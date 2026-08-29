import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// "Start over": clears the person's own goals (contributions and projections cascade) and
// events. The profile row stays, so Discover reopens prefilled. RLS scopes every delete.
export async function POST() {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const events = await supabase.from("motivational_events").delete().eq("user_id", user.id);
    if (events.error) throw events.error;
    const goals = await supabase.from("goals").delete().eq("user_id", user.id);
    if (goals.error) throw goals.error;
    return NextResponse.json({ ok: true, redirect: "/discover" });
  } catch (err) {
    console.error("POST /api/reset", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
