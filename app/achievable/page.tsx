import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";
import { monthDate, monthIndex } from "@/lib/engine/rates";
import { DISCLAIMER } from "@/lib/engine/types";
import { KIND_COLOR, KIND_LABEL, formatMoney, monthYearLabel, weeklyFromMonthlyCents } from "@/lib/format";
import { LogoutLink } from "@/app/components/logout-link";

// S2 · What's achievable — design/screens/Achievable.dc.html ported 1:1, bound per
// ZENDA_SCREEN_BINDINGS.md. Server Component: reads goals + goal_projections. A projection
// surface (S2 is in the disclaimer list) -> DISCLAIMER renders once at the bottom.

const CHOOSABLE = new Set<string>(CHOOSABLE_GOAL_KINDS);

export default async function AchievablePage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const [goals, profile] = await Promise.all([getGoalsWithProjections(supabase), getProfile(supabase)]);
  if (goals.length === 0) redirect("/discover"); // D4: "No goals -> /discover"
  if (!profile) redirect("/discover");

  // "Goals ordered by target_date; the buffer and emergency goals are shown after the chosen
  // ones (they are foundations, not choices)" (S2).
  const chosen = goals.filter((g) => CHOOSABLE.has(g.kind)).sort((x, y) => (x.target_date < y.target_date ? -1 : 1));
  const foundations = goals.filter((g) => !CHOOSABLE.has(g.kind)).sort((x, y) => (x.target_date < y.target_date ? -1 : 1));
  const ordered = [...chosen, ...foundations];

  return (
    <main style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>What&apos;s achievable</span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 18, height: 4, borderRadius: 2, background: "#5856D6" }} />
            ))}
          </div>
          <LogoutLink />
        </div>
      </div>

      <div style={{ padding: "14px 20px 0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Here&apos;s what {formatMoney(weeklyFromMonthlyCents((goals[0].projection?.capacity_monthly_cents) ?? 0), profile.currency)} a week can reach.
        </span>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(60,60,67,0.78)" }}>Honest distances, not verdicts. Every one has a lever.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 20px 0 20px" }}>
        {ordered.map((goal) => {
          const projection = goal.projection;
          const isGrowth = goal.goal_type === "growth_required";
          const achievable = projection?.achievable ?? false;
          const tag = achievable ? "On track" : isGrowth ? "Adjusted" : "Needs a trade-off";
          const eyebrowColor = KIND_COLOR[goal.kind] ?? "#5856D6";

          const years = Math.round(monthIndex(profile.started_on, goal.target_date) / 12);
          const leftAmount = isGrowth
            ? `${formatMoney(goal.target_cents, profile.currency)} in ${years} year${years === 1 ? "" : "s"}`
            : formatMoney(goal.target_cents, profile.currency);
          const rightAmount =
            achievable && projection?.completion_month != null
              ? monthYearLabel(monthDate(profile.started_on, projection.completion_month))
              : projection
                ? `needs ${formatMoney(weeklyFromMonthlyCents(projection.required_monthly_cents), profile.currency)} / wk`
                : "";

          return (
            <div key={goal.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "16px 18px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: eyebrowColor }}>
                  {KIND_LABEL[goal.kind]} · {goal.title}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 9px",
                    borderRadius: 999,
                    background: tag === "On track" ? "rgba(0,122,255,0.10)" : "#F2F2F7",
                    color: tag === "On track" ? "#0057D9" : "rgba(60,60,67,0.85)",
                  }}
                >
                  {tag}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>{leftAmount}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: achievable ? "inherit" : "rgba(60,60,67,0.78)" }}>{rightAmount}</span>
              </div>
              {goal.why && <span style={{ fontSize: 14, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>{goal.why}</span>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "auto", padding: "20px 20px 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 13, lineHeight: 1.4, color: "rgba(60,60,67,0.78)", textAlign: "center" }}>
          Already running underneath: super, about $8,400 a year.
        </span>
        <Link
          href="/prioritise"
          style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center", border: 0, borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 17, fontWeight: 600, textDecoration: "none" }}
        >
          Prioritise my goals
        </Link>
        <p style={{ fontSize: 12, color: "var(--label-3)", margin: 0 }}>{DISCLAIMER}</p>
      </div>
    </main>
  );
}
