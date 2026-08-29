import { prioritiseBody as bodySchema } from "@/lib/api/schemas";
import { recompute } from "@/lib/data/recompute";
import { HttpError, ok, requireUser, withHandler } from "@/lib/api/respond";

// D5 POST /api/prioritise — S3. Sets priority = index + 1 for the submitted ids (in that order),
// re-runs the engine, and upserts projections. Priority never changes waterfall dates (D6 §8:
// "date order drives funding") — it only changes the Prioritise/Roadmap screens' display order.

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "validation", { issues: parsed.error.issues });
  }
  const { ordered_goal_ids } = parsed.data;

  // A goal that RLS hides (someone else's, or missing) is a 404 (D5) rather than a silent no-op.
  const { data: ownedRows, error: readError } = await supabase
    .from("goals")
    .select("id")
    .in("id", ordered_goal_ids);
  if (readError) throw readError;
  const ownedIds = new Set(((ownedRows ?? []) as { id: string }[]).map((g) => g.id));
  if (ownedIds.size !== ordered_goal_ids.length) {
    throw new HttpError(404, "not_found");
  }

  // priority >= 1 by construction (index + 1, index >= 0) — no separate guard needed.
  const updateResults = await Promise.all(
    ordered_goal_ids.map((id, index) =>
      supabase.from("goals").update({ priority: index + 1 }).eq("id", id).eq("user_id", userId).select("id"),
    ),
  );
  const updateError = updateResults.find((r) => r.error)?.error;
  if (updateError) throw updateError;
  const zeroRow = updateResults.find((r) => (r.data ?? []).length === 0);
  if (zeroRow) throw new HttpError(404, "not_found");

  await recompute(supabase, userId);

  return ok({ redirect: "/roadmap" });
});
