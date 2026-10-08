import { Hono } from 'hono';
import { impactFromMeals } from '../../../shared/scoring';
import type { AppConfig, ImpactStats } from '../../../shared/types';
import type { AppEnv, Env } from '../env';
import { emailAdmins, templates } from '../lib/email';
import { geocode } from '../lib/geocode';
import { toSponsor } from '../lib/mappers';
import { rateLimit } from '../lib/ratelimit';
import { sponsorContactSchema } from '../lib/schemas';
import { requireAuth } from '../lib/session';
import { appUrl, fail, newId, normaliseCity, now, parse, readJson, titleCase } from '../lib/util';

export const pub = new Hono<AppEnv>();

pub.use('/public/*', rateLimit('public', 120, 60_000));

/** Small edge-cache wrapper so popular public counters don't hit D1 on every view. */
async function cached(c: { req: { url: string }; executionCtx: { waitUntil(p: Promise<unknown>): void } }, ttl: number, build: () => Promise<Response>) {
  let cache: Cache | undefined;
  try {
    cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
  } catch {
    cache = undefined;
  }
  const key = new Request(c.req.url);
  if (cache) {
    const hit = await cache.match(key);
    // Cached responses have immutable headers; re-wrap so later middleware can add headers.
    if (hit) return new Response(hit.body, hit);
  }
  const res = await build();
  res.headers.set('Cache-Control', `public, max-age=${ttl}`);
  if (cache && res.ok) {
    try {
      c.executionCtx.waitUntil(cache.put(key, res.clone()));
    } catch {
      /* no execution context in tests */
    }
  }
  return res;
}

const today = () => new Date(now() + 330 * 60_000).toISOString().slice(0, 10);

async function activeSponsors(env: Env, city?: string) {
  const d = today();
  const stmt = city
    ? env.DB.prepare(
        `SELECT * FROM sponsors WHERE start_date <= ?1 AND end_date >= ?1 AND city IN (?2, 'all')
         ORDER BY CASE tier WHEN 'platinum' THEN 0 WHEN 'gold' THEN 1 ELSE 2 END, name LIMIT 50`,
      ).bind(d, city)
    : env.DB.prepare(
        `SELECT * FROM sponsors WHERE start_date <= ?1 AND end_date >= ?1
         ORDER BY CASE tier WHEN 'platinum' THEN 0 WHEN 'gold' THEN 1 ELSE 2 END, name LIMIT 50`,
      ).bind(d);
  const { results } = await stmt.all();
  return results.map(toSponsor);
}

export async function impactStats(env: Env, city?: string): Promise<ImpactStats> {
  const where = city ? 'WHERE city = ?' : '';
  const binds = city ? [city] : [];
  const [audit, rest, ngos] = await env.DB.batch([
    env.DB.prepare(`SELECT COALESCE(SUM(servings), 0) AS meals, COUNT(*) AS pickups FROM pickup_audit ${where}`).bind(...binds),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM restaurants ${city ? "WHERE city = ? AND verification = 'approved'" : "WHERE verification = 'approved'"}`).bind(...binds),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM ngos ${city ? "WHERE city = ? AND verification = 'approved'" : "WHERE verification = 'approved'"}`).bind(...binds),
  ]);
  const a = audit.results[0] as { meals: number; pickups: number };
  const impact = impactFromMeals(a.meals);
  return {
    ...impact,
    pickups: a.pickups,
    restaurants: (rest.results[0] as { n: number }).n,
    ngos: (ngos.results[0] as { n: number }).n,
  };
}

pub.get('/config', (c) => {
  const cfg: AppConfig = {
    packagingCap: Number(c.env.PACKAGING_CAP ?? 15) || 15,
    googleEnabled: !!c.env.GOOGLE_CLIENT_ID,
    devLogin: c.env.DEV_LOGIN === 'true' && ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname),
  };
  return c.json(cfg);
});

pub.get('/public/stats', (c) =>
  cached(c, 300, async () => c.json({ stats: await impactStats(c.env), sponsors: await activeSponsors(c.env) })),
);

pub.get('/public/cities', (c) =>
  cached(c, 600, async () => {
    const { results } = await c.env.DB.prepare(
      'SELECT city, SUM(servings) AS meals FROM pickup_audit GROUP BY city ORDER BY meals DESC LIMIT 50',
    ).all<{ city: string; meals: number }>();
    return c.json({ items: results.map((r) => ({ city: r.city, label: titleCase(r.city), meals: r.meals })) });
  }),
);

pub.get('/public/city/:city', (c) =>
  cached(c, 300, async () => {
    const city = normaliseCity(decodeURIComponent(c.req.param('city')));
    if (city.length < 2 || city.length > 80) fail(400, 'Invalid city');
    const [stats, sponsors, top] = await Promise.all([
      impactStats(c.env, city),
      activeSponsors(c.env, city),
      c.env.DB.prepare(
        `SELECT r.name, r.premium, SUM(a.servings) AS meals FROM pickup_audit a JOIN restaurants r ON r.user_id = a.restaurant_id
         WHERE a.city = ? AND r.hide_name = 0 GROUP BY a.restaurant_id ORDER BY meals DESC LIMIT 10`,
      )
        .bind(city)
        .all<{ name: string; premium: number; meals: number }>(),
    ]);
    return c.json({
      city,
      label: titleCase(city),
      stats,
      sponsors,
      topRestaurants: top.results.map((r) => ({ name: r.name, premium: !!r.premium, meals: r.meals })),
    });
  }),
);

pub.post('/public/sponsor-contact', rateLimit('contact', 3, 3600_000), async (c) => {
  const b = parse(sponsorContactSchema, await readJson(c.req.raw));
  if (b.website) return c.json({ ok: true }); // honeypot tripped: pretend success
  await c.env.DB.prepare(
    `INSERT INTO contact_messages (id, kind, name, email, organisation, city, phone, message, created_at)
     VALUES (?, 'sponsor', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId(), b.name, b.email, b.organisation, b.city ?? null, b.phone ?? null, b.message, now())
    .run();
  const t = templates.adminNotice(c.env, appUrl(c.env, c.req.raw), 'New sponsorship enquiry', {
    Name: b.name,
    Email: b.email,
    Organisation: b.organisation,
    City: b.city,
    Phone: b.phone,
    Message: b.message,
  });
  await emailAdmins(c.env, t.subject, t.html);
  return c.json({ ok: true });
});

pub.get('/geocode', requireAuth, rateLimit('geocode', 20, 60_000), async (c) => {
  const q = c.req.query('q') ?? '';
  const results = await geocode(c.env, q);
  return c.json({ results });
});
