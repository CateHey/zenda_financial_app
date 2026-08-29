import { requireUser, withHandler, ok, orNotFound } from "@/lib/api/respond";

// D5 POST /api/events/[id]/seen — S8. No body. Sets seen_at on the caller's own event row.
// A goal that RLS hides is a 404 (D5); the same rule applies to any other user's event id.
// Idempotent by construction: calling it again just sets seen_at to a later timestamp — no
// unique constraint or state machine to conflict with, so a second call is always safe (D5 spec:
// "/api/events/[id]/seen safe to call twice").

export const POST = withHandler(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { supabase } = await requireUser();

  const { id } = await params;

  const { data: existing, error: readError } = await supabase
    .from("motivational_events")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  orNotFound(existing);

  const { error: updateError } = await supabase
    .from("motivational_events")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;

  return ok();
});
