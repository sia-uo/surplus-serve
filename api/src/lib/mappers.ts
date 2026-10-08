import { directionsUrl } from '../../../shared/geo';
import { qualityScore, reliabilityScore } from '../../../shared/scoring';
import type { Claim, Listing, NgoProfile, RestaurantProfile, Sponsor, User } from '../../../shared/types';
import type { SessionUser } from '../env';
import { isUrgent } from './rules';
import { publicFileUrl } from './uploads';
import { parseJsonArray } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function toUser(u: SessionUser): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatar_url,
    role: u.role,
    status: u.status,
    suspendedReason: u.suspended_reason,
    locale: u.locale,
  };
}

export function toRestaurant(r: Row): RestaurantProfile {
  return {
    name: r.name,
    address: r.address,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    phone: r.phone,
    fssaiNumber: r.fssai_number,
    upiId: r.upi_id ?? null,
    hideName: !!r.hide_name,
    verification: r.verification,
    rejectionReason: r.rejection_reason ?? null,
    premium: !!r.premium,
    qualityScore: qualityScore({ ratingSum: r.rating_sum, ratingCount: r.rating_count }),
    mealsDonated: r.meals_donated,
  };
}

export function ngoReliability(r: Row): number {
  return reliabilityScore({
    completed: r.completed_count ?? 0,
    noShows: r.no_show_count ?? 0,
    ratingSum: r.rating_sum ?? 0,
    ratingCount: r.rating_count ?? 0,
  });
}

export function toNgo(r: Row): NgoProfile {
  return {
    name: r.name,
    address: r.address,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    phone: r.phone,
    registrationNumber: r.registration_number,
    certificateKey: r.certificate_key ?? null,
    verification: r.verification,
    rejectionReason: r.rejection_reason ?? null,
    alertsEnabled: !!r.alerts_enabled,
    alertRadiusKm: r.alert_radius_km,
    reliabilityScore: ngoReliability(r),
    completedCount: r.completed_count,
    noShowCount: r.no_show_count,
    mealsReceived: r.meals_received,
  };
}

/** Expects listing columns plus r_name, r_premium, r_rating_sum, r_rating_count from a join on restaurants. */
export function toListing(r: Row, nowMs: number, distanceKm?: number): Listing {
  return {
    id: r.id,
    restaurantId: r.restaurant_id,
    restaurantName: r.r_name ?? '',
    restaurantPremium: !!r.r_premium,
    restaurantQuality: qualityScore({ ratingSum: r.r_rating_sum ?? 0, ratingCount: r.r_rating_count ?? 0 }),
    title: r.title,
    description: r.description,
    servingsTotal: r.servings_total,
    servingsRemaining: r.servings_remaining,
    foodType: r.food_type,
    allergens: parseJsonArray(r.allergens),
    cookedAt: r.cooked_at,
    safeUntil: r.safe_until,
    pickupStart: r.pickup_start,
    pickupEnd: r.pickup_end,
    packagingCost: r.packaging_cost,
    photoUrl: publicFileUrl(r.photo_key),
    status: r.status,
    lat: r.lat,
    lng: r.lng,
    city: r.city,
    distanceKm: distanceKm === undefined ? undefined : Math.round(distanceKm * 100) / 100,
    urgent: r.status === 'active' && isUrgent(r.safe_until, nowMs),
    createdAt: r.created_at,
    recurringId: r.recurring_id ?? null,
    pendingClaims: r.pending_claims ?? undefined,
  };
}

/**
 * Expects claim columns plus l_title, l_food_type, l_pickup_start, l_packaging_cost and,
 * depending on viewer, restaurant (r_*) or NGO (n_*) columns.
 */
export function toClaim(r: Row, viewer: 'ngo' | 'restaurant' | 'admin'): Claim {
  const claim: Claim = {
    id: r.id,
    listingId: r.listing_id,
    listingTitle: r.l_title,
    foodType: r.l_food_type,
    servings: r.servings,
    status: r.status,
    pickupBy: r.pickup_by,
    pickupStart: r.l_pickup_start,
    packagingCost: r.l_packaging_cost,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? null,
    cancelReason: r.cancel_reason ?? null,
    foodRating: r.food_rating ?? null,
    ngoRating: r.ngo_rating ?? null,
  };
  if (viewer === 'ngo' && r.status === 'pending') claim.otp = r.otp;
  if (r.r_name !== undefined) {
    claim.restaurant = {
      id: r.restaurant_id,
      name: r.r_name,
      address: r.r_address,
      phone: r.r_phone,
      upiId: r.r_upi_id ?? null,
      lat: r.r_lat,
      lng: r.r_lng,
      directionsUrl: directionsUrl(r.r_lat, r.r_lng),
    };
  }
  if (r.n_name !== undefined) {
    claim.ngo = {
      id: r.ngo_id,
      name: r.n_name,
      phone: r.n_phone,
      reliabilityScore: reliabilityScore({
        completed: r.n_completed_count ?? 0,
        noShows: r.n_no_show_count ?? 0,
        ratingSum: r.n_rating_sum ?? 0,
        ratingCount: r.n_rating_count ?? 0,
      }),
    };
  }
  return claim;
}

export function toSponsor(r: Row): Sponsor {
  return {
    id: r.id,
    name: r.name,
    logoUrl: publicFileUrl(r.logo_key),
    website: r.website ?? null,
    city: r.city,
    tier: r.tier,
    startDate: r.start_date,
    endDate: r.end_date,
  };
}

export const LISTING_SELECT = `SELECT l.*, r.name AS r_name, r.premium AS r_premium,
  r.rating_sum AS r_rating_sum, r.rating_count AS r_rating_count
  FROM listings l JOIN restaurants r ON r.user_id = l.restaurant_id`;

export const CLAIM_SELECT_FOR_NGO = `SELECT c.*, l.title AS l_title, l.food_type AS l_food_type,
  l.pickup_start AS l_pickup_start, l.packaging_cost AS l_packaging_cost,
  r.name AS r_name, r.address AS r_address, r.phone AS r_phone, r.upi_id AS r_upi_id, r.lat AS r_lat, r.lng AS r_lng
  FROM claims c JOIN listings l ON l.id = c.listing_id JOIN restaurants r ON r.user_id = c.restaurant_id`;

export const CLAIM_SELECT_FOR_RESTAURANT = `SELECT c.*, l.title AS l_title, l.food_type AS l_food_type,
  l.pickup_start AS l_pickup_start, l.packaging_cost AS l_packaging_cost,
  n.name AS n_name, n.phone AS n_phone, n.completed_count AS n_completed_count, n.no_show_count AS n_no_show_count,
  n.rating_sum AS n_rating_sum, n.rating_count AS n_rating_count
  FROM claims c JOIN listings l ON l.id = c.listing_id JOIN ngos n ON n.user_id = c.ngo_id`;
