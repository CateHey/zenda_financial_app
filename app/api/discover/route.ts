import { NextResponse, after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { recompute } from "@/lib/data/recompute";
import { assumptionsToEngine } from "@/lib/data/queries";
import { capacityMonthlyCents, monthDate, monthIndex } from "@/lib/engine/rates";
import { goalType as classifyGoalType } from "@/lib/engine/waterfall";
import type { Assumptions, EngineProfile } from "@/lib/engine/types";
import { DISCLAIMER } from "@/lib/engine/types";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";
import type { AssumptionRow, GoalRow, PayCycle, ProfileRow } from "@/lib/data/types";
import { discoverBody as bodySchema } from "@/lib/api/schemas";
import { aiEnabled } from "@/lib/ai/enabled";
import { runDiscoverReflection, runRoadmapCopy } from "@/lib/ai/run";

// D5 POST /api/discover, A5 (foundation goals). Upserts the profile's "where you are today"
// numbers, replaces the user's chip-selectable active goals with the submitted list, ensures
// the buffer + emergency foundation goals exist, re-runs the engine, and upserts projections
// + template `why`s via lib/data/recompute.ts (the only writer of goal_projections). D7 calls 1
// (reflection) and 2 (roadmap copy) run in after() once the response is already on its way —
// gated by aiEnabled() so a blank key schedules no work and logs nothing (task 11).

const CHOOSABLE_KINDS = CHOOSABLE_GOAL_KINDS;

/** A5: ensure the buffer + emergency foundation goals exist, unless one of that kind already does. */
async function ensureFoundationGoals(
  supabase: SupabaseClient,
  userId: string,
  startedOn: string,
  essentialsCentsPerCycle: number,
  payCycle: PayCycle,
  a: Assumptions,
): Promise<unknown> {
  const { data: foundationRows, error: readError } = await supabase
    .from("goals")
    .select("id, kind, status")
    .eq("user_id", userId)
    .in("kind", ["buffer", "emergency"]);
  if (readError) return readError;
  const rows = (foundationRows ?? []) as Pick<GoalRow, "id" | "kind" | "status">[];

  const bufferExists = rows.some((g) => g.kind === "buffer");
  const emergencyExists = rows.some((g) => g.kind === "emergency");

  const inserts: Record<string, unknown>[] = [];

  // Bug 1 fix: the DB check `target_cents > 0` rejects a computed target of 0 (e.g. essentials
  // 0 -> emergency target 0), which previously 500'd the whole /api/discover submit for a
  // fresh/blank-numbers account. A foundation goal only gets created when its computed target is
  // a real amount (>= 100 cents = $1); otherwise it's skipped entirely this submit — it will be
  // created on a later submit once the underlying number is non-zero. Same guard applied to the
  // buffer goal's target for symmetry, even though `firstMilestoneCents` is a fixed assumption
  // that is never 0 in practice.
  const MIN_FOUNDATION_TARGET_CENTS = 100;

  if (!bufferExists && a.firstMilestoneCents >= MIN_FOUNDATION_TARGET_CENTS) {
    inserts.push({
      user_id: userId,
      kind: "buffer",
      title: "Breathing room",
      target_cents: a.firstMilestoneCents,
      target_date: monthDate(startedOn, 1),
      priority: 90,
      goal_type: "savings_achievable",
      status: "active",
    });
  }

  if (!emergencyExists) {
    const weeklyEssentials =
      payCycle === "weekly"
        ? essentialsCentsPerCycle
        : payCycle === "fortnightly"
          ? Math.round(essentialsCentsPerCycle / 2)
          : Math.round((essentialsCentsPerCycle * 12) / 52);
    const emergencyTargetCents = Math.round(weeklyEssentials * a.emergencyWeeks);
    if (emergencyTargetCents >= MIN_FOUNDATION_TARGET_CENTS) {
      inserts.push({
        user_id: userId,
        kind: "emergency",
        title: "Emergency fund",
        target_cents: emergencyTargetCents,
        target_date: monthDate(startedOn, 6),
        priority: 91,
        goal_type: "savings_achievable",
        status: "active",
      });
    }
  }

  if (inserts.length === 0) return null;
  const { error: insertError } = await supabase.from("goals").insert(inserts);
  return insertError ?? null;
}

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

    const { data: existingProfile, error: profileReadError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileReadError) return NextResponse.json({ error: "internal" }, { status: 500 });
    if (!existingProfile) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const profile = existingProfile as ProfileRow;

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        freedom_text: body.freedom_text ?? profile.freedom_text,
        pay_cycle: body.pay_cycle,
        take_home_cents: body.take_home_cents,
        essentials_cents: body.essentials_cents,
        lifestyle_cents: body.lifestyle_cents,
        buffer_cents: body.buffer_cents,
        savings_cents: body.savings_cents,
        debt_cents: body.debt_cents,
        debt_rate_bps: body.debt_rate_bps,
        risk_comfort: body.risk_comfort,
      })
      .eq("user_id", userId);
    if (profileUpdateError) return NextResponse.json({ error: "internal" }, { status: 500 });

    const { data: assumptionRows, error: assumptionsError } = await supabase.from("assumptions").select("*");
    if (assumptionsError) return NextResponse.json({ error: "internal" }, { status: 500 });
    const a = assumptionsToEngine((assumptionRows ?? []) as AssumptionRow[]);

    const engineProfile: EngineProfile = {
      payCycle: body.pay_cycle,
      takeHomeCents: body.take_home_cents,
      essentialsCents: body.essentials_cents,
      lifestyleCents: body.lifestyle_cents,
      bufferCents: body.buffer_cents,
    };
    const capacity = capacityMonthlyCents(engineProfile);

    // "Replace the user's active goals with the list" (D5) — scoped to the chip-selectable
    // kinds; buffer/emergency are foundation goals A5 owns exclusively and are never touched
    // by this loop (they aren't valid values for the submitted `kind` enum either).
    const { data: existingChoosableRows, error: existingReadError } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("kind", CHOOSABLE_KINDS as unknown as string[]);
    if (existingReadError) return NextResponse.json({ error: "internal" }, { status: 500 });
    const existingChoosable = (existingChoosableRows ?? []) as GoalRow[];
    const existingById = new Map(existingChoosable.map((g) => [g.id, g]));

    const keptIds = new Set<string>();

    for (let i = 0; i < body.goals.length; i++) {
      const submitted = body.goals[i];
      const existing = submitted.id ? existingById.get(submitted.id) : undefined;
      const targetMonth = monthIndex(profile.started_on, submitted.target_date);
      // Preserve an existing goal's starting balance (e.g. contributions already logged
      // against it) when the client doesn't explicitly send one — never silently zero it out.
      const startingBalanceCents = submitted.starting_balance_cents ?? existing?.starting_balance_cents ?? 0;
      const goalTypeValue = classifyGoalType(
        { targetCents: submitted.target_cents, startingBalanceCents, targetMonth },
        capacity,
        a,
      );

      if (existing) {
        const { error: updateError } = await supabase
          .from("goals")
          .update({
            kind: submitted.kind,
            title: submitted.title,
            target_cents: submitted.target_cents,
            starting_balance_cents: startingBalanceCents,
            target_date: submitted.target_date,
            priority: i + 1,
            goal_type: goalTypeValue,
          })
          .eq("id", existing.id)
          .eq("user_id", userId);
        if (updateError) return NextResponse.json({ error: "internal" }, { status: 500 });
        keptIds.add(existing.id);
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from("goals")
          .insert({
            user_id: userId,
            kind: submitted.kind,
            title: submitted.title,
            target_cents: submitted.target_cents,
            starting_balance_cents: startingBalanceCents,
            target_date: submitted.target_date,
            priority: i + 1,
            goal_type: goalTypeValue,
            status: "active",
          })
          .select("id")
          .single();
        if (insertError || !inserted) return NextResponse.json({ error: "internal" }, { status: 500 });
        keptIds.add(inserted.id as string);
      }
    }

    // Discover is also the "edit my data" screen: a chip that gets deselected on a re-submit
    // must never destroy a goal that already has check-in history. A goal with >=1 contribution
    // is paused (excluded from getGoalsWithProjections/waterfall, but its id, contributions and
    // past goal_projections rows survive — reselecting the chip later starts a fresh goal rather
    // than reviving this one, which is an acceptable trade-off, but the history itself is never
    // lost). Only a goal with zero contributions — nothing to lose — is still hard-deleted.
    const idsToRemove = existingChoosable.filter((g) => !keptIds.has(g.id)).map((g) => g.id);
    if (idsToRemove.length > 0) {
      const { data: contributionRows, error: contributionsReadError } = await supabase
        .from("contributions")
        .select("goal_id")
        .in("goal_id", idsToRemove);
      if (contributionsReadError) return NextResponse.json({ error: "internal" }, { status: 500 });
      const idsWithContributions = new Set(
        ((contributionRows ?? []) as { goal_id: string }[]).map((r) => r.goal_id),
      );
      const idsToPause = idsToRemove.filter((id) => idsWithContributions.has(id));
      const idsToDelete = idsToRemove.filter((id) => !idsWithContributions.has(id));

      if (idsToPause.length > 0) {
        const { error: pauseError } = await supabase
          .from("goals")
          .update({ status: "paused" })
          .in("id", idsToPause)
          .eq("user_id", userId);
        if (pauseError) return NextResponse.json({ error: "internal" }, { status: 500 });
      }
      if (idsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from("goals")
          .delete()
          .in("id", idsToDelete)
          .eq("user_id", userId);
        if (deleteError) return NextResponse.json({ error: "internal" }, { status: 500 });
      }
    }

    const foundationError = await ensureFoundationGoals(
      supabase,
      userId,
      profile.started_on,
      body.essentials_cents,
      body.pay_cycle,
      a,
    );
    if (foundationError) return NextResponse.json({ error: "internal" }, { status: 500 });

    await recompute(supabase, userId);

    // D7 calls 1 (reflection) + 2 (roadmap copy) — after() guarantees these start only once the
    // response below has been sent; gated by aiEnabled() so a blank ANTHROPIC_API_KEY schedules
    // no work at all (task 11 acceptance: "nothing breaks").
    if (aiEnabled()) {
      after(() => runDiscoverReflection(supabase, userId));
      after(() => runRoadmapCopy(supabase, userId));
    }

    return NextResponse.json({ ok: true, redirect: "/achievable", disclaimer: DISCLAIMER });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
