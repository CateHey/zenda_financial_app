import { NextResponse } from "next/server";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { prioritiseBody as bodySchema } from "@/lib/api/schemas";
import { recompute } from "@/lib/data/recompute";

// D5 POST /api/prioritise — S3. Sets priority = index + 1 for the submitted ids (in that order),
// re-runs the engine, and upserts projections. Priority never changes waterfall dates (D6 §8:
// "date order drives funding") — it only changes the Prioritise/Roadmap screens' display order.

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }
    const { ordered_goal_ids } = parsed.data;

    const supabase = await supabaseServer();
    if (!supabase) return NextResponse.json({ error: "internal" }, { status: 500 });

    // A goal that RLS hides (someone else's, or missing) is a 404 (D5) rather than a silent no-op.
    const { data: ownedRows, error: readError } = await supabase
      .from("goals")
      .select("id")
      .in("id", ordered_goal_ids);
    if (readError) return NextResponse.json({ error: "internal" }, { status: 500 });
    const ownedIds = new Set(((ownedRows ?? []) as { id: string }[]).map((g) => g.id));
    if (ownedIds.size !== ordered_goal_ids.length) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const updateResults = await Promise.all(
      ordered_goal_ids.map((id, index) =>
        supabase.from("goals").update({ priority: index + 1 }).eq("id", id).eq("user_id", userId),
      ),
    );
    const updateError = updateResults.find((r) => r.error)?.error;
    if (updateError) return NextResponse.json({ error: "internal" }, { status: 500 });

    await recompute(supabase, userId);

    return NextResponse.json({ ok: true, redirect: "/roadmap" });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
