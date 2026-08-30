import { z } from "zod";
import { recompute } from "@/lib/data/recompute";
import { todayIso } from "@/lib/engine/today";
import { capacityMonthlyCents, cycleDays } from "@/lib/engine/rates";
import { perCycleFromMonthlyCents } from "@/lib/format";
import type { GoalRow, ProfileRow } from "@/lib/data/types";
import { HttpError, ok, orNotFound, requireUser, withHandler } from "@/lib/api/respond";
import { toEngineProfile } from "@/lib/data/engine-profile";

// POST /api/withdraw — "I need some of that money": takes an amount out of a goal (an emergency,
// a change of plan) as a negative `manual` contribution with a note, then re-runs the engine so
// every date after it moves. A goal that had been reached becomes active again with a fresh
// target date (refilled at capacity from today), so the roadmap redraws instead of pretending.
// Needs migration 0002_money_moves.sql (negative manual amounts + note); without it the insert
// fails the check constraint and the client gets `needs_migration`.

const bodySchema = z.object({
  goal_id: z.string().uuid(),
  amount_cents: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().max(80).optional(),
});

function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "validation", { issues: parsed.error.issues });
  const { goal_id: goalId, amount_cents: amountCents, reason } = parsed.data;

  const { data: profileRow, error: profileError } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (profileError) throw profileError;
  const profile = orNotFound(profileRow) as ProfileRow;

  const { data: goalRow, error: goalError } = await supabase.from("goals").select("*").eq("id", goalId).maybeSingle();
  if (goalError) throw goalError;
  if (!goalRow || !["active", "reached"].includes((goalRow as GoalRow).status)) throw new HttpError(404, "not_found");
  const goal = goalRow as GoalRow;

  const { data: existingRows, error: existingError } = await supabase.from("contributions").select("amount_cents").eq("goal_id", goal.id);
  if (existingError) throw existingError;
  const savedBefore = goal.starting_balance_cents + (existingRows ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0);
  if (amountCents > savedBefore) throw new HttpError(400, "more_than_saved", { saved_cents: savedBefore });

  const today = todayIso();
  const { error: insertError } = await supabase.from("contributions").insert({
    user_id: userId,
    goal_id: goal.id,
    amount_cents: -amountCents,
    occurred_on: today,
    kind: "manual",
    note: reason && reason.length > 0 ? reason : null,
  });
  if (insertError) {
    // 23514 = check_violation, 42703 = undefined_column: migration 0002 not applied yet.
    const code = (insertError as { code?: string }).code;
    if (code === "23514" || code === "42703" || code === "PGRST204") throw new HttpError(503, "needs_migration");
    throw insertError;
  }

  const savedCents = savedBefore - amountCents;
  let reactivated = false;
  if (goal.status === "reached" && savedCents < goal.target_cents) {
    // Back on the path: refill it at capacity from today, so its date is honest again.
    const capacityMonthly = capacityMonthlyCents(toEngineProfile(profile));
    const perCycle = perCycleFromMonthlyCents(capacityMonthly, profile.pay_cycle);
    const cycles = perCycle > 0 ? Math.max(1, Math.ceil((goal.target_cents - savedCents) / perCycle)) : 4;
    const targetDate = isoPlusDays(today, cycles * cycleDays(profile.pay_cycle));
    const { error: reactivateError } = await supabase
      .from("goals")
      .update({ status: "active", reached_at: null, target_date: targetDate })
      .eq("id", goal.id);
    if (reactivateError) throw reactivateError;
    reactivated = true;
  }

  await recompute(supabase, userId);

  return ok({
    saved_cents: savedCents,
    remaining_cents: Math.max(0, goal.target_cents - savedCents),
    reactivated,
    redirect: reactivated ? "/roadmap" : "/progress",
  });
});
