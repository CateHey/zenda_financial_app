import { after } from "next/server";
import { checkinBody as bodySchema } from "@/lib/api/schemas";
import { recompute } from "@/lib/data/recompute";
import { templateCelebration } from "@/lib/data/templates";
import { todayIso } from "@/lib/engine/today";
import { capacityMonthlyCents, cycleDays } from "@/lib/engine/rates";
import { checkedInThisCycle, streak } from "@/lib/engine/progress";
import { perCycleFromMonthlyCents } from "@/lib/format";
import type { ContributionKind, GoalRow, ProfileRow } from "@/lib/data/types";
import { aiEnabled } from "@/lib/ai/enabled";
import { runRoadmapCopy } from "@/lib/ai/run";
import { HttpError, ok, orNotFound, requireUser, withHandler } from "@/lib/api/respond";

// D5 POST /api/checkin — S6. Inserts one contribution row per check-in ("full" = the whole
// per-cycle capacity, "partial" = a lesser submitted amount, "skip" = amount 0 recorded against
// checkin_full per A3), then re-derives whether the goal is now reached, re-runs the engine
// (lib/data/recompute.ts — the only writer of goal_projections, also advances the next goal's
// start_month per A4 once this goal freezes), and returns the account's current streak. On the
// goal-reached branch only, D7 call 2 (the celebration line upgrade) runs in after() once the
// response is sent, gated by aiEnabled() (task 11).
//
// Robustness pass addition: a second check-in against the same goal in the same pay cycle
// (A3's "already checked in this cycle" rule — same test lib/engine/progress.ts already
// implements for the Progress screen's "Done for this payday" state) is rejected with 409
// rather than silently inserting a second contribution row and double-counting it.

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "validation", { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const profile = orNotFound(profileRow) as ProfileRow;

  // RLS scopes this to the caller's own rows: a goal that belongs to someone else (or doesn't
  // exist) simply doesn't come back — the D5 "a goal that RLS hides is a 404" rule.
  const { data: goalRow, error: goalError } = await supabase
    .from("goals")
    .select("*")
    .eq("id", body.goal_id)
    .maybeSingle();
  if (goalError) throw goalError;
  // Decision: a check-in only makes sense against an active goal (the current goal the
  // Progress screen shows); reached/paused goals 404 the same as a missing one — simplest
  // option, since the UI never sends anything else.
  if (!goalRow || (goalRow as GoalRow).status !== "active") {
    throw new HttpError(404, "not_found");
  }
  const goal = goalRow as GoalRow;

  const today = todayIso();
  const cycleLength = cycleDays(profile.pay_cycle);

  const { data: existingContribRows, error: existingContribError } = await supabase
    .from("contributions")
    .select("amount_cents, occurred_on")
    .eq("goal_id", goal.id);
  if (existingContribError) throw existingContribError;
  const existingContribs = (existingContribRows ?? []) as { amount_cents: number; occurred_on: string }[];

  // A3: "already checked in this cycle" — a contribution already exists within the cycle window.
  // Server-side guard behind the Progress screen's own "Done for this payday" state, so a replay
  // or a second tab can't insert (and double-count) a second contribution for the same cycle.
  if (
    checkedInThisCycle(
      existingContribs.map((c) => ({ goalId: goal.id, amountCents: c.amount_cents, occurredOn: c.occurred_on })),
      cycleLength,
      today,
    )
  ) {
    throw new HttpError(409, "already_checked_in");
  }

  const capacityMonthly = capacityMonthlyCents({
    payCycle: profile.pay_cycle,
    takeHomeCents: profile.take_home_cents,
    essentialsCents: profile.essentials_cents,
    lifestyleCents: profile.lifestyle_cents,
    bufferCents: profile.buffer_cents,
  });
  const capacityPerCycle = perCycleFromMonthlyCents(capacityMonthly, profile.pay_cycle);

  let amountCents: number;
  let contributionKind: ContributionKind;
  if (body.kind === "full") {
    amountCents = capacityPerCycle;
    contributionKind = "checkin_full";
  } else if (body.kind === "partial") {
    const submitted = body.amount_cents ?? 0;
    if (submitted >= capacityPerCycle) {
      throw new HttpError(400, "validation", {
        issues: [{ message: "a partial amount must be less than the per-cycle capacity" }],
      });
    }
    amountCents = submitted;
    contributionKind = "checkin_partial";
  } else {
    // A3: "A skip check-in inserts amount_cents = 0, kind = checkin_full."
    amountCents = 0;
    contributionKind = "checkin_full";
  }

  const { error: insertError } = await supabase.from("contributions").insert({
    user_id: userId,
    goal_id: goal.id,
    amount_cents: amountCents,
    occurred_on: today,
    kind: contributionKind,
  });
  if (insertError) throw insertError;

  const savedCents =
    goal.starting_balance_cents + existingContribs.reduce((sum, r) => sum + r.amount_cents, 0) + amountCents;

  const reached = savedCents >= goal.target_cents;
  if (reached) {
    // Timestamp built from todayIso() (A12), not real wall-clock time — reached_at feeds
    // monthIndex() in lib/data/recompute.ts and must stay on the demo clock.
    const reachedAtIso = `${today}T00:00:00.000Z`;
    const { data: reachedRows, error: reachError } = await supabase
      .from("goals")
      .update({ status: "reached", reached_at: reachedAtIso })
      .eq("id", goal.id)
      .select("id");
    if (reachError) throw reachError;
    if ((reachedRows ?? []).length === 0) throw new HttpError(404, "not_found");
  }

  // Re-run the engine: projections for every remaining goal, and (A4) a just-reached goal
  // freezes while the next goal's start_month advances from the new cursor.
  await recompute(supabase, userId);

  const { data: activeRows, error: activeError } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("target_date", { ascending: true });
  if (activeError) throw activeError;
  const currentAfter = ((activeRows ?? []) as GoalRow[])[0] as GoalRow | undefined;

  let eventId: string | undefined;
  if (reached) {
    const message = templateCelebration(goal.target_cents, goal.title, currentAfter?.title ?? null, profile.currency);
    const { data: eventRow, error: eventError } = await supabase
      .from("motivational_events")
      .insert({ user_id: userId, goal_id: goal.id, kind: "milestone_reached", message, payload: {} })
      .select("id")
      .single();
    if (eventError) throw eventError;
    eventId = orNotFound(eventRow).id as string;

    if (aiEnabled()) {
      after(() => runRoadmapCopy(supabase, userId, eventId));
    }
  }

  // Streak (A3): the (possibly new) current goal's contributions plus every goal before it in
  // date order — same combined set the Progress screen's dots use. If every goal is now
  // reached, fall back to the just-checked-in goal so the streak still reflects real history.
  const currentForStreak = currentAfter ?? goal;
  const { data: streakGoalRows, error: streakGoalError } = await supabase
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .lte("target_date", currentForStreak.target_date);
  if (streakGoalError) throw streakGoalError;
  const streakGoalIds = ((streakGoalRows ?? []) as { id: string }[]).map((g) => g.id);
  const { data: streakContribRows, error: streakContribError } = await supabase
    .from("contributions")
    .select("goal_id, amount_cents, occurred_on")
    .in("goal_id", streakGoalIds.length > 0 ? streakGoalIds : [currentForStreak.id]);
  if (streakContribError) throw streakContribError;
  const streakContribs = (streakContribRows ?? []).map((c) => ({
    goalId: c.goal_id as string,
    amountCents: c.amount_cents as number,
    occurredOn: c.occurred_on as string,
  }));
  const streakCount = streak(streakContribs, cycleLength);

  return ok({
    reached,
    event_id: eventId,
    streak: streakCount,
    redirect: reached ? `/celebrate?event=${eventId}` : "/progress",
  });
});
