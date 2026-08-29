// lib/engine/types.ts — D6 types, verbatim, plus small additive types the D6 functions need
// (profile/contribution shapes) that the spec's type block didn't spell out.

export type Assumptions = {
  cashRateAnnual: number; growthRateAnnual: number; upsideRateAnnual: number;
  glideCashBelowMonths: number; glideGrowthAboveMonths: number;
  firstMilestoneCents: number; emergencyWeeks: number;
};
export type EngineGoal = {
  id: string; kind: string; targetCents: number; startingBalanceCents: number;
  targetMonth: number;          // months from started_on to target_date (ceil)
  priority: number; goalType: "savings_achievable" | "growth_required"; status: "active" | "reached" | "paused";
  // A4 addition: months from started_on to reached_at, for goals already reached (frozen in the
  // waterfall — used only to advance the cursor, never recomputed). Undefined for active goals.
  reachedAtMonth?: number | null;
};
export type CurvePoint = { m: number; balanceCents: number };
export type GoalProjection = {
  goalId: string; rateAnnual: number; capacityMonthlyCents: number;
  startMonth: number; completionMonth: number | null; requiredMonthlyCents: number; achievable: boolean;
  altLaterMonths: number | null; altSmallerTargetCents: number | null; altExtraMonthlyCents: number | null;
  curve: CurvePoint[];
};
export type Progress = {
  savedCents: number; expectedByNowCents: number; onTrack: boolean; pctComplete: number;  // 0–100, integer
  paydaysRemaining: number; streak: number;
};
export const DISCLAIMER =
  "Zenda gives general information, not personal financial advice. Projections are arithmetic on the numbers you entered and the planning rates shown; real outcomes will differ.";

// ---- Additive: the pieces of `profiles` capacityMonthlyCents needs (D6 §1). ----
export type PayCycle = "weekly" | "fortnightly" | "monthly";
export type EngineProfile = {
  payCycle: PayCycle;
  takeHomeCents: number;
  essentialsCents: number;
  lifestyleCents: number;
  bufferCents: number;
};

// ---- Additive: one row of `contributions`, as `progress()` (D6 §6) needs it. ----
export type EngineContribution = {
  goalId: string;
  amountCents: number;
  occurredOn: string; // YYYY-MM-DD, UTC calendar date (A2)
};
