import { ok, requireUser, withHandler } from "@/lib/api/respond";

// "Start over": clears the person's own goals (contributions and projections cascade) and
// events. The profile row stays, so Discover reopens prefilled. RLS scopes every delete.
export const POST = withHandler(async () => {
  const { userId, supabase } = await requireUser();

  const events = await supabase.from("motivational_events").delete().eq("user_id", userId);
  if (events.error) throw events.error;
  const goals = await supabase.from("goals").delete().eq("user_id", userId);
  if (goals.error) throw goals.error;

  return ok({ redirect: "/discover" });
});
