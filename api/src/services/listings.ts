import { MAX_OTP_ATTEMPTS } from '../../../shared/constants';
import { directionsUrl } from '../../../shared/geo';
import type { ClaimStatus, ListingStatus } from '../../../shared/types';
import type { Env } from '../env';
import { auditInsert } from '../lib/audit';
import { sendEmail, templates } from '../lib/email';
import { claimPickupBy, deriveListingStatus, isClaimable, isNoShow, shouldSuspendForNoShows } from '../lib/rules';
import { fail, generateOtp, newId, safeEqual } from '../lib/util';

interface ListingRow {
  id: string;
  restaurant_id: string;
  title: string;
  food_type: string;
  servings_total: number;
  servings_remaining: number;
  safe_until: number;
  pickup_start: number;
  pickup_end: number;
  packaging_cost: number;
  status: ListingStatus;
  city: string;
}

export function formatIst(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Re-derive and persist a listing's status from its claims. */
export async function refreshListingStatus(env: Env, listingId: string, nowMs: number): Promise<ListingStatus | null> {
  const l = await env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(listingId).first<ListingRow>();
  if (!l) return null;
  const { results: claims } = await env.DB.prepare('SELECT status FROM claims WHERE listing_id = ?')
    .bind(listingId)
    .all<{ status: ClaimStatus }>();
  const status = deriveListingStatus(
    { status: l.status, servingsRemaining: l.servings_remaining, safeUntil: l.safe_until, pickupEnd: l.pickup_end },
    claims,
    nowMs,
  );
  if (status !== l.status) {
    await env.DB.prepare('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?').bind(status, nowMs, listingId).run();
  }
  return status;
}

export async function createClaim(env: Env, baseUrl: string, ngoUserId: string, listingId: string, servings: number, nowMs: number) {
  const ngo = await env.DB.prepare('SELECT * FROM ngos WHERE user_id = ?').bind(ngoUserId).first<Record<string, any>>();
  if (!ngo) fail(400, 'Complete your NGO profile first');
  if (ngo.verification !== 'approved') fail(403, 'Your NGO must be approved by an admin before claiming');

  const l = await env.DB.prepare('SELECT * FROM listings WHERE id = ?').bind(listingId).first<ListingRow>();
  if (!l) fail(404, 'Listing not found');
  if (!isClaimable({ status: l.status, servingsRemaining: l.servings_remaining, safeUntil: l.safe_until, pickupEnd: l.pickup_end }, nowMs))
    fail(409, 'This listing is no longer available');
  if (servings > l.servings_remaining) fail(409, `Only ${l.servings_remaining} servings are left`);

  const existing = await env.DB.prepare("SELECT id FROM claims WHERE listing_id = ? AND ngo_id = ? AND status = 'pending'")
    .bind(listingId, ngoUserId)
    .first();
  if (existing) fail(409, 'You already have an active claim on this listing');

  // Optimistic decrement guarded by the WHERE clause prevents over-claiming under concurrency.
  const dec = await env.DB.prepare(
    `UPDATE listings SET servings_remaining = servings_remaining - ?1, updated_at = ?3
     WHERE id = ?2 AND status = 'active' AND servings_remaining >= ?1 AND safe_until > ?3 AND pickup_end > ?3`,
  )
    .bind(servings, listingId, nowMs)
    .run();
  if (dec.meta.changes !== 1) fail(409, 'Someone else just claimed these servings — please refresh');

  const claimId = newId();
  const otp = generateOtp();
  const pickupBy = claimPickupBy(l.pickup_end, l.safe_until);
  try {
    await env.DB.prepare(
      `INSERT INTO claims (id, listing_id, ngo_id, restaurant_id, servings, otp, status, safety_ack, pickup_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)`,
    )
      .bind(claimId, listingId, ngoUserId, l.restaurant_id, servings, otp, pickupBy, nowMs)
      .run();
  } catch (err) {
    await env.DB.prepare('UPDATE listings SET servings_remaining = servings_remaining + ? WHERE id = ?').bind(servings, listingId).run();
    throw err;
  }
  await refreshListingStatus(env, listingId, nowMs);

  const r = await env.DB.prepare('SELECT name, address, phone, lat, lng FROM restaurants WHERE user_id = ?')
    .bind(l.restaurant_id)
    .first<{ name: string; address: string; phone: string; lat: number; lng: number }>();
  const email = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(ngoUserId).first<{ email: string }>();
  if (r && email) {
    const t = templates.claimConfirmation(env, baseUrl, {
      ngoName: ngo.name,
      title: l.title,
      servings,
      otp,
      restaurantName: r.name,
      address: r.address,
      phone: r.phone,
      pickupBy: formatIst(pickupBy),
      packagingTotal: servings * l.packaging_cost,
      directions: directionsUrl(r.lat, r.lng),
    });
    await sendEmail(env, { to: email.email, ...t }, 'critical');
  }
  return claimId;
}

export async function cancelClaim(env: Env, claimId: string, ngoUserId: string, nowMs: number) {
  const c = await env.DB.prepare('SELECT * FROM claims WHERE id = ? AND ngo_id = ?').bind(claimId, ngoUserId).first<Record<string, any>>();
  if (!c) fail(404, 'Claim not found');
  if (c.status !== 'pending') fail(409, 'Only upcoming claims can be cancelled');
  const res = await env.DB.prepare(
    "UPDATE claims SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'Cancelled by NGO' WHERE id = ? AND status = 'pending'",
  )
    .bind(nowMs, claimId)
    .run();
  if (res.meta.changes !== 1) fail(409, 'Claim already updated');
  await releaseServings(env, c.listing_id, c.servings, nowMs);
}

async function releaseServings(env: Env, listingId: string, servings: number, nowMs: number) {
  await env.DB.prepare(
    `UPDATE listings SET servings_remaining = MIN(servings_total, servings_remaining + ?), updated_at = ?,
       status = CASE WHEN status = 'claimed' THEN 'active' ELSE status END
     WHERE id = ?`,
  )
    .bind(servings, nowMs, listingId)
    .run();
  await refreshListingStatus(env, listingId, nowMs);
}

/** Restaurant verifies the NGO's OTP: completes the claim and writes the immutable audit row. */
export async function verifyPickup(env: Env, baseUrl: string, restaurantUserId: string, claimId: string, otp: string, nowMs: number) {
  const c = await env.DB.prepare(
    `SELECT c.*, l.title AS l_title, l.food_type AS l_food_type, l.city AS l_city, l.safe_until AS l_safe_until,
            r.name AS r_name, n.name AS n_name
     FROM claims c JOIN listings l ON l.id = c.listing_id
     JOIN restaurants r ON r.user_id = c.restaurant_id JOIN ngos n ON n.user_id = c.ngo_id
     WHERE c.id = ? AND c.restaurant_id = ?`,
  )
    .bind(claimId, restaurantUserId)
    .first<Record<string, any>>();
  if (!c) fail(404, 'Claim not found');
  if (c.status !== 'pending') fail(409, 'This claim is not awaiting pickup');
  if (c.otp_attempts >= MAX_OTP_ATTEMPTS) fail(429, 'Too many wrong OTP attempts for this claim. Contact support.');
  if (!safeEqual(String(c.otp), otp)) {
    await env.DB.prepare('UPDATE claims SET otp_attempts = otp_attempts + 1 WHERE id = ?').bind(claimId).run();
    fail(422, `Incorrect OTP (${MAX_OTP_ATTEMPTS - c.otp_attempts - 1} attempts left)`);
  }

  const audit = await auditInsert(env, {
    claimId,
    listingId: c.listing_id,
    restaurantId: c.restaurant_id,
    restaurantName: c.r_name,
    ngoId: c.ngo_id,
    ngoName: c.n_name,
    city: c.l_city,
    foodTitle: c.l_title,
    foodType: c.l_food_type,
    servings: c.servings,
    verifiedBy: restaurantUserId,
    verifiedAt: nowMs,
  });

  // One transaction: complete claim, append audit row, bump counters.
  await env.DB.batch([
    env.DB.prepare("UPDATE claims SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'pending'").bind(nowMs, claimId),
    audit,
    env.DB.prepare('UPDATE ngos SET completed_count = completed_count + 1, meals_received = meals_received + ?, updated_at = ? WHERE user_id = ?').bind(
      c.servings,
      nowMs,
      c.ngo_id,
    ),
    env.DB.prepare('UPDATE restaurants SET meals_donated = meals_donated + ?, updated_at = ? WHERE user_id = ?').bind(c.servings, nowMs, c.restaurant_id),
  ]);
  await refreshListingStatus(env, c.listing_id, nowMs);

  const emails = await env.DB.prepare('SELECT id, email, name FROM users WHERE id IN (?, ?)')
    .bind(c.ngo_id, c.restaurant_id)
    .all<{ id: string; email: string; name: string }>();
  for (const u of emails.results) {
    const isNgo = u.id === c.ngo_id;
    const t = templates.pickupCompleted(env, baseUrl, {
      name: isNgo ? c.n_name : c.r_name,
      title: c.l_title,
      servings: c.servings,
      counterparty: isNgo ? c.r_name : c.n_name,
    });
    await sendEmail(env, { to: u.email, ...t }, 'normal');
  }
  return { servings: c.servings as number };
}

/**
 * Cron: mark overdue pending claims as no-shows, release their servings,
 * bump the NGO's no-show count and suspend at the threshold.
 */
export async function processNoShows(env: Env, baseUrl: string, nowMs: number, limit = 50) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.listing_id, c.ngo_id, c.servings, c.status, c.pickup_by, l.title AS l_title
     FROM claims c JOIN listings l ON l.id = c.listing_id
     WHERE c.status = 'pending' AND c.pickup_by < ? LIMIT ?`,
  )
    .bind(nowMs, limit)
    .all<{ id: string; listing_id: string; ngo_id: string; servings: number; status: ClaimStatus; pickup_by: number; l_title: string }>();

  let count = 0;
  for (const c of results) {
    if (!isNoShow({ status: c.status, pickupBy: c.pickup_by }, nowMs)) continue;
    const upd = await env.DB.prepare(
      "UPDATE claims SET status = 'no_show', cancelled_at = ?, cancel_reason = 'Not collected in pickup window' WHERE id = ? AND status = 'pending'",
    )
      .bind(nowMs, c.id)
      .run();
    if (upd.meta.changes !== 1) continue;
    count++;
    await releaseServings(env, c.listing_id, c.servings, nowMs);

    const ngo = await env.DB.prepare(
      'UPDATE ngos SET no_show_count = no_show_count + 1, updated_at = ? WHERE user_id = ? RETURNING no_show_count, name',
    )
      .bind(nowMs, c.ngo_id)
      .first<{ no_show_count: number; name: string }>();
    if (!ngo) continue;
    const suspend = shouldSuspendForNoShows(ngo.no_show_count);
    if (suspend) {
      await env.DB.prepare(
        "UPDATE users SET status = 'suspended', suspended_reason = 'Automatically suspended after 3 no-shows' WHERE id = ? AND status = 'active'",
      )
        .bind(c.ngo_id)
        .run();
    }
    const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(c.ngo_id).first<{ email: string }>();
    if (u) {
      const t = templates.noShowWarning(env, baseUrl, { name: ngo.name, title: c.l_title, count: ngo.no_show_count, suspended: suspend });
      await sendEmail(env, { to: u.email, ...t }, 'critical');
    }
  }
  return count;
}

/**
 * Cron: re-derive status for listings whose safe-until or pickup window has passed,
 * which moves them to expired (or completed if some servings were picked up).
 * Runs after processNoShows so overdue claims have already been released.
 */
export async function processExpiry(env: Env, nowMs: number, limit = 200) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM listings WHERE status IN ('active', 'claimed') AND (safe_until <= ?1 OR pickup_end <= ?1) LIMIT ?2",
  )
    .bind(nowMs, limit)
    .all<{ id: string }>();
  let changed = 0;
  for (const { id } of results) {
    const s = await refreshListingStatus(env, id, nowMs);
    if (s === 'expired' || s === 'completed') changed++;
  }
  return changed;
}
