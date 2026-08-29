// lib/engine/waterfall.ts — the roadmap: alternatives, goal classification, the waterfall itself
// (D6 §7–9, A4).

import type { Assumptions, EngineGoal, GoalProjection } from "./types";
import { glideRate } from "./rates";
import { monthsToReach, projectCurve, requiredMonthlyCents } from "./solver";

export type Alternatives = {
  altLaterMonths: number | null;
  altSmallerTargetCents: number | null;
  altExtraMonthlyCents: number | null;
};

/**
 * alternatives(goal, startMonth, capacityMonthly, rateAnnual) — D6 §7.
 * Never throws, never says "impossible" — the three numbers are the answer:
 *  - altLaterMonths: how many months later than the original target the goal lands at capacity.
 *  - altSmallerTargetCents: what capacity actually reaches by the original target date.
 *  - altExtraMonthlyCents: the extra monthly capacity that would make the original date work.
 */
export function alternatives(
  goal: EngineGoal,
  startMonth: number,
  capacityMonthly: number,
  rateAnnual: number,
): Alternatives {
  const horizon = goal.targetMonth - startMonth;
  const requiredMonthly = requiredMonthlyCents(goal.targetCents, goal.startingBalanceCents, horizon, rateAnnual);
  const n = monthsToReach(goal.targetCents, goal.startingBalanceCents, capacityMonthly, rateAnnual);
  const altLaterMonths = n === null ? null : n - horizon;
  const curve = projectCurve(goal.startingBalanceCents, capacityMonthly, rateAnnual, Math.max(0, horizon));
  const altSmallerTargetCents = curve[curve.length - 1]?.balanceCents ?? goal.startingBalanceCents;
  const altExtraMonthlyCents = requiredMonthly - capacityMonthly;
  return { altLaterMonths, altSmallerTargetCents, altExtraMonthlyCents };
}

/**
 * goalType(goal, capacity, a) — D6 §9. Classified at /api/discover time (cursor = 0, i.e. the
 * goal's own targetMonth is its horizon) unless the client sent an explicit type.
 */
export function goalType(
  goal: Pick<EngineGoal, "targetCents" | "startingBalanceCents" | "targetMonth">,
  capacityMonthly: number,
  a: Assumptions,
): "savings_achievable" | "growth_required" {
  const horizon = goal.targetMonth;
  const rate = glideRate(horizon, a);
  const required = requiredMonthlyCents(goal.targetCents, goal.startingBalanceCents, horizon, rate);
  if (required > capacityMonthly && horizon >= a.glideGrowthAboveMonths) return "growth_required";
  return "savings_achievable";
}

/**
 * waterfall(goals, capacityMonthlyCents, a, todayMonthFraction) — D6 §8, A4.
 *
 * Non-paused goals are processed in target-date order (ties broken by priority). A `reached`
 * goal is frozen — the engine does not recompute or emit a projection for it, the caller keeps
 * the stored row (A4) — but it still advances the cursor to (at least) its reached month.
 *
 * Only `savings_achievable` goals advance the cursor; a `growth_required` goal receives capacity
 * from the cursor onward to its own targetMonth and never blocks what comes after it. A
 * `growth_required` goal always plans at the growth rate (D6 §2: "never goes below the blend") —
 * its type was fixed at classification time for a 5+ year horizon, so it keeps that rate even
 * once the effective remaining horizon (after the cursor moves) drops under the blend.
 *
 * `todayMonthFraction` defaults to 0, matching the D6 worked example (all goals active, no
 * contributions, today = started_on): startMonth = max(cursor, floor(todayMonthFraction)) then
 * reduces to plain `cursor`, so the vector's numbers are unchanged (A4's stated invariant).
 */
export function waterfall(
  goals: EngineGoal[],
  capacityMonthlyCents: number,
  a: Assumptions,
  todayMonthFraction = 0,
): GoalProjection[] {
  const relevant = goals.filter((g) => g.status !== "paused");
  const sorted = [...relevant].sort(
    (x, y) => x.targetMonth - y.targetMonth || x.priority - y.priority,
  );

  let cursor = 0;
  const results: GoalProjection[] = [];

  for (const goal of sorted) {
    if (goal.status === "reached") {
      const reachedMonth = goal.reachedAtMonth ?? goal.targetMonth;
      cursor = Math.max(cursor, reachedMonth);
      continue;
    }

    const startMonth = Math.max(cursor, Math.floor(todayMonthFraction));
    const horizon = goal.targetMonth - startMonth;
    const rate = goal.goalType === "growth_required" ? a.growthRateAnnual : glideRate(horizon, a);

    const n = monthsToReach(goal.targetCents, goal.startingBalanceCents, capacityMonthlyCents, rate);
    const completionMonth = n === null ? null : startMonth + n;
    const required = requiredMonthlyCents(goal.targetCents, goal.startingBalanceCents, horizon, rate);
    const achievable = completionMonth !== null && completionMonth <= goal.targetMonth;

    const curveMonths = Math.max(
      0,
      Math.min(completionMonth ?? goal.targetMonth, goal.targetMonth) - startMonth,
    );
    const curve = projectCurve(goal.startingBalanceCents, capacityMonthlyCents, rate, curveMonths);

    let altLaterMonths: number | null = null;
    let altSmallerTargetCents: number | null = null;
    let altExtraMonthlyCents: number | null = null;
    if (!achievable) {
      const alt = alternatives(goal, startMonth, capacityMonthlyCents, rate);
      altLaterMonths = alt.altLaterMonths;
      altSmallerTargetCents = alt.altSmallerTargetCents;
      altExtraMonthlyCents = alt.altExtraMonthlyCents;
    }

    results.push({
      goalId: goal.id,
      rateAnnual: rate,
      capacityMonthlyCents,
      startMonth,
      completionMonth,
      requiredMonthlyCents: required,
      achievable,
      altLaterMonths,
      altSmallerTargetCents,
      altExtraMonthlyCents,
      curve,
    });

    if (goal.goalType !== "growth_required") {
      cursor = completionMonth ?? cursor;
    }
  }

  return results;
}
