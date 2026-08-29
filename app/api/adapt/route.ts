import { NextResponse } from "next/server";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { adaptBody as bodySchema } from "@/lib/api/schemas";
import { recompute } from "@/lib/data/recompute";
import { capacityMonthlyCents } from "@/lib/engine/rates";
import { formatMoney, perCycleFromMonthlyCents, weeklyFromMonthlyCents } from "@/lib/format";
import type { EngineProfile } from "@/lib/engine/types";
import type { GoalRow, GoalProjectionRow, ProfileRow } from "@/lib/data/types";

// D5 POST /api/adapt — S7. Updates the profile's "where you are today" numbers, re-runs the
// engine, and records an `adapted` event with { before, after } capacities and every goal's
// completion month. `protect_dates` reduces the submitted lifestyle_cents by exactly the
// per-cycle capacity shortfall so the recomputed capacity matches the ORIGINAL (pre-edit) one —
// "nothing you've saved moves; only the dates" holds because the dates then don't move either.

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    const supabase = await supabaseServer();
    if (!supabase) return NextResponse.json({ error: "internal" }, { status: 500 });

    const [{ data: profileRow, error: profileError }, { data: goalRows, error: goalsError }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("goals").select("*, goal_projections(*)").eq("user_id", userId).neq("status", "paused"),
    ]);
    if (profileError) return NextResponse.json({ error: "internal" }, { status: 500 });
    if (!profileRow) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (goalsError) return NextResponse.json({ error: "internal" }, { status: 500 });
    const profile = profileRow as ProfileRow;

    const beforeEngineProfile: EngineProfile = {
      payCycle: profile.pay_cycle,
      takeHomeCents: profile.take_home_cents,
      essentialsCents: profile.essentials_cents,
      lifestyleCents: profile.lifestyle_cents,
      bufferCents: profile.buffer_cents,
    };
    const beforeCapacityMonthly = capacityMonthlyCents(beforeEngineProfile);
    const beforeCapacityPerCycle = perCycleFromMonthlyCents(beforeCapacityMonthly, profile.pay_cycle);

    const beforeGoals = ((goalRows ?? []) as (GoalRow & { goal_projections: GoalProjectionRow[] | GoalProjectionRow | null })[]).map((row) => {
      const projection = Array.isArray(row.goal_projections) ? (row.goal_projections[0] ?? null) : row.goal_projections;
      return { goal_id: row.id, completion_month: projection?.completion_month ?? null };
    });

    let finalLifestyleCents = body.lifestyle_cents;
    if (body.strategy === "protect_dates") {
      const submittedCapacityMonthly = capacityMonthlyCents({
        payCycle: body.pay_cycle,
        takeHomeCents: body.take_home_cents,
        essentialsCents: body.essentials_cents,
        lifestyleCents: body.lifestyle_cents,
        bufferCents: body.buffer_cents,
      });
      const submittedCapacityPerCycle = perCycleFromMonthlyCents(submittedCapacityMonthly, body.pay_cycle);
      const deltaPerCycle = beforeCapacityPerCycle - submittedCapacityPerCycle; // > 0 when capacity dropped
      if (deltaPerCycle > 0) finalLifestyleCents = Math.max(0, body.lifestyle_cents - deltaPerCycle);
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        pay_cycle: body.pay_cycle,
        take_home_cents: body.take_home_cents,
        essentials_cents: body.essentials_cents,
        lifestyle_cents: finalLifestyleCents,
        buffer_cents: body.buffer_cents,
        savings_cents: body.savings_cents,
        debt_cents: body.debt_cents,
        debt_rate_bps: body.debt_rate_bps,
        risk_comfort: body.risk_comfort,
      })
      .eq("user_id", userId);
    if (updateError) return NextResponse.json({ error: "internal" }, { status: 500 });

    const afterProjections = await recompute(supabase, userId);

    const afterEngineProfile: EngineProfile = {
      payCycle: body.pay_cycle,
      takeHomeCents: body.take_home_cents,
      essentialsCents: body.essentials_cents,
      lifestyleCents: finalLifestyleCents,
      bufferCents: body.buffer_cents,
    };
    const afterCapacityMonthly = capacityMonthlyCents(afterEngineProfile);

    const message = `Your engine is now ${formatMoney(weeklyFromMonthlyCents(afterCapacityMonthly), profile.currency)} a week.`;
    const { error: eventError } = await supabase.from("motivational_events").insert({
      user_id: userId,
      goal_id: null,
      kind: "adapted",
      message,
      payload: {
        before: { capacity_monthly_cents: beforeCapacityMonthly, goals: beforeGoals },
        after: {
          capacity_monthly_cents: afterCapacityMonthly,
          goals: afterProjections.map((p) => ({ goal_id: p.goalId, completion_month: p.completionMonth })),
        },
      },
    });
    if (eventError) return NextResponse.json({ error: "internal" }, { status: 500 });

    return NextResponse.json({ ok: true, redirect: "/roadmap" });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
