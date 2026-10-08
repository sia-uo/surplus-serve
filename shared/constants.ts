// Constants shared by the API and the web app.

export const FOOD_TYPES = ['veg', 'nonveg', 'jain'] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export const ALLERGENS = [
  'gluten',
  'dairy',
  'nuts',
  'peanuts',
  'soy',
  'egg',
  'fish',
  'shellfish',
  'sesame',
  'mustard',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const RADIUS_OPTIONS_KM = [2, 5, 10, 25] as const;

export const LOCALES = ['en', 'hi', 'gu'] as const;
export type Locale = (typeof LOCALES)[number];

export const SPONSOR_TIERS = ['platinum', 'gold', 'silver'] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

/** Mandatory food-safety checklist a restaurant must tick before posting. */
export const SAFETY_CHECKLIST = [
  'cookedHygienically',
  'storedSafely',
  'notServed',
  'labelledAllergens',
  'packagedSealed',
] as const;
export type ChecklistItem = (typeof SAFETY_CHECKLIST)[number];

/** Impact estimates (documented in README). */
export const KG_PER_MEAL = 0.4;
/** kg CO2-equivalent avoided per kg of food not wasted. */
export const CO2_PER_KG_FOOD = 2.5;

/** A listing is "urgent" when it is safe for less than this long. */
export const URGENT_WINDOW_MS = 2 * 60 * 60 * 1000;
/** Maximum time between cooking and safe-until. */
export const MAX_SAFE_HOURS = 12;
/** Grace after the pickup window before a claim is recorded as a no-show. */
export const NO_SHOW_GRACE_MS = 15 * 60 * 1000;
/** No-shows that trigger automatic NGO suspension. */
export const NO_SHOW_SUSPEND_THRESHOLD = 3;
/** Max wrong OTP attempts per claim. */
export const MAX_OTP_ATTEMPTS = 5;

export const DEFAULT_PACKAGING_CAP = 15;

export const UPLOAD_LIMITS = {
  photo: { maxBytes: 3 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
  cert: { maxBytes: 5 * 1024 * 1024, types: ['application/pdf', 'image/jpeg', 'image/png'] },
  logo: { maxBytes: 1 * 1024 * 1024, types: ['image/jpeg', 'image/png', 'image/webp'] },
} as const;
export type UploadKind = keyof typeof UPLOAD_LIMITS;
