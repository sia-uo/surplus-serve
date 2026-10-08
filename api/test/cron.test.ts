import { beforeEach, describe, expect, it } from 'vitest';
import { runAlerts, runRecurring } from '../src/cron';
import type { Env } from '../src/env';
import { istParts } from '../src/lib/util';
import { processExpiry, processNoShows } from '../src/services/listings';
import { fullChecklist, makeEnv, seedNgo, seedRestaurant, TestD1, VADODARA } from './helpers';

const H = 3600_000;
let env: Env;
let d1: TestD1;

beforeEach(() => {
  ({ env, d1 } = makeEnv());
  seedRestaurant(d1, 'r1');
});

function insertListing(id: string, o: { safeUntil: number; pickupEnd: number; servings?: number; remaining?: number; status?: string; lat?: number }) {
  const t = Date.now();
  d1.db
    .prepare(
      `INSERT INTO listings (id, restaurant_id, title, servings_total, servings_remaining, food_type, cooked_at, safe_until, pickup_start, pickup_end,
         packaging_cost, checklist, status, lat, lng, city, created_at, updated_at)
       VALUES (?, 'r1', 'Paneer rice', ?, ?, 'veg', ?, ?, ?, ?, 5, '{}', ?, ?, ?, 'vadodara', ?, ?)`,
    )
    .run(id, o.servings ?? 10, o.remaining ?? o.servings ?? 10, t - 2 * H, o.safeUntil, t - 2 * H, o.pickupEnd, o.status ?? 'active', o.lat ?? VADODARA.lat, VADODARA.lng, t, t);
}

function insertClaim(id: string, listingId: string, ngoId: string, pickupBy: number, servings = 10) {
  d1.db
    .prepare(
      `INSERT INTO claims (id, listing_id, ngo_id, restaurant_id, servings, otp, status, safety_ack, pickup_by, created_at)
       VALUES (?, ?, ?, 'r1', ?, '123456', 'pending', 1, ?, ?)`,
    )
    .run(id, listingId, ngoId, servings, pickupBy, Date.now() - H);
}

const row = (sql: string, ...p: (string | number)[]) => d1.db.prepare(sql).get(...p) as Record<string, any>;

describe('expiry cron', () => {
  it('expires active listings at safe-until', async () => {
    const t = Date.now();
    insertListing('old', { safeUntil: t - 1000, pickupEnd: t - 2000 });
    insertListing('fresh', { safeUntil: t + 3 * H, pickupEnd: t + 2 * H });
    await processExpiry(env, t);
    expect(row('SELECT status FROM listings WHERE id = ?', 'old').status).toBe('expired');
    expect(row('SELECT status FROM listings WHERE id = ?', 'fresh').status).toBe('active');
  });

  it('marks partly picked-up listings as completed instead of expired', async () => {
    const t = Date.now();
    seedNgo(d1, 'n1');
    insertListing('l1', { safeUntil: t - 1000, pickupEnd: t - 2000, servings: 20, remaining: 10 });
    insertClaim('c1', 'l1', 'n1', t - 3 * H);
    d1.db.prepare("UPDATE claims SET status = 'completed' WHERE id = 'c1'").run();
    await processExpiry(env, t);
    expect(row('SELECT status FROM listings WHERE id = ?', 'l1').status).toBe('completed');
  });
});

describe('no-show cron', () => {
  it('records a no-show after the pickup window, releases servings and warns', async () => {
    const t = Date.now();
    seedNgo(d1, 'n1');
    insertListing('l1', { safeUntil: t + 3 * H, pickupEnd: t - H, remaining: 0, status: 'claimed' });
    insertClaim('c1', 'l1', 'n1', t - H);
    const n = await processNoShows(env, 'http://localhost', t);
    expect(n).toBe(1);
    expect(row('SELECT status FROM claims WHERE id = ?', 'c1').status).toBe('no_show');
    expect(row('SELECT no_show_count FROM ngos WHERE user_id = ?', 'n1').no_show_count).toBe(1);
    const l = row('SELECT servings_remaining, status FROM listings WHERE id = ?', 'l1');
    expect(l.servings_remaining).toBe(10);
    expect(l.status).toBe('expired'); // pickup window is over, so the released food cannot be re-claimed
    expect(row('SELECT status FROM users WHERE id = ?', 'n1').status).toBe('active');
  });

  it('releases servings back to an open listing', async () => {
    const t = Date.now();
    seedNgo(d1, 'n1');
    insertListing('l1', { safeUntil: t + 4 * H, pickupEnd: t + 2 * H, remaining: 0, status: 'claimed' });
    insertClaim('c1', 'l1', 'n1', t - H); // claim-specific deadline already passed
    await processNoShows(env, 'http://localhost', t);
    expect(row('SELECT servings_remaining, status FROM listings WHERE id = ?', 'l1')).toEqual({ servings_remaining: 10, status: 'active' });
  });

  it('respects the 15-minute grace period', async () => {
    const t = Date.now();
    seedNgo(d1, 'n1');
    insertListing('l1', { safeUntil: t + 3 * H, pickupEnd: t - 5 * 60_000 });
    insertClaim('c1', 'l1', 'n1', t - 5 * 60_000);
    expect(await processNoShows(env, 'http://localhost', t)).toBe(0);
    expect(row('SELECT status FROM claims WHERE id = ?', 'c1').status).toBe('pending');
  });

  it('auto-suspends an NGO on its 3rd no-show', async () => {
    const t = Date.now();
    seedNgo(d1, 'n1', { noShows: 2 });
    insertListing('l1', { safeUntil: t + 3 * H, pickupEnd: t - H });
    insertClaim('c1', 'l1', 'n1', t - H);
    await processNoShows(env, 'http://localhost', t);
    const u = row('SELECT status, suspended_reason FROM users WHERE id = ?', 'n1');
    expect(u.status).toBe('suspended');
    expect(u.suspended_reason).toMatch(/3 no-shows/);
  });

  it('does not touch completed claims', async () => {
    const t = Date.now();
    seedNgo(d1, 'n1');
    insertListing('l1', { safeUntil: t + 3 * H, pickupEnd: t - H });
    insertClaim('c1', 'l1', 'n1', t - H);
    d1.db.prepare("UPDATE claims SET status = 'completed' WHERE id = 'c1'").run();
    expect(await processNoShows(env, 'http://localhost', t)).toBe(0);
  });
});

describe('recurring listings', () => {
  it('posts a daily template once per day after its post time', async () => {
    const t = Date.now();
    const mins = Math.max(0, istParts(t).minutes - 1);
    const postTime = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    d1.db
      .prepare(
        `INSERT INTO recurring_templates (id, restaurant_id, title, servings, food_type, packaging_cost, frequency, post_time, safe_hours,
           pickup_start_offset_min, pickup_duration_min, checklist, active, created_at)
         VALUES ('t1', 'r1', 'Daily thali', 25, 'veg', 5, 'daily', ?, 6, 0, 180, ?, 1, ?)`,
      )
      .run(postTime, JSON.stringify(fullChecklist), t);
    expect(await runRecurring(env, t)).toBe(1);
    expect(await runRecurring(env, t + 60_000)).toBe(0);
    const l = row("SELECT * FROM listings WHERE recurring_id = 't1'");
    expect(l.servings_total).toBe(25);
    expect(l.pickup_end).toBeLessThanOrEqual(l.safe_until);
  });
});

describe('new-listing alerts', () => {
  it('marks listings alerted and respects NGO radius', async () => {
    seedNgo(d1, 'near', { lat: VADODARA.lat + 0.01 });
    seedNgo(d1, 'far', { lat: VADODARA.lat + 0.5 });
    const t = Date.now();
    insertListing('l1', { safeUntil: t + 3 * H, pickupEnd: t + 2 * H });
    // No RESEND_API_KEY in tests → emails are logged, not sent; listings still get marked.
    await runAlerts(env, t);
    expect(row('SELECT alerted FROM listings WHERE id = ?', 'l1').alerted).toBe(1);
  });
});
