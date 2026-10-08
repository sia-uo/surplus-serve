import { Hono } from 'hono';
import { impactFromMeals } from '../../../shared/scoring';
import type { RecurringTemplate } from '../../../shared/types';
import type { AppEnv } from '../env';
import { emailAdmins, templates } from '../lib/email';
import { CLAIM_SELECT_FOR_RESTAURANT, LISTING_SELECT, toClaim, toListing, toRestaurant } from '../lib/mappers';
import { validateListingTimes } from '../lib/rules';
import { listingSchema, otpSchema, premiumRequestSchema, ratingSchema, recurringSchema, restaurantProfileSchema } from '../lib/schemas';
import { requireAuth, requireRole } from '../lib/session';
import { appUrl, fail, newId, normaliseCity, now, packagingCap, pageParams, paginate, parse, parseJsonArray, readJson } from '../lib/util';
import { refreshListingStatus, verifyPickup } from '../services/listings';

export const restaurant = new Hono<AppEnv>();
restaurant.use('*', requireAuth, requireRole('restaurant'));

async function getProfile(c: { env: AppEnv['Bindings'] }, userId: string) {
  return c.env.DB.prepare('SELECT * FROM restaurants WHERE user_id = ?').bind(userId).first<Record<string, any>>();
}

async function requireApproved(c: { env: AppEnv['Bindings'] }, userId: string) {
  const r = await getProfile(c, userId);
  if (!r) fail(400, 'Complete your restaurant profile first');
  if (r.verification !== 'approved') fail(403, 'Your restaurant is awaiting admin approval');
  return r;
}

restaurant.get('/profile', async (c) => {
  const r = await getProfile(c, c.get('user').id);
  return c.json({ profile: r ? toRestaurant(r) : null });
});

restaurant.put('/profile', async (c) => {
  const user = c.get('user');
  const p = parse(restaurantProfileSchema, await readJson(c.req.raw));
  const t = now();
  const existing = await getProfile(c, user.id);
  const city = normaliseCity(p.city);
  let needsReview = !existing;
  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO restaurants (user_id, name, address, city, lat, lng, phone, fssai_number, upi_id, hide_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(user.id, p.name, p.address, city, p.lat, p.lng, p.phone, p.fssaiNumber, p.upiId || null, p.hideName ? 1 : 0, t, t)
      .run();
  } else {
    // Changing the licence number or business name requires re-verification.
    const reverify = existing.fssai_number !== p.fssaiNumber || existing.name !== p.name || existing.verification === 'rejected';
    needsReview = reverify && existing.verification !== 'pending';
    await c.env.DB.prepare(
      `UPDATE restaurants SET name = ?, address = ?, city = ?, lat = ?, lng = ?, phone = ?, fssai_number = ?, upi_id = ?, hide_name = ?,
         verification = CASE WHEN ? THEN 'pending' ELSE verification END,
         rejection_reason = CASE WHEN ? THEN NULL ELSE rejection_reason END, updated_at = ?
       WHERE user_id = ?`,
    )
      .bind(p.name, p.address, city, p.lat, p.lng, p.phone, p.fssaiNumber, p.upiId || null, p.hideName ? 1 : 0, reverify ? 1 : 0, reverify ? 1 : 0, t, user.id)
      .run();
  }
  if (needsReview) {
    const base = appUrl(c.env, c.req.raw);
    const t = templates.adminNotice(c.env, base, 'Restaurant awaiting verification', {
      Restaurant: p.name,
      City: p.city,
      'FSSAI licence': p.fssaiNumber,
      Contact: `${user.name} <${user.email}>`,
      Phone: p.phone,
      Review: `${base}/admin/verifications?type=restaurant`,
    });
    await emailAdmins(c.env, t.subject, t.html);
  }
  const r = await getProfile(c, user.id);
  return c.json({ profile: toRestaurant(r!) });
});

restaurant.get('/dashboard', async (c) => {
  const uid = c.get('user').id;
  const [counts, pending] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM listings WHERE restaurant_id = ? GROUP BY status').bind(uid),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM claims WHERE restaurant_id = ? AND status = 'pending'").bind(uid),
  ]);
  const byStatus: Record<string, number> = { active: 0, claimed: 0, completed: 0, expired: 0, cancelled: 0 };
  for (const row of counts.results as { status: string; n: number }[]) byStatus[row.status] = row.n;
  return c.json({ counts: byStatus, pendingPickups: (pending.results[0] as { n: number }).n });
});

restaurant.get('/listings', async (c) => {
  const uid = c.get('user').id;
  const { page, pageSize, offset } = pageParams(c.req.query());
  const status = c.req.query('status');
  const allowed = ['active', 'claimed', 'completed', 'expired', 'cancelled'];
  const filter = status && allowed.includes(status) ? 'AND l.status = ?' : '';
  const stmt = c.env.DB.prepare(
    `SELECT l.*, r.name AS r_name, r.premium AS r_premium, r.rating_sum AS r_rating_sum, r.rating_count AS r_rating_count,
       (SELECT COUNT(*) FROM claims c WHERE c.listing_id = l.id AND c.status = 'pending') AS pending_claims
     FROM listings l JOIN restaurants r ON r.user_id = l.restaurant_id
     WHERE l.restaurant_id = ? ${filter} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
  );
  const binds = filter ? [uid, status, pageSize + 1, offset] : [uid, pageSize + 1, offset];
  const { results } = await stmt.bind(...binds).all();
  const t = now();
  return c.json(paginate(results.map((r) => toListing(r, t)), page, pageSize));
});

restaurant.post('/listings', async (c) => {
  const uid = c.get('user').id;
  const r = await requireApproved(c, uid);
  const body = parse(listingSchema, await readJson(c.req.raw));
  const t = now();
  const timeError = validateListingTimes(body, t);
  if (timeError) fail(400, timeError);
  const cap = packagingCap(c.env);
  if (body.packagingCost > cap) fail(400, `Packaging cost cannot exceed ₹${cap} per serving`);
  if (body.photoKey && !body.photoKey.startsWith(`photos/${uid}/`)) fail(400, 'Invalid photo');

  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO listings (id, restaurant_id, title, description, servings_total, servings_remaining, food_type, allergens,
       cooked_at, safe_until, pickup_start, pickup_end, packaging_cost, photo_key, checklist, status, lat, lng, city, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      uid,
      body.title,
      body.description,
      body.servings,
      body.servings,
      body.foodType,
      JSON.stringify(body.allergens),
      body.cookedAt,
      body.safeUntil,
      body.pickupStart,
      body.pickupEnd,
      body.packagingCost,
      body.photoKey ?? null,
      JSON.stringify({ ...body.checklist, confirmedAt: t }),
      r.lat,
      r.lng,
      r.city,
      t,
      t,
    )
    .run();
  const row = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.id = ?`).bind(id).first();
  return c.json({ listing: toListing(row!, t) }, 201);
});

restaurant.post('/listings/:id/cancel', async (c) => {
  const uid = c.get('user').id;
  const id = c.req.param('id');
  const t = now();
  const pending = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM claims WHERE listing_id = ? AND status = 'pending'").bind(id).first<{ n: number }>();
  if ((pending?.n ?? 0) > 0) fail(409, 'This listing has pending pickups — it cannot be cancelled now');
  const res = await c.env.DB.prepare(
    "UPDATE listings SET status = 'cancelled', updated_at = ? WHERE id = ? AND restaurant_id = ? AND status = 'active'",
  )
    .bind(t, id, uid)
    .run();
  if (res.meta.changes !== 1) fail(409, 'Only active listings can be cancelled');
  return c.json({ ok: true });
});

restaurant.get('/claims', async (c) => {
  const uid = c.get('user').id;
  const { page, pageSize, offset } = pageParams(c.req.query());
  const status = c.req.query('status');
  const allowed = ['pending', 'completed', 'cancelled', 'no_show'];
  const filter = status && allowed.includes(status) ? 'AND c.status = ?' : '';
  const order = status === 'pending' ? 'c.pickup_by ASC' : 'c.created_at DESC';
  const binds = filter ? [uid, status, pageSize + 1, offset] : [uid, pageSize + 1, offset];
  const { results } = await c.env.DB.prepare(
    `${CLAIM_SELECT_FOR_RESTAURANT} WHERE c.restaurant_id = ? ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`,
  )
    .bind(...binds)
    .all();
  return c.json(paginate(results.map((r) => toClaim(r, 'restaurant')), page, pageSize));
});

restaurant.post('/claims/:id/verify', async (c) => {
  const { otp } = parse(otpSchema, await readJson(c.req.raw));
  const result = await verifyPickup(c.env, appUrl(c.env, c.req.raw), c.get('user').id, c.req.param('id'), otp, now());
  return c.json({ ok: true, ...result });
});

restaurant.post('/claims/:id/rate', async (c) => {
  const uid = c.get('user').id;
  const { rating, comment } = parse(ratingSchema, await readJson(c.req.raw));
  const claim = await c.env.DB.prepare('SELECT ngo_id FROM claims WHERE id = ? AND restaurant_id = ?').bind(c.req.param('id'), uid).first<{ ngo_id: string }>();
  if (!claim) fail(404, 'Claim not found');
  const res = await c.env.DB.prepare(
    "UPDATE claims SET ngo_rating = ?, ngo_comment = ? WHERE id = ? AND restaurant_id = ? AND status = 'completed' AND ngo_rating IS NULL",
  )
    .bind(rating, comment ?? null, c.req.param('id'), uid)
    .run();
  if (res.meta.changes !== 1) fail(409, 'Only completed pickups can be rated, once');
  await c.env.DB.prepare('UPDATE ngos SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?').bind(rating, claim.ngo_id).run();
  return c.json({ ok: true });
});

restaurant.get('/impact', async (c) => {
  const uid = c.get('user').id;
  const row = await c.env.DB.prepare(
    'SELECT COALESCE(SUM(servings), 0) AS meals, COUNT(*) AS pickups, COUNT(DISTINCT ngo_id) AS ngos FROM pickup_audit WHERE restaurant_id = ?',
  )
    .bind(uid)
    .first<{ meals: number; pickups: number; ngos: number }>();
  const listings = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM listings WHERE restaurant_id = ?').bind(uid).first<{ n: number }>();
  return c.json({ ...impactFromMeals(row?.meals ?? 0), pickups: row?.pickups ?? 0, ngosServed: row?.ngos ?? 0, listings: listings?.n ?? 0 });
});

/** Premium: detailed analytics over the last 12 months. */
restaurant.get('/analytics', async (c) => {
  const uid = c.get('user').id;
  const r = await getProfile(c, uid);
  if (!r?.premium) fail(403, 'Detailed analytics are part of the premium plan');
  const since = now() - 365 * 24 * 3600_000;
  const [monthly, topNgos, foodTypes, outcomes, claimSpeed] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m', verified_at / 1000, 'unixepoch', '+330 minutes') AS month, SUM(servings) AS meals, COUNT(*) AS pickups
       FROM pickup_audit WHERE restaurant_id = ? AND verified_at >= ? GROUP BY month ORDER BY month`,
    ).bind(uid, since),
    c.env.DB.prepare(
      `SELECT ngo_name AS name, SUM(servings) AS meals, COUNT(*) AS pickups FROM pickup_audit
       WHERE restaurant_id = ? AND verified_at >= ? GROUP BY ngo_id ORDER BY meals DESC LIMIT 5`,
    ).bind(uid, since),
    c.env.DB.prepare(
      `SELECT food_type AS type, SUM(servings) AS meals FROM pickup_audit WHERE restaurant_id = ? AND verified_at >= ? GROUP BY food_type`,
    ).bind(uid, since),
    c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM listings WHERE restaurant_id = ? AND created_at >= ? GROUP BY status`).bind(uid, since),
    c.env.DB.prepare(
      `SELECT AVG(c.created_at - l.created_at) AS avg_ms FROM claims c JOIN listings l ON l.id = c.listing_id
       WHERE c.restaurant_id = ? AND c.created_at >= ?`,
    ).bind(uid, since),
  ]);
  const outcomeMap: Record<string, number> = {};
  for (const o of outcomes.results as { status: string; n: number }[]) outcomeMap[o.status] = o.n;
  const total = Object.values(outcomeMap).reduce((a, b) => a + b, 0);
  return c.json({
    monthly: monthly.results,
    topNgos: topNgos.results,
    foodTypes: foodTypes.results,
    outcomes: outcomeMap,
    rescueRate: total ? Math.round((((outcomeMap.completed ?? 0) + (outcomeMap.claimed ?? 0)) / total) * 100) : 0,
    avgMinutesToClaim: Math.round(((claimSpeed.results[0] as { avg_ms: number | null })?.avg_ms ?? 0) / 60000),
  });
});

/** Premium: data for the monthly shareable impact certificate (rendered client-side). */
restaurant.get('/certificate', async (c) => {
  const uid = c.get('user').id;
  const r = await getProfile(c, uid);
  if (!r?.premium) fail(403, 'Impact certificates are part of the premium plan');
  const month = c.req.query('month') ?? new Date(now() + 330 * 60_000).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) fail(400, 'Invalid month');
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(servings), 0) AS meals, COUNT(*) AS pickups, COUNT(DISTINCT ngo_id) AS ngos FROM pickup_audit
     WHERE restaurant_id = ? AND strftime('%Y-%m', verified_at / 1000, 'unixepoch', '+330 minutes') = ?`,
  )
    .bind(uid, month)
    .first<{ meals: number; pickups: number; ngos: number }>();
  return c.json({ restaurantName: r.name, city: r.city, month, ...impactFromMeals(row?.meals ?? 0), pickups: row?.pickups ?? 0, ngos: row?.ngos ?? 0 });
});

restaurant.post('/premium-request', async (c) => {
  const user = c.get('user');
  const { message } = parse(premiumRequestSchema, await readJson(c.req.raw));
  const r = await getProfile(c, user.id);
  if (!r) fail(400, 'Complete your restaurant profile first');
  if (r.premium) fail(409, 'You already have the premium plan');
  const recent = await c.env.DB.prepare("SELECT id FROM contact_messages WHERE kind = 'premium' AND user_id = ? AND created_at > ?")
    .bind(user.id, now() - 24 * 3600_000)
    .first();
  if (recent) fail(429, 'We already received your request — our team will be in touch');
  await c.env.DB.prepare(
    `INSERT INTO contact_messages (id, kind, user_id, name, email, organisation, city, phone, message, created_at)
     VALUES (?, 'premium', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId(), user.id, user.name, user.email, r.name, r.city, r.phone, message || 'Premium plan requested', now())
    .run();
  const t = templates.adminNotice(c.env, appUrl(c.env, c.req.raw), 'Premium plan request', {
    Restaurant: r.name,
    City: r.city,
    Contact: `${user.name} <${user.email}>`,
    Phone: r.phone,
    Message: message,
  });
  await emailAdmins(c.env, t.subject, t.html);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Recurring listings
// ---------------------------------------------------------------------------
function toTemplate(r: Record<string, any>): RecurringTemplate {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    servings: r.servings,
    foodType: r.food_type,
    allergens: parseJsonArray(r.allergens),
    packagingCost: r.packaging_cost,
    frequency: r.frequency,
    weekday: r.weekday,
    postTime: r.post_time,
    safeHours: r.safe_hours,
    pickupStartOffsetMin: r.pickup_start_offset_min,
    pickupDurationMin: r.pickup_duration_min,
    active: !!r.active,
    lastRunDate: r.last_run_date,
  };
}

restaurant.get('/recurring', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM recurring_templates WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(c.get('user').id)
    .all();
  return c.json({ items: results.map(toTemplate) });
});

restaurant.post('/recurring', async (c) => {
  const uid = c.get('user').id;
  await requireApproved(c, uid);
  const b = parse(recurringSchema, await readJson(c.req.raw));
  const cap = packagingCap(c.env);
  if (b.packagingCost > cap) fail(400, `Packaging cost cannot exceed ₹${cap} per serving`);
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM recurring_templates WHERE restaurant_id = ?').bind(uid).first<{ n: number }>();
  if ((count?.n ?? 0) >= 20) fail(409, 'You can have at most 20 recurring listings');
  const id = newId();
  await c.env.DB.prepare(
    `INSERT INTO recurring_templates (id, restaurant_id, title, description, servings, food_type, allergens, packaging_cost, frequency,
       weekday, post_time, safe_hours, pickup_start_offset_min, pickup_duration_min, checklist, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      id,
      uid,
      b.title,
      b.description,
      b.servings,
      b.foodType,
      JSON.stringify(b.allergens),
      b.packagingCost,
      b.frequency,
      b.frequency === 'weekly' ? b.weekday : null,
      b.postTime,
      b.safeHours,
      b.pickupStartOffsetMin,
      b.pickupDurationMin,
      JSON.stringify({ ...b.checklist, confirmedAt: now() }),
      now(),
    )
    .run();
  const row = await c.env.DB.prepare('SELECT * FROM recurring_templates WHERE id = ?').bind(id).first();
  return c.json({ template: toTemplate(row!) }, 201);
});

restaurant.patch('/recurring/:id', async (c) => {
  const body = (await readJson(c.req.raw)) as { active?: unknown };
  if (typeof body.active !== 'boolean') fail(400, 'Invalid active flag');
  const res = await c.env.DB.prepare('UPDATE recurring_templates SET active = ? WHERE id = ? AND restaurant_id = ?')
    .bind(body.active ? 1 : 0, c.req.param('id'), c.get('user').id)
    .run();
  if (res.meta.changes !== 1) fail(404, 'Recurring listing not found');
  return c.json({ ok: true });
});

restaurant.delete('/recurring/:id', async (c) => {
  const res = await c.env.DB.prepare('DELETE FROM recurring_templates WHERE id = ? AND restaurant_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  if (res.meta.changes !== 1) fail(404, 'Recurring listing not found');
  return c.json({ ok: true });
});

// Keep listing statuses fresh when a restaurant views a single listing.
restaurant.get('/listings/:id', async (c) => {
  const t = now();
  await refreshListingStatus(c.env, c.req.param('id'), t);
  const row = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.id = ? AND l.restaurant_id = ?`).bind(c.req.param('id'), c.get('user').id).first();
  if (!row) fail(404, 'Listing not found');
  return c.json({ listing: toListing(row, t) });
});
