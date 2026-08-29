import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";
import { monthDate, monthIndex } from "@/lib/engine/rates";
import { KIND_COLOR, monthOnlyLabel, monthYearLabel, weeklyFromMonthlyCents, formatMoney } from "@/lib/format";
import { PrioritiseClient, type PrioritiseCard } from "./prioritise-client";

// S3 · Prioritise — design/screens/Priorities.dc.html ported 1:1, bound per
// ZENDA_SCREEN_BINDINGS.md. Server Component: computes each ranked card's static consequence
// line and the "where the engine goes" bar (both independent of the on-screen reorder — D6 §8:
// priority never changes waterfall dates, only display order); the client owns the chevron
// reordering and the POST /api/prioritise submit.

const CHOOSABLE = new Set<string>(CHOOSABLE_GOAL_KINDS);

export default async function PrioritisePage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const [goals, profile] = await Promise.all([getGoalsWithProjections(supabase), getProfile(supabase)]);
  if (goals.length === 0) redirect("/discover"); // D4: "No goals -> /discover"
  if (!profile) redirect("/discover");

  const chosen = goals.filter((g) => CHOOSABLE.has(g.kind)).sort((x, y) => x.priority - y.priority);
  const soonestId = chosen.length
    ? chosen.reduce((soonest, g) => (g.target_date < soonest.target_date ? g : soonest), chosen[0]).id
    : null;

  const cards: PrioritiseCard[] = chosen.map((goal) => {
    const projection = goal.projection;
    let consequence: string;
    if (goal.id === soonestId && projection?.completion_month != null) {
      // Design's literal copy: "Goes first anyway: small and soon. Done by January." (month only).
      consequence = `Goes first anyway: small and soon. Done by ${monthOnlyLabel(monthDate(profile.started_on, projection.completion_month))}.`;
    } else if (projection?.achievable) {
      consequence = `Engine from ${monthYearLabel(monthDate(profile.started_on, projection.start_month))} to ${monthYearLabel(monthDate(profile.started_on, projection.completion_month ?? projection.start_month))}.`;
    } else if (projection) {
      consequence = `Needs ${formatMoney(weeklyFromMonthlyCents(projection.required_monthly_cents), profile.currency)}/wk — see the trade-off.`;
    } else {
      consequence = "";
    }
    return {
      id: goal.id,
      title: goal.title,
      kind: goal.kind,
      targetCents: goal.target_cents,
      consequence,
    };
  });

  // "Where the $260 goes" — funding (waterfall/date) order, unaffected by priority reordering.
  const byStart = [...goals]
    .filter((g) => g.status !== "reached" || g.projection)
    .sort((x, y) => (x.projection?.start_month ?? 0) - (y.projection?.start_month ?? 0));
  const segments = byStart
    .map((goal) => {
      const projection = goal.projection;
      if (!projection) return null;
      const isGrowth = goal.goal_type === "growth_required";
      const targetMonth = monthIndex(profile.started_on, goal.target_date);
      const width = Math.max(1, (isGrowth ? targetMonth : (projection.completion_month ?? targetMonth)) - projection.start_month);
      return { id: goal.id, title: goal.title, kind: goal.kind, color: KIND_COLOR[goal.kind] ?? "#5856D6", width, startMonth: projection.start_month, targetDate: goal.target_date };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <main className="screen" data-web="center" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ padding: "20px 20px 0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Prioritise</span>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>When goals compete, which wins?</span>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(60,60,67,0.78)" }}>Drag to reorder. The engine follows your order; the dates follow the engine.</span>
      </div>

      <PrioritiseClient cards={cards}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "24px 20px 0 20px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" }}>
            Where the {formatMoney(weeklyFromMonthlyCents(byStart[0]?.projection?.capacity_monthly_cents ?? 0), profile.currency)} goes
          </span>
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 }}>
            {segments.map((s) => (
              <span key={s.id} style={{ flexGrow: s.width, background: s.color }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(60,60,67,0.78)" }}>
            {segments.map((s) => (
              <span key={s.id}>{s.title}</span>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
            {segments.map((s, i) => (
              <span key={s.id}>{i === segments.length - 1 ? monthYearLabel(s.targetDate) : monthYearLabel(monthDate(profile.started_on, s.startMonth))}</span>
            ))}
          </div>
        </div>

        <div style={{ margin: "20px 20px 0 20px", padding: "14px 16px", borderRadius: 14, background: "#F2F2F7", fontSize: 14, lineHeight: 1.4, color: "rgba(60,60,67,0.85)" }}>
          Priority order and date order are different on purpose. Peru is first because it&apos;s small and soon; the house is first because it matters most.
        </div>
      </PrioritiseClient>
    </main>
  );
}
