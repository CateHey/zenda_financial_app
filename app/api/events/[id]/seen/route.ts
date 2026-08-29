import { NextResponse } from "next/server";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";

// D5 POST /api/events/[id]/seen — S8. No body. Sets seen_at on the caller's own event row.
// A goal that RLS hides is a 404 (D5); the same rule applies to any other user's event id.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await params;

    const supabase = await supabaseServer();
    if (!supabase) return NextResponse.json({ error: "internal" }, { status: 500 });

    const { data: existing, error: readError } = await supabase
      .from("motivational_events")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: "internal" }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { error: updateError } = await supabase
      .from("motivational_events")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", id);
    if (updateError) return NextResponse.json({ error: "internal" }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
