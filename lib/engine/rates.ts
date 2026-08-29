// lib/engine/rates.ts — capacity, glide rate, and calendar arithmetic (D6 §1–2, A2).

import type { Assumptions, EngineProfile, PayCycle } from "./types";

/** Guard: a non-finite (NaN/±Infinity) number becomes `fallback` instead of propagating through
 * every downstream calculation (D6 robustness pass: "NaN/Infinity -> clamp/null"). */
function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

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
 * ((1,100 − 590 − 250 − 100) + 100 = $260/wk -> $112,667/month) and VINAY_JOURNEY.md §2's
 * "surplus + buffer line, banked" derivation.
 */
export function capacityMonthlyCents(profile: EngineProfile): number {
  // NaN/Infinity guard: a corrupted or non-numeric profile field (e.g. a bigint that came back
  // as an unparsable string) clamps to 0 rather than turning the whole result NaN.
  const takeHome = finiteOr(profile.takeHomeCents, 0);
  const essentials = finiteOr(profile.essentialsCents, 0);
  const lifestyle = finiteOr(profile.lifestyleCents, 0);
  const buffer = finiteOr(profile.bufferCents, 0);
  const perCycle = Math.max(0, takeHome - essentials - lifestyle - buffer) + buffer;
  // capacity <= 0 (e.g. lifestyle spend exceeds take-home) is a legitimate, already-handled
  // state — Math.max(0, ...) floors the surplus above; the final round/finite guard below only
  // catches an otherwise-impossible non-finite result from a bad monthlyFactor/perCycle input.
  return finiteOr(Math.round(perCycle * monthlyFactor(profile.payCycle)), 0);
}

/**
 * glideRate(monthsToHorizon, a) — D6 §2. Cash rate under the cash horizon, growth rate at/above
 * the growth horizon, linear blend between. The formula is continuous at both boundaries, so no
 * special-casing is needed for the edges (glideRate(glideCashBelowMonths) === cashRateAnnual).
 */
export function glideRate(monthsToHorizon: number, a: Assumptions): number {
  const horizon = finiteOr(monthsToHorizon, 0);
  if (horizon < a.glideCashBelowMonths) return a.cashRateAnnual;
  if (horizon >= a.glideGrowthAboveMonths) return a.growthRateAnnual;
  const span = a.glideGrowthAboveMonths - a.glideCashBelowMonths;
  // Guard: a misconfigured assumptions row (glideGrowthAboveMonths <= glideCashBelowMonths)
  // would divide by zero/negative and hand back NaN or a nonsensical rate; the horizon already
  // failed both boundary checks above, so split the difference rather than propagate garbage.
  if (span <= 0) return (a.cashRateAnnual + a.growthRateAnnual) / 2;
  const frac = (horizon - a.glideCashBelowMonths) / span;
  return a.cashRateAnnual + (a.growthRateAnnual - a.cashRateAnnual) * frac;
}

export function parseIsoDate(date: string): { y: number; m: number; d: number } {
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
  const raw = (b.y - a.y) * 12 + (b.m - a.m) + (b.d > a.d ? 1 : 0);
  // Guard: a date at or before startedOn (a stale/corrupted target_date, or a reached_at that
  // predates the profile's own started_on) floors at 0 rather than going negative and pulling
  // waterfall()'s cursor/horizon maths into negative territory (D6 robustness pass: "target_date
  // before started_on -> clamp"). The one existing test for a past date ("2026-08-15" against
  // "2026-09-01") already lands on 0 without this — it's a no-op there, and only changes the
  // result for dates further in the past.
  return Math.max(0, raw);
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

/**
 * monthDate(startedOn, m) — A2, the inverse of monthIndex: the calendar date `startedOn + m
 * months`, same day-of-month, clamped to month end (e.g. Jan 31 + 1 month -> Feb 28/29).
 * Used to turn a curve/projection month index back into a displayable "Month YYYY" date.
 */
export function monthDate(startedOn: string, m: number): string {
  const start = parseIsoDate(startedOn);
  const totalMonths = (start.m - 1) + m;
  const y = start.y + Math.floor(totalMonths / 12);
  const zeroBasedMonth = ((totalMonths % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(y, zeroBasedMonth + 1, 0)).getUTCDate();
  const d = Math.min(start.d, lastDayOfMonth);
  const dd = new Date(Date.UTC(y, zeroBasedMonth, d));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dd.getUTCFullYear()}-${pad(dd.getUTCMonth() + 1)}-${pad(dd.getUTCDate())}`;
}
