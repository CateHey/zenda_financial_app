// tests/db/rls.test.ts — ZENDA_TEST_SPEC.md Layer 2, "rls.test.ts": the employer-blindness
// proof, one case per row of the spec's table. Real Supabase, anon key + signed-in test
// accounts. Skips with a visible reason when the env vars are absent (never fails).

import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAIL, E2E_EMAIL, JUDGE_EMAIL, anon, currentUserId, hasDbEnv, signIn } from "./clients";

const envReady = hasDbEnv();
if (!envReady) {
  console.warn(
    "tests/db/rls.test.ts: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipping layer 2.",
  );
}

describe.skipIf(!envReady)("RLS — employer blindness (layer 2)", () => {
  let e2eClient: SupabaseClient;
  let adminClient: SupabaseClient;
  let judgeClient: SupabaseClient;
  let judgeUserId: string;
  let orgId: string;

  beforeAll(async () => {
    e2eClient = await signIn(E2E_EMAIL);
    adminClient = await signIn(ADMIN_EMAIL);
    judgeClient = await signIn(JUDGE_EMAIL);

    judgeUserId = await currentUserId(judgeClient);
    const { data: judgeProfile, error } = await judgeClient.from("profiles").select("org_id").single();
    if (error) throw error;
    orgId = judgeProfile!.org_id as string;
  });

  it("as admin: from('goals').select('*') -> [] , no error", async () => {
    const { data, error } = await adminClient.from("goals").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("as admin: from('profiles').select('user_id') -> exactly 1 row = admin's own", async () => {
    const { data, error } = await adminClient.from("profiles").select("user_id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const adminUserId = await currentUserId(adminClient);
    expect(data![0].user_id).toBe(adminUserId);
  });

  it("as admin: contributions, goal_projections, motivational_events -> [] each", async () => {
    for (const table of ["contributions", "goal_projections", "motivational_events"] as const) {
      const { data, error } = await adminClient.from(table).select("*");
      expect(error, `${table} should not error`).toBeNull();
      expect(data, `${table} should be []`).toEqual([]);
    }
  });

  it("as e2e: rpc('org_seat_stats', { org }) -> [] (not an admin of this org)", async () => {
    const { data, error } = await e2eClient.rpc("org_seat_stats", { org: orgId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("as admin: rpc('org_seat_stats', { org }) -> 1 row; members >= 4; active_14d number or null", async () => {
    const { data, error } = await adminClient.rpc("org_seat_stats", { org: orgId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const row = data![0] as { seats: number; members: number; active_14d: number | null };
    expect(row.members).toBeGreaterThanOrEqual(4);
    expect(row.active_14d === null || typeof row.active_14d === "number").toBe(true);
  });

  it("as e2e: from('goals').select('*') -> >= 5 rows, all user_id = e2e", async () => {
    const { data, error } = await e2eClient.from("goals").select("*");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(5);
    const e2eUserId = await currentUserId(e2eClient);
    for (const row of data!) expect(row.user_id).toBe(e2eUserId);
  });

  it("as e2e: from('goals').select('*').eq('user_id', <judge id>) -> []", async () => {
    const { data, error } = await e2eClient.from("goals").select("*").eq("user_id", judgeUserId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("as e2e: insert into goals with user_id = judge id -> error (RLS)", async () => {
    const { error } = await e2eClient.from("goals").insert({
      user_id: judgeUserId,
      kind: "travel",
      title: "RLS probe — should never insert",
      target_cents: 100_000,
      target_date: "2099-01-01",
    });
    expect(error).not.toBeNull();
  });

  it("as e2e: update judge's profile row -> affects 0 rows", async () => {
    const { data, error } = await e2eClient
      .from("profiles")
      .update({ display_name: "RLS probe — should never apply" })
      .eq("user_id", judgeUserId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("as anon: from('assumptions').select('*') -> [] or error (not authenticated)", async () => {
    const { data, error } = await anon().from("assumptions").select("*");
    if (error) {
      expect(error).not.toBeNull();
    } else {
      expect(data).toEqual([]);
    }
  });

  it("as e2e: assumptions -> 8 rows; lessons -> 5 rows", async () => {
    const { data: assumptions, error: assumptionsError } = await e2eClient.from("assumptions").select("*");
    expect(assumptionsError).toBeNull();
    expect(assumptions).toHaveLength(8);

    const { data: lessons, error: lessonsError } = await e2eClient.from("lessons").select("*");
    expect(lessonsError).toBeNull();
    expect(lessons).toHaveLength(5);
  });

  it("as e2e: from('organisations').select('name') -> 1 row 'Demo Co Pty Ltd'", async () => {
    const { data, error } = await e2eClient.from("organisations").select("name");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].name).toBe("Demo Co Pty Ltd");
  });

  it("as judge: rpc('org_id_for_join_code') — 'demo' (case-insensitive) -> org uuid; 'NOPE' -> null", async () => {
    const { data: demoResult, error: demoError } = await judgeClient.rpc("org_id_for_join_code", { code: "demo" });
    expect(demoError).toBeNull();
    expect(demoResult).toBe(orgId);

    const { data: nopeResult, error: nopeError } = await judgeClient.rpc("org_id_for_join_code", { code: "NOPE" });
    expect(nopeError).toBeNull();
    expect(nopeResult).toBeNull();
  });
});
