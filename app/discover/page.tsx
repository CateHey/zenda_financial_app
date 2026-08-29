import { supabaseServer } from "@/lib/supabase/server";
import { getGoalsWithProjections, getLatestReflectionEvent, getProfile } from "@/lib/data/queries";
import { DiscoverClient, type DiscoverGoal, type DiscoverProfile } from "./discover-client";

// S1 · Discover — /discover (D4 row 1). Server Component: reads `profiles` (prefill if it
// exists) and the user's active chip-selectable goals, then hands everything to the client
// component that owns the interactive numbers sheet, goal chips, and live engine box.
const CHOOSABLE_KINDS = new Set(["travel", "car", "home", "study", "business", "other"]);

export default async function DiscoverPage() {
  const supabase = await supabaseServer();

  let profile: DiscoverProfile | null = null;
  let goals: DiscoverGoal[] = [];
  let reflectionMessage: string | null = null;

  if (supabase) {
    const [profileRow, goalRows, reflectionEvent] = await Promise.all([
      getProfile(supabase),
      getGoalsWithProjections(supabase),
      getLatestReflectionEvent(supabase),
    ]);

    if (profileRow) {
      profile = {
        currency: profileRow.currency,
        payCycle: profileRow.pay_cycle,
        takeHomeCents: profileRow.take_home_cents,
        essentialsCents: profileRow.essentials_cents,
        lifestyleCents: profileRow.lifestyle_cents,
        bufferCents: profileRow.buffer_cents,
        savingsCents: profileRow.savings_cents,
        debtCents: profileRow.debt_cents,
        debtRateBps: profileRow.debt_rate_bps,
        freedomText: profileRow.freedom_text,
      };
    }

    goals = goalRows
      .filter((g) => g.status === "active" && CHOOSABLE_KINDS.has(g.kind))
      .map((g) => ({ id: g.id, kind: g.kind, title: g.title, targetCents: g.target_cents, targetDate: g.target_date }));

    reflectionMessage = reflectionEvent?.message ?? null;
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <DiscoverClient
      initialProfile={profile}
      initialGoals={goals}
      reflectionMessage={reflectionMessage}
      todayIso={todayIso}
    />
  );
}
