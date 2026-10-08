import { describe, expect, it } from 'vitest';
import { boundingBox, haversineKm, isInIndia } from '../../shared/geo';
import { impactFromMeals, qualityScore, reliabilityScore } from '../../shared/scoring';
import { ceilingFor } from '../src/lib/email';
import { hit } from '../src/lib/ratelimit';
import {
  claimPickupBy,
  deriveListingStatus,
  isClaimable,
  isExpired,
  isNoShow,
  isUrgent,
  shouldSuspendForNoShows,
  validateListingTimes,
} from '../src/lib/rules';
import { sniffType, validateUpload } from '../src/lib/uploads';
import { generateOtp, istParts, istToEpoch, safeEqual } from '../src/lib/util';

const H = 3600_000;
const M = 60_000;

describe('distance (Haversine)', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(22.3072, 73.1812, 22.3072, 73.1812)).toBe(0);
  });

  it('matches the known Vadodara → Ahmedabad distance (~100 km)', () => {
    const d = haversineKm(22.3072, 73.1812, 23.0225, 72.5714);
    expect(d).toBeGreaterThan(98);
    expect(d).toBeLessThan(103);
  });

  it('is symmetric', () => {
    const a = haversineKm(22.3, 73.18, 22.35, 73.2);
    const b = haversineKm(22.35, 73.2, 22.3, 73.18);
    expect(a).toBeCloseTo(b, 10);
  });

  it('1 degree of latitude is ~111 km', () => {
    expect(haversineKm(22, 73, 23, 73)).toBeCloseTo(111.2, 0);
  });

  it('bounding box contains every point within the radius', () => {
    const c = { lat: 22.3072, lng: 73.1812 };
    const box = boundingBox(c.lat, c.lng, 10);
    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      const p = { lat: c.lat + (9.9 / 111.32) * Math.cos(rad), lng: c.lng + (9.9 / (111.32 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin(rad) };
      expect(haversineKm(c.lat, c.lng, p.lat, p.lng)).toBeLessThanOrEqual(10.01);
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(p.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it('recognises coordinates inside India', () => {
    expect(isInIndia(22.3, 73.18)).toBe(true);
    expect(isInIndia(51.5, -0.12)).toBe(false);
  });
});

describe('expiry rules', () => {
  const now = Date.UTC(2026, 0, 1, 12);

  it('expires exactly at safe-until', () => {
    expect(isExpired(now + 1, now)).toBe(false);
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(now - 1, now)).toBe(true);
  });

  it('flags listings as urgent under 2 hours to safe-until', () => {
    expect(isUrgent(now + 119 * M, now)).toBe(true);
    expect(isUrgent(now + 2 * H, now)).toBe(false);
    expect(isUrgent(now - M, now)).toBe(false);
  });

  it('validates listing times', () => {
    const ok = { cookedAt: now - H, safeUntil: now + 4 * H, pickupStart: now, pickupEnd: now + 2 * H };
    expect(validateListingTimes(ok, now)).toBeNull();
    expect(validateListingTimes({ ...ok, safeUntil: now - 1 }, now)).toMatch(/future/);
    expect(validateListingTimes({ ...ok, cookedAt: now + H }, now)).toMatch(/future/);
    expect(validateListingTimes({ ...ok, pickupEnd: now + 5 * H }, now)).toMatch(/before the safe-until/);
    expect(validateListingTimes({ ...ok, pickupEnd: ok.pickupStart }, now)).toMatch(/after its start/);
    expect(validateListingTimes({ ...ok, cookedAt: now - 13 * H, pickupStart: now - 13 * H }, now)).toMatch(/at most 12 hours/);
  });

  it('is claimable only while active, with servings, before safe-until and pickup end', () => {
    const l = { status: 'active' as const, servingsRemaining: 5, safeUntil: now + H, pickupEnd: now + H / 2 };
    expect(isClaimable(l, now)).toBe(true);
    expect(isClaimable({ ...l, servingsRemaining: 0 }, now)).toBe(false);
    expect(isClaimable({ ...l, status: 'claimed' }, now)).toBe(false);
    expect(isClaimable(l, now + H / 2)).toBe(false);
  });

  it('claim deadline is the earlier of pickup end and safe-until', () => {
    expect(claimPickupBy(now + H, now + 2 * H)).toBe(now + H);
    expect(claimPickupBy(now + 3 * H, now + 2 * H)).toBe(now + 2 * H);
  });

  it('derives listing status from servings, claims and time', () => {
    const base = { status: 'active' as const, servingsRemaining: 10, safeUntil: now + 4 * H, pickupEnd: now + 2 * H };
    expect(deriveListingStatus(base, [], now)).toBe('active');
    expect(deriveListingStatus({ ...base, servingsRemaining: 0 }, [{ status: 'pending' }], now)).toBe('claimed');
    expect(deriveListingStatus({ ...base, servingsRemaining: 0 }, [{ status: 'completed' }], now)).toBe('completed');
    expect(deriveListingStatus(base, [], now + 2 * H)).toBe('expired');
    expect(deriveListingStatus(base, [{ status: 'completed' }], now + 5 * H)).toBe('completed');
    expect(deriveListingStatus(base, [{ status: 'no_show' }], now + 5 * H)).toBe('expired');
    expect(deriveListingStatus({ ...base, status: 'cancelled' }, [], now)).toBe('cancelled');
  });
});

describe('no-show rules', () => {
  const now = Date.UTC(2026, 0, 1, 12);

  it('becomes a no-show only after the pickup deadline plus 15 min grace', () => {
    expect(isNoShow({ status: 'pending', pickupBy: now - 10 * M }, now)).toBe(false);
    expect(isNoShow({ status: 'pending', pickupBy: now - 16 * M }, now)).toBe(true);
  });

  it('never marks completed or cancelled claims as no-shows', () => {
    expect(isNoShow({ status: 'completed', pickupBy: now - H }, now)).toBe(false);
    expect(isNoShow({ status: 'cancelled', pickupBy: now - H }, now)).toBe(false);
  });

  it('suspends at 3 no-shows', () => {
    expect(shouldSuspendForNoShows(2)).toBe(false);
    expect(shouldSuspendForNoShows(3)).toBe(true);
    expect(shouldSuspendForNoShows(4)).toBe(true);
  });
});

describe('scores & impact', () => {
  it('computes impact from meals', () => {
    expect(impactFromMeals(100)).toEqual({ meals: 100, kgSaved: 40, co2Avoided: 100 });
  });

  it('reliability rewards completions and punishes no-shows', () => {
    const fresh = reliabilityScore({ completed: 0, noShows: 0, ratingSum: 0, ratingCount: 0 });
    const good = reliabilityScore({ completed: 20, noShows: 0, ratingSum: 100, ratingCount: 20 });
    const bad = reliabilityScore({ completed: 2, noShows: 3, ratingSum: 0, ratingCount: 0 });
    expect(good).toBe(100);
    expect(fresh).toBeGreaterThan(bad);
    expect(bad).toBeLessThan(60);
  });

  it('quality score starts at the 4★ prior and moves with ratings', () => {
    expect(qualityScore({ ratingSum: 0, ratingCount: 0 })).toBe(80);
    expect(qualityScore({ ratingSum: 50, ratingCount: 10 })).toBeGreaterThan(90);
    expect(qualityScore({ ratingSum: 10, ratingCount: 10 })).toBeLessThan(50);
  });
});

describe('utilities', () => {
  it('generates 6-digit OTPs', () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('compares strings in constant time', () => {
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '123457')).toBe(false);
    expect(safeEqual('123', '1234')).toBe(false);
  });

  it('converts IST times', () => {
    const t = istToEpoch('2026-01-01', '09:30');
    expect(new Date(t).toISOString()).toBe('2026-01-01T04:00:00.000Z');
    expect(istParts(t)).toEqual({ date: '2026-01-01', weekday: 4, minutes: 570 });
  });

  it('rate limiter allows up to the limit per window', () => {
    const k = `t-${Math.random()}`;
    expect(hit(k, 2, 1000, 0)).toBe(true);
    expect(hit(k, 2, 1000, 1)).toBe(true);
    expect(hit(k, 2, 1000, 2)).toBe(false);
    expect(hit(k, 2, 1000, 1001)).toBe(true);
  });

  it('email ceilings keep a reserve for critical mail', () => {
    expect(ceilingFor('critical', 100)).toBe(100);
    expect(ceilingFor('normal', 100)).toBe(90);
    expect(ceilingFor('bulk', 100)).toBe(70);
  });

  it('sniffs file types from magic bytes', () => {
    expect(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('application/pdf');
    expect(sniffType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(validateUpload('photo', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('Unsupported file type');
    expect(validateUpload('cert', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toEqual({ type: 'application/pdf', ext: 'pdf' });
  });
});
