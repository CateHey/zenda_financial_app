import { after } from "next/server";
import { adjustBody as bodySchema } from "@/lib/api/schemas";
import { recompute } from "@/lib/data/recompute";
import { templateTradeOff } from "@/lib/data/templates";
import { DISCLAIMER } from "@/lib/engine/types";
import type { GoalRow, ProfileRow } from "@/lib/data/types";
import { aiEnabled } from "@/lib/ai/enabled";
import { runRoadmapCopy } from "@/lib/ai/run";
import { HttpError, ok, orNotFound, requireUser, withHandler } from "@/lib/api/respond";

// D5 POST /api/goals/[id]/adjust — S5. Updates the goal's target and/or date, records a
// `trade_off` event with { before, after }, and re-runs the engine. D7 call 2 (roadmap copy)
// runs in after() once the response is sent, gated by aiEnabled() (task 11).

export const POST = withHandler(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { userId, supabase } = await requireUser();

  const { id } = await params;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "validation", { issues: parsed.error.issues });
  }
  const body = parsed.data;

  const { data: goalRow, error: goalError } = await supabase.from("goals").select("*").eq("id", id).maybeSingle();
  if (goalError) throw goalError;
  const goal = orNotFound(goalRow) as GoalRow; // RLS-hidden or unknown -> 404 (D5)

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const profile = orNotFound(profileRow) as ProfileRow;

  const before = { target_cents: goal.target_cents, target_date: goal.target_date };
  // Named afterValues, not `after` — this file also imports `after` from "next/server" (D10
  // task 11) and a same-named local would shadow it, silently turning the after() call below
  // into "invoke this plain object", which is not callable.
  const afterValues = {
    target_cents: body.target_cents ?? goal.target_cents,
    target_date: body.target_date ?? goal.target_date,
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("goals")
    .update({ target_cents: afterValues.target_cents, target_date: afterValues.target_date })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (updateError) throw updateError;
  if ((updatedRows ?? []).length === 0) throw new HttpError(404, "not_found");

  const message = templateTradeOff(goal.kind, afterValues.target_cents, afterValues.target_date, before.target_cents, before.target_date, profile.currency);
  const { error: eventError } = await supabase.from("motivational_events").insert({
    user_id: userId,
    goal_id: id,
    kind: "trade_off",
    message,
    payload: { before, after: afterValues },
  });
  if (eventError) throw eventError;

  await recompute(supabase, userId);

  if (aiEnabled()) {
    after(() => runRoadmapCopy(supabase, userId));
  }

  return ok({ redirect: "/roadmap", disclaimer: DISCLAIMER });
});
