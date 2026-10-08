import { afterEach, describe, expect, it, vi } from 'vitest';
import { listingTimeError } from '../../shared/listingTimes';
import { makeClient, makeEnv, seedUser, VADODARA } from './helpers';

const H = 3600_000;

describe('shared listing time rules (used by the form and the API)', () => {
  const now = Date.UTC(2026, 9, 8, 10);
  const ok = { cookedAt: now - H, safeUntil: now + 4 * H, pickupStart: now, pickupEnd: now + H };

  it('accepts a valid listing (e.g. the reported 3:23 cooked / 4:15–4:30 pickup / 8:15 safe)', () => {
    expect(listingTimeError(ok, now)).toBeNull();
  });

  it('returns a specific code for each problem', () => {
    expect(listingTimeError({ ...ok, cookedAt: now + H }, now)).toBe('cookedFuture');
    expect(listingTimeError({ ...ok, safeUntil: now - 1 }, now)).toBe('safePast');
    expect(listingTimeError({ ...ok, cookedAt: now - 13 * H, pickupStart: now - 13 * H }, now)).toBe('tooLong');
    expect(listingTimeError({ ...ok, pickupEnd: ok.pickupStart }, now)).toBe('pickupOrder');
    expect(listingTimeError({ ...ok, pickupEnd: now + 5 * H }, now)).toBe('pickupAfterSafe');
    expect(listingTimeError({ ...ok, pickupStart: now - 2 * H }, now)).toBe('pickupBeforeCooked');
  });
});

describe('admin is notified when a profile needs verification', () => {
  afterEach(() => vi.restoreAllMocks());

  const profile = { name: 'Sia ka Dhaba', address: 'RC Dutt Road, Vadodara', city: 'Vadodara', ...VADODARA, phone: '9876543210', fssaiNumber: '10012345678901' };

  it('emails admins for a new restaurant profile, but not for an ordinary edit', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { env, d1 } = makeEnv();
    seedUser(d1, 'r1', 'r1@test.in', 'restaurant');
    const { request } = makeClient(env);
    expect((await request('/api/restaurant/profile', { method: 'PUT', as: 'r1', json: profile })).status).toBe(200);
    const adminMails = () => log.mock.calls.filter((c) => String(c[0]).includes('to=admin@test.in') && String(c[0]).includes('awaiting verification'));
    expect(adminMails()).toHaveLength(1);
    await request('/api/restaurant/profile', { method: 'PUT', as: 'r1', json: { ...profile, phone: '9876500000' } });
    expect(adminMails()).toHaveLength(1);
  });

  it('emails admins for a new NGO profile', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { env, d1 } = makeEnv();
    seedUser(d1, 'n1', 'n1@test.in', 'ngo');
    const { request } = makeClient(env);
    const res = await request('/api/ngo/profile', {
      method: 'PUT',
      as: 'n1',
      json: { name: 'Roti Bank', address: 'Manjalpur, Vadodara', city: 'Vadodara', ...VADODARA, phone: '9876543210', registrationNumber: 'GUJ/1/2020' },
    });
    expect(res.status).toBe(200);
    expect(log.mock.calls.some((c) => String(c[0]).includes('NGO awaiting verification'))).toBe(true);
  });
});
