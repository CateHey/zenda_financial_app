import { profileBody as bodySchema } from "@/lib/api/schemas";
import { HttpError, ok, requireUser, withHandler } from "@/lib/api/respond";

// D5: POST /api/profile — { display_name, join_code } -> org_id_for_join_code -> upsert profiles.

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "validation", { issues: parsed.error.issues });
  }
  const { display_name, join_code } = parsed.data;

  const { data: orgId, error: rpcError } = await supabase.rpc("org_id_for_join_code", {
    code: join_code,
  });
  if (rpcError) throw rpcError;
  if (!orgId) throw new HttpError(404, "unknown_join_code");

  const { error: upsertError } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      org_id: orgId,
      role: "employee",
      display_name,
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw upsertError;

  return ok();
});
