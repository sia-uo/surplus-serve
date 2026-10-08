import type { GeocodeResult } from '../../../shared/types';
import type { Env } from '../env';
import { fail } from './util';

const CACHE_TTL_MS = 90 * 24 * 3600_000;
/** Nominatim's usage policy allows at most 1 request per second. */
const MIN_INTERVAL_MS = 1100;

export function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

export function toResults(items: NominatimItem[]): GeocodeResult[] {
  return items.slice(0, 5).map((it) => {
    const a = it.address ?? {};
    const city = a.city || a.town || a.village || a.city_district || a.county || a.state_district || a.state || '';
    return { label: it.display_name, lat: Number(it.lat), lng: Number(it.lon), city };
  });
}

/**
 * Geocode an address within India. Results are cached in D1; a global
 * timestamp in app_state spaces outgoing Nominatim calls by >1 s.
 */
export async function geocode(env: Env, query: string, fetcher: typeof fetch = fetch): Promise<GeocodeResult[]> {
  const key = normaliseQuery(query);
  if (key.length < 3) fail(400, 'Please enter at least 3 characters');

  const cached = await env.DB.prepare('SELECT results, created_at FROM geocode_cache WHERE query = ?')
    .bind(key)
    .first<{ results: string; created_at: number }>();
  if (cached && Date.now() - cached.created_at < CACHE_TTL_MS) return JSON.parse(cached.results);

  // Global spacing: claim the "slot" atomically; if someone called <1.1 s ago, wait briefly once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = Date.now();
    const res = await env.DB.prepare(
      `INSERT INTO app_state (key, value, updated_at) VALUES ('nominatim_last', ?1, ?1)
       ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = ?1 WHERE CAST(value AS INTEGER) <= ?2`,
    )
      .bind(t, t - MIN_INTERVAL_MS)
      .run();
    if (res.meta.changes > 0) break;
    if (attempt === 1) fail(429, 'Address lookup is busy, please try again in a moment');
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS));
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query.trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'in');
  url.searchParams.set('limit', '5');
  // OSM policy: identify the app; a real contact email goes in the `email` parameter.
  // (Placeholder addresses or localhost URLs in the User-Agent get a 403.)
  const contact = env.CONTACT_EMAIL?.trim();
  if (contact && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(contact) && !/@example\.(com|org)$/i.test(contact)) {
    url.searchParams.set('email', contact);
  }
  const resp = await fetcher(url.toString(), {
    headers: {
      'User-Agent': 'SurplusServe/1.0 (https://github.com/sia-uo/surplus-serve)',
      'Accept-Language': 'en',
    },
  });
  if (!resp.ok) fail(503, 'Address lookup is temporarily unavailable');
  const results = toResults((await resp.json()) as NominatimItem[]);

  await env.DB.prepare(
    `INSERT INTO geocode_cache (query, results, created_at) VALUES (?, ?, ?)
     ON CONFLICT(query) DO UPDATE SET results = excluded.results, created_at = excluded.created_at`,
  )
    .bind(key, JSON.stringify(results), Date.now())
    .run();
  return results;
}
