// Pure business rules for listing lifecycle, expiry and no-shows (unit-tested).
import { LISTING_TIME_MESSAGES, listingTimeError, type ListingTimes } from '../../../shared/listingTimes';
import {
  NO_SHOW_GRACE_MS,
  NO_SHOW_SUSPEND_THRESHOLD,
  URGENT_WINDOW_MS,
} from '../../../shared/constants';
import type { ClaimStatus, ListingStatus } from '../../../shared/types';

export type { ListingTimes } from '../../../shared/listingTimes';

/** Validates listing timing; returns an English error message or null. */
export function validateListingTimes(t: ListingTimes, now: number): string | null {
  const code = listingTimeError(t, now);
  return code ? LISTING_TIME_MESSAGES[code] : null;
}

export function isExpired(safeUntil: number, now: number): boolean {
  return now >= safeUntil;
}

export function isUrgent(safeUntil: number, now: number): boolean {
  return safeUntil > now && safeUntil - now < URGENT_WINDOW_MS;
}

/** A listing can be claimed while it has servings, is not expired and the pickup window is open or upcoming. */
export function isClaimable(
  l: { status: ListingStatus; servingsRemaining: number; safeUntil: number; pickupEnd: number },
  now: number,
): boolean {
  return l.status === 'active' && l.servingsRemaining > 0 && now < l.safeUntil && now < l.pickupEnd;
}

/** Deadline for a claim to be collected: end of the pickup window (never after safe-until). */
export function claimPickupBy(pickupEnd: number, safeUntil: number): number {
  return Math.min(pickupEnd, safeUntil);
}

/** A pending claim becomes a no-show once the pickup deadline plus grace has passed. */
export function isNoShow(claim: { status: ClaimStatus; pickupBy: number }, now: number): boolean {
  return claim.status === 'pending' && now > claim.pickupBy + NO_SHOW_GRACE_MS;
}

export function shouldSuspendForNoShows(noShowCount: number): boolean {
  return noShowCount >= NO_SHOW_SUSPEND_THRESHOLD;
}

/**
 * Derive a listing's status from its servings, its claims and the clock.
 * - active:    servings remain and it can still be claimed
 * - claimed:   nothing claimable right now but pickups are pending
 * - completed: at least one pickup happened and nothing is pending/claimable
 * - expired:   window passed with no pickups
 */
export function deriveListingStatus(
  l: { status: ListingStatus; servingsRemaining: number; safeUntil: number; pickupEnd: number },
  claims: { status: ClaimStatus }[],
  now: number,
): ListingStatus {
  if (l.status === 'cancelled') return 'cancelled';
  const pending = claims.some((c) => c.status === 'pending');
  const completed = claims.some((c) => c.status === 'completed');
  const open = l.servingsRemaining > 0 && now < l.safeUntil && now < l.pickupEnd;
  if (open) return 'active';
  if (pending && now < l.safeUntil) return 'claimed';
  if (completed) return 'completed';
  if (now >= l.safeUntil || now >= l.pickupEnd) return 'expired';
  return 'claimed';
}
