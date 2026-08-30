import { lockBody as bodySchema } from "@/lib/api/schemas";
import { HttpError, ok, requireUser, withHandler } from "@/lib/api/respond";
import { recompute } from "@/lib/data/recompute";

// POST /api/lock — set or clear profiles.locked_monthly_cents (migration 0004).
//
// Locking is a standing decision, not a one-off edit: while it is set the engine uses it as the
// monthly capacity outright, so a pay rise or a change to the fun line moves what is left over
// rather than what reaches the goals. Because capacity is what every projection is built on, the
// projections have to be rebuilt here — recompute() is the only writer of that table (D6/A7), so
// this route changes the one column and then asks it to redraw.

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "validation", { issues: parsed.error.issues });
  }
  const { monthly_cents } = parsed.data;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ locked_monthly_cents: monthly_cents })
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    // 42703 / PGRST204: the column isn't there yet, i.e. 0004 hasn't been run in the SQL editor.
    const code = (error as { code?: string }).code;
    if (code === "42703" || code === "PGRST204") throw new HttpError(503, "needs_migration");
    throw error;
  }
  if ((updated ?? []).length === 0) throw new HttpError(404, "not_found");

  const projections = await recompute(supabase, userId);

  return ok({ locked_monthly_cents: monthly_cents, goals: projections.length });
});
