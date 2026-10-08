import { describe, expect, it } from 'vitest';
import { geocode, normaliseQuery } from '../src/lib/geocode';
import { makeEnv } from './helpers';

const NOMINATIM_RESPONSE = [
  {
    display_name: 'Alkapuri, Vadodara, Gujarat, 390007, India',
    lat: '22.3105',
    lon: '73.1700',
    address: { suburb: 'Alkapuri', city: 'Vadodara', state: 'Gujarat' },
  },
];

describe('geocoding (Nominatim, cached in D1)', () => {
  it('normalises queries for the cache key', () => {
    expect(normaliseQuery('  Alkapuri   VADODARA ')).toBe('alkapuri vadodara');
  });

  it('calls Nominatim once, then serves from the D1 cache', async () => {
    const { env } = makeEnv({ CONTACT_EMAIL: 'ops@surplusserve.in' });
    const calls: { url: string; ua: string | null }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, ua: new Headers(init?.headers).get('User-Agent') });
      return new Response(JSON.stringify(NOMINATIM_RESPONSE), { status: 200 });
    }) as typeof fetch;

    const first = await geocode(env, 'Alkapuri Vadodara', fakeFetch);
    expect(first).toEqual([{ label: NOMINATIM_RESPONSE[0].display_name, lat: 22.3105, lng: 73.17, city: 'Vadodara' }]);
    const second = await geocode(env, '  alkapuri   vadodara', fakeFetch);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('countrycodes=in');
    expect(calls[0].url).toContain('email=ops%40surplusserve.in');
    expect(calls[0].ua).toMatch(/^SurplusServe\/1\.0 \(https:\/\/github\.com/);
  });

  it('never sends placeholder contact emails', async () => {
    const { env } = makeEnv({ CONTACT_EMAIL: 'admin@example.com' });
    let url = '';
    await geocode(env, 'Sayajigunj', (async (u: string) => {
      url = u;
      return new Response('[]');
    }) as typeof fetch);
    expect(url).not.toContain('email=');
  });

  it('rejects too-short queries', async () => {
    const { env } = makeEnv();
    await expect(geocode(env, 'ab')).rejects.toThrow(/at least 3/);
  });
});
