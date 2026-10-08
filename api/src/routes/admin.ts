import { Hono } from 'hono';
import { impactFromMeals } from '../../../shared/scoring';
import type { SponsorReport } from '../../../shared/types';
import type { AppEnv } from '../env';
import { verifyChain } from '../lib/audit';
import { sendEmail, templates } from '../lib/email';
import { CLAIM_SELECT_FOR_RESTAURANT, LISTING_SELECT, ngoReliability, toClaim, toListing, toNgo, toRestaurant, toSponsor } from '../lib/mappers';
import { reportSchema, sponsorSchema, verifyDecisionSchema } from '../lib/schemas';
import { requireAuth, requireRole } from '../lib/session';
import { appUrl, fail, IST_OFFSET_MS, logAdminAction, newId, normaliseCity, now, pageParams, paginate, parse, readJson, titleCase } from '../lib/util';
import { impactStats } from './public';

export const admin = new Hono<AppEnv>();
admin.use('*', requireAuth, requireRole('admin'));

admin.get('/overview', async (c) => {
  const [global, pendingR, pendingN, cities, listingCounts, users] = await Promise.all([
    impactStats(c.env),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM restaurants WHERE verification = 'pending'").first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM ngos WHERE verification = 'pending'").first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT city, SUM(servings) AS meals, COUNT(*) AS pickups, COUNT(DISTINCT restaurant_id) AS restaurants, COUNT(DISTINCT ngo_id) AS ngos
       FROM pickup_audit GROUP BY city ORDER BY meals DESC LIMIT 25`,
    ).all<{ city: string; meals: number; pickups: number; restaurants: number; ngos: number }>(),
    c.env.DB.prepare('SELECT status, COUNT(*) AS n FROM listings GROUP BY status').all<{ status: string; n: number }>(),
    c.env.DB.prepare('SELECT role, COUNT(*) AS n FROM users GROUP BY role').all<{ role: string | null; n: number }>(),
  ]);
  return c.json({
    stats: global,
    pending: { restaurants: pendingR?.n ?? 0, ngos: pendingN?.n ?? 0 },
    cities: cities.results.map((r) => ({ ...r, label: titleCase(r.city), ...impactFromMeals(r.meals) })),
    listings: Object.fromEntries(listingCounts.results.map((r) => [r.status, r.n])),
    users: Object.fromEntries(users.results.map((r) => [r.role ?? 'unassigned', r.n])),
  });
});

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------
admin.get('/verifications', async (c) => {
  const type = c.req.query('type') === 'restaurant' ? 'restaurant' : 'ngo';
  const status = ['pending', 'approved', 'rejected'].includes(c.req.query('status') ?? '') ? c.req.query('status')! : 'pending';
  const { page, pageSize, offset } = pageParams(c.req.query());
  const table = type === 'restaurant' ? 'restaurants' : 'ngos';
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, u.email, u.status AS user_status FROM ${table} p JOIN users u ON u.id = p.user_id
     WHERE p.verification = ? ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(status, pageSize + 1, offset)
    .all<Record<string, any>>();
  const items = results.map((r) => ({
    userId: r.user_id,
    email: r.email,
    userStatus: r.user_status,
    createdAt: r.created_at,
    profile: type === 'restaurant' ? toRestaurant(r) : toNgo(r),
  }));
  return c.json(paginate(items, page, pageSize));
});

for (const type of ['restaurants', 'ngos'] as const) {
  admin.post(`/${type}/:id/verify`, async (c) => {
    const id = c.req.param('id');
    const { decision, reason } = parse(verifyDecisionSchema, await readJson(c.req.raw));
    if (decision === 'rejected' && !reason) fail(400, 'Please give a reason for rejection');
    const res = await c.env.DB.prepare(`UPDATE ${type} SET verification = ?, rejection_reason = ?, updated_at = ? WHERE user_id = ?`)
      .bind(decision, decision === 'rejected' ? reason : null, now(), id)
      .run();
    if (res.meta.changes !== 1) fail(404, 'Profile not found');
    await logAdminAction(c.env, c.get('user').id, `${type}.${decision}`, id, reason);
    const target = await c.env.DB.prepare(`SELECT u.email, p.name FROM users u JOIN ${type} p ON p.user_id = u.id WHERE u.id = ?`)
      .bind(id)
      .first<{ email: string; name: string }>();
    if (target) {
      const t = templates.verification(c.env, appUrl(c.env, c.req.raw), target.name, decision === 'approved', reason);
      await sendEmail(c.env, { to: target.email, ...t }, 'critical');
    }
    return c.json({ ok: true });
  });
}

admin.post('/restaurants/:id/premium', async (c) => {
  const body = (await readJson(c.req.raw)) as { premium?: unknown };
  if (typeof body.premium !== 'boolean') fail(400, 'Invalid premium flag');
  const res = await c.env.DB.prepare('UPDATE restaurants SET premium = ?, updated_at = ? WHERE user_id = ?')
    .bind(body.premium ? 1 : 0, now(), c.req.param('id'))
    .run();
  if (res.meta.changes !== 1) fail(404, 'Restaurant not found');
  await logAdminAction(c.env, c.get('user').id, body.premium ? 'premium.on' : 'premium.off', c.req.param('id'));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
admin.get('/users', async (c) => {
  const { page, pageSize, offset } = pageParams(c.req.query());
  const q = (c.req.query('q') ?? '').trim().toLowerCase();
  const role = c.req.query('role');
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (q) {
    conds.push('(u.email LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(COALESCE(r.name, n.name, \'\')) LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (role && ['restaurant', 'ngo', 'admin'].includes(role)) {
    conds.push('u.role = ?');
    binds.push(role);
  }
  if (c.req.query('status') === 'suspended') conds.push("u.status = 'suspended'");
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.status, u.suspended_reason, u.created_at, u.last_login_at,
       COALESCE(r.name, n.name) AS org_name, COALESCE(r.city, n.city) AS city,
       COALESCE(r.verification, n.verification) AS verification, r.premium,
       n.completed_count, n.no_show_count, n.rating_sum, n.rating_count
     FROM users u LEFT JOIN restaurants r ON r.user_id = u.id LEFT JOIN ngos n ON n.user_id = u.id
     ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize + 1, offset)
    .all<Record<string, any>>();
  const items = results.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    suspendedReason: u.suspended_reason,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    orgName: u.org_name,
    city: u.city,
    verification: u.verification,
    premium: !!u.premium,
    noShows: u.no_show_count ?? null,
    reliability: u.role === 'ngo' && u.completed_count != null ? ngoReliability(u) : null,
  }));
  return c.json(paginate(items, page, pageSize));
});

admin.post('/users/:id/suspend', async (c) => {
  const body = (await readJson(c.req.raw)) as { suspended?: unknown; reason?: unknown };
  if (typeof body.suspended !== 'boolean') fail(400, 'Invalid suspended flag');
  const id = c.req.param('id');
  if (id === c.get('user').id) fail(400, 'You cannot suspend yourself');
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : null;
  const res = await c.env.DB.prepare('UPDATE users SET status = ?, suspended_reason = ? WHERE id = ?')
    .bind(body.suspended ? 'suspended' : 'active', body.suspended ? reason || 'Suspended by admin' : null, id)
    .run();
  if (res.meta.changes !== 1) fail(404, 'User not found');
  if (!body.suspended) {
    // Reinstating an NGO clears its no-show strikes so it is not immediately re-suspended.
    await c.env.DB.prepare('UPDATE ngos SET no_show_count = 0 WHERE user_id = ?').bind(id).run();
  }
  await logAdminAction(c.env, c.get('user').id, body.suspended ? 'user.suspend' : 'user.reinstate', id, reason ?? undefined);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Listings & claims
// ---------------------------------------------------------------------------
admin.get('/listings', async (c) => {
  const { page, pageSize, offset } = pageParams(c.req.query());
  const status = c.req.query('status');
  const city = c.req.query('city');
  const conds: string[] = [];
  const binds: (string | number)[] = [];
  if (status && ['active', 'claimed', 'completed', 'expired', 'cancelled'].includes(status)) {
    conds.push('l.status = ?');
    binds.push(status);
  }
  if (city) {
    conds.push('l.city = ?');
    binds.push(normaliseCity(city));
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { results } = await c.env.DB.prepare(`${LISTING_SELECT} ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize + 1, offset)
    .all();
  const t = now();
  return c.json(paginate(results.map((r) => toListing(r, t)), page, pageSize));
});

admin.get('/claims', async (c) => {
  const { page, pageSize, offset } = pageParams(c.req.query());
  const status = c.req.query('status');
  const filter = status && ['pending', 'completed', 'cancelled', 'no_show'].includes(status) ? 'WHERE c.status = ?' : '';
  const sql = CLAIM_SELECT_FOR_RESTAURANT.replace(
    'FROM claims c',
    ', r.name AS r_name, r.address AS r_address, r.phone AS r_phone, r.upi_id AS r_upi_id, r.lat AS r_lat, r.lng AS r_lng FROM claims c',
  ) + ' JOIN restaurants r ON r.user_id = c.restaurant_id';
  const { results } = await c.env.DB.prepare(`${sql} ${filter} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...(filter ? [status!] : []), pageSize + 1, offset)
    .all();
  return c.json(paginate(results.map((r) => toClaim(r, 'admin')), page, pageSize));
});

// ---------------------------------------------------------------------------
// Sponsors
// ---------------------------------------------------------------------------
admin.get('/sponsors', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM sponsors ORDER BY end_date DESC, name LIMIT 200').all();
  return c.json({ items: results.map(toSponsor) });
});

function sponsorBinds(b: ReturnType<typeof sponsorSchema.parse>) {
  const city = b.city.trim().toLowerCase() === 'all' ? 'all' : normaliseCity(b.city);
  return [b.name, b.logoKey || null, b.website || null, city, b.tier, b.startDate, b.endDate];
}

admin.post('/sponsors', async (c) => {
  const b = parse(sponsorSchema, await readJson(c.req.raw));
  if (b.logoKey && !b.logoKey.startsWith('logos/')) fail(400, 'Invalid logo');
  const id = newId();
  const t = now();
  await c.env.DB.prepare(
    'INSERT INTO sponsors (name, logo_key, website, city, tier, start_date, end_date, id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(...sponsorBinds(b), id, t, t)
    .run();
  await logAdminAction(c.env, c.get('user').id, 'sponsor.create', id, b.name);
  const row = await c.env.DB.prepare('SELECT * FROM sponsors WHERE id = ?').bind(id).first();
  return c.json({ sponsor: toSponsor(row!) }, 201);
});

admin.put('/sponsors/:id', async (c) => {
  const b = parse(sponsorSchema, await readJson(c.req.raw));
  if (b.logoKey && !b.logoKey.startsWith('logos/')) fail(400, 'Invalid logo');
  const res = await c.env.DB.prepare(
    'UPDATE sponsors SET name = ?, logo_key = ?, website = ?, city = ?, tier = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?',
  )
    .bind(...sponsorBinds(b), now(), c.req.param('id'))
    .run();
  if (res.meta.changes !== 1) fail(404, 'Sponsor not found');
  await logAdminAction(c.env, c.get('user').id, 'sponsor.update', c.req.param('id'), b.name);
  return c.json({ ok: true });
});

admin.delete('/sponsors/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT logo_key FROM sponsors WHERE id = ?').bind(c.req.param('id')).first<{ logo_key: string | null }>();
  if (!row) fail(404, 'Sponsor not found');
  await c.env.DB.prepare('DELETE FROM sponsors WHERE id = ?').bind(c.req.param('id')).run();
  if (row.logo_key) await c.env.UPLOADS.delete(row.logo_key);
  await logAdminAction(c.env, c.get('user').id, 'sponsor.delete', c.req.param('id'));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Sponsor impact report (OTP-verified pickups only)
// ---------------------------------------------------------------------------
function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote special characters.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

admin.get('/report', async (c) => {
  const q = parse(reportSchema, c.req.query());
  if (q.to < q.from) fail(400, 'End date must be after start date');
  const city = normaliseCity(q.city);
  const fromTs = Date.parse(`${q.from}T00:00:00Z`) - IST_OFFSET_MS;
  const toTs = Date.parse(`${q.to}T00:00:00Z`) - IST_OFFSET_MS + 24 * 3600_000;
  if (toTs - fromTs > 400 * 24 * 3600_000) fail(400, 'Report range can be at most ~13 months');
  const allCities = city === 'all';
  const where = allCities ? 'verified_at >= ? AND verified_at < ?' : 'city = ? AND verified_at >= ? AND verified_at < ?';
  const binds = allCities ? [fromTs, toTs] : [city, fromTs, toTs];

  if (q.format === 'csv') {
    const { results } = await c.env.DB.prepare(
      `SELECT seq, verified_at, city, restaurant_name, ngo_name, food_title, food_type, servings, otp_verified, claim_id, hash
       FROM pickup_audit WHERE ${where} ORDER BY verified_at LIMIT 10000`,
    )
      .bind(...binds)
      .all<Record<string, any>>();
    const header = ['seq', 'verified_at_ist', 'city', 'restaurant', 'ngo', 'food', 'food_type', 'servings', 'otp_verified', 'est_kg', 'est_co2_kg', 'claim_id', 'audit_hash'];
    const lines = [header.join(',')];
    for (const r of results) {
      const imp = impactFromMeals(r.servings);
      const ist = new Date(r.verified_at + IST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16);
      lines.push(
        [r.seq, ist, r.city, r.restaurant_name, r.ngo_name, r.food_title, r.food_type, r.servings, r.otp_verified ? 'yes' : 'no', imp.kgSaved, imp.co2Avoided, r.claim_id, r.hash]
          .map(csvCell)
          .join(','),
      );
    }
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="surplusserve-${city.replace(/\W+/g, '-')}-${q.from}-to-${q.to}.csv"`,
      },
    });
  }

  const [totals, byRestaurant, byNgo, daily] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(servings), 0) AS meals, COUNT(*) AS pickups, COUNT(DISTINCT restaurant_id) AS restaurants, COUNT(DISTINCT ngo_id) AS ngos
       FROM pickup_audit WHERE ${where}`,
    ).bind(...binds),
    c.env.DB.prepare(
      `SELECT restaurant_name AS name, SUM(servings) AS meals, COUNT(*) AS pickups FROM pickup_audit WHERE ${where}
       GROUP BY restaurant_id ORDER BY meals DESC LIMIT 50`,
    ).bind(...binds),
    c.env.DB.prepare(
      `SELECT ngo_name AS name, SUM(servings) AS meals, COUNT(*) AS pickups FROM pickup_audit WHERE ${where}
       GROUP BY ngo_id ORDER BY meals DESC LIMIT 50`,
    ).bind(...binds),
    c.env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', verified_at / 1000, 'unixepoch', '+330 minutes') AS date, SUM(servings) AS meals
       FROM pickup_audit WHERE ${where} GROUP BY date ORDER BY date`,
    ).bind(...binds),
  ]);
  const tot = totals.results[0] as { meals: number; pickups: number; restaurants: number; ngos: number };
  const sponsors = await c.env.DB.prepare(
    `SELECT * FROM sponsors WHERE start_date <= ? AND end_date >= ? ${allCities ? '' : "AND city IN (?, 'all')"}
     ORDER BY CASE tier WHEN 'platinum' THEN 0 WHEN 'gold' THEN 1 ELSE 2 END`,
  )
    .bind(...(allCities ? [q.to, q.from] : [q.to, q.from, city]))
    .all();
  const report: SponsorReport = {
    city: allCities ? 'All cities' : titleCase(city),
    from: q.from,
    to: q.to,
    ...impactFromMeals(tot.meals),
    pickups: tot.pickups,
    restaurants: tot.restaurants,
    ngos: tot.ngos,
    sponsors: sponsors.results.map(toSponsor),
    byRestaurant: byRestaurant.results as SponsorReport['byRestaurant'],
    byNgo: byNgo.results as SponsorReport['byNgo'],
    daily: daily.results as SponsorReport['daily'],
  };
  return c.json(report);
});

// ---------------------------------------------------------------------------
// Audit log & messages
// ---------------------------------------------------------------------------
admin.get('/audit', async (c) => {
  const { page, pageSize, offset } = pageParams(c.req.query());
  const { results } = await c.env.DB.prepare('SELECT * FROM pickup_audit ORDER BY seq DESC LIMIT ? OFFSET ?')
    .bind(pageSize + 1, offset)
    .all<Record<string, any>>();
  const items = results.map((r) => ({
    seq: r.seq,
    claimId: r.claim_id,
    restaurantName: r.restaurant_name,
    ngoName: r.ngo_name,
    city: r.city,
    foodTitle: r.food_title,
    servings: r.servings,
    otpVerified: !!r.otp_verified,
    verifiedAt: r.verified_at,
    hash: r.hash,
  }));
  return c.json(paginate(items, page, pageSize));
});

/** Verifies the hash chain over the most recent N rows (bounded to stay within free-tier CPU). */
admin.get('/audit/verify', async (c) => {
  const limit = Math.min(500, Math.max(1, Number(c.req.query('limit') ?? 200) || 200));
  const { results } = await c.env.DB.prepare('SELECT * FROM (SELECT * FROM pickup_audit ORDER BY seq DESC LIMIT ?) ORDER BY seq ASC')
    .bind(limit)
    .all<any>();
  const broken = await verifyChain(results);
  return c.json({ checked: results.length, ok: broken === -1, brokenAtSeq: broken === -1 ? null : results[broken].seq });
});

admin.get('/messages', async (c) => {
  const { page, pageSize, offset } = pageParams(c.req.query());
  const { results } = await c.env.DB.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(pageSize + 1, offset)
    .all<Record<string, any>>();
  return c.json(
    paginate(
      results.map((m) => ({
        id: m.id,
        kind: m.kind,
        name: m.name,
        email: m.email,
        organisation: m.organisation,
        city: m.city,
        phone: m.phone,
        message: m.message,
        handled: !!m.handled,
        createdAt: m.created_at,
      })),
      page,
      pageSize,
    ),
  );
});

admin.post('/messages/:id/handled', async (c) => {
  await c.env.DB.prepare('UPDATE contact_messages SET handled = 1 WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
