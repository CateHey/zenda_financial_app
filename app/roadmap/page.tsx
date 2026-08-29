import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { assumptionsToEngine, getAssumptions, getContributions, getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";
import { capacityMonthlyCents, monthDate, monthIndex, todayMonth } from "@/lib/engine/rates";
import { todayIso } from "@/lib/engine/today";
import { projectCurve } from "@/lib/engine/solver";
import { progress } from "@/lib/engine/progress";
import { DISCLAIMER } from "@/lib/engine/types";
import type { EngineProfile, Progress } from "@/lib/engine/types";
import {
  CYCLE_WORD,
  KIND_COLOR,
  KIND_LABEL,
  formatMoney,
  formatMoneyRangeCompact,
  joinTitles,
  monthYearLabel,
  perCycleFromMonthlyCents,
  weeklyFromMonthlyCents,
} from "@/lib/format";
import { LogoutLink } from "@/app/components/logout-link";
import { WhatIf, type WhatIfEngineGoal } from "./what-if";

// S4 · Roadmap — design/screens/Roadmap.dc.html ported 1:1, bound per ZENDA_SCREEN_BINDINGS.md.
// Server Component: reads goals + goal_projections + the current goal's contributions +
// assumptions via lib/data/queries.ts, then hands a snapshot to the client <WhatIf> slider.
//
// Choice made: the design mocks the growth_required ("home") goal as two stacked visual beats
// (an outcome framing, then a "deposit engine" framing) but the bindings doc defines only one
// generic node template with a growth_required branch — so one bound node is rendered per goal,
// using that branch's eyebrow/amount format. Also: the design's literal "Priority Home › Car ›
// Peru" chip uses a goal *title* where the binding rule says "kind labels joined" — the rule
// (not the mockup's placeholder text) is followed, since the bindings doc overrides the raw
// design copy wherever a rule is stated.
const CHOOSABLE = new Set<string>(CHOOSABLE_GOAL_KINDS);

export default async function RoadmapPage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const [profile, goals, assumptionRows] = await Promise.all([
    getProfile(supabase),
    getGoalsWithProjections(supabase),
    getAssumptions(supabase),
  ]);

  if (!profile || goals.length === 0) redirect("/discover");

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
  const weeklyCapacity = weeklyFromMonthlyCents(capacityMonthly);
  const cycleWord = CYCLE_WORD[profile.pay_cycle];

  const today = todayIso();
  const todayFraction = todayMonth(profile.started_on, today);

  const activeGoals = goals.filter((g) => g.status === "active");
  const reachedGoals = goals.filter((g) => g.status === "reached");
  const currentGoal = activeGoals.length
    ? activeGoals.reduce((soonest, g) => (g.target_date < soonest.target_date ? g : soonest), activeGoals[0])
    : null;
  const lastReached = reachedGoals.length
    ? reachedGoals.reduce((latest, g) => (((g.reached_at ?? "") > (latest.reached_at ?? "")) ? g : latest), reachedGoals[0])
    : null;

  const todayNodeText = lastReached
    ? `Today · ${lastReached.title} ${formatMoney(lastReached.target_cents, profile.currency)} done`
    : `Today · ${formatMoney(capacityPerCycle, profile.currency)} / ${cycleWord}`;

  // Engine goals for the client what-if slider — mirrors lib/data/recompute.ts's construction.
  // A goal's own stored curve[0] balance already equals starting_balance_cents + contributions
  // to date (A4), so we can reuse it and skip N extra contribution queries here.
  const engineGoals: WhatIfEngineGoal[] = goals.map((g) => ({
    id: g.id,
    kind: g.kind,
    title: g.title,
    targetCents: g.target_cents,
    startingBalanceCents: g.projection?.curve?.[0]?.balance_cents ?? g.starting_balance_cents,
    targetMonth: monthIndex(profile.started_on, g.target_date),
    priority: g.priority,
    goalType: g.goal_type,
    status: g.status,
    reachedAtMonth: g.reached_at ? monthIndex(profile.started_on, g.reached_at.slice(0, 10)) : null,
  }));

  if (!currentGoal) {
    // Every non-paused goal is reached. The dedicated Celebration screen (task 8) isn't built
    // yet — render a minimal, honest stand-in rather than bouncing to /discover (the user's
    // whole path IS still here, just fully reached).
    return (
      <main className="screen" data-web="center" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", padding: "20px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Your roadmap</span>
          <LogoutLink />
        </div>
        <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.12 }}>Every goal on the path is reached.</span>
        <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>{todayNodeText}</span>
        <Link href="/discover" style={{ color: "#5856D6", fontWeight: 600, fontSize: 15, textDecoration: "none" }}>
          Add a new goal
        </Link>
        <p style={{ fontSize: 12, color: "var(--label-3)", marginTop: "auto" }}>{DISCLAIMER}</p>
      </main>
    );
  }

  const chosenByPriority = [...activeGoals].filter((g) => CHOOSABLE.has(g.kind)).sort((x, y) => x.priority - y.priority);
  const titleLine = joinTitles(chosenByPriority.map((g) => g.title));
  const priorityChip = chosenByPriority.map((g) => KIND_LABEL[g.kind]).join(" › ");

  const pathNodes = [...activeGoals].sort((x, y) => (x.target_date < y.target_date ? 1 : x.target_date > y.target_date ? -1 : 0));

  let currentProgress: Progress | null = null;
  if (currentGoal.projection) {
    const contributions = await getContributions(supabase, currentGoal.id);
    const engineContribs = contributions.map((c) => ({ goalId: c.goal_id, amountCents: c.amount_cents, occurredOn: c.occurred_on }));
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

  return (
    <main className="screen" data-web="wide" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {/* header: prioritised goals + this week's allocation */}
      <div style={{ padding: "20px 20px 0 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Your roadmap</span>
          <LogoutLink />
        </div>
        <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.12 }}>{titleLine}</span>
        <div style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 999, background: "#F2F2F7", fontSize: 13, fontWeight: 600, color: "rgba(60,60,67,0.85)" }}>
            <span style={{ color: "#5856D6" }}>Priority</span> {priorityChip}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 13, fontWeight: 600 }}>
            This {cycleWord} {formatMoney(capacityPerCycle, profile.currency)} → {currentGoal.title}
          </span>
        </div>
      </div>

      {/* the path: farthest first, then today */}
      <div style={{ position: "relative", padding: "16px 20px 0 20px", display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div className="path-line" style={{ position: "absolute", left: 33, top: 24, bottom: 6, width: 3, borderRadius: 2, background: "linear-gradient(180deg, #AF52DE 0%, #8450DA 22%, #5856D6 48%, #007AFF 78%, #10265F 100%)" }} />

        <div className="path-nodes" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {pathNodes.map((goal) => {
            const isCurrent = goal.id === currentGoal.id;
            const projection = goal.projection;
            const isGrowth = goal.goal_type === "growth_required";
            const achievable = projection?.achievable ?? false;
            const tag = achievable ? "On track" : isGrowth ? "Adjusted" : "Trade-off";
            const tagIsOnTrack = tag === "On track";
            const dotColor = KIND_COLOR[goal.kind] ?? "#5856D6";

            const eyebrow =
              isGrowth && projection
                ? `${monthYearLabel(monthDate(profile.started_on, projection.start_month))} → ${monthYearLabel(goal.target_date)} · ${formatMoney(weeklyFromMonthlyCents(projection.capacity_monthly_cents), profile.currency)} / wk allocated`
                : `${monthYearLabel(goal.target_date)} · ${KIND_LABEL[goal.kind]}`;

            let amount = formatMoney(goal.target_cents, profile.currency);
            if (isGrowth && projection && projection.curve.length > 0) {
              const lowEnd = projection.curve[projection.curve.length - 1].balance_cents;
              const months = projection.curve.length - 1;
              const upsideCurve = projectCurve(projection.curve[0]?.balance_cents ?? 0, projection.capacity_monthly_cents, a.upsideRateAnnual, months);
              const highEnd = upsideCurve[upsideCurve.length - 1]?.balanceCents ?? lowEnd;
              amount = formatMoneyRangeCompact(lowEnd, highEnd);
            }

            const nodeInner = (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: dotColor }}>{eyebrow}</span>
                  {tag === "Trade-off" ? (
                    <Link
                      href={`/roadmap/trade-off?goal=${goal.id}`}
                      style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#F2F2F7", color: "rgba(60,60,67,0.85)", textDecoration: "none" }}
                    >
                      {tag}
                    </Link>
                  ) : (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: tagIsOnTrack ? "rgba(0,122,255,0.10)" : "#F2F2F7",
                        color: tagIsOnTrack ? "#0057D9" : "rgba(60,60,67,0.85)",
                      }}
                    >
                      {tag}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{goal.title}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>{amount}</span>
                </div>
                {isCurrent && currentProgress ? (
                  <>
                    <div style={{ height: 6, borderRadius: 3, background: "#F2F2F7", overflow: "hidden" }}>
                      <div data-testid="pct" style={{ width: `${currentProgress.pctComplete}%`, height: 6, borderRadius: 3, background: dotColor }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(60,60,67,0.78)" }}>
                      <span>
                        {formatMoney(currentProgress.savedCents, profile.currency)} saved · all {formatMoney(capacityPerCycle, profile.currency)} / {cycleWord} goes here
                      </span>
                      <span>{currentProgress.paydaysRemaining} paydays</span>
                    </div>
                  </>
                ) : (
                  goal.why && <span style={{ fontSize: 13, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>{goal.why}</span>
                )}
              </>
            );

            return (
              <div key={goal.id} style={{ display: "flex", gap: 18, padding: "0 0 14px 0" }}>
                <div style={{ width: 30, display: "flex", justifyContent: "center", flexShrink: 0, paddingTop: isCurrent ? 2 : 4 }}>
                  <span
                    style={{
                      width: isCurrent ? 16 : 12,
                      height: isCurrent ? 16 : 12,
                      borderRadius: "50%",
                      background: dotColor,
                      boxShadow: isCurrent ? `0 0 0 3px #FFFFFF, 0 0 0 6px ${dotColor}59` : `0 0 0 3px #FFFFFF, 0 0 0 5px ${dotColor}`,
                    }}
                  />
                </div>
                {isCurrent ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      flexGrow: 1,
                      padding: "12px 16px",
                      margin: "-8px 0 0 0",
                      borderRadius: 14,
                      background: "#FFFFFF",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
                    }}
                  >
                    {nodeInner}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, flexGrow: 1 }}>{nodeInner}</div>
                )}
              </div>
            );
          })}

          {/* today */}
          <div style={{ display: "flex", gap: 18, padding: "0 0 10px 0" }}>
            <div style={{ width: 30, display: "flex", justifyContent: "center", flexShrink: 0, paddingTop: 2 }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#10265F", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 3px #FFFFFF" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexGrow: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#10265F" }}>{todayNodeText}</span>
            </div>
          </div>
        </div>
      </div>

      {/* what if — docked */}
      <div data-col="side">
      <WhatIf
        engineGoals={engineGoals}
        assumptions={a}
        weeklyCapacityCents={weeklyCapacity}
        todayFraction={todayFraction}
        startedOn={profile.started_on}
        currency={profile.currency}
      />
      </div>

      <p style={{ fontSize: 12, color: "var(--label-3)", padding: "0 20px 20px 20px" }}>{DISCLAIMER}</p>
    </main>
  );
}
