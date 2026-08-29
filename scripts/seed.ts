// scripts/seed.ts — D8 + A7. Run with `npx tsx scripts/seed.ts` (also `npm run seed`).
//
// Parses .env.local itself (read here only — never printed, never echoed back). Uses the
// service role key — the ONLY runtime use of SUPABASE_SERVICE_ROLE_KEY in the whole app (D5:
// "no service role at runtime" refers to the Next app; this script is the seed-only exception).
// Idempotent: every entity is looked up by its A7 key and updated rather than duplicated, so
// re-running this script converges to the same end state instead of accumulating duplicates.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recompute } from "@/lib/data/recompute";
import type { ContributionKind, EventKind, GoalKind, GoalType, PayCycle, RiskComfort } from "@/lib/data/types";

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
  console.error("seed: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local — cannot proceed.");
  process.exit(1);
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_PASSWORD = "Zenda-demo-2026!";
const STARTED_ON = "2026-09-01";

// ---------- idempotent upsert helpers (A7 keys) ----------

async function ensureOrganisation(): Promise<string> {
  const { data: existing, error: readError } = await admin
    .from("organisations")
    .select("id")
    .eq("join_code", "DEMO")
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await admin.from("organisations").update({ name: "Demo Co Pty Ltd", seat_limit: 50 }).eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }
  const { data: inserted, error: insertError } = await admin
    .from("organisations")
    .insert({ name: "Demo Co Pty Ltd", join_code: "DEMO", seat_limit: 50 })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted.id as string;
}

async function ensureUser(email: string): Promise<string> {
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) break;
  }
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  if (!created.user) throw new Error(`seed: auth.admin.createUser returned no user for ${email}`);
  return created.user.id;
}

type ProfileFields = {
  role?: "admin" | "employee";
  display_name: string;
  pay_cycle?: PayCycle;
  take_home_cents?: number;
  essentials_cents?: number;
  lifestyle_cents?: number;
  buffer_cents?: number;
  savings_cents?: number;
  debt_cents?: number;
  debt_rate_bps?: number;
  risk_comfort?: RiskComfort;
  freedom_text?: string;
  started_on?: string;
};

async function upsertProfile(userId: string, orgId: string, fields: ProfileFields): Promise<void> {
  const { error } = await admin
    .from("profiles")
    .upsert({ user_id: userId, org_id: orgId, last_seen_at: new Date().toISOString(), ...fields }, { onConflict: "user_id" });
  if (error) throw error;
}

type GoalSpec = {
  kind: GoalKind;
  title: string;
  target_cents: number;
  target_date: string;
  priority: number;
  goal_type: GoalType;
  starting_balance_cents?: number;
};

/** Every goal is (re-)seeded `active`; goals D8 marks reached are flipped afterward (see main()) —
 * so a re-run always converges to the same end state regardless of the goal's current status. */
async function ensureGoal(userId: string, goal: GoalSpec): Promise<string> {
  const { data: existing, error: readError } = await admin
    .from("goals")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", goal.kind)
    .eq("title", goal.title)
    .maybeSingle();
  if (readError) throw readError;
  const fields = {
    target_cents: goal.target_cents,
    target_date: goal.target_date,
    priority: goal.priority,
    goal_type: goal.goal_type,
    status: "active" as const,
    starting_balance_cents: goal.starting_balance_cents ?? 0,
  };
  if (existing) {
    const { error } = await admin.from("goals").update(fields).eq("id", existing.id);
    if (error) throw error;
    return existing.id as string;
  }
  const { data: inserted, error: insertError } = await admin
    .from("goals")
    .insert({ user_id: userId, kind: goal.kind, title: goal.title, ...fields })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return inserted.id as string;
}

async function markGoalReached(goalId: string, reachedAtIso: string): Promise<void> {
  const { error } = await admin.from("goals").update({ status: "reached", reached_at: reachedAtIso }).eq("id", goalId);
  if (error) throw error;
}

async function ensureContribution(
  userId: string,
  goalId: string,
  amountCents: number,
  occurredOn: string,
  kind: ContributionKind,
): Promise<void> {
  const { data: existing, error: readError } = await admin
    .from("contributions")
    .select("id")
    .eq("goal_id", goalId)
    .eq("occurred_on", occurredOn)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await admin.from("contributions").update({ amount_cents: amountCents, kind }).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error: insertError } = await admin
    .from("contributions")
    .insert({ user_id: userId, goal_id: goalId, amount_cents: amountCents, occurred_on: occurredOn, kind });
  if (insertError) throw insertError;
}

async function ensureEvent(
  userId: string,
  kind: EventKind,
  goalId: string | null,
  message: string,
  payload: Record<string, unknown>,
  seenAt: string | null,
): Promise<void> {
  const base = admin.from("motivational_events").select("id").eq("user_id", userId).eq("kind", kind);
  const scoped = goalId === null ? base.is("goal_id", null) : base.eq("goal_id", goalId);
  const { data: existing, error: readError } = await scoped.maybeSingle();
  if (readError) throw readError;
  if (existing) {
    const { error } = await admin.from("motivational_events").update({ message, payload, seen_at: seenAt }).eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error: insertError } = await admin
    .from("motivational_events")
    .insert({ user_id: userId, kind, goal_id: goalId, message, payload, seen_at: seenAt });
  if (insertError) throw insertError;
}

type LessonSpec = { slug: string; title: string; body_md: string; trigger_tag: string };

async function ensureLesson(lesson: LessonSpec): Promise<void> {
  const { error } = await admin.from("lessons").upsert(lesson, { onConflict: "slug" });
  if (error) throw error;
}

// ---------- D8 step 8: five lessons, body text from VINAY_JOURNEY.md §5 (the debt and super
// notes sit in §3's footer, immediately above §5's own list — same "flags for the person"
// material; content, not location, is what D8 asks for). trigger_tag values from the
// public.lessons table comment in supabase/migrations/0001_zenda.sql. ----------
const LESSONS: LessonSpec[] = [
  {
    slug: "debt-vs-savings",
    title: "Debt vs. savings — pick the higher rate",
    trigger_tag: "debt_vs_savings",
    body_md:
      "The $30,000 debt sits at 2.8%; the savings engine earns roughly 5%. Every extra dollar put " +
      "toward the debt only saves 2.8%, but the same dollar in savings earns more — so the plan " +
      "pays the minimum on the debt and lets the surplus do the work where it earns more. If the " +
      "debt's real rate is ever higher than the savings rate, the comparison flips and the numbers " +
      "recompute instantly.",
  },
  {
    slug: "match-money-to-horizon",
    title: "Match the money to the horizon",
    trigger_tag: "horizon",
    body_md:
      "Money needed inside three years — a trip, a car — belongs in cash savings, where it can't " +
      "lose value right before you need it. Money with five or more years to grow belongs in " +
      "growth assets, where time can absorb the ups and downs. Never the reverse: short-horizon " +
      "money doesn't get long-run growth, and long-horizon money doesn't have to sit in cash.",
  },
  {
    slug: "twelve-percent-is-upside",
    title: "12% is the upside, not the plan",
    trigger_tag: "optimism",
    body_md:
      "Long-run diversified growth assets have averaged roughly 8–10% a year. The roadmap plans " +
      "at 9% for money with a long horizon and shows 12% only as an upside case — never the number " +
      "it commits to. Planning at the optimistic number makes every date look closer than it really " +
      "is, so the honest plan uses the steadier figure and treats the higher one as a pleasant " +
      "surprise if it happens.",
  },
  {
    slug: "buffer-double-duty",
    title: "The buffer is doing double duty",
    trigger_tag: "buffer",
    body_md:
      "The weekly 'buffer' line is counted as savings capacity in the engine — it's assumed to be " +
      "money that's actually set aside, not spent. If it's really spent most weeks instead, the " +
      "true savings capacity is lower, and every date on the roadmap moves out by roughly two-thirds. " +
      "The fix is simple: track the buffer for a few pay cycles and let the engine recompute from " +
      "what's actually happening.",
  },
  {
    slug: "super-already-running",
    title: "Super is already running in the background",
    trigger_tag: "super",
    body_md:
      "Employer superannuation contributions — a set percentage of income, paid in automatically — " +
      "are already building a long-term balance in the background, separate from every goal on this " +
      "roadmap. They're not counted toward the house, the car, or the trip; they're a second, slower " +
      "engine that keeps running on its own and doesn't need a weekly decision.",
  },
];

async function main() {
  console.log("seed: organisation…");
  const orgId = await ensureOrganisation();

  console.log("seed: auth users…");
  const vinayId = await ensureUser("vinay@demo.zenda.app");
  const judgeId = await ensureUser("judge@demo.zenda.app");
  const adminId = await ensureUser("admin@demo.zenda.app");
  // T1 (ZENDA_TEST_SPEC.md "Test data"): a fourth account, a Vinay clone used only by mutating
  // tests — vinay@ itself must stay pristine. Reset to this same state by scripts/reset-e2e.ts.
  const e2eId = await ensureUser("e2e@demo.zenda.app");

  console.log("seed: profiles…");
  await upsertProfile(vinayId, orgId, {
    display_name: "Vinay",
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
  });
  await upsertProfile(judgeId, orgId, { display_name: "Judge" });
  await upsertProfile(adminId, orgId, { role: "admin", display_name: "Admin" });
  await upsertProfile(e2eId, orgId, {
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
  });

  console.log("seed: Vinay's goals…");
  const homeId = await ensureGoal(vinayId, {
    kind: "home",
    title: "A first home",
    target_cents: 24_000_000,
    target_date: "2033-09-01",
    priority: 1,
    goal_type: "growth_required",
  });
  const carId = await ensureGoal(vinayId, {
    kind: "car",
    title: "The car, no loan",
    target_cents: 2_500_000,
    target_date: "2029-01-14",
    priority: 2,
    goal_type: "savings_achievable",
  });
  const peruId = await ensureGoal(vinayId, {
    kind: "travel",
    title: "Peru",
    target_cents: 400_000,
    target_date: "2027-01-10",
    priority: 3,
    goal_type: "savings_achievable",
  });
  const emergencyId = await ensureGoal(vinayId, {
    kind: "emergency",
    title: "Emergency fund",
    target_cents: 236_000,
    target_date: "2027-03-07",
    priority: 4,
    goal_type: "savings_achievable",
  });
  const bufferId = await ensureGoal(vinayId, {
    kind: "buffer",
    title: "Breathing room",
    target_cents: 50_000,
    target_date: "2026-10-01",
    priority: 5,
    goal_type: "savings_achievable",
  });
  void homeId;

  console.log("seed: contributions…");
  await ensureContribution(vinayId, bufferId, 26_000, "2026-09-07", "seed");
  await ensureContribution(vinayId, bufferId, 26_000, "2026-09-14", "seed");
  await ensureContribution(vinayId, peruId, 26_000, "2026-09-21", "seed");
  await ensureContribution(vinayId, peruId, 26_000, "2026-09-28", "seed");
  await ensureContribution(vinayId, peruId, 26_000, "2026-10-05", "seed");
  await ensureContribution(vinayId, peruId, 26_000, "2026-10-12", "seed");

  console.log("seed: running the engine (lib/data/recompute — the only writer of goal_projections)…");
  // Computed once while the buffer goal is still `active`, so it gets a real projection row
  // too (D8 step 6: "upsert goal_projections for all five") before being frozen as reached
  // (A4: a reached goal's projection is frozen — recompute() never emits one for it again).
  const projections = await recompute(admin, vinayId);
  if (projections.length !== 5) {
    console.warn(`seed: expected 5 projections, recompute() wrote ${projections.length}`);
  }

  console.log("seed: marking the buffer goal reached…");
  await markGoalReached(bufferId, "2026-09-14T00:00:00.000Z");

  console.log("seed: events…");
  await ensureEvent(
    vinayId,
    "milestone_reached",
    bufferId,
    "$500 of breathing room — done. Peru just moved closer.",
    {},
    "2026-09-14T00:00:00.000Z",
  );
  await ensureEvent(vinayId, "streak", null, "Six paydays in a row.", {}, null);
  await ensureEvent(
    vinayId,
    "trade_off",
    carId,
    "Chose $25,000 for the car, landing January 2029 instead of $50,000 in September 2028.",
    {
      before: { target_cents: 5_000_000, target_date: "2028-09-01" },
      after: { target_cents: 2_500_000, target_date: "2029-01-14" },
    },
    null,
  );
  void emergencyId;

  // ---------- T1: e2e@demo.zenda.app — a Vinay clone (ZENDA_TEST_SPEC.md "Test data") ----------
  // Same shape as Vinay's block above; scripts/reset-e2e.ts restores exactly this state between
  // mutating test runs so vinay@ itself never has to be touched.
  console.log("seed: e2e's goals (Vinay clone)…");
  const e2eHomeId = await ensureGoal(e2eId, {
    kind: "home",
    title: "A first home",
    target_cents: 24_000_000,
    target_date: "2033-09-01",
    priority: 1,
    goal_type: "growth_required",
  });
  const e2eCarId = await ensureGoal(e2eId, {
    kind: "car",
    title: "The car, no loan",
    target_cents: 2_500_000,
    target_date: "2029-01-14",
    priority: 2,
    goal_type: "savings_achievable",
  });
  const e2ePeruId = await ensureGoal(e2eId, {
    kind: "travel",
    title: "Peru",
    target_cents: 400_000,
    target_date: "2027-01-10",
    priority: 3,
    goal_type: "savings_achievable",
  });
  const e2eEmergencyId = await ensureGoal(e2eId, {
    kind: "emergency",
    title: "Emergency fund",
    target_cents: 236_000,
    target_date: "2027-03-07",
    priority: 4,
    goal_type: "savings_achievable",
  });
  const e2eBufferId = await ensureGoal(e2eId, {
    kind: "buffer",
    title: "Breathing room",
    target_cents: 50_000,
    target_date: "2026-10-01",
    priority: 5,
    goal_type: "savings_achievable",
  });
  void e2eHomeId;

  console.log("seed: e2e's contributions…");
  await ensureContribution(e2eId, e2eBufferId, 26_000, "2026-09-07", "seed");
  await ensureContribution(e2eId, e2eBufferId, 26_000, "2026-09-14", "seed");
  await ensureContribution(e2eId, e2ePeruId, 26_000, "2026-09-21", "seed");
  await ensureContribution(e2eId, e2ePeruId, 26_000, "2026-09-28", "seed");
  await ensureContribution(e2eId, e2ePeruId, 26_000, "2026-10-05", "seed");
  await ensureContribution(e2eId, e2ePeruId, 26_000, "2026-10-12", "seed");

  console.log("seed: running the engine for e2e…");
  const e2eProjections = await recompute(admin, e2eId);
  if (e2eProjections.length !== 5) {
    console.warn(`seed: expected 5 projections for e2e, recompute() wrote ${e2eProjections.length}`);
  }

  console.log("seed: marking e2e's buffer goal reached…");
  await markGoalReached(e2eBufferId, "2026-09-14T00:00:00.000Z");

  console.log("seed: e2e's events…");
  await ensureEvent(
    e2eId,
    "milestone_reached",
    e2eBufferId,
    "$500 of breathing room — done. Peru just moved closer.",
    {},
    "2026-09-14T00:00:00.000Z",
  );
  await ensureEvent(e2eId, "streak", null, "Six paydays in a row.", {}, null);
  await ensureEvent(
    e2eId,
    "trade_off",
    e2eCarId,
    "Chose $25,000 for the car, landing January 2029 instead of $50,000 in September 2028.",
    {
      before: { target_cents: 5_000_000, target_date: "2028-09-01" },
      after: { target_cents: 2_500_000, target_date: "2029-01-14" },
    },
    null,
  );
  void e2eEmergencyId;

  console.log("seed: lessons…");
  for (const lesson of LESSONS) await ensureLesson(lesson);

  console.log("seed: done.");
  console.log("  vinay@demo.zenda.app / Zenda-demo-2026!  (populated persona)");
  console.log("  judge@demo.zenda.app / Zenda-demo-2026!  (fresh account)");
  console.log("  admin@demo.zenda.app / Zenda-demo-2026!  (org admin)");
  console.log("  e2e@demo.zenda.app / Zenda-demo-2026!    (test account — mutated by tests, reset via npm run reset:e2e)");
}

main().catch((error) => {
  console.error("seed: failed —", error instanceof Error ? error.message : error);
  process.exit(1);
});
