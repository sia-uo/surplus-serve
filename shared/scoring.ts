import { CO2_PER_KG_FOOD, KG_PER_MEAL } from './constants';

export function impactFromMeals(meals: number) {
  const kg = meals * KG_PER_MEAL;
  return {
    meals,
    kgSaved: Math.round(kg * 10) / 10,
    co2Avoided: Math.round(kg * CO2_PER_KG_FOOD * 10) / 10,
  };
}

/**
 * NGO reliability score, 0–100.
 * 70% pickup reliability (completed vs no-shows, with a +1/+1 prior so new NGOs
 * start high but not perfect) and 30% average rating from restaurants.
 */
export function reliabilityScore(input: {
  completed: number;
  noShows: number;
  ratingSum: number;
  ratingCount: number;
}): number {
  const pickupRate = (input.completed + 1) / (input.completed + input.noShows + 1);
  const avgRating = input.ratingCount > 0 ? input.ratingSum / input.ratingCount : 4;
  const score = 70 * pickupRate + 30 * (avgRating / 5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Restaurant quality score, 0–100: Bayesian average of NGO food ratings
 * (prior of 4★ weighted as 3 ratings) scaled to 100.
 */
export function qualityScore(input: { ratingSum: number; ratingCount: number }): number {
  const PRIOR_MEAN = 4;
  const PRIOR_WEIGHT = 3;
  const avg = (input.ratingSum + PRIOR_MEAN * PRIOR_WEIGHT) / (input.ratingCount + PRIOR_WEIGHT);
  return Math.max(0, Math.min(100, Math.round((avg / 5) * 100)));
}
