import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { assumptionsToEngine, getAssumptions, getContributions, getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { capacityMonthlyCents, monthIndex, todayMonth } from "@/lib/engine/rates";
import { todayIso } from "@/lib/engine/today";
import { progress } from "@/lib/engine/progress";
import type { EngineGoal } from "@/lib/engine/types";
import { perCycleFromMonthlyCents } from "@/lib/format";
import { toEngineProfile } from "@/lib/data/engine-profile";
import { AdaptClient, type AdaptBaselineGoal } from "./adapt-client";

// S7 · Life changed — design/screens/Adapt.dc.html ported 1:1, bound per
// ZENDA_SCREEN_BINDINGS.md. Server Component: hands the client everything needed to compute the
// before/after table itself — the baseline (already-stored) projections plus the raw engine
// goals so a live waterfall() re-run (D5: "computed client-side with the engine before commit")
// can produce the "after" column as the numbers sheet is edited.

export default async function AdaptPage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const [profile, goals, assumptionRows] = await Promise.all([
    getProfile(supabase),
    getGoalsWithProjections(supabase),
    getAssumptions(supabase),
  ]);
  if (!profile) redirect("/login");
  if (goals.length === 0) redirect("/discover");

  const a = assumptionsToEngine(assumptionRows);
  const engineProfile = toEngineProfile(profile);
  const capacityMonthly = capacityMonthlyCents(engineProfile);
  const capacityPerCycle = perCycleFromMonthlyCents(capacityMonthly, profile.pay_cycle);
  const todayFraction = todayMonth(profile.started_on, todayIso());

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

  const activeGoals = goals.filter((g) => g.status === "active");
  const savingsGoals = activeGoals
    .filter((g) => g.goal_type !== "growth_required")
    .sort((x, y) => (x.target_date < y.target_date ? -1 : 1));
  const growthGoal = activeGoals.find((g) => g.goal_type === "growth_required") ?? null;

  const baselineGoals: AdaptBaselineGoal[] = savingsGoals.map((g) => ({
    id: g.id,
    title: g.title,
    completionMonth: g.projection?.completion_month ?? null,
  }));
  const baselineGrowth = growthGoal
    ? {
        id: growthGoal.id,
        title: growthGoal.title,
        targetDate: growthGoal.target_date,
        curveEndCents: growthGoal.projection?.curve?.length ? growthGoal.projection.curve[growthGoal.projection.curve.length - 1].balance_cents : 0,
      }
    : null;

  const currentGoal = activeGoals.length
    ? activeGoals.reduce((soonest, g) => (g.target_date < soonest.target_date ? g : soonest), activeGoals[0])
    : null;
  let paydaysRemaining = 0;
  if (currentGoal?.projection) {
    const contributions = await getContributions(supabase, currentGoal.id);
    const weeklyCapacity = perCycleFromMonthlyCents(capacityMonthly, "weekly");
    const result = progress(
      { id: currentGoal.id, targetCents: currentGoal.target_cents, startingBalanceCents: currentGoal.starting_balance_cents },
      contributions.map((c) => ({ goalId: c.goal_id, amountCents: c.amount_cents, occurredOn: c.occurred_on })),
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
    paydaysRemaining = result.paydaysRemaining;
  }

  return (
    <AdaptClient
      initialProfile={{
        payCycle: profile.pay_cycle,
        takeHomeCents: profile.take_home_cents,
        essentialsCents: profile.essentials_cents,
        lifestyleCents: profile.lifestyle_cents,
        bufferCents: profile.buffer_cents,
        savingsCents: profile.savings_cents,
        debtCents: profile.debt_cents,
        debtRateBps: profile.debt_rate_bps,
        riskComfort: profile.risk_comfort,
        currency: profile.currency,
      }}
      capacityPerCycleCents={capacityPerCycle}
      startedOn={profile.started_on}
      todayFraction={todayFraction}
      assumptions={a}
      engineGoals={engineGoals}
      baselineGoals={baselineGoals}
      baselineGrowth={baselineGrowth}
      paydaysRemaining={paydaysRemaining}
    />
  );
}
