import { NextResponse } from "next/server";
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

// D5 POST /api/discover, A5 (foundation goals). Upserts the profile's "where you are today"
// numbers, replaces the user's chip-selectable active goals with the submitted list, ensures
// the buffer + emergency foundation goals exist, re-runs the engine, and upserts projections
// + template `why`s via lib/data/recompute.ts (the only writer of goal_projections).
// AI (D7 calls 1/2 in after()) is wired in task 11 — not here.

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

  if (!bufferExists) {
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
    inserts.push({
      user_id: userId,
      kind: "emergency",
      title: "Emergency fund",
      target_cents: Math.round(weeklyEssentials * a.emergencyWeeks),
      target_date: monthDate(startedOn, 6),
      priority: 91,
      goal_type: "savings_achievable",
      status: "active",
    });
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

    const idsToRemove = existingChoosable.filter((g) => !keptIds.has(g.id)).map((g) => g.id);
    if (idsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("goals")
        .delete()
        .in("id", idsToRemove)
        .eq("user_id", userId);
      if (deleteError) return NextResponse.json({ error: "internal" }, { status: 500 });
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

    // AI calls (D7 call 1 reflection, call 2 roadmap copy) run in after() — task 11.

    return NextResponse.json({ ok: true, redirect: "/achievable", disclaimer: DISCLAIMER });
  } catch {
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
