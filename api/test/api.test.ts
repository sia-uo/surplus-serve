import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { listingBody, makeClient, makeEnv, seedNgo, seedRestaurant, seedUser, TestD1, VADODARA } from './helpers';

let env: Env;
let d1: TestD1;
let api: ReturnType<typeof makeClient>['request'];

beforeEach(() => {
  ({ env, d1 } = makeEnv());
  api = makeClient(env).request;
});

async function postListing(restaurantId = 'r1', overrides: Record<string, unknown> = {}) {
  const res = await api('/api/restaurant/listings', { method: 'POST', as: restaurantId, json: listingBody(overrides) });
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.listing;
}

describe('auth & roles', () => {
  it('returns no user when signed out', async () => {
    const res = await api('/api/me');
    expect(res.status).toBe(200);
    expect(res.data.user).toBeNull();
  });

  it('rejects protected routes without a session', async () => {
    expect((await api('/api/restaurant/listings')).status).toBe(401);
    expect((await api('/api/admin/overview')).status).toBe(401);
  });

  it('lets a new user pick a role exactly once', async () => {
    seedUser(d1, 'u1', 'u1@test.in', null);
    const first = await api('/api/me/role', { method: 'POST', as: 'u1', json: { role: 'ngo' } });
    expect(first.status).toBe(200);
    const again = await api('/api/me/role', { method: 'POST', as: 'u1', json: { role: 'restaurant' } });
    expect(again.status).toBe(409);
    expect((await api('/api/me', { as: 'u1' })).data.user.role).toBe('ngo');
  });

  it('enforces role-based access', async () => {
    seedNgo(d1, 'n1');
    seedRestaurant(d1, 'r1');
    expect((await api('/api/restaurant/listings', { as: 'n1' })).status).toBe(403);
    expect((await api('/api/ngo/claims', { as: 'r1' })).status).toBe(403);
    expect((await api('/api/admin/overview', { as: 'r1' })).status).toBe(403);
  });

  it('blocks suspended users', async () => {
    seedNgo(d1, 'n1');
    d1.db.prepare("UPDATE users SET status = 'suspended' WHERE id = 'n1'").run();
    expect((await api('/api/ngo/claims', { as: 'n1' })).status).toBe(403);
    expect((await api('/api/me', { as: 'n1' })).data.user.status).toBe('suspended');
  });

  it('rejects tampered session tokens', async () => {
    const res = await api('/api/me', { headers: { Cookie: 'ss_session=abc.def.ghi' } });
    expect(res.data.user).toBeNull();
  });

  it('blocks cross-origin state-changing requests', async () => {
    seedUser(d1, 'u1', 'u1@test.in', null);
    const res = await api('/api/me/role', { method: 'POST', as: 'u1', json: { role: 'ngo' }, headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('dev login is disabled unless DEV_LOGIN=true', async () => {
    const res = await api('/api/auth/dev-login', { method: 'POST', json: { email: 'x@test.in' } });
    expect(res.status).toBe(404);
  });

  it('dev login grants admin to ADMIN_EMAILS when enabled', async () => {
    ({ env, d1 } = makeEnv({ DEV_LOGIN: 'true' }));
    api = makeClient(env).request;
    const res = await api('/api/auth/dev-login', { method: 'POST', json: { email: 'admin@test.in' } });
    expect(res.status).toBe(200);
    expect(res.data.role).toBe('admin');
    expect(res.headers.get('set-cookie')).toMatch(/ss_session=.*HttpOnly/i);
  });
});

describe('restaurant profile & listings', () => {
  it('creates a profile that starts pending approval', async () => {
    seedUser(d1, 'r9', 'r9@test.in', 'restaurant');
    const res = await api('/api/restaurant/profile', {
      method: 'PUT',
      as: 'r9',
      json: { name: 'Spice Garden', address: 'RC Dutt Road, Vadodara', city: 'Vadodara', ...VADODARA, phone: '+91 98765 43210', fssaiNumber: '10012345678901', hideName: true },
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.profile.verification).toBe('pending');
    expect(res.data.profile.city).toBe('vadodara');
    expect(res.data.profile.hideName).toBe(true);
  });

  it('validates FSSAI numbers', async () => {
    seedUser(d1, 'r9', 'r9@test.in', 'restaurant');
    const res = await api('/api/restaurant/profile', {
      method: 'PUT',
      as: 'r9',
      json: { name: 'X', address: 'Somewhere long', city: 'Vadodara', ...VADODARA, phone: '9876543210', fssaiNumber: '123' },
    });
    expect(res.status).toBe(400);
  });

  it('blocks posting until approved', async () => {
    seedRestaurant(d1, 'r1', { verification: 'pending' });
    const res = await api('/api/restaurant/listings', { method: 'POST', as: 'r1', json: listingBody() });
    expect(res.status).toBe(403);
  });

  it('requires the full food-safety checklist', async () => {
    seedRestaurant(d1, 'r1');
    const res = await api('/api/restaurant/listings', {
      method: 'POST',
      as: 'r1',
      json: listingBody({ checklist: { cookedHygienically: true } }),
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/checklist/);
  });

  it('enforces the packaging cost cap', async () => {
    seedRestaurant(d1, 'r1');
    const res = await api('/api/restaurant/listings', { method: 'POST', as: 'r1', json: listingBody({ packagingCost: 16 }) });
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/₹15/);
  });

  it('rejects pickup windows that end after safe-until', async () => {
    seedRestaurant(d1, 'r1');
    const t = Date.now();
    const res = await api('/api/restaurant/listings', { method: 'POST', as: 'r1', json: listingBody({ safeUntil: t + 3600_000, pickupEnd: t + 7200_000 }) });
    expect(res.status).toBe(400);
  });

  it('creates a listing and shows it on the dashboard', async () => {
    seedRestaurant(d1, 'r1');
    const l = await postListing();
    expect(l.status).toBe('active');
    expect(l.servingsRemaining).toBe(40);
    const dash = await api('/api/restaurant/dashboard', { as: 'r1' });
    expect(dash.data.counts.active).toBe(1);
    const list = await api('/api/restaurant/listings?status=active', { as: 'r1' });
    expect(list.data.items).toHaveLength(1);
  });

  it('cancels an active listing without claims', async () => {
    seedRestaurant(d1, 'r1');
    const l = await postListing();
    const res = await api(`/api/restaurant/listings/${l.id}/cancel`, { method: 'POST', as: 'r1' });
    expect(res.status).toBe(200);
  });
});

describe('search', () => {
  beforeEach(() => {
    seedRestaurant(d1, 'r1'); // Vadodara centre
    seedRestaurant(d1, 'r2', { lat: VADODARA.lat + 0.06, lng: VADODARA.lng }); // ~6.7 km north
    seedRestaurant(d1, 'r3', { lat: 23.0225, lng: 72.5714 }); // Ahmedabad
    seedNgo(d1, 'n1');
  });

  it('filters by radius and sorts by distance', async () => {
    await postListing('r1');
    await postListing('r2', { title: 'Dal rice', foodType: 'jain' });
    await postListing('r3');
    const near = await api(`/api/listings/search?lat=${VADODARA.lat}&lng=${VADODARA.lng}&radius=5`, { as: 'n1' });
    expect(near.status).toBe(200);
    expect(near.data.items).toHaveLength(1);
    const wider = await api(`/api/listings/search?lat=${VADODARA.lat}&lng=${VADODARA.lng}&radius=10`, { as: 'n1' });
    expect(wider.data.items.map((l: { restaurantId: string }) => l.restaurantId)).toEqual(['r1', 'r2']);
    expect(wider.data.items[0].distanceKm).toBeLessThan(wider.data.items[1].distanceKm);
  });

  it('filters by food type and minimum servings', async () => {
    await postListing('r1', { servings: 10 });
    await postListing('r2', { foodType: 'jain', servings: 50 });
    const jain = await api(`/api/listings/search?lat=${VADODARA.lat}&lng=${VADODARA.lng}&radius=10&foodType=jain`, { as: 'n1' });
    expect(jain.data.items).toHaveLength(1);
    const big = await api(`/api/listings/search?lat=${VADODARA.lat}&lng=${VADODARA.lng}&radius=10&minServings=20`, { as: 'n1' });
    expect(big.data.items).toHaveLength(1);
    expect(big.data.items[0].servingsRemaining).toBe(50);
  });

  it('marks listings urgent when safe-until is under 2 hours', async () => {
    const t = Date.now();
    await postListing('r1', { safeUntil: t + 90 * 60_000, pickupEnd: t + 60 * 60_000 });
    const res = await api(`/api/listings/search?lat=${VADODARA.lat}&lng=${VADODARA.lng}&radius=2`, { as: 'n1' });
    expect(res.data.items[0].urgent).toBe(true);
  });

  it('rejects unsupported radii', async () => {
    const res = await api(`/api/listings/search?lat=${VADODARA.lat}&lng=${VADODARA.lng}&radius=7`, { as: 'n1' });
    expect(res.status).toBe(400);
  });
});

describe('claims & pickup verification', () => {
  beforeEach(() => {
    seedRestaurant(d1, 'r1');
    seedNgo(d1, 'n1');
    seedNgo(d1, 'n2');
  });

  it('requires an approved NGO and the safety acknowledgement', async () => {
    seedNgo(d1, 'n3', { verification: 'pending' });
    const l = await postListing();
    expect((await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n3', json: { servings: 5, safetyAck: true } })).status).toBe(403);
    expect((await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 5, safetyAck: false } })).status).toBe(400);
  });

  it('supports partial claims with OTP, contact and directions', async () => {
    const l = await postListing();
    const res = await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 15, safetyAck: true } });
    expect(res.status).toBe(201);
    expect(res.data.claim.otp).toMatch(/^\d{6}$/);
    expect(res.data.claim.restaurant.phone).toBe('9876543210');
    expect(res.data.claim.restaurant.directionsUrl).toMatch(/google\.com\/maps\/dir/);
    const listing = await api(`/api/listings/${l.id}`, { as: 'n1' });
    expect(listing.data.listing.servingsRemaining).toBe(25);
    expect(listing.data.listing.status).toBe('active');
  });

  it('prevents over-claiming and marks fully claimed listings', async () => {
    const l = await postListing('r1', { servings: 10 });
    expect((await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 11, safetyAck: true } })).status).toBe(409);
    expect((await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 10, safetyAck: true } })).status).toBe(201);
    expect((await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n2', json: { servings: 1, safetyAck: true } })).status).toBe(409);
    const listing = await api(`/api/listings/${l.id}`, { as: 'n1' });
    expect(listing.data.listing.status).toBe('claimed');
  });

  it('verifies pickup by OTP, writes the immutable audit log and allows ratings', async () => {
    const l = await postListing('r1', { servings: 10 });
    const claim = (await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 10, safetyAck: true } })).data.claim;

    const wrong = await api(`/api/restaurant/claims/${claim.id}/verify`, { method: 'POST', as: 'r1', json: { otp: claim.otp === '000000' ? '111111' : '000000' } });
    expect(wrong.status).toBe(422);

    const ok = await api(`/api/restaurant/claims/${claim.id}/verify`, { method: 'POST', as: 'r1', json: { otp: claim.otp } });
    expect(ok.status).toBe(200);
    const listing = await api(`/api/listings/${l.id}`, { as: 'n1' });
    expect(listing.data.listing.status).toBe('completed');

    const audit = d1.db.prepare('SELECT * FROM pickup_audit').all() as { servings: number; otp_verified: number; prev_hash: string; hash: string }[];
    expect(audit).toHaveLength(1);
    expect(audit[0].servings).toBe(10);
    expect(audit[0].otp_verified).toBe(1);
    expect(audit[0].prev_hash).toBe('GENESIS');
    expect(() => d1.db.prepare('UPDATE pickup_audit SET servings = 999').run()).toThrow(/append-only/);
    expect(() => d1.db.prepare('DELETE FROM pickup_audit').run()).toThrow(/append-only/);

    // OTP is hidden once completed
    const mine = await api('/api/ngo/claims?status=completed', { as: 'n1' });
    expect(mine.data.items[0].otp).toBeUndefined();

    expect((await api(`/api/ngo/claims/${claim.id}/rate`, { method: 'POST', as: 'n1', json: { rating: 5 } })).status).toBe(200);
    expect((await api(`/api/ngo/claims/${claim.id}/rate`, { method: 'POST', as: 'n1', json: { rating: 1 } })).status).toBe(409);
    expect((await api(`/api/restaurant/claims/${claim.id}/rate`, { method: 'POST', as: 'r1', json: { rating: 4 } })).status).toBe(200);

    const impact = await api('/api/restaurant/impact', { as: 'r1' });
    expect(impact.data).toMatchObject({ meals: 10, kgSaved: 4, co2Avoided: 10, pickups: 1 });
  });

  it('locks verification after too many wrong OTPs', async () => {
    const l = await postListing();
    const claim = (await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 5, safetyAck: true } })).data.claim;
    const bad = claim.otp === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) await api(`/api/restaurant/claims/${claim.id}/verify`, { method: 'POST', as: 'r1', json: { otp: bad } });
    const res = await api(`/api/restaurant/claims/${claim.id}/verify`, { method: 'POST', as: 'r1', json: { otp: claim.otp } });
    expect(res.status).toBe(429);
  });

  it('only the owning restaurant can verify', async () => {
    seedRestaurant(d1, 'r2');
    const l = await postListing();
    const claim = (await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 5, safetyAck: true } })).data.claim;
    expect((await api(`/api/restaurant/claims/${claim.id}/verify`, { method: 'POST', as: 'r2', json: { otp: claim.otp } })).status).toBe(404);
  });

  it('cancelling a claim releases servings', async () => {
    const l = await postListing('r1', { servings: 10 });
    const claim = (await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 10, safetyAck: true } })).data.claim;
    expect((await api(`/api/ngo/claims/${claim.id}/cancel`, { method: 'POST', as: 'n1' })).status).toBe(200);
    const listing = await api(`/api/listings/${l.id}`, { as: 'n1' });
    expect(listing.data.listing).toMatchObject({ servingsRemaining: 10, status: 'active' });
  });
});

describe('admin', () => {
  beforeEach(() => {
    seedUser(d1, 'a1', 'admin@test.in', 'admin');
    seedNgo(d1, 'n1', { verification: 'pending' });
    seedRestaurant(d1, 'r1', { verification: 'pending' });
  });

  it('approves and rejects NGOs', async () => {
    const pending = await api('/api/admin/verifications?type=ngo', { as: 'a1' });
    expect(pending.data.items).toHaveLength(1);
    expect((await api('/api/admin/ngos/n1/verify', { method: 'POST', as: 'a1', json: { decision: 'rejected' } })).status).toBe(400);
    expect((await api('/api/admin/ngos/n1/verify', { method: 'POST', as: 'a1', json: { decision: 'approved' } })).status).toBe(200);
    expect((await api('/api/me', { as: 'n1' })).data.ngo.verification).toBe('approved');
  });

  it('suspends and reinstates users, toggles premium', async () => {
    expect((await api('/api/admin/users/n1/suspend', { method: 'POST', as: 'a1', json: { suspended: true } })).status).toBe(200);
    expect((await api('/api/ngo/claims', { as: 'n1' })).status).toBe(403);
    expect((await api('/api/admin/users/n1/suspend', { method: 'POST', as: 'a1', json: { suspended: false } })).status).toBe(200);
    expect((await api('/api/admin/restaurants/r1/premium', { method: 'POST', as: 'a1', json: { premium: true } })).status).toBe(200);
    expect((await api('/api/me', { as: 'r1' })).data.restaurant.premium).toBe(true);
  });

  it('manages sponsors and shows them publicly for the city', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await api('/api/admin/sponsors', {
      method: 'POST',
      as: 'a1',
      json: { name: 'Acme Foods', city: 'Vadodara', tier: 'gold', startDate: '2020-01-01', endDate: '2099-12-31', website: 'https://acme.example' },
    });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    const city = await api('/api/public/city/vadodara');
    expect(city.data.sponsors.map((s: { name: string }) => s.name)).toContain('Acme Foods');
    expect(today).toBeTruthy();
  });

  it('generates sponsor reports as JSON and CSV', async () => {
    d1.db.prepare("UPDATE restaurants SET verification = 'approved'").run();
    d1.db.prepare("UPDATE ngos SET verification = 'approved'").run();
    const l = await postListing('r1', { servings: 20 });
    const claim = (await api(`/api/listings/${l.id}/claim`, { method: 'POST', as: 'n1', json: { servings: 20, safetyAck: true } })).data.claim;
    await api(`/api/restaurant/claims/${claim.id}/verify`, { method: 'POST', as: 'r1', json: { otp: claim.otp } });

    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10);
    const json = await api(`/api/admin/report?city=Vadodara&from=${from}&to=${today}`, { as: 'a1' });
    expect(json.status, JSON.stringify(json.data)).toBe(200);
    expect(json.data).toMatchObject({ meals: 20, pickups: 1, restaurants: 1, ngos: 1, kgSaved: 8 });

    const csv = await api(`/api/admin/report?city=Vadodara&from=${from}&to=${today}&format=csv`, { as: 'a1' });
    expect(csv.headers.get('content-type')).toMatch(/text\/csv/);
    expect(String(csv.data).split('\n')).toHaveLength(2);

    const verify = await api('/api/admin/audit/verify', { as: 'a1' });
    expect(verify.data).toMatchObject({ checked: 1, ok: true });
  });
});

describe('public endpoints', () => {
  it('returns live impact stats', async () => {
    const res = await api('/api/public/stats');
    expect(res.status).toBe(200);
    expect(res.data.stats).toMatchObject({ meals: 0, kgSaved: 0 });
  });

  it('accepts sponsor enquiries and rate-limits them', async () => {
    const body = { name: 'Priya', email: 'priya@corp.example', organisation: 'Corp Ltd', message: 'We would like to sponsor meals in Vadodara.' };
    for (let i = 0; i < 3; i++) expect((await api('/api/public/sponsor-contact', { method: 'POST', json: body })).status).toBe(200);
    expect((await api('/api/public/sponsor-contact', { method: 'POST', json: body })).status).toBe(429);
    const rows = d1.db.prepare("SELECT COUNT(*) AS n FROM contact_messages WHERE kind = 'sponsor'").get() as { n: number };
    expect(rows.n).toBe(3);
  });

  it('exposes config with the packaging cap', async () => {
    const res = await api('/api/config');
    expect(res.data.packagingCap).toBe(15);
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const res = await api('/api/nope');
    expect(res.status).toBe(404);
  });
});

describe('uploads', () => {
  it('stores certificates privately and checks type', async () => {
    seedNgo(d1, 'n1');
    seedNgo(d1, 'n2');
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const form = new FormData();
    form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'cert.pdf');
    const res = await api('/api/uploads?kind=cert', { method: 'POST', as: 'n1', body: form });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.key).toMatch(/^certs\/n1\//);
    expect((await api(`/api/files/${res.data.key}`, { as: 'n1' })).status).toBe(200);
    expect((await api(`/api/files/${res.data.key}`, { as: 'n2' })).status).toBe(404);
    expect((await api(`/api/files/${res.data.key}`)).status).toBe(404);

    const bad = new FormData();
    bad.set('file', new Blob([new TextEncoder().encode('<svg/>')], { type: 'image/svg+xml' }), 'x.svg');
    expect((await api('/api/uploads?kind=cert', { method: 'POST', as: 'n1', body: bad })).status).toBe(415);
  });
});
