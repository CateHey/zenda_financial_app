import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  assumptionsToEngine,
  getAssumptions,
  getContributionsForGoals,
  getGoalsWithProjections,
  getProfile,
} from "@/lib/data/queries";
import { capacityMonthlyCents, cycleDays, monthDate, monthIndex, todayMonth } from "@/lib/engine/rates";
import { todayIso } from "@/lib/engine/today";
import { projectCurve } from "@/lib/engine/solver";
import { checkedInThisCycle, progress, streak } from "@/lib/engine/progress";
import type { EngineContribution, EngineProfile } from "@/lib/engine/types";
import {
  KIND_COLOR,
  KIND_LABEL,
  formatMoney,
  formatMoneyRangeCompact,
  monthYearLabel,
  perCycleFromMonthlyCents,
} from "@/lib/format";
import { templateNudge } from "@/lib/data/templates";
import { LogoutLink } from "@/app/components/logout-link";
import { CheckinSheet } from "./checkin-sheet";

// S6 · Progress — design/screens/Tracking.dc.html ported 1:1, bound per ZENDA_SCREEN_BINDINGS.md.
// Server Component: reads the current goal (soonest active), the combined contributions of that
// goal and every goal before it in date order (A3's streak/dots span), and the next active goal
// for the dimmed path preview. The check-in itself is a client sheet (POST /api/checkin).
//
// Choices made (undesigned by the bindings doc, simplest option):
// - The design has no page-level header row; every other app screen does (D4 common rule), so a
//   minimal one ("Progress" eyebrow + Log out) is added above the in-app nudge card.
// - "Previous goal" for the dot caption = the goal with the latest target_date among those
//   strictly before the current goal in the combined set; none -> caption names only the current
//   goal.
// - Streak dots show the most recent 12 contributions (oldest-first among those shown) when more
//   than 12 exist, rather than the very first 12 ever made — a rolling recent-history window.

const NUMBER_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen",
  "Nineteen", "Twenty",
];

function streakTitle(count: number): string {
  if (count === 0) return "Your first payday.";
  if (count === 1) return "One payday.";
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${word} paydays in a row.`;
}

function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function dayMonthYearLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export default async function ProgressPage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const [profile, goals, assumptionRows] = await Promise.all([
    getProfile(supabase),
    getGoalsWithProjections(supabase),
    getAssumptions(supabase),
  ]);
  if (!profile) redirect("/login");

  const activeGoals = goals.filter((g) => g.status === "active");
  const currentGoal = activeGoals.length
    ? activeGoals.reduce((soonest, g) => (g.target_date < soonest.target_date ? g : soonest), activeGoals[0])
    : null;
  if (!currentGoal) redirect("/roadmap"); // D4: "No active goal -> /roadmap"

  const a = assumptionsToEngine(assumptionRows);
  const engineProfile: EngineProfile = {
    payCycle: profile.pay_cycle,
    takeHomeCents: profile.take_home_cents,
    essentialsCents: profile.essentials_cents,
    lifestyleCents: profile.lifestyle_cents,
    bufferCents: profile.buffer_cents,
  };
  const capacityMonthly = capacityMonthlyCents(engineProfile);
  const capacityPerCycle = perCycleFromMonthlyCents(capacityMonthly, profile.pay_cycle);
  const cycleLength = cycleDays(profile.pay_cycle);
  const today = todayIso();
  const todayFraction = todayMonth(profile.started_on, today);

  // A3/S6: the current goal plus every goal before it in date order (any status — a reached
  // foundation goal like the buffer still contributes its dots and streak).
  const combined = goals
    .filter((g) => g.target_date <= currentGoal.target_date)
    .sort((x, y) => (x.target_date < y.target_date ? -1 : x.target_date > y.target_date ? 1 : 0));
  const combinedIds = combined.map((g) => g.id);
  const kindByGoalId = new Map(combined.map((g) => [g.id, g.kind]));

  const contributionRows = await getContributionsForGoals(supabase, combinedIds);
  const engineContribs: EngineContribution[] = contributionRows.map((c) => ({
    goalId: c.goal_id,
    amountCents: c.amount_cents,
    occurredOn: c.occurred_on,
  }));

  const streakCount = streak(engineContribs, cycleLength);
  const alreadyCheckedIn = checkedInThisCycle(engineContribs, cycleLength, today);
  const latestContribution = contributionRows[0] ?? null; // already sorted occurred_on desc
  const nextPaydayLabel = latestContribution ? dayMonthYearLabel(addDaysIso(latestContribution.occurred_on, cycleLength)) : "";

  let currentProgress: ReturnType<typeof progress> | null = null;
  if (currentGoal.projection) {
    const weeklyCapacity = perCycleFromMonthlyCents(capacityMonthly, "weekly"); // paydaysRemaining is always weeks (D6 §6)
    currentProgress = progress(
      { id: currentGoal.id, targetCents: currentGoal.target_cents, startingBalanceCents: currentGoal.starting_balance_cents },
      engineContribs,
      {
        goalId: currentGoal.projection.goal_id,
        rateAnnual: currentGoal.projection.rate_annual,
        capacityMonthlyCents: currentGoal.projection.capacity_monthly_cents,
        startMonth: currentGoal.projection.start_month,
        completionMonth: currentGoal.projection.completion_month,
        requiredMonthlyCents: currentGoal.projection.required_monthly_cents,
        achievable: currentGoal.projection.achievable,
        altLaterMonths: currentGoal.projection.alt_later_months,
        altSmallerTargetCents: currentGoal.projection.alt_smaller_target_cents,
        altExtraMonthlyCents: currentGoal.projection.alt_extra_monthly_cents,
        curve: currentGoal.projection.curve.map((p) => ({ m: p.m, balanceCents: p.balance_cents })),
      },
      todayFraction,
      weeklyCapacity,
    );
  }

  const paydaysRemaining = currentProgress?.paydaysRemaining ?? 0;
  const pctComplete = currentProgress?.pctComplete ?? 0;

  // Dots: filled per contribution (oldest-first, most recent 12 when more exist), then empty
  // dots up to paydaysRemaining, capped at 12 total; anything beyond -> "+N".
  const oldestFirst = [...contributionRows].reverse();
  const shownContribs = oldestFirst.length > 12 ? oldestFirst.slice(oldestFirst.length - 12) : oldestFirst;
  const filledShown = shownContribs.length;
  const emptyShown = Math.min(paydaysRemaining, 12 - filledShown);
  const overflow = oldestFirst.length + paydaysRemaining - (filledShown + emptyShown);

  const previousGoal = combined.length > 1 ? combined[combined.length - 2] : null;
  const dotCaption = previousGoal
    ? `${previousGoal.title}, then ${currentGoal.title}. Each dot is a payday.`
    : `${currentGoal.title}. Each dot is a payday.`;

  const nudgeText = templateNudge(capacityPerCycle, currentGoal.title, paydaysRemaining, profile.currency);

  // Dimmed path: the next active goal after current, then current — same S4 node bindings.
  const nextGoal = activeGoals
    .filter((g) => g.id !== currentGoal.id)
    .filter((g) => g.target_date > currentGoal.target_date)
    .sort((x, y) => (x.target_date < y.target_date ? -1 : 1))[0] ?? null;
  const dimmedNodes = [nextGoal, currentGoal].filter((g): g is NonNullable<typeof g> => g !== null);

  return (
    <main className="screen" data-web="two-col" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0 20px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Progress</span>
        <LogoutLink />
      </div>

      {!alreadyCheckedIn && (
        <div style={{ margin: "16px 20px 0 20px", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.10)" }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #007AFF, #AF52DE)", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 1, flexGrow: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" }}>Payday</span>
            <span style={{ fontSize: 15, lineHeight: 1.3 }}>{nudgeText}</span>
          </div>
        </div>
      )}

      <div style={{ padding: "26px 20px 0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Progress</span>
        <span data-testid="streak-title" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
          {streakTitle(streakCount)}
        </span>
        <span style={{ fontSize: 17, lineHeight: 1.4, color: "rgba(60,60,67,0.78)" }}>
          You&apos;re <span data-testid="pct">{pctComplete}</span>% of the way to {currentGoal.title}.
        </span>

        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          {shownContribs.map((c) => (
            <span key={c.id} style={{ width: 18, height: 18, borderRadius: "50%", background: KIND_COLOR[kindByGoalId.get(c.goal_id) ?? "other"] ?? "#5856D6" }} />
          ))}
          {Array.from({ length: emptyShown }).map((_, i) => (
            <span key={`empty-${i}`} style={{ width: 18, height: 18, borderRadius: "50%", background: "#F2F2F7", boxShadow: "inset 0 0 0 2px #D1D1D6" }} />
          ))}
          {overflow > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(60,60,67,0.78)" }}>+{overflow}</span>}
        </div>
        <span style={{ fontSize: 13, color: "rgba(60,60,67,0.78)" }}>{dotCaption}</span>

        <Link
          href="/progress/adapt"
          style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, padding: "12px 14px", borderRadius: 14, background: "#F2F2F7", textDecoration: "none", color: "inherit" }}
        >
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: "#FFFFFF", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12a8 8 0 1 1-2.3-5.7" />
              <path d="M20 4v5h-5" />
            </svg>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, flexGrow: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Life changed?</span>
            <span style={{ fontSize: 13, lineHeight: 1.3, color: "rgba(60,60,67,0.78)" }}>Rent up, bonus in, new goal — update anything and the path redraws.</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {dimmedNodes.length > 0 && (
        <div style={{ position: "relative", padding: "18px 20px 0 20px", display: "flex", flexDirection: "column", flexGrow: 1, opacity: 0.55 }}>
          <div style={{ position: "absolute", left: 33, top: 30, bottom: 0, width: 3, borderRadius: 2, background: "linear-gradient(180deg, #5856D6 0%, #007AFF 60%, #10265F 100%)" }} />
          {dimmedNodes.map((goal) => {
            const projection = goal.projection;
            const isGrowth = goal.goal_type === "growth_required";
            const achievable = projection?.achievable ?? false;
            const tag = achievable ? "On track" : isGrowth ? "Adjusted" : "Trade-off";
            const isCurrent = goal.id === currentGoal.id;
            const dotColor = KIND_COLOR[goal.kind] ?? "#5856D6";
            const eyebrow =
              isGrowth && projection
                ? `${monthYearLabel(monthDate(profile.started_on, projection.start_month))} → ${monthYearLabel(goal.target_date)}`
                : `${isCurrent ? "Now · " : ""}${monthYearLabel(goal.target_date)} · ${KIND_LABEL[goal.kind]}`;
            let amount = formatMoney(goal.target_cents, profile.currency);
            if (isGrowth && projection && projection.curve.length > 0) {
              const lowEnd = projection.curve[projection.curve.length - 1].balance_cents;
              const months = projection.curve.length - 1;
              const upsideCurve = projectCurve(projection.curve[0]?.balance_cents ?? 0, projection.capacity_monthly_cents, a.upsideRateAnnual, months);
              const highEnd = upsideCurve[upsideCurve.length - 1]?.balanceCents ?? lowEnd;
              amount = formatMoneyRangeCompact(lowEnd, highEnd);
            }
            return (
              <div key={goal.id} style={{ display: "flex", gap: 18, padding: "0 0 18px 0" }}>
                <div style={{ width: 30, display: "flex", justifyContent: "center", flexShrink: 0, paddingTop: isCurrent ? 2 : 4 }}>
                  <span style={{ width: isCurrent ? 16 : 12, height: isCurrent ? 16 : 12, borderRadius: "50%", background: dotColor, boxShadow: isCurrent ? `0 0 0 3px #FFFFFF, 0 0 0 6px ${dotColor}59` : `0 0 0 3px #FFFFFF, 0 0 0 5px ${dotColor}` }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: dotColor }}>{eyebrow}</span>
                    {tag === "Trade-off" ? (
                      <Link href={`/roadmap/trade-off?goal=${goal.id}`} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#FFFFFF", color: "rgba(60,60,67,0.85)", textDecoration: "none" }}>
                        {tag}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: tag === "On track" ? "rgba(0,122,255,0.10)" : "#FFFFFF", color: tag === "On track" ? "#0057D9" : "rgba(60,60,67,0.85)" }}>
                        {tag}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 17, fontWeight: 600 }}>{goal.title}{isCurrent ? ", funded" : ""}</span>
                    <span style={{ fontSize: 17, fontWeight: 700 }}>{amount}</span>
                  </div>
                  {goal.why && <span style={{ fontSize: 13, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>{goal.why}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CheckinSheet
        goalId={currentGoal.id}
        capacityPerCycleCents={capacityPerCycle}
        currency={profile.currency}
        alreadyCheckedIn={alreadyCheckedIn}
        nextPaydayLabel={nextPaydayLabel}
      />
    </main>
  );
}
