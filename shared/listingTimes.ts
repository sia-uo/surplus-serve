// Listing time rules, shared so the browser shows the same errors the API enforces.
import { MAX_SAFE_HOURS } from './constants';

export interface ListingTimes {
  cookedAt: number;
  safeUntil: number;
  pickupStart: number;
  pickupEnd: number;
}

export type ListingTimeError =
  | 'cookedFuture'
  | 'safePast'
  | 'safeBeforeCooked'
  | 'tooLong'
  | 'pickupOrder'
  | 'pickupPast'
  | 'pickupAfterSafe'
  | 'pickupBeforeCooked';

/** Allowed clock skew for "cooked at" being slightly in the future. */
const COOKED_SKEW_MS = 5 * 60_000;

export function listingTimeError(t: ListingTimes, now: number): ListingTimeError | null {
  if (t.cookedAt > now + COOKED_SKEW_MS) return 'cookedFuture';
  if (t.safeUntil <= now) return 'safePast';
  if (t.safeUntil <= t.cookedAt) return 'safeBeforeCooked';
  if (t.safeUntil - t.cookedAt > MAX_SAFE_HOURS * 3600_000) return 'tooLong';
  if (t.pickupEnd <= t.pickupStart) return 'pickupOrder';
  if (t.pickupEnd <= now) return 'pickupPast';
  if (t.pickupEnd > t.safeUntil) return 'pickupAfterSafe';
  if (t.pickupStart < t.cookedAt) return 'pickupBeforeCooked';
  return null;
}

/** English messages used by the API. */
export const LISTING_TIME_MESSAGES: Record<ListingTimeError, string> = {
  cookedFuture: 'Cooked-at time cannot be in the future',
  safePast: 'Safe-until time must be in the future',
  safeBeforeCooked: 'Safe-until must be after cooked-at',
  tooLong: `Food must be safe for at most ${MAX_SAFE_HOURS} hours after cooking`,
  pickupOrder: 'Pickup window end must be after its start',
  pickupPast: 'Pickup window must end in the future',
  pickupAfterSafe: 'Pickup window must end before the safe-until time',
  pickupBeforeCooked: 'Pickup cannot start before the food was cooked',
};
