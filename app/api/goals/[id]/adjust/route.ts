import { NextResponse } from "next/server";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { adjustBody as bodySchema } from "@/lib/api/schemas";
import { recompute } from "@/lib/data/recompute";
import { templateTradeOff } from "@/lib/data/templates";
import { DISCLAIMER } from "@/lib/engine/types";
import type { GoalRow, ProfileRow } from "@/lib/data/types";

// D5 POST /api/goals/[id]/adjust — S5. Updates the goal's target and/or date, records a
// `trade_off` event with { before, after }, and re-runs the engine.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    const supabase = await supabaseServer();
    if (!supabase) return NextResponse.json({ error: "internal" }, { status: 500 });

    const { data: goalRow, error: goalError } = await supabase.from("goals").select("*").eq("id", id).maybeSingle();
    if (goalError) return NextResponse.json({ error: "internal" }, { status: 500 });
    if (!goalRow) return NextResponse.json({ error: "not_found" }, { status: 404 }); // RLS-hidden or unknown
    const goal = goalRow as GoalRow;

    const { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: "internal" }, { status: 500 });
    if (!profileRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const profile = profileRow as ProfileRow;

    const before = { target_cents: goal.target_cents, target_date: goal.target_date };
    const after = {
      target_cents: body.target_cents ?? goal.target_cents,
      target_date: body.target_date ?? goal.target_date,
    };

    const { error: updateError } = await supabase
      .from("goals")
      .update({ target_cents: after.target_cents, target_date: after.target_date })
      .eq("id", id)
      .eq("user_id", userId);
    if (updateError) return NextResponse.json({ error: "internal" }, { status: 500 });

    const message = templateTradeOff(goal.kind, after.target_cents, after.target_date, before.target_cents, before.target_date, profile.currency);
    const { error: eventError } = await supabase.from("motivational_events").insert({
      user_id: userId,
      goal_id: id,
      kind: "trade_off",
      message,
      payload: { before, after },
    });
    if (eventError) return NextResponse.json({ error: "internal" }, { status: 500 });

    await recompute(supabase, userId);

    return NextResponse.json({ ok: true, redirect: "/roadmap", disclaimer: DISCLAIMER });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
