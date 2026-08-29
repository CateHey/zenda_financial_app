// tests/db/seed.test.ts — ZENDA_TEST_SPEC.md Layer 2, "seed.test.ts". Verifies the e2e account
// (a Vinay clone) sits in exactly the state scripts/seed.ts / scripts/reset-e2e.ts put it in.
// Run `npm run seed` then `npm run reset:e2e` before this suite (Playwright's globalSetup does
// the reset automatically; this file assumes the accounts already exist).

import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { E2E_EMAIL, hasDbEnv, signIn } from "./clients";

const envReady = hasDbEnv();
if (!envReady) {
  console.warn("tests/db/seed.test.ts: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipping layer 2.");
}

type GoalRow = {
  id: string;
  kind: string;
  status: string;
  goal_type: string;
};

describe.skipIf(!envReady)("seed state — e2e (layer 2)", () => {
  let e2e: SupabaseClient;
  let goals: GoalRow[];

  beforeAll(async () => {
    e2e = await signIn(E2E_EMAIL);
    const { data, error } = await e2e.from("goals").select("id, kind, status, goal_type");
    if (error) throw error;
    goals = data as GoalRow[];
  });

  it("goals count = 5", () => {
    expect(goals).toHaveLength(5);
  });

  it("contributions count = 6", async () => {
    const { data, error } = await e2e.from("contributions").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(6);
  });

  it("projections count = 5", async () => {
    const { data, error } = await e2e.from("goal_projections").select("goal_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(5);
  });

  it("events count >= 2", async () => {
    const { data, error } = await e2e.from("motivational_events").select("id");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
  });

  it("buffer goal status = reached", () => {
    const buffer = goals.find((g) => g.kind === "buffer");
    expect(buffer).toBeDefined();
    expect(buffer!.status).toBe("reached");
  });

  // Corrected per ZENDA_TEST_SPEC.md's addendum: completion_month = 4 (= January 2027 — the
  // $1,040 already saved counts per A4 and the buffer is reached at month 1; the no-contribution
  // D6 vector's 5 does not apply to this seeded state). This holds only because
  // scripts/reset-e2e.ts recomputes the waterfall a *second* time after marking the buffer
  // `reached` (T2 fix) — the first pass (buffer still `active`, already over target) gives the
  // buffer cursor = 0 instead of A4's `max(cursor, reachedAtMonth)`, which understates every
  // later goal's start_month by one waterfall step.
  it("Peru projection: completion_month = 4, achievable = true", async () => {
    const peru = goals.find((g) => g.kind === "travel");
    expect(peru).toBeDefined();
    const { data, error } = await e2e.from("goal_projections").select("completion_month, achievable").eq("goal_id", peru!.id).single();
    expect(error).toBeNull();
    expect(data!.completion_month).toBe(4);
    expect(data!.achievable).toBe(true);
  });

  it("car projection: achievable = true (already the $25k version)", async () => {
    const car = goals.find((g) => g.kind === "car");
    expect(car).toBeDefined();
    const { data, error } = await e2e.from("goal_projections").select("achievable").eq("goal_id", car!.id).single();
    expect(error).toBeNull();
    expect(data!.achievable).toBe(true);
  });

  it("home goal: goal_type = growth_required", () => {
    const home = goals.find((g) => g.kind === "home");
    expect(home).toBeDefined();
    expect(home!.goal_type).toBe("growth_required");
  });
});
