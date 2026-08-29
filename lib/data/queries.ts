// lib/data/queries.ts — A8: one function per read, all taking the user-scoped server client
// (RLS already scopes every row to auth.uid() — see supabase/migrations/0001_zenda.sql). Pages
// call these; they never write SQL inline.
//
// Robustness pass: every function here returns its "nothing" value (null for a single row, []
// for a list) on a Postgrest error, after console.error, instead of throwing. A page never gets
// an exception out of this module — a query failure looks exactly like "there's nothing there
// yet" to the caller, which every page already has to handle (a brand-new account has no
// profile/goals either), and the console.error keeps the real error visible in server logs.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Assumptions } from "@/lib/engine/types";
import type {
  AssumptionRow,
  ContributionRow,
  GoalProjectionRow,
  GoalRow,
  GoalWithProjection,
  MotivationalEventRow,
  ProfileRow,
} from "./types";

export async function getProfile(supabase: SupabaseClient): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
  if (error) {
    console.error("getProfile failed", error);
    return null;
  }
  return data as ProfileRow | null;
}

/** One goal by id, scoped to the signed-in user by RLS (S5 trade-off, S8 celebrate). */
export async function getGoalById(supabase: SupabaseClient, id: string): Promise<GoalRow | null> {
  const { data, error } = await supabase.from("goals").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("getGoalById failed", error);
    return null;
  }
  return data as GoalRow | null;
}

/** Every non-paused goal for the signed-in user, joined with its projection (if any), by target_date asc. */
export async function getGoalsWithProjections(supabase: SupabaseClient): Promise<GoalWithProjection[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("*, goal_projections(*)")
    .neq("status", "paused")
    .order("target_date", { ascending: true });
  if (error) {
    console.error("getGoalsWithProjections failed", error);
    return [];
  }
  return (data ?? []).map((row) => {
    const { goal_projections, ...goal } = row as GoalRow & { goal_projections: GoalProjectionRow[] | GoalProjectionRow | null };
    const projection = Array.isArray(goal_projections) ? (goal_projections[0] ?? null) : goal_projections;
    return { ...(goal as GoalRow), projection };
  });
}

/** The soonest active goal ("current goal" everywhere in the bindings doc). Null when none is active. */
export async function getCurrentGoal(supabase: SupabaseClient): Promise<GoalWithProjection | null> {
  const goals = await getGoalsWithProjections(supabase);
  const active = goals.filter((g) => g.status === "active");
  if (active.length === 0) return null;
  return active.reduce((soonest, g) => (g.target_date < soonest.target_date ? g : soonest), active[0]);
}

export async function getContributions(supabase: SupabaseClient, goalId: string): Promise<ContributionRow[]> {
  const { data, error } = await supabase
    .from("contributions")
    .select("*")
    .eq("goal_id", goalId)
    .order("occurred_on", { ascending: false });
  if (error) {
    console.error("getContributions failed", error);
    return [];
  }
  return (data ?? []) as ContributionRow[];
}

/** Every contribution against any of the given goal ids, newest first (S6: streak/dots span the
 * current goal and the goals before it in date order — this fetches all of them in one call). */
export async function getContributionsForGoals(
  supabase: SupabaseClient,
  goalIds: string[],
): Promise<ContributionRow[]> {
  if (goalIds.length === 0) return [];
  const { data, error } = await supabase
    .from("contributions")
    .select("*")
    .in("goal_id", goalIds)
    .order("occurred_on", { ascending: false });
  if (error) {
    console.error("getContributionsForGoals failed", error);
    return [];
  }
  return (data ?? []) as ContributionRow[];
}

export async function getUnseenEvents(supabase: SupabaseClient): Promise<MotivationalEventRow[]> {
  const { data, error } = await supabase
    .from("motivational_events")
    .select("*")
    .is("seen_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getUnseenEvents failed", error);
    return [];
  }
  return (data ?? []) as MotivationalEventRow[];
}

/** One motivational_events row by id, scoped to the signed-in user by RLS (S8: /celebrate?event=). */
export async function getEventById(supabase: SupabaseClient, id: string): Promise<MotivationalEventRow | null> {
  const { data, error } = await supabase.from("motivational_events").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("getEventById failed", error);
    return null;
  }
  return data as MotivationalEventRow | null;
}

/** The latest Discover reflection bubble (S1 bubble 3), if AI call 1 (task 11) has ever run. */
export async function getLatestReflectionEvent(supabase: SupabaseClient): Promise<MotivationalEventRow | null> {
  const { data, error } = await supabase
    .from("motivational_events")
    .select("*")
    .eq("kind", "nudge")
    .contains("payload", { reflection: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getLatestReflectionEvent failed", error);
    return null;
  }
  return data as MotivationalEventRow | null;
}

export async function getAssumptions(supabase: SupabaseClient): Promise<AssumptionRow[]> {
  const { data, error } = await supabase.from("assumptions").select("*");
  if (error) {
    console.error("getAssumptions failed", error);
    return [];
  }
  return (data ?? []) as AssumptionRow[];
}

/** Maps the `assumptions` rows (key/value) onto the engine's typed Assumptions shape (D6). Every
 * field falls back to the D2 default when its row is missing (empty `rows`, a partial fetch, or
 * the getAssumptions() error fallback above) — never NaN/undefined into the engine. */
export function assumptionsToEngine(rows: AssumptionRow[]): Assumptions {
  if (rows.length === 0) {
    console.warn("assumptionsToEngine: no assumptions rows — falling back to D2 defaults");
  }
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  const num = (v: number | undefined, fallback: number) => (Number.isFinite(v) ? (v as number) : fallback);
  return {
    cashRateAnnual: num(map.cash_rate_annual, 0.05),
    growthRateAnnual: num(map.growth_rate_annual, 0.09),
    upsideRateAnnual: num(map.upside_rate_annual, 0.12),
    glideCashBelowMonths: num(map.glide_cash_below_months, 36),
    glideGrowthAboveMonths: num(map.glide_growth_above_months, 60),
    firstMilestoneCents: num(map.first_milestone_cents, 50_000),
    emergencyWeeks: num(map.emergency_weeks, 4),
  };
}
