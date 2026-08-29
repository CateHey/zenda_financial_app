// lib/engine/progress.ts — progress and streak (D6 §6, A3).

import type { EngineContribution, EngineGoal, GoalProjection, Progress } from "./types";

// Looks up the curve's balance at relative month `m` (m >= 0, curve[0].m === 0). Beyond the
// curve's own range (goal already past its projected window) clamps to the last point.
function balanceAtMonth(curve: GoalProjection["curve"], m: number): number {
  if (curve.length === 0) return 0;
  const exact = curve.find((p) => p.m === m);
  if (exact) return exact.balanceCents;
  return curve[curve.length - 1].balanceCents;
}

function daysBetween(laterIso: string, earlierIso: string): number {
  const [ly, lm, ld] = laterIso.split("-").map(Number);
  const [ey, em, ed] = earlierIso.split("-").map(Number);
  const laterMs = Date.UTC(ly, lm - 1, ld);
  const earlierMs = Date.UTC(ey, em - 1, ed);
  return Math.round((laterMs - earlierMs) / 86_400_000);
}

/**
 * streak(contributions, cycleDaysLength) — A3. Walk contributions ordered by occurred_on desc;
 * count while amount_cents > 0 and the gap to the previously-counted row is <= cycle + 1 days;
 * stop at the first zero-amount row or gap. A `skip` check-in (amount 0) breaks the streak.
 */
export function streak(contributions: EngineContribution[], cycleDaysLength: number): number {
  const sorted = [...contributions].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0));
  let count = 0;
  let previous: string | null = null;
  for (const c of sorted) {
    if (c.amountCents <= 0) break;
    if (previous !== null && daysBetween(previous, c.occurredOn) > cycleDaysLength + 1) break;
    count++;
    previous = c.occurredOn;
  }
  return count;
}

/**
 * progress(goal, contributions, projection, todayMonthFraction, weeklyCapacityCents, cycleDaysLength)
 * — D6 §6. `contributions` carries every contribution relevant to the streak (the current goal's
 * and the goals before it in date order, per ZENDA_SCREEN_BINDINGS S6); `saved` sums only the rows
 * belonging to `goal`. `cycleDaysLength` is an additive 6th parameter (default 7 / weekly, matching
 * the D6 worked example) so fortnightly/monthly pay cycles can supply their own A3 cycle length.
 */
export function progress(
  goal: Pick<EngineGoal, "id" | "targetCents" | "startingBalanceCents">,
  contributions: EngineContribution[],
  projection: GoalProjection,
  todayMonthFraction: number,
  weeklyCapacityCents: number,
  cycleDaysLength = 7,
): Progress {
  const ownContributions = contributions.filter((c) => c.goalId === goal.id);
  const savedCents = goal.startingBalanceCents + ownContributions.reduce((sum, c) => sum + c.amountCents, 0);

  const relMonth = Math.floor(todayMonthFraction - projection.startMonth);
  const expectedByNowCents = relMonth < 0 ? 0 : balanceAtMonth(projection.curve, relMonth);

  const onTrack = savedCents >= 0.9 * expectedByNowCents;
  const pctComplete = Math.min(100, Math.round((100 * savedCents) / goal.targetCents));
  const paydaysRemaining = Math.ceil(Math.max(0, goal.targetCents - savedCents) / weeklyCapacityCents);
  const streakCount = streak(contributions, cycleDaysLength);

  return {
    savedCents,
    expectedByNowCents,
    onTrack,
    pctComplete,
    paydaysRemaining,
    streak: streakCount,
  };
}
