import { NextResponse } from "next/server";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { profileBody as bodySchema } from "@/lib/api/schemas";

// D5: POST /api/profile — { display_name, join_code } -> org_id_for_join_code -> upsert profiles.

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { display_name, join_code } = parsed.data;

    const supabase = await supabaseServer();
    if (!supabase) {
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    const { data: orgId, error: rpcError } = await supabase.rpc("org_id_for_join_code", {
      code: join_code,
    });
    if (rpcError) {
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    if (!orgId) {
      return NextResponse.json({ error: "unknown_join_code" }, { status: 404 });
    }

    const { error: upsertError } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        org_id: orgId,
        role: "employee",
        display_name,
      },
      { onConflict: "user_id" },
    );
    if (upsertError) {
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
