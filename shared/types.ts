// API response shapes shared by the Worker and the web app.
import type { FoodType, Locale, SponsorTier } from './constants';

export type Role = 'restaurant' | 'ngo' | 'admin';
export type Verification = 'pending' | 'approved' | 'rejected';
export type ListingStatus = 'active' | 'claimed' | 'completed' | 'expired' | 'cancelled';
export type ClaimStatus = 'pending' | 'completed' | 'cancelled' | 'no_show';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role | null;
  status: 'active' | 'suspended';
  suspendedReason: string | null;
  locale: Locale;
}

export interface RestaurantProfile {
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  phone: string;
  fssaiNumber: string;
  upiId: string | null;
  hideName: boolean;
  verification: Verification;
  rejectionReason: string | null;
  premium: boolean;
  qualityScore: number;
  mealsDonated: number;
}

export interface NgoProfile {
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  phone: string;
  registrationNumber: string;
  certificateKey: string | null;
  verification: Verification;
  rejectionReason: string | null;
  alertsEnabled: boolean;
  alertRadiusKm: number;
  reliabilityScore: number;
  completedCount: number;
  noShowCount: number;
  mealsReceived: number;
}

export interface MeResponse {
  user: User | null;
  restaurant: RestaurantProfile | null;
  ngo: NgoProfile | null;
}

export interface Listing {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantPremium: boolean;
  restaurantQuality: number;
  title: string;
  description: string;
  servingsTotal: number;
  servingsRemaining: number;
  foodType: FoodType;
  allergens: string[];
  cookedAt: number;
  safeUntil: number;
  pickupStart: number;
  pickupEnd: number;
  packagingCost: number;
  photoUrl: string | null;
  status: ListingStatus;
  lat: number;
  lng: number;
  city: string;
  distanceKm?: number;
  urgent: boolean;
  createdAt: number;
  recurringId: string | null;
  pendingClaims?: number;
}

export interface Claim {
  id: string;
  listingId: string;
  listingTitle: string;
  foodType: FoodType;
  servings: number;
  status: ClaimStatus;
  otp?: string; // only visible to the claiming NGO
  pickupBy: number;
  pickupStart: number;
  packagingCost: number;
  createdAt: number;
  completedAt: number | null;
  cancelReason: string | null;
  foodRating: number | null;
  ngoRating: number | null;
  restaurant?: {
    id: string;
    name: string;
    address: string;
    phone: string;
    upiId: string | null;
    lat: number;
    lng: number;
    directionsUrl: string;
  };
  ngo?: {
    id: string;
    name: string;
    phone: string;
    reliabilityScore: number;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ImpactStats {
  meals: number;
  kgSaved: number;
  co2Avoided: number;
  restaurants: number;
  ngos: number;
  pickups: number;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  city: string;
  tier: SponsorTier;
  startDate: string;
  endDate: string;
}

export interface RecurringTemplate {
  id: string;
  title: string;
  description: string;
  servings: number;
  foodType: FoodType;
  allergens: string[];
  packagingCost: number;
  frequency: 'daily' | 'weekly';
  weekday: number | null;
  postTime: string;
  safeHours: number;
  pickupStartOffsetMin: number;
  pickupDurationMin: number;
  active: boolean;
  lastRunDate: string | null;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
  city: string;
}

export interface SponsorReport {
  city: string;
  from: string;
  to: string;
  meals: number;
  kgSaved: number;
  co2Avoided: number;
  pickups: number;
  restaurants: number;
  ngos: number;
  sponsors: Sponsor[];
  byRestaurant: { name: string; meals: number; pickups: number }[];
  byNgo: { name: string; meals: number; pickups: number }[];
  daily: { date: string; meals: number }[];
}

export interface AppConfig {
  packagingCap: number;
  googleEnabled: boolean;
  devLogin: boolean;
}
