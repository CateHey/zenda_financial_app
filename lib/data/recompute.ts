// lib/data/recompute.ts — D5: "the single place projections are written; every handler calls
// it." Loads profile + goals + assumptions with the user-scoped client, runs the D6 waterfall,
// upserts goal_projections, and refreshes the template `why` (D7 fallback) for every active goal
// on every recompute — the template is the truth for the current projection. This is the ONLY
// writer of goal_projections in the whole app.

import type { SupabaseClient } from "@supabase/supabase-js";
import { capacityMonthlyCents, monthIndex, todayMonth } from "@/lib/engine/rates";
import { todayIso } from "@/lib/engine/today";
import { waterfall } from "@/lib/engine/waterfall";
import type { EngineGoal, GoalProjection } from "@/lib/engine/types";
import { weeklyFromMonthlyCents } from "@/lib/format";
import { toEngineProfile } from "@/lib/data/engine-profile";
import { assumptionsToEngine } from "./queries";
import { templateWhy } from "./templates";
import type { AssumptionRow, ContributionRow, GoalRow, ProfileRow } from "./types";

/**
 * recompute(supabase, userId) — loads everything the waterfall needs, runs it, upserts one
 * goal_projections row per (non-reached) goal, and writes a fresh template `why` for each of
 * those goals every time (D7 fallback + cache rule — see the comment above `whyUpdates` below).
 * Returns the projections it wrote (callers avoid a second read).
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

  const engineProfile = toEngineProfile(profile);
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

  const goalsById = new Map(goals.map((g) => [g.id, g]));
  const weeklyCapacityCents = weeklyFromMonthlyCents(capacity);

  // D7 fallback + cache rule (lib/ai/run.ts's needsRegeneration): the template `why` is the
  // truth for the *current* projection, so it is rewritten for every active goal on every
  // recompute — not only the first time a goal gets one — otherwise a changed projection
  // (adapt/adjust/prioritise) leaves `why` quoting stale numbers until the AI upgrade happens to
  // run again. `projections` only ever holds active goals (waterfall() freezes `reached` goals
  // and never emits a row for them, D6 §8), so a reached goal's `why` is never touched here.
  //
  // Ordering matters: this update MUST land before the goal_projections upsert below. The
  // `goals_touch` trigger bumps `goals.updated_at` to Postgres's own now() on any update to the
  // row, and needsRegeneration only re-triggers the AI copy when the projection's `computed_at`
  // is strictly newer than that. Writing `why` first (bumping `updated_at`) and reading back what
  // Postgres actually stamped it with — rather than comparing against this process's own
  // `new Date()` — matters: a client/server clock skew of even ~100ms (observed against the real
  // dev Supabase project) can otherwise land computed_at *before* updated_at despite happening
  // strictly after it, silently starving needsRegeneration of the newer projection it's waiting
  // for. `computedAt` below is Postgres's own clock, read back and nudged 1s forward, so both
  // sides of that comparison come from the same source of truth and an AI regeneration is
  // triggered exactly when the projection actually changed, on every recompute.
  const whyUpdates = projections
    .map((p) => {
      const goal = goalsById.get(p.goalId);
      if (!goal) return null;
      return { id: goal.id, why: templateWhy(goal, p, profile.started_on, weeklyCapacityCents, profile.currency) };
    })
    .filter((u): u is { id: string; why: string } => u !== null);

  let computedAt = new Date().toISOString();
  if (whyUpdates.length > 0) {
    const whyResults = await Promise.all(
      whyUpdates.map((u) => supabase.from("goals").update({ why: u.why }).eq("id", u.id).select("updated_at")),
    );
    const whyError = whyResults.find((r) => r.error)?.error;
    if (whyError) throw whyError;

    const updatedAtMsValues = whyResults
      .flatMap((r) => r.data ?? [])
      .map((row) => new Date((row as { updated_at: string }).updated_at).getTime())
      .filter((ms) => Number.isFinite(ms));
    if (updatedAtMsValues.length > 0) {
      computedAt = new Date(Math.max(...updatedAtMsValues) + 1000).toISOString();
    }
  }

  const upsertResults = await Promise.all(
    projections.map((p) =>
      supabase.from("goal_projections").upsert(
        {
          goal_id: p.goalId,
          user_id: userId,
          computed_at: computedAt,
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

  return projections;
}
