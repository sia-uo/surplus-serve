import { Hono } from 'hono';
import { boundingBox, haversineKm } from '../../../shared/geo';
import type { AppEnv } from '../env';
import { CLAIM_SELECT_FOR_NGO, LISTING_SELECT, toClaim, toListing } from '../lib/mappers';
import { claimSchema, searchSchema } from '../lib/schemas';
import { requireAuth, requireRole } from '../lib/session';
import { appUrl, fail, now, parse, readJson } from '../lib/util';
import { createClaim } from '../services/listings';

export const listings = new Hono<AppEnv>();
listings.use('*', requireAuth);

const SEARCH_PAGE_SIZE = 20;
const SEARCH_SCAN_LIMIT = 300;

/**
 * Nearby search: indexed bounding-box pre-filter in SQL, exact Haversine
 * distance + radius filter and distance sort in the Worker, then paginate.
 */
listings.get('/search', requireRole('ngo', 'admin'), async (c) => {
  const q = parse(searchSchema, c.req.query());
  const t = now();
  const box = boundingBox(q.lat, q.lng, q.radius);
  const conds = [
    "l.status = 'active'",
    'l.lat BETWEEN ? AND ?',
    'l.lng BETWEEN ? AND ?',
    'l.safe_until > ?',
    'l.pickup_end > ?',
    'l.servings_remaining > 0',
  ];
  const binds: (string | number)[] = [box.minLat, box.maxLat, box.minLng, box.maxLng, t, t];
  if (q.foodType) {
    conds.push('l.food_type = ?');
    binds.push(q.foodType);
  }
  if (q.minServings) {
    conds.push('l.servings_remaining >= ?');
    binds.push(q.minServings);
  }
  const { results } = await c.env.DB.prepare(
    `${LISTING_SELECT} JOIN users u ON u.id = l.restaurant_id WHERE ${conds.join(' AND ')} AND u.status = 'active' LIMIT ${SEARCH_SCAN_LIMIT}`,
  )
    .bind(...binds)
    .all();

  const withDistance = results
    .map((r) => ({ r, d: haversineKm(q.lat, q.lng, r.lat as number, r.lng as number) }))
    .filter((x) => x.d <= q.radius)
    .sort((a, b) => a.d - b.d);
  const start = (q.page - 1) * SEARCH_PAGE_SIZE;
  const pageItems = withDistance.slice(start, start + SEARCH_PAGE_SIZE).map(({ r, d }) => toListing(r, t, d));
  return c.json({
    items: pageItems,
    page: q.page,
    pageSize: SEARCH_PAGE_SIZE,
    hasMore: withDistance.length > start + SEARCH_PAGE_SIZE,
    total: withDistance.length,
  });
});

listings.get('/:id', async (c) => {
  const row = await c.env.DB.prepare(`${LISTING_SELECT} WHERE l.id = ?`).bind(c.req.param('id')).first();
  if (!row) fail(404, 'Listing not found');
  const user = c.get('user');
  if (user.role === 'restaurant' && row.restaurant_id !== user.id) fail(404, 'Listing not found');
  return c.json({ listing: toListing(row, now()) });
});

listings.post('/:id/claim', requireRole('ngo'), async (c) => {
  const { servings } = parse(claimSchema, await readJson(c.req.raw));
  const user = c.get('user');
  const claimId = await createClaim(c.env, appUrl(c.env, c.req.raw), user.id, c.req.param('id'), servings, now());
  const row = await c.env.DB.prepare(`${CLAIM_SELECT_FOR_NGO} WHERE c.id = ?`).bind(claimId).first();
  return c.json({ claim: toClaim(row!, 'ngo') }, 201);
});
