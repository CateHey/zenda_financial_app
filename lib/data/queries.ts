// lib/data/queries.ts — A8: one function per read, all taking the user-scoped server client
// (RLS already scopes every row to auth.uid() — see supabase/migrations/0001_zenda.sql). Pages
// call these; they never write SQL inline.

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
  if (error) throw error;
  return data as ProfileRow | null;
}

/** Every non-paused goal for the signed-in user, joined with its projection (if any), by target_date asc. */
export async function getGoalsWithProjections(supabase: SupabaseClient): Promise<GoalWithProjection[]> {
  const { data, error } = await supabase
    .from("goals")
    .select("*, goal_projections(*)")
    .neq("status", "paused")
    .order("target_date", { ascending: true });
  if (error) throw error;
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
  if (error) throw error;
  return (data ?? []) as ContributionRow[];
}

export async function getUnseenEvents(supabase: SupabaseClient): Promise<MotivationalEventRow[]> {
  const { data, error } = await supabase
    .from("motivational_events")
    .select("*")
    .is("seen_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MotivationalEventRow[];
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
  if (error) throw error;
  return data as MotivationalEventRow | null;
}

export async function getAssumptions(supabase: SupabaseClient): Promise<AssumptionRow[]> {
  const { data, error } = await supabase.from("assumptions").select("*");
  if (error) throw error;
  return (data ?? []) as AssumptionRow[];
}

/** Maps the `assumptions` rows (key/value) onto the engine's typed Assumptions shape (D6). */
export function assumptionsToEngine(rows: AssumptionRow[]): Assumptions {
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return {
    cashRateAnnual: map.cash_rate_annual ?? 0.05,
    growthRateAnnual: map.growth_rate_annual ?? 0.09,
    upsideRateAnnual: map.upside_rate_annual ?? 0.12,
    glideCashBelowMonths: map.glide_cash_below_months ?? 36,
    glideGrowthAboveMonths: map.glide_growth_above_months ?? 60,
    firstMilestoneCents: map.first_milestone_cents ?? 50_000,
    emergencyWeeks: map.emergency_weeks ?? 4,
  };
}
