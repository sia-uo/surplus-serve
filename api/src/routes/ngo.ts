import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { emailAdmins, templates } from '../lib/email';
import { CLAIM_SELECT_FOR_NGO, toClaim, toNgo } from '../lib/mappers';
import { ngoProfileSchema, ratingSchema } from '../lib/schemas';
import { requireAuth, requireRole } from '../lib/session';
import { appUrl, fail, normaliseCity, now, pageParams, paginate, parse, readJson } from '../lib/util';
import { cancelClaim } from '../services/listings';

export const ngo = new Hono<AppEnv>();
ngo.use('*', requireAuth, requireRole('ngo'));

ngo.get('/profile', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM ngos WHERE user_id = ?').bind(c.get('user').id).first();
  return c.json({ profile: r ? toNgo(r) : null });
});

ngo.put('/profile', async (c) => {
  const uid = c.get('user').id;
  const p = parse(ngoProfileSchema, await readJson(c.req.raw));
  if (p.certificateKey && !p.certificateKey.startsWith(`certs/${uid}/`)) fail(400, 'Invalid certificate');
  const t = now();
  const city = normaliseCity(p.city);
  const existing = await c.env.DB.prepare('SELECT * FROM ngos WHERE user_id = ?').bind(uid).first<Record<string, any>>();
  let needsReview = !existing;
  if (!existing) {
    await c.env.DB.prepare(
      `INSERT INTO ngos (user_id, name, address, city, lat, lng, phone, registration_number, certificate_key, alerts_enabled, alert_radius_km, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(uid, p.name, p.address, city, p.lat, p.lng, p.phone, p.registrationNumber, p.certificateKey ?? null, p.alertsEnabled ? 1 : 0, p.alertRadiusKm, t, t)
      .run();
  } else {
    const reverify =
      existing.registration_number !== p.registrationNumber ||
      existing.name !== p.name ||
      (p.certificateKey ?? null) !== existing.certificate_key ||
      existing.verification === 'rejected';
    needsReview = reverify && existing.verification !== 'pending';
    await c.env.DB.prepare(
      `UPDATE ngos SET name = ?, address = ?, city = ?, lat = ?, lng = ?, phone = ?, registration_number = ?, certificate_key = ?,
         alerts_enabled = ?, alert_radius_km = ?,
         verification = CASE WHEN ? THEN 'pending' ELSE verification END,
         rejection_reason = CASE WHEN ? THEN NULL ELSE rejection_reason END, updated_at = ?
       WHERE user_id = ?`,
    )
      .bind(
        p.name,
        p.address,
        city,
        p.lat,
        p.lng,
        p.phone,
        p.registrationNumber,
        p.certificateKey ?? null,
        p.alertsEnabled ? 1 : 0,
        p.alertRadiusKm,
        reverify ? 1 : 0,
        reverify ? 1 : 0,
        t,
        uid,
      )
      .run();
  }
  if (needsReview) {
    const user = c.get('user');
    const base = appUrl(c.env, c.req.raw);
    const t = templates.adminNotice(c.env, base, 'NGO awaiting verification', {
      NGO: p.name,
      City: p.city,
      'Registration no.': p.registrationNumber,
      Certificate: p.certificateKey ? 'Uploaded' : 'Not uploaded yet',
      Contact: `${user.name} <${user.email}>`,
      Phone: p.phone,
      Review: `${base}/admin/verifications?type=ngo`,
    });
    await emailAdmins(c.env, t.subject, t.html);
  }
  const r = await c.env.DB.prepare('SELECT * FROM ngos WHERE user_id = ?').bind(uid).first();
  return c.json({ profile: toNgo(r!) });
});

/** My claims: upcoming (pending), completed, cancelled (incl. no-shows). */
ngo.get('/claims', async (c) => {
  const uid = c.get('user').id;
  const { page, pageSize, offset } = pageParams(c.req.query());
  const tab = c.req.query('status') ?? 'upcoming';
  const where =
    tab === 'completed' ? "c.status = 'completed'" : tab === 'cancelled' ? "c.status IN ('cancelled', 'no_show')" : "c.status = 'pending'";
  const order = tab === 'upcoming' ? 'c.pickup_by ASC' : 'c.created_at DESC';
  const { results } = await c.env.DB.prepare(`${CLAIM_SELECT_FOR_NGO} WHERE c.ngo_id = ? AND ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(uid, pageSize + 1, offset)
    .all();
  return c.json(paginate(results.map((r) => toClaim(r, 'ngo')), page, pageSize));
});

ngo.post('/claims/:id/cancel', async (c) => {
  await cancelClaim(c.env, c.req.param('id'), c.get('user').id, now());
  return c.json({ ok: true });
});

ngo.post('/claims/:id/rate', async (c) => {
  const uid = c.get('user').id;
  const { rating, comment } = parse(ratingSchema, await readJson(c.req.raw));
  const claim = await c.env.DB.prepare('SELECT restaurant_id FROM claims WHERE id = ? AND ngo_id = ?').bind(c.req.param('id'), uid).first<{ restaurant_id: string }>();
  if (!claim) fail(404, 'Claim not found');
  const res = await c.env.DB.prepare(
    "UPDATE claims SET food_rating = ?, food_comment = ? WHERE id = ? AND ngo_id = ? AND status = 'completed' AND food_rating IS NULL",
  )
    .bind(rating, comment ?? null, c.req.param('id'), uid)
    .run();
  if (res.meta.changes !== 1) fail(409, 'Only completed pickups can be rated, once');
  await c.env.DB.prepare('UPDATE restaurants SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?')
    .bind(rating, claim.restaurant_id)
    .run();
  return c.json({ ok: true });
});
