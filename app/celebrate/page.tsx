import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getEventById, getGoalById, getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { capacityMonthlyCents, monthDate } from "@/lib/engine/rates";
import { formatMoney, monthYearLabel, perCycleFromMonthlyCents } from "@/lib/format";
import { toEngineProfile } from "@/lib/data/engine-profile";
import { CelebrateActions } from "./celebrate-actions";

// S8 · Goal reached — design/screens/Celebration.dc.html ported 1:1, bound per
// ZENDA_SCREEN_BINDINGS.md. Server Component: reads the motivational_events row named by
// ?event=, its goal, and the next active goal (for the pill). Not a projection surface per the
// bindings doc's disclaimer list (S2/S4/S5/S7 only) — no DISCLAIMER line here.

const NEXT_STEP_LABEL: Record<string, string> = {
  travel: "Book the flights",
  car: "Go and see it",
  home: "Talk to a broker",
  buffer: "Keep it there",
  emergency: "Keep it there",
  study: "Take the next step",
  business: "Take the next step",
  other: "Take the next step",
};

async function latestMilestone(supabase: Parameters<typeof getEventById>[0]) {
  const { data } = await supabase
    .from("motivational_events")
    .select("*")
    .eq("kind", "milestone_reached")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as Awaited<ReturnType<typeof getEventById>>;
}

export default async function CelebratePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const { event: eventId } = await searchParams;
  // With no id (e.g. from the landing page) show the latest milestone reached.
  const event = eventId ? await getEventById(supabase, eventId) : await latestMilestone(supabase);
  if (!event || !event.goal_id) redirect("/roadmap"); // D4: "Event not found / not owned -> /roadmap"

  const [goal, profile, goals] = await Promise.all([
    getGoalById(supabase, event.goal_id),
    getProfile(supabase),
    getGoalsWithProjections(supabase),
  ]);
  if (!goal || !profile) redirect("/roadmap");

  const engineProfile = toEngineProfile(profile);
  const capacityPerCycle = perCycleFromMonthlyCents(capacityMonthlyCents(engineProfile), profile.pay_cycle);

  const activeGoals = goals.filter((g) => g.status === "active");
  const nextGoal = activeGoals.length
    ? activeGoals.reduce((soonest, g) => (g.target_date < soonest.target_date ? g : soonest), activeGoals[0])
    : null;

  const pillText = nextGoal
    ? `Your ${formatMoney(capacityPerCycle, profile.currency)} a week now flows to ${nextGoal.title}${
        nextGoal.projection?.completion_month != null
          ? ` · ${monthYearLabel(monthDate(profile.started_on, nextGoal.projection.completion_month))}`
          : ""
      }`
    : "You've reached every goal on the path.";

  const titleLine = goal.kind === "buffer" ? `${goal.title}, done.` : `${goal.title}, funded.`;
  const nextStepLabel = NEXT_STEP_LABEL[goal.kind] ?? "Take the next step";

  return (
    <main className="screen" data-web="center"
      style={{
        maxWidth: 390,
        margin: "0 auto",
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        background: "linear-gradient(165deg, #007AFF 0%, #5856D6 48%, #AF52DE 100%)",
        color: "#FFFFFF",
      }}
    >
      <span style={{ position: "absolute", left: 44, top: 120, width: 10, height: 10, borderRadius: "50%", background: "rgba(255,255,255,0.55)" }} />
      <span style={{ position: "absolute", left: 300, top: 92, width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />
      <span style={{ position: "absolute", left: 330, top: 230, width: 14, height: 14, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
      <span style={{ position: "absolute", left: 70, top: 300, width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.45)" }} />
      <span style={{ position: "absolute", left: 250, top: 560, width: 9, height: 9, borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />
      <span style={{ position: "absolute", left: 110, top: 620, width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />

      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 28px", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.85 }}>Milestone</span>
        <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{formatMoney(goal.target_cents, profile.currency)}</span>
        <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{titleLine}</span>
        <span style={{ fontSize: 17, lineHeight: 1.45, opacity: 0.92, maxWidth: "30ch", marginTop: 6 }}>{event.message}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 20px 22px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px", marginBottom: 8, borderRadius: 999, background: "rgba(255,255,255,0.16)", fontSize: 13, fontWeight: 600 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
          <span>{pillText}</span>
        </div>
        <CelebrateActions eventId={event.id} nextStepLabel={nextStepLabel} />
      </div>
    </main>
  );
}
