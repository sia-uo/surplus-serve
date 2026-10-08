import { RADIUS_OPTIONS_KM } from '../../shared/constants';
import { boundingBox, formatDistance, haversineKm } from '../../shared/geo';
import type { Env } from './env';
import { remainingQuota, sendBatch, templates, type EmailMessage } from './lib/email';
import { isUrgent } from './lib/rules';
import { appUrl, istParts, istToEpoch, newId, now } from './lib/util';
import { formatIst, processExpiry, processNoShows } from './services/listings';

const ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_RADIUS = Math.max(...RADIUS_OPTIONS_KM);

/** Create today's listings from active recurring templates whose post time has arrived (IST). */
export async function runRecurring(env: Env, nowMs: number) {
  const { date, weekday, minutes } = istParts(nowMs);
  const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const { results } = await env.DB.prepare(
    `SELECT t.*, r.lat, r.lng, r.city FROM recurring_templates t
     JOIN restaurants r ON r.user_id = t.restaurant_id
     JOIN users u ON u.id = t.restaurant_id
     WHERE t.active = 1 AND t.post_time <= ? AND (t.last_run_date IS NULL OR t.last_run_date < ?)
       AND (t.frequency = 'daily' OR t.weekday = ?)
       AND r.verification = 'approved' AND u.status = 'active'
     LIMIT 50`,
  )
    .bind(hhmm, date, weekday)
    .all<Record<string, any>>();

  let created = 0;
  for (const t of results) {
    // Claim today's run first so a slow/duplicate cron can never post twice.
    const mark = await env.DB.prepare(
      'UPDATE recurring_templates SET last_run_date = ? WHERE id = ? AND (last_run_date IS NULL OR last_run_date < ?)',
    )
      .bind(date, t.id, date)
      .run();
    if (mark.meta.changes !== 1) continue;
    const cookedAt = Math.min(istToEpoch(date, t.post_time), nowMs);
    const safeUntil = cookedAt + t.safe_hours * 3600_000;
    const pickupStart = cookedAt + t.pickup_start_offset_min * 60_000;
    const pickupEnd = Math.min(pickupStart + t.pickup_duration_min * 60_000, safeUntil);
    if (pickupEnd <= nowMs) continue; // cron was down for too long; skip a stale post
    await env.DB.prepare(
      `INSERT INTO listings (id, restaurant_id, title, description, servings_total, servings_remaining, food_type, allergens,
         cooked_at, safe_until, pickup_start, pickup_end, packaging_cost, checklist, status, lat, lng, city, recurring_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        t.restaurant_id,
        t.title,
        t.description,
        t.servings,
        t.servings,
        t.food_type,
        t.allergens,
        cookedAt,
        safeUntil,
        pickupStart,
        pickupEnd,
        t.packaging_cost,
        t.checklist,
        t.lat,
        t.lng,
        t.city,
        t.id,
        nowMs,
        nowMs,
      )
      .run();
    created++;
  }
  return created;
}

/**
 * Batched new-listing alerts: one digest email per NGO covering all new listings
 * in its alert radius, at most once per hour per NGO, and only while the bulk
 * email quota has room. Listings are marked alerted either way.
 */
export async function runAlerts(env: Env, nowMs: number) {
  const { results: listings } = await env.DB.prepare(
    `SELECT id, title, servings_remaining, lat, lng, safe_until FROM listings
     WHERE alerted = 0 AND status = 'active' AND safe_until > ? ORDER BY created_at LIMIT 50`,
  )
    .bind(nowMs)
    .all<{ id: string; title: string; servings_remaining: number; lat: number; lng: number; safe_until: number }>();
  if (listings.length === 0) return 0;

  const markAll = () =>
    env.DB.batch(listings.map((l) => env.DB.prepare('UPDATE listings SET alerted = 1 WHERE id = ?').bind(l.id)));

  const budget = await remainingQuota(env, 'bulk', nowMs);
  if (budget <= 0) {
    await markAll();
    return 0;
  }

  // One indexed bbox query covering all new listings (max radius), then exact per-NGO radius checks.
  const box = listings.reduce(
    (acc, l) => {
      const b = boundingBox(l.lat, l.lng, MAX_RADIUS);
      return {
        minLat: Math.min(acc.minLat, b.minLat),
        maxLat: Math.max(acc.maxLat, b.maxLat),
        minLng: Math.min(acc.minLng, b.minLng),
        maxLng: Math.max(acc.maxLng, b.maxLng),
      };
    },
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
  );
  const { results: ngos } = await env.DB.prepare(
    `SELECT n.user_id, n.name, n.lat, n.lng, n.alert_radius_km, u.email FROM ngos n JOIN users u ON u.id = n.user_id
     WHERE n.alerts_enabled = 1 AND n.lat BETWEEN ? AND ? AND n.lng BETWEEN ? AND ?
       AND n.verification = 'approved' AND u.status = 'active' AND (n.last_alert_at IS NULL OR n.last_alert_at < ?)
     LIMIT 500`,
  )
    .bind(box.minLat, box.maxLat, box.minLng, box.maxLng, nowMs - ALERT_COOLDOWN_MS)
    .all<{ user_id: string; name: string; lat: number; lng: number; alert_radius_km: number; email: string }>();

  const base = appUrl(env);
  const messages: (EmailMessage & { ngoId: string })[] = [];
  for (const n of ngos) {
    const near = listings
      .map((l) => ({ l, d: haversineKm(n.lat, n.lng, l.lat, l.lng) }))
      .filter((x) => x.d <= n.alert_radius_km)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10);
    if (near.length === 0) continue;
    const t = templates.newListings(env, base, {
      name: n.name,
      listings: near.map(({ l, d }) => ({
        title: l.title,
        servings: l.servings_remaining,
        distance: formatDistance(d),
        safeUntil: formatIst(l.safe_until),
        urgent: isUrgent(l.safe_until, nowMs),
      })),
    });
    messages.push({ to: n.email, ...t, ngoId: n.user_id });
    if (messages.length >= Math.min(budget, 100)) break;
  }

  const sent = await sendBatch(env, messages, 'bulk');
  const sentTo = messages.slice(0, sent);
  if (sentTo.length) {
    await env.DB.batch(sentTo.map((m) => env.DB.prepare('UPDATE ngos SET last_alert_at = ? WHERE user_id = ?').bind(nowMs, m.ngoId)));
  }
  await markAll();
  return sent;
}

/** Daily housekeeping: trim old caches and quota rows so D1 stays small. */
export async function runDaily(env: Env, nowMs: number) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM geocode_cache WHERE created_at < ?').bind(nowMs - 90 * 24 * 3600_000),
    env.DB.prepare('DELETE FROM email_quota WHERE day < ?').bind(new Date(nowMs - 30 * 24 * 3600_000).toISOString().slice(0, 10)),
  ]);
}

export async function scheduled(controller: ScheduledController, env: Env) {
  const t = now();
  if (controller.cron === '30 18 * * *') {
    await runDaily(env, t);
    return;
  }
  const base = appUrl(env);
  const noShows = await processNoShows(env, base, t);
  const expired = await processExpiry(env, t);
  const recurring = await runRecurring(env, t);
  const alerts = await runAlerts(env, t);
  console.log(JSON.stringify({ cron: controller.cron, noShows, expired, recurring, alerts }));
}
