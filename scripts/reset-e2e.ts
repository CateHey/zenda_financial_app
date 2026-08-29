// scripts/reset-e2e.ts — ZENDA_TEST_SPEC.md "Test data" + A7 (same runner pattern as
// scripts/seed.ts). Service role, reads .env.local the same way (parsed here only — never
// printed). Run directly with `npx tsx scripts/reset-e2e.ts`, via `npm run reset:e2e`, or as
// Playwright's globalSetup.
//
// Deletes e2e@demo.zenda.app's goals (cascades to contributions/projections per the
// `on delete cascade` FKs in supabase/migrations/0001_zenda.sql), events, and profile, then
// re-creates them identical to Vinay's seed state (scripts/seed.ts) — vinay@ itself is never
// touched by any test. Also deletes any auth user left over from a signup test
// (e2e-fresh-*@demo.zenda.app). Also resets judge@demo.zenda.app back to the D8 "fresh account"
// state (orchestrator instruction): its auth user and profile row (org member, Vinay's numbers)
// are kept as-is — only its goals (cascades contributions/projections), and events are deleted —
// so the demo account lands on /discover again after manual verification runs left it with a
// full goal set. Prints one line: `e2e reset: <n goals>, <n contributions> | judge reset: <n
// goals deleted>`.
//
// Writes tests/fixtures/ids.json (e2e user id, e2e goal ids by kind, judge user id, org id) so
// layer-2/3 tests can address specific rows without re-deriving them.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recompute } from "@/lib/data/recompute";
import type { ContributionKind, EventKind, GoalKind, GoalType } from "@/lib/data/types";

// ---------- .env.local (parsed here only; A7 — never overrides an already-set env var) ----------
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "reset-e2e: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — cannot proceed.",
  );
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "Zenda-demo-2026!";
const STARTED_ON = "2026-09-01";
const E2E_EMAIL = "e2e@demo.zenda.app";
const JUDGE_EMAIL = "judge@demo.zenda.app";
const FRESH_LEFTOVER_RE = /^e2e-fresh-.*@demo\.zenda\.app$/i;

async function findUserByEmail(email: string): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function ensureE2eUser(): Promise<string> {
  const existing = await findUserByEmail(E2E_EMAIL);
  if (existing) return existing;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: E2E_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  if (!created.user) throw new Error("reset-e2e: auth.admin.createUser returned no user for e2e@demo.zenda.app");
  return created.user.id;
}

/** Signup-test leftovers: any auth user whose email matches e2e-fresh-*@demo.zenda.app. */
async function deleteFreshSignupLeftovers(): Promise<number> {
  let deleted = 0;
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const matches = data.users.filter((u) => u.email && FRESH_LEFTOVER_RE.test(u.email));
    for (const u of matches) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(u.id);
      if (deleteError) throw deleteError;
      deleted++;
    }
    if (data.users.length < perPage) break;
  }
  return deleted;
}

type GoalSpec = {
  kind: GoalKind;
  title: string;
  target_cents: number;
  target_date: string;
  priority: number;
  goal_type: GoalType;
};

// Identical to Vinay's seed state (scripts/seed.ts) — see ZENDA_TEST_SPEC.md "Test data": "a
// Vinay clone", profile/goals/contributions/projections/events identical, display_name "E2E".
const GOALS: GoalSpec[] = [
  { kind: "home", title: "A first home", target_cents: 24_000_000, target_date: "2033-09-01", priority: 1, goal_type: "growth_required" },
  { kind: "car", title: "The car, no loan", target_cents: 2_500_000, target_date: "2029-01-14", priority: 2, goal_type: "savings_achievable" },
  { kind: "travel", title: "Peru", target_cents: 400_000, target_date: "2027-01-10", priority: 3, goal_type: "savings_achievable" },
  { kind: "emergency", title: "Emergency fund", target_cents: 236_000, target_date: "2027-03-07", priority: 4, goal_type: "savings_achievable" },
  { kind: "buffer", title: "Breathing room", target_cents: 50_000, target_date: "2026-10-01", priority: 5, goal_type: "savings_achievable" },
];

const CONTRIBUTIONS: { kind: GoalKind; amount_cents: number; occurred_on: string }[] = [
  { kind: "buffer", amount_cents: 26_000, occurred_on: "2026-09-07" },
  { kind: "buffer", amount_cents: 26_000, occurred_on: "2026-09-14" },
  { kind: "travel", amount_cents: 26_000, occurred_on: "2026-09-21" },
  { kind: "travel", amount_cents: 26_000, occurred_on: "2026-09-28" },
  { kind: "travel", amount_cents: 26_000, occurred_on: "2026-10-05" },
  { kind: "travel", amount_cents: 26_000, occurred_on: "2026-10-12" },
];

async function main() {
  console.log("reset-e2e: locating accounts…");
  const e2eId = await ensureE2eUser();
  const judgeId = await findUserByEmail(JUDGE_EMAIL);
  if (!judgeId) {
    console.warn("reset-e2e: judge@demo.zenda.app not found — run `npm run seed` first. Continuing without it.");
  }

  const { data: org, error: orgError } = await admin
    .from("organisations")
    .select("id")
    .eq("join_code", "DEMO")
    .maybeSingle();
  if (orgError) throw orgError;
  if (!org) throw new Error("reset-e2e: organisation with join_code DEMO not found — run `npm run seed` first.");
  const orgId = org.id as string;

  console.log("reset-e2e: deleting signup-test leftovers (e2e-fresh-*@demo.zenda.app)…");
  const leftoversDeleted = await deleteFreshSignupLeftovers();
  if (leftoversDeleted > 0) console.log(`reset-e2e: deleted ${leftoversDeleted} leftover signup account(s).`);

  console.log("reset-e2e: deleting e2e's goals (cascades contributions + projections), events, profile…");
  const { error: deleteGoalsError } = await admin.from("goals").delete().eq("user_id", e2eId);
  if (deleteGoalsError) throw deleteGoalsError;
  const { error: deleteEventsError } = await admin.from("motivational_events").delete().eq("user_id", e2eId);
  if (deleteEventsError) throw deleteEventsError;
  const { error: deleteProfileError } = await admin.from("profiles").delete().eq("user_id", e2eId);
  if (deleteProfileError) throw deleteProfileError;

  console.log("reset-e2e: re-creating e2e's profile (identical to Vinay's)…");
  const { error: insertProfileError } = await admin.from("profiles").insert({
    user_id: e2eId,
    org_id: orgId,
    role: "employee",
    display_name: "E2E",
    pay_cycle: "weekly",
    take_home_cents: 110_000,
    essentials_cents: 59_000,
    lifestyle_cents: 25_000,
    buffer_cents: 10_000,
    savings_cents: 0,
    debt_cents: 3_000_000,
    debt_rate_bps: 280,
    risk_comfort: "high",
    freedom_text: "A house — a real one, around a million. A car I don't have to worry about. And Peru in January.",
    started_on: STARTED_ON,
    last_seen_at: new Date().toISOString(),
  });
  if (insertProfileError) throw insertProfileError;

  console.log("reset-e2e: re-creating e2e's goals…");
  const goalIdByKind: Record<string, string> = {};
  for (const g of GOALS) {
    const { data: inserted, error: insertGoalError } = await admin
      .from("goals")
      .insert({
        user_id: e2eId,
        kind: g.kind,
        title: g.title,
        target_cents: g.target_cents,
        starting_balance_cents: 0,
        target_date: g.target_date,
        priority: g.priority,
        goal_type: g.goal_type,
        status: "active",
      })
      .select("id")
      .single();
    if (insertGoalError || !inserted) throw insertGoalError ?? new Error(`reset-e2e: insert of goal ${g.kind} returned no row`);
    goalIdByKind[g.kind] = inserted.id as string;
  }

  console.log("reset-e2e: re-creating e2e's contributions…");
  const contributionRows = CONTRIBUTIONS.map((c) => ({
    user_id: e2eId,
    goal_id: goalIdByKind[c.kind],
    amount_cents: c.amount_cents,
    occurred_on: c.occurred_on,
    kind: "seed" as ContributionKind,
  }));
  const { error: insertContributionsError } = await admin.from("contributions").insert(contributionRows);
  if (insertContributionsError) throw insertContributionsError;

  console.log("reset-e2e: running the engine (lib/data/recompute), pass 1…");
  // Pass 1, computed while the buffer goal is still `active`, same order as scripts/seed.ts, so
  // it gets a real projection row before being frozen as reached (A4: a reached goal's row is
  // "frozen — keep the stored row; do not recompute" once it's reached, so this is buffer's only
  // chance to get one — the waterfall skips `reached` goals entirely).
  const pass1 = await recompute(admin, e2eId);
  if (pass1.length !== 5) {
    console.warn(`reset-e2e: expected 5 projections from pass 1, recompute() wrote ${pass1.length}`);
  }

  console.log("reset-e2e: marking e2e's buffer goal reached…");
  const { error: reachedError } = await admin
    .from("goals")
    .update({ status: "reached", reached_at: "2026-09-14T00:00:00.000Z" })
    .eq("id", goalIdByKind.buffer);
  if (reachedError) throw reachedError;

  console.log("reset-e2e: running the engine (lib/data/recompute), pass 2…");
  // Pass 2, now that the buffer is `reached`: A4 says a reached goal's cursor contribution is
  // `max(cursor, reachedAtMonth)`, not "completes instantly at month 0" (what pass 1 saw with
  // the buffer still `active` and already over target) — so every other goal's start_month must
  // be recomputed against the buffer's real reached_at, or every downstream date is one waterfall
  // step earlier than the live client-side waterfall() (roadmap/what-if, trade-off, adapt) ever
  // shows for the exact same numbers. The waterfall skips `reached` goals (no row emitted), so
  // this pass's upsert only touches travel/emergency/car/home — the buffer's pass-1 row (its
  // true state while still active) stays untouched, exactly the "frozen" row A4 describes.
  const pass2 = await recompute(admin, e2eId);
  if (pass2.length !== 4) {
    console.warn(`reset-e2e: expected 4 projections from pass 2 (buffer excluded, frozen), recompute() wrote ${pass2.length}`);
  }

  console.log("reset-e2e: re-creating e2e's events…");
  const events: { kind: EventKind; goal_id: string | null; message: string; payload: Record<string, unknown>; seen_at: string | null }[] = [
    {
      kind: "milestone_reached",
      goal_id: goalIdByKind.buffer,
      message: "$500 of breathing room — done. Peru just moved closer.",
      payload: {},
      seen_at: "2026-09-14T00:00:00.000Z",
    },
    { kind: "streak", goal_id: null, message: "Six paydays in a row.", payload: {}, seen_at: null },
    {
      kind: "trade_off",
      goal_id: goalIdByKind.car,
      message: "Chose $25,000 for the car, landing January 2029 instead of $50,000 in September 2028.",
      payload: {
        before: { target_cents: 5_000_000, target_date: "2028-09-01" },
        after: { target_cents: 2_500_000, target_date: "2029-01-14" },
      },
      seen_at: null,
    },
  ];
  const { error: insertEventsError } = await admin
    .from("motivational_events")
    .insert(events.map((e) => ({ user_id: e2eId, kind: e.kind, goal_id: e.goal_id, message: e.message, payload: e.payload, seen_at: e.seen_at })));
  if (insertEventsError) throw insertEventsError;

  // judge@: reset to the D8 "fresh account" state — keep the auth user and profile row (org
  // member, Vinay's numbers stand), delete only goals (cascades contributions + projections) and
  // events, so the account has zero goals and lands on /discover again (D3 redirect rule).
  let judgeGoalsDeleted = 0;
  if (judgeId) {
    console.log("reset-e2e: resetting judge's goals (cascades contributions + projections) and events…");
    const { data: judgeGoalRows, error: judgeGoalsReadError } = await admin
      .from("goals")
      .select("id")
      .eq("user_id", judgeId);
    if (judgeGoalsReadError) throw judgeGoalsReadError;
    judgeGoalsDeleted = (judgeGoalRows ?? []).length;

    const { error: deleteJudgeGoalsError } = await admin.from("goals").delete().eq("user_id", judgeId);
    if (deleteJudgeGoalsError) throw deleteJudgeGoalsError;
    const { error: deleteJudgeEventsError } = await admin.from("motivational_events").delete().eq("user_id", judgeId);
    if (deleteJudgeEventsError) throw deleteJudgeEventsError;
  }

  const fixtures = {
    e2eUserId: e2eId,
    judgeUserId: judgeId,
    orgId,
    e2eGoalIdsByKind: goalIdByKind,
  };
  const fixturesDir = resolve(process.cwd(), "tests", "fixtures");
  if (!existsSync(fixturesDir)) mkdirSync(fixturesDir, { recursive: true });
  writeFileSync(resolve(fixturesDir, "ids.json"), JSON.stringify(fixtures, null, 2) + "\n", "utf8");

  console.log(`e2e reset: ${GOALS.length} goals, ${CONTRIBUTIONS.length} contributions | judge reset: ${judgeGoalsDeleted} goals deleted`);
}

main().catch((error) => {
  console.error("reset-e2e: failed —", error instanceof Error ? error.message : error);
  process.exit(1);
});
