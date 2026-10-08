import { z } from 'zod';
import { ALLERGENS, FOOD_TYPES, LOCALES, RADIUS_OPTIONS_KM, SAFETY_CHECKLIST, SPONSOR_TIERS } from '../../../shared/constants';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const phone = z
  .string()
  .trim()
  .regex(/^(\+91[\s-]?)?[0-9][0-9\s-]{7,13}$/, 'Enter a valid Indian phone number');
const lat = z.number().min(6).max(37.5);
const lng = z.number().min(68).max(97.5);
const ts = z.number().int().positive();

export const roleSchema = z.object({ role: z.enum(['restaurant', 'ngo']) });
export const localeSchema = z.object({ locale: z.enum(LOCALES) });

export const restaurantProfileSchema = z.object({
  name: text(2, 120),
  address: text(5, 300),
  city: text(2, 80),
  lat,
  lng,
  phone,
  fssaiNumber: z.string().trim().regex(/^\d{14}$/, 'FSSAI licence number must be 14 digits'),
  upiId: z
    .string()
    .trim()
    .regex(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID')
    .nullish()
    .or(z.literal('')),
  hideName: z.boolean().default(false),
});

export const ngoProfileSchema = z.object({
  name: text(2, 120),
  address: text(5, 300),
  city: text(2, 80),
  lat,
  lng,
  phone,
  registrationNumber: text(3, 60),
  certificateKey: z.string().max(200).nullish(),
  alertsEnabled: z.boolean().default(true),
  alertRadiusKm: z.number().refine((v) => (RADIUS_OPTIONS_KM as readonly number[]).includes(v), 'Invalid radius').default(5),
});

const checklist = z
  .record(z.string(), z.boolean())
  .refine((c) => SAFETY_CHECKLIST.every((k) => c[k] === true), 'Every food-safety checklist item must be confirmed');

const allergens = z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]);

export const listingSchema = z.object({
  title: text(3, 100),
  description: z.string().trim().max(1000).default(''),
  servings: z.number().int().min(1).max(5000),
  foodType: z.enum(FOOD_TYPES),
  allergens,
  cookedAt: ts,
  safeUntil: ts,
  pickupStart: ts,
  pickupEnd: ts,
  packagingCost: z.number().int().min(0),
  photoKey: z.string().max(200).nullish(),
  checklist,
});

export const recurringSchema = z
  .object({
    title: text(3, 100),
    description: z.string().trim().max(1000).default(''),
    servings: z.number().int().min(1).max(5000),
    foodType: z.enum(FOOD_TYPES),
    allergens,
    packagingCost: z.number().int().min(0),
    frequency: z.enum(['daily', 'weekly']),
    weekday: z.number().int().min(0).max(6).nullish(),
    postTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
    safeHours: z.number().int().min(1).max(12),
    pickupStartOffsetMin: z.number().int().min(0).max(600).default(0),
    pickupDurationMin: z.number().int().min(15).max(720).default(120),
    checklist,
  })
  .refine((v) => v.frequency === 'daily' || v.weekday != null, { message: 'Choose a weekday', path: ['weekday'] })
  .refine((v) => v.pickupStartOffsetMin + v.pickupDurationMin <= v.safeHours * 60, {
    message: 'Pickup window must end before the food stops being safe',
    path: ['pickupDurationMin'],
  });

export const claimSchema = z.object({
  servings: z.number().int().min(1).max(5000),
  safetyAck: z.literal(true, { message: 'You must accept the food-safety acknowledgement' }),
});

export const otpSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') });
export const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export const searchSchema = z.object({
  lat: z.coerce.number().min(6).max(37.5),
  lng: z.coerce.number().min(68).max(97.5),
  radius: z.coerce.number().refine((v) => (RADIUS_OPTIONS_KM as readonly number[]).includes(v), 'Invalid radius').default(5),
  foodType: z.enum(FOOD_TYPES).optional(),
  minServings: z.coerce.number().int().min(1).max(5000).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

export const sponsorContactSchema = z.object({
  name: text(2, 100),
  email: z.email().max(200),
  organisation: text(2, 150),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  message: text(10, 2000),
  website: z.string().max(500).optional(), // honeypot — real users leave it empty
});

export const premiumRequestSchema = z.object({ message: z.string().trim().max(1000).default('') });

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const sponsorSchema = z
  .object({
    name: text(2, 120),
    logoKey: z.string().max(200).nullish(),
    website: z.url().max(300).nullish().or(z.literal('')),
    city: text(2, 80),
    tier: z.enum(SPONSOR_TIERS),
    startDate: dateStr,
    endDate: dateStr,
  })
  .refine((s) => s.endDate >= s.startDate, { message: 'End date must be after start date', path: ['endDate'] });

export const verifyDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().trim().max(500).optional(),
});

export const reportSchema = z.object({
  city: z.string().trim().min(2).max(80),
  from: dateStr,
  to: dateStr,
  format: z.enum(['json', 'csv']).default('json'),
});
