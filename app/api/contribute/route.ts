import { after } from "next/server";
import { z } from "zod";
import { recompute } from "@/lib/data/recompute";
import { templateCelebration } from "@/lib/data/templates";
import { todayIso } from "@/lib/engine/today";
import type { GoalRow, ProfileRow } from "@/lib/data/types";
import { aiEnabled } from "@/lib/ai/enabled";
import { runRoadmapCopy } from "@/lib/ai/run";
import { HttpError, ok, orNotFound, requireUser, withHandler } from "@/lib/api/respond";

// POST /api/contribute — "I came into some extra money": a one-off amount the person puts toward
// a goal of their choice (not only the current one). Inserts one `manual` contribution dated
// today (A12 demo clock), outside the payday check-in rhythm, so it never collides with A3's
// "already checked in this cycle" rule and never breaks the streak. Then the same tail as a
// check-in: reached? → freeze the goal + celebration event; re-run the engine so every date
// after it moves earlier.

const bodySchema = z.object({
  goal_id: z.string().uuid(),
  amount_cents: z.number().int().positive().max(100_000_000),
});

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "validation", { issues: parsed.error.issues });
  const { goal_id: goalId, amount_cents: amountCents } = parsed.data;

  const { data: profileRow, error: profileError } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (profileError) throw profileError;
  const profile = orNotFound(profileRow) as ProfileRow;

  // RLS scopes this to the caller's own rows; only an active goal can take money.
  const { data: goalRow, error: goalError } = await supabase.from("goals").select("*").eq("id", goalId).maybeSingle();
  if (goalError) throw goalError;
  if (!goalRow || (goalRow as GoalRow).status !== "active") throw new HttpError(404, "not_found");
  const goal = goalRow as GoalRow;

  const { data: existingRows, error: existingError } = await supabase.from("contributions").select("amount_cents").eq("goal_id", goal.id);
  if (existingError) throw existingError;
  const savedBefore = goal.starting_balance_cents + (existingRows ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0);

  const today = todayIso();
  const { error: insertError } = await supabase
    .from("contributions")
    .insert({ user_id: userId, goal_id: goal.id, amount_cents: amountCents, occurred_on: today, kind: "manual" });
  if (insertError) throw insertError;

  const savedCents = savedBefore + amountCents;
  const reached = savedCents >= goal.target_cents;
  if (reached) {
    const { data: reachedRows, error: reachError } = await supabase
      .from("goals")
      .update({ status: "reached", reached_at: `${today}T00:00:00.000Z` })
      .eq("id", goal.id)
      .select("id");
    if (reachError) throw reachError;
    if ((reachedRows ?? []).length === 0) throw new HttpError(404, "not_found");
  }

  await recompute(supabase, userId);

  let eventId: string | undefined;
  if (reached) {
    const { data: activeRows, error: activeError } = await supabase
      .from("goals")
      .select("title")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("target_date", { ascending: true })
      .limit(1);
    if (activeError) throw activeError;
    const nextTitle = (activeRows?.[0]?.title as string | undefined) ?? null;
    const message = templateCelebration(goal.target_cents, goal.title, nextTitle, profile.currency);
    const { data: eventRow, error: eventError } = await supabase
      .from("motivational_events")
      .insert({ user_id: userId, goal_id: goal.id, kind: "milestone_reached", message, payload: {} })
      .select("id")
      .single();
    if (eventError) throw eventError;
    eventId = orNotFound(eventRow).id as string;
    if (aiEnabled()) after(() => runRoadmapCopy(supabase, userId, eventId));
  }

  return ok({
    reached,
    saved_cents: savedCents,
    remaining_cents: Math.max(0, goal.target_cents - savedCents),
    event_id: eventId,
    redirect: reached ? `/celebrate?event=${eventId}` : "/progress",
  });
});
