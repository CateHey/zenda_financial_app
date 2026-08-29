// lib/data/recompute.ts — D5: "the single place projections are written; every handler calls
// it." Loads profile + goals + assumptions with the user-scoped client, runs the D6 waterfall,
// upserts goal_projections, and fills in a template `why` (D7 fallback) on any goal whose why
// is still empty. This is the ONLY writer of goal_projections in the whole app.

import type { SupabaseClient } from "@supabase/supabase-js";
import { capacityMonthlyCents, monthDate, monthIndex, todayMonth } from "@/lib/engine/rates";
import { waterfall } from "@/lib/engine/waterfall";
import type { EngineGoal, EngineProfile, GoalProjection } from "@/lib/engine/types";
import { formatMoney, monthYearLabel, weeklyFromMonthlyCents } from "@/lib/format";
import { assumptionsToEngine } from "./queries";
import type { AssumptionRow, ContributionRow, GoalRow, ProfileRow } from "./types";

/** "Today" as a UTC calendar date string (A2: never construct a Date from a local timezone). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function templateWhy(
  goal: GoalRow,
  projection: GoalProjection,
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
 * recompute(supabase, userId) — loads everything the waterfall needs, runs it, upserts one
 * goal_projections row per (non-reached) goal, and writes a template `why` on any goal that
 * doesn't have one yet. Returns the projections it wrote (callers avoid a second read).
 */
export async function recompute(supabase: SupabaseClient, userId: string): Promise<GoalProjection[]> {
  const [profileResult, goalsResult, assumptionsResult, contributionsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("goals").select("*").eq("user_id", userId).neq("status", "paused"),
    supabase.from("assumptions").select("*"),
    supabase.from("contributions").select("goal_id, amount_cents, occurred_on").eq("user_id", userId),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (goalsResult.error) throw goalsResult.error;
  if (assumptionsResult.error) throw assumptionsResult.error;
  if (contributionsResult.error) throw contributionsResult.error;

  const profile = profileResult.data as ProfileRow | null;
  if (!profile) return [];

  const goals = (goalsResult.data ?? []) as GoalRow[];
  if (goals.length === 0) return [];

  const a = assumptionsToEngine((assumptionsResult.data ?? []) as AssumptionRow[]);
  const contributions = (contributionsResult.data ?? []) as Pick<
    ContributionRow,
    "goal_id" | "amount_cents" | "occurred_on"
  >[];

  const today = todayIso();
  // A4: "the sum of its contributions to date" — every recorded contribution counts. A
  // contribution's occurred_on is never future-dated in real use (check-ins default to
  // current_date); no runtime date filter here (lib/engine/progress.ts sums the same way,
  // unconditionally — this mirrors it rather than silently dropping seeded/backfilled rows
  // whose occurred_on merely predates the *engine's* started_on-relative "today").
  const contributedByGoal = new Map<string, number>();
  for (const c of contributions) {
    contributedByGoal.set(c.goal_id, (contributedByGoal.get(c.goal_id) ?? 0) + c.amount_cents);
  }

  const engineProfile: EngineProfile = {
    payCycle: profile.pay_cycle,
    takeHomeCents: profile.take_home_cents,
    essentialsCents: profile.essentials_cents,
    lifestyleCents: profile.lifestyle_cents,
    bufferCents: profile.buffer_cents,
  };
  const capacity = capacityMonthlyCents(engineProfile);
  const todayFraction = todayMonth(profile.started_on, today);

  const engineGoals: EngineGoal[] = goals.map((g) => ({
    id: g.id,
    kind: g.kind,
    targetCents: g.target_cents,
    startingBalanceCents: g.starting_balance_cents + (contributedByGoal.get(g.id) ?? 0),
    targetMonth: monthIndex(profile.started_on, g.target_date),
    priority: g.priority,
    goalType: g.goal_type,
    status: g.status,
    reachedAtMonth: g.reached_at ? monthIndex(profile.started_on, g.reached_at.slice(0, 10)) : null,
  }));

  const projections = waterfall(engineGoals, capacity, a, todayFraction);

  const upsertResults = await Promise.all(
    projections.map((p) =>
      supabase.from("goal_projections").upsert(
        {
          goal_id: p.goalId,
          user_id: userId,
          computed_at: new Date().toISOString(),
          rate_annual: p.rateAnnual,
          capacity_monthly_cents: p.capacityMonthlyCents,
          start_month: p.startMonth,
          completion_month: p.completionMonth,
          required_monthly_cents: p.requiredMonthlyCents,
          achievable: p.achievable,
          alt_later_months: p.altLaterMonths,
          alt_smaller_target_cents: p.altSmallerTargetCents,
          alt_extra_monthly_cents: p.altExtraMonthlyCents,
          curve: p.curve.map((pt) => ({ m: pt.m, balance_cents: pt.balanceCents })),
        },
        { onConflict: "goal_id" },
      ),
    ),
  );
  const upsertError = upsertResults.find((r) => r.error)?.error;
  if (upsertError) throw upsertError;

  const goalsById = new Map(goals.map((g) => [g.id, g]));
  const weeklyCapacityCents = weeklyFromMonthlyCents(capacity);

  const whyUpdates = projections
    .map((p) => {
      const goal = goalsById.get(p.goalId);
      if (!goal || goal.why) return null; // D7: template stands only when `why` is empty.
      return { id: goal.id, why: templateWhy(goal, p, profile.started_on, weeklyCapacityCents, profile.currency) };
    })
    .filter((u): u is { id: string; why: string } => u !== null);

  if (whyUpdates.length > 0) {
    const whyResults = await Promise.all(
      whyUpdates.map((u) => supabase.from("goals").update({ why: u.why }).eq("id", u.id)),
    );
    const whyError = whyResults.find((r) => r.error)?.error;
    if (whyError) throw whyError;
  }

  return projections;
}
