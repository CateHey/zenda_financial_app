// lib/engine/rates.ts — capacity, glide rate, and calendar arithmetic (D6 §1–2, A2).

import type { Assumptions, EngineProfile, PayCycle } from "./types";

/** Per-pay-cycle amount -> monthly amount (D6 preamble: weekly x52/12, fortnightly x26/12). */
function monthlyFactor(payCycle: PayCycle): number {
  if (payCycle === "weekly") return 52 / 12;
  if (payCycle === "fortnightly") return 26 / 12;
  return 1; // monthly
}

/** Cycle length in days (A3). */
export function cycleDays(payCycle: PayCycle): number {
  if (payCycle === "weekly") return 7;
  if (payCycle === "fortnightly") return 14;
  return 30;
}

/**
 * capacityMonthlyCents(profile) — D6 §1.
 * The buffer line is money already set aside (banked as savings capacity): it is subtracted
 * out of the surplus calculation, then added back in — it cancels, but the max(0, ...) floor
 * must apply to (take-home − essentials − lifestyle − buffer), matching the worked example
 * ((1,100 − 590 − 250 − 100) + 100 = $260/wk -> $112,667/month) and VINUY_JOURNEY.md §2's
 * "surplus + buffer line, banked" derivation.
 */
export function capacityMonthlyCents(profile: EngineProfile): number {
  const perCycle =
    Math.max(
      0,
      profile.takeHomeCents - profile.essentialsCents - profile.lifestyleCents - profile.bufferCents,
    ) + profile.bufferCents;
  return Math.round(perCycle * monthlyFactor(profile.payCycle));
}

/**
 * glideRate(monthsToHorizon, a) — D6 §2. Cash rate under the cash horizon, growth rate at/above
 * the growth horizon, linear blend between. The formula is continuous at both boundaries, so no
 * special-casing is needed for the edges (glideRate(glideCashBelowMonths) === cashRateAnnual).
 */
export function glideRate(monthsToHorizon: number, a: Assumptions): number {
  if (monthsToHorizon < a.glideCashBelowMonths) return a.cashRateAnnual;
  if (monthsToHorizon >= a.glideGrowthAboveMonths) return a.growthRateAnnual;
  const span = a.glideGrowthAboveMonths - a.glideCashBelowMonths;
  const frac = (monthsToHorizon - a.glideCashBelowMonths) / span;
  return a.cashRateAnnual + (a.growthRateAnnual - a.cashRateAnnual) * frac;
}

function parseIsoDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/**
 * monthIndex(startedOn, date) — A2. Whole months from startedOn to date, rounding a partial
 * month up (never below 1 for a future date).
 */
export function monthIndex(startedOn: string, date: string): number {
  const a = parseIsoDate(startedOn);
  const b = parseIsoDate(date);
  return (b.y - a.y) * 12 + (b.m - a.m) + (b.d > a.d ? 1 : 0);
}

/**
 * todayMonth(startedOn, today) — A2. Same base as monthIndex, but fractional (no day-of-month
 * ceiling) and floored at 0.
 */
export function todayMonth(startedOn: string, today: string): number {
  const a = parseIsoDate(startedOn);
  const b = parseIsoDate(today);
  const wholeMonths = (b.y - a.y) * 12 + (b.m - a.m);
  const fraction = (b.d - a.d) / 30;
  return Math.max(0, wholeMonths + fraction);
}
