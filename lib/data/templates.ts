// lib/data/templates.ts — D7 fallback templates (why, celebration, nudge). "Screens always
// render the template first" (D7) — the AI upgrade (task 11, not built here) only ever replaces
// this text once containsBannedTerms confirms it's clean. By construction none of these strings
// can trip lib/ai/banned-terms.ts: they're built only from goal titles, computed numbers and
// fixed prose — never a product, bank, fund, ticker or the word "impossible".

import { monthDate } from "@/lib/engine/rates";
import type { GoalProjection } from "@/lib/engine/types";
import { formatMoney, monthYearLabel } from "@/lib/format";
import type { GoalRow } from "./types";

/**
 * templateWhy — D7 fallback: "$<target> by <Month YYYY>. At $<capacity>/week that lands
 * <on time | in <Month YYYY> | later than planned>." The one place a goal's `why` is written
 * when the AI hasn't (yet) upgraded it (`goals.why` stays empty until this runs).
 */
export function templateWhy(
  goal: Pick<GoalRow, "target_cents" | "target_date">,
  projection: Pick<GoalProjection, "achievable" | "completionMonth">,
  startedOn: string,
  weeklyCapacityCents: number,
  currency: string,
): string {
  const target = formatMoney(goal.target_cents, currency);
  const byMonth = monthYearLabel(goal.target_date);
  const weekly = formatMoney(weeklyCapacityCents, currency);
  const lands = projection.achievable
    ? "on time"
    : projection.completionMonth !== null
      ? `in ${monthYearLabel(monthDate(startedOn, projection.completionMonth))}`
      : "later than planned";
  return `${target} by ${byMonth}. At ${weekly}/week that lands ${lands}.`;
}

/**
 * templateCelebration — D7 fallback: "$<amount> — <title>, done. <Next title> just moved
 * closer." Used as a `milestone_reached` event's `message` (POST /api/checkin) until the AI
 * upgrade (call 2) replaces it.
 */
export function templateCelebration(
  amountCents: number,
  title: string,
  nextTitle: string | null,
  currency: string,
): string {
  const amount = formatMoney(amountCents, currency);
  const next = nextTitle ? `${nextTitle} just moved closer.` : "You've reached every goal on the path.";
  return `${amount} — ${title}, done. ${next}`;
}

/** templateNudge — S6 nudge card: "$<capacity per cycle> is ready for <current goal title>. <paydaysRemaining> paydays to go." */
export function templateNudge(
  perCycleCents: number,
  currentGoalTitle: string,
  paydaysRemaining: number,
  currency: string,
): string {
  return `${formatMoney(perCycleCents, currency)} is ready for ${currentGoalTitle}. ${paydaysRemaining} paydays to go.`;
}
