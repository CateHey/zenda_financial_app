import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { assumptionsToEngine, getAssumptions, getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { capacityMonthlyCents, monthDate, monthIndex, todayMonth } from "@/lib/engine/rates";
import { todayIso } from "@/lib/engine/today";
import { DISCLAIMER } from "@/lib/engine/types";
import type { EngineGoal, EngineProfile } from "@/lib/engine/types";
import { KIND_LABEL, formatMoney, joinTitles, monthYearLabel, weeklyFromMonthlyCents } from "@/lib/format";
import { LogoutLink } from "@/app/components/logout-link";
import { TradeoffClient } from "./trade-off-client";

// S5 · The trade-off — design/screens/Tradeoff.dc.html ported 1:1, bound per
// ZENDA_SCREEN_BINDINGS.md. Server Component: options A/B/C come from the goal's own stored
// projection.alt* fields (D6 §7 — no re-run needed); the consequence card's two curve-end
// figures need a fresh waterfall for "this goal at option A" and "this goal removed", so that
// computation happens client-side (lib/engine is importable by the browser too, D5) in
// TradeoffClient, mirroring app/roadmap/what-if.tsx's pattern.

export default async function TradeoffPage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string }>;
}) {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const { goal: goalId } = await searchParams;
  if (!goalId) redirect("/roadmap");

  const [goals, profile, assumptionRows] = await Promise.all([
    getGoalsWithProjections(supabase),
    getProfile(supabase),
    getAssumptions(supabase),
  ]);
  if (!profile) redirect("/login");
  if (goals.length === 0) redirect("/discover");

  const goal = goals.find((g) => g.id === goalId);
  if (!goal) redirect("/roadmap"); // RLS-hidden or unknown id
  const projection = goal.projection;
  // D4: "Opened for a goal that is achievable -> redirect /roadmap."
  if (!projection || projection.achievable) redirect("/roadmap");

  const a = assumptionsToEngine(assumptionRows);
  const engineProfile: EngineProfile = {
    payCycle: profile.pay_cycle,
    takeHomeCents: profile.take_home_cents,
    essentialsCents: profile.essentials_cents,
    lifestyleCents: profile.lifestyle_cents,
    bufferCents: profile.buffer_cents,
  };
  const capacityMonthly = capacityMonthlyCents(engineProfile);
  const capacityWeekly = weeklyFromMonthlyCents(capacityMonthly);
  const requiredWeekly = weeklyFromMonthlyCents(projection.required_monthly_cents);
  const todayFraction = todayMonth(profile.started_on, todayIso());

  const horizonMonths = monthIndex(profile.started_on, goal.target_date);
  const horizonLabel =
    horizonMonths >= 12 && horizonMonths % 12 === 0 ? `${horizonMonths / 12} years` : `${horizonMonths} months`;

  const priorGoals = goals.filter((g) => g.target_date < goal.target_date).sort((x, y) => (x.target_date < y.target_date ? -1 : 1));
  const priorTitles = priorGoals.length > 0 ? joinTitles(priorGoals.map((g) => g.title)) : "everything else";

  // Option A: the smaller target that lands exactly on the original date, rounded to the
  // nearest $1k (S5: "$<alt_smaller_target rounded to nearest $1k>").
  const optionACents = Math.round((projection.alt_smaller_target_cents ?? 0) / 100_000) * 100_000;
  const optionADate = goal.target_date;

  // Option B: the original target, landing however many months later it actually takes at capacity.
  const optionBDate = monthDate(profile.started_on, horizonMonths + (projection.alt_later_months ?? 0));

  // Option C: the original ask, unmodified — "out of reach" at the current engine.
  const optionCDate = goal.target_date;
  const ratio = capacityWeekly > 0 ? requiredWeekly / capacityWeekly : 0;
  // "a $10k raise adds about $130 a week" (S5): 10,000 x 0.68 / 52, rounded.
  const raiseAddsCents = Math.round((1_000_000 * 0.68) / 52);

  const growthGoal = goals.find((g) => g.goal_type === "growth_required" && g.id !== goal.id) ?? null;
  const growthShiftedStartLabel =
    growthGoal?.projection?.start_month != null ? monthYearLabel(monthDate(profile.started_on, growthGoal.projection.start_month)) : null;

  const engineGoals: (EngineGoal & { title: string })[] = goals.map((g) => ({
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

  return (
    <main className="screen" data-web="grid" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ padding: "16px 20px 0 20px", display: "flex", justifyContent: "flex-end" }}>
        <LogoutLink />
      </div>

      <div style={{ padding: "4px 20px 0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>
          Trade-off · {KIND_LABEL[goal.kind]}
        </span>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {formatMoney(goal.target_cents, profile.currency)} in {horizonLabel} needs {formatMoney(requiredWeekly, profile.currency)} a week.
        </span>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(60,60,67,0.78)" }}>
          You have {formatMoney(capacityWeekly, profile.currency)}. Pick the version that&apos;s true — every option keeps {priorTitles} on time.
        </span>
      </div>

      <div className="cards" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 20px 0 20px" }}>
        <div style={{ display: "flex", gap: 14, padding: "16px 18px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 0 0 2px #5856D6, 0 4px 16px rgba(0,0,0,0.06)" }}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 999, background: "#5856D6", flexShrink: 0, marginTop: 2 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{formatMoney(optionACents, profile.currency)} · {monthYearLabel(optionADate)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "rgba(88,86,214,0.10)", color: "#5856D6" }}>Recommended</span>
            </div>
            <span style={{ fontSize: 14, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>
              Lands at your current engine. {growthGoal ? `${growthGoal.title} starts on time.` : "Nothing else on the path moves."}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, padding: "16px 18px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, boxShadow: "inset 0 0 0 2px #C7C7CC", flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{formatMoney(goal.target_cents, profile.currency)} · {monthYearLabel(optionBDate)}</span>
            <span style={{ fontSize: 14, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>
              The {goal.kind} you want, {projection.alt_later_months ?? 0} months later.{" "}
              {growthGoal && growthShiftedStartLabel ? `${growthGoal.title} starts ${growthShiftedStartLabel}.` : ""}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, padding: "16px 18px", borderRadius: 14, background: "#F2F2F7", opacity: 0.8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, boxShadow: "inset 0 0 0 2px #C7C7CC", flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexGrow: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{formatMoney(goal.target_cents, profile.currency)} · {monthYearLabel(optionCDate)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, background: "#FFFFFF", color: "rgba(60,60,67,0.85)" }}>Out of reach</span>
            </div>
            <span style={{ fontSize: 14, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>
              {formatMoney(requiredWeekly, profile.currency)} a week is {ratio.toFixed(1)}× your engine. Reachable only with more income — a $10k raise adds about {formatMoney(raiseAddsCents, profile.currency)} a week.
            </span>
          </div>
        </div>
      </div>

      <TradeoffClient
        goalId={goal.id}
        goalKind={goal.kind}
        goalTitle={goal.title}
        optionACents={optionACents}
        optionADate={optionADate}
        engineGoals={engineGoals}
        assumptions={a}
        capacityMonthlyCents={capacityMonthly}
        todayFraction={todayFraction}
        startedOn={profile.started_on}
        currency={profile.currency}
        growthGoalId={growthGoal?.id ?? null}
        growthGoalTitle={growthGoal?.title ?? null}
      />

      <p style={{ fontSize: 12, color: "var(--label-3)", padding: "0 20px 20px 20px" }}>{DISCLAIMER}</p>
    </main>
  );
}
