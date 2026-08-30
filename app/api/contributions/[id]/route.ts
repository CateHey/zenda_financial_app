import { contributionEditBody as bodySchema } from "@/lib/api/schemas";
import { HttpError, ok, orNotFound, requireUser, withHandler } from "@/lib/api/respond";
import { recompute } from "@/lib/data/recompute";
import { toEngineProfile } from "@/lib/data/engine-profile";
import { capacityMonthlyCents, cycleDays } from "@/lib/engine/rates";
import { perCycleFromMonthlyCents } from "@/lib/format";
import { todayIso } from "@/lib/engine/today";
import type { ContributionRow, GoalRow, ProfileRow } from "@/lib/data/types";

// PATCH / DELETE /api/contributions/[id] — fixing a move that was already recorded (Progress →
// Recent moves). A check-in taps the wrong number, a bonus went in as $200 when it was $250, a
// row was logged against the wrong payday: none of that should mean living with a wrong balance.
//
// Everything downstream of a contribution is derived, never stored twice — the goal's saved total
// is the sum of its rows and the dates come out of the engine — so an edit is genuinely just this
// one row plus a recompute(). Two consequences are handled explicitly:
//   - `kind` has to stay honest. Editing a full payday down to half makes it a part payday, and a
//     payday edited to 0 is a skip; the labels in Recent moves read straight off `kind`.
//   - a goal marked reached can fall back under its target, exactly as /api/withdraw can make it.
//     Same treatment: active again, with a date refilled at capacity from today.
//
// RLS scopes the row to its owner, so someone else's id is simply not found (D5's 404 rule).

function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The row, its goal and the profile — or a 404 if RLS hides any of it. */
async function load(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], id: string) {
  const { data: row, error } = await supabase.from("contributions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  const contribution = orNotFound(row) as ContributionRow;

  const [{ data: goalRow, error: goalError }, { data: profileRow, error: profileError }] = await Promise.all([
    supabase.from("goals").select("*").eq("id", contribution.goal_id).maybeSingle(),
    supabase.from("profiles").select("*").maybeSingle(),
  ]);
  if (goalError) throw goalError;
  if (profileError) throw profileError;

  return {
    contribution,
    goal: orNotFound(goalRow) as GoalRow,
    profile: orNotFound(profileRow) as ProfileRow,
  };
}

/** Sum of every contribution against a goal (the saved total is never stored, only derived). */
async function savedFor(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  goal: GoalRow,
): Promise<number> {
  const { data, error } = await supabase.from("contributions").select("amount_cents").eq("goal_id", goal.id);
  if (error) throw error;
  return goal.starting_balance_cents + (data ?? []).reduce((acc, r) => acc + (r as { amount_cents: number }).amount_cents, 0);
}

/** Reached, but no longer funded: put it back on the path with an honest date. */
async function reactivateIfShort(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  goal: GoalRow,
  profile: ProfileRow,
  savedCents: number,
): Promise<boolean> {
  if (goal.status !== "reached" || savedCents >= goal.target_cents) return false;
  const perCycle = perCycleFromMonthlyCents(capacityMonthlyCents(toEngineProfile(profile)), profile.pay_cycle);
  const cycles = perCycle > 0 ? Math.max(1, Math.ceil((goal.target_cents - savedCents) / perCycle)) : 4;
  const { error } = await supabase
    .from("goals")
    .update({ status: "active", reached_at: null, target_date: isoPlusDays(todayIso(), cycles * cycleDays(profile.pay_cycle)) })
    .eq("id", goal.id);
  if (error) throw error;
  return true;
}

export const PATCH = withHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId, supabase } = await requireUser();
  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) throw new HttpError(400, "validation", { issues: parsed.error.issues });
  const { amount_cents, note } = parsed.data;

  const { contribution, goal, profile } = await load(supabase, id);

  // Migration 0002's check constraint, enforced here so the caller gets a reason rather than a 409.
  if (contribution.kind === "manual") {
    if (amount_cents === 0) throw new HttpError(400, "validation", { issues: [{ path: ["amount_cents"], message: "a money move can't be zero — delete it instead" }] });
  } else if (amount_cents < 0) {
    throw new HttpError(400, "validation", { issues: [{ path: ["amount_cents"], message: "a payday check-in can't be negative" }] });
  }

  // Keep `kind` truthful: Recent moves labels a row from it, so a full payday edited down to half
  // must stop calling itself full. `manual` and `seed` mean something else and are left alone.
  let kind = contribution.kind;
  if (kind === "checkin_full" || kind === "checkin_partial") {
    const perCycle = perCycleFromMonthlyCents(capacityMonthlyCents(toEngineProfile(profile)), profile.pay_cycle);
    kind = perCycle > 0 && amount_cents >= perCycle ? "checkin_full" : "checkin_partial";
  }

  const update: Record<string, unknown> = { amount_cents, kind };
  if (note !== undefined) update.note = note === null || note === "" ? null : note;

  const { error: updateError } = await supabase.from("contributions").update(update).eq("id", id);
  if (updateError) {
    const code = (updateError as { code?: string }).code;
    if (code === "23514" || code === "42703" || code === "PGRST204") throw new HttpError(503, "needs_migration");
    throw updateError;
  }

  const savedCents = await savedFor(supabase, goal);
  const reactivated = await reactivateIfShort(supabase, goal, profile, savedCents);
  await recompute(supabase, userId);

  return ok({ amount_cents, kind, saved_cents: savedCents, reactivated });
});

export const DELETE = withHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId, supabase } = await requireUser();
  const { id } = await params;

  const { goal, profile } = await load(supabase, id);

  const { error } = await supabase.from("contributions").delete().eq("id", id);
  if (error) throw error;

  const savedCents = await savedFor(supabase, goal);
  const reactivated = await reactivateIfShort(supabase, goal, profile, savedCents);
  await recompute(supabase, userId);

  return ok({ deleted: true, saved_cents: savedCents, reactivated });
});
