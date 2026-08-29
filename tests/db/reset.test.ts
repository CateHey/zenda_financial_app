// tests/db/reset.test.ts — ZENDA_TEST_SPEC.md Layer 2, "reset.test.ts". Mutates e2e's data, runs
// scripts/reset-e2e.ts via execSync, then proves the seed-state counts hold again and the
// mutation is gone.

import { execSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { E2E_EMAIL, currentUserId, hasDbEnv, signIn } from "./clients";

const envReady = hasDbEnv();
if (!envReady) {
  console.warn("tests/db/reset.test.ts: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipping layer 2.");
}

const STRAY_DATE = "1999-01-01"; // outside the seed's contribution dates — unambiguous marker

describe.skipIf(!envReady)("reset script — e2e (layer 2)", () => {
  let e2e: SupabaseClient;

  beforeAll(async () => {
    e2e = await signIn(E2E_EMAIL);
  });

  it(
    "a contribution inserted before the reset is gone after it; seed counts hold again",
    async () => {
      // 1. Mutate: insert a stray contribution against one of e2e's own goals.
      const e2eUserId = await currentUserId(e2e);
      const { data: goalRows, error: goalError } = await e2e.from("goals").select("id").limit(1);
      expect(goalError).toBeNull();
      expect(goalRows!.length).toBeGreaterThan(0);
      const goalId = goalRows![0].id as string;

      const { error: insertError } = await e2e.from("contributions").insert({
        user_id: e2eUserId,
        goal_id: goalId,
        amount_cents: 1,
        occurred_on: STRAY_DATE,
        kind: "manual",
      });
      expect(insertError).toBeNull();

      const { data: beforeReset } = await e2e.from("contributions").select("id").eq("occurred_on", STRAY_DATE);
      expect(beforeReset!.length).toBeGreaterThan(0);

      // 2. Run the reset script for real (service role; reads .env.local itself).
      execSync("npx tsx scripts/reset-e2e.ts", { cwd: process.cwd(), stdio: "pipe" });

      // 3. Re-sign-in (the reset re-creates the profile row; the auth user/password is unchanged).
      e2e = await signIn(E2E_EMAIL);

      const { data: goalsAfter, error: goalsAfterError } = await e2e.from("goals").select("id");
      expect(goalsAfterError).toBeNull();
      expect(goalsAfter).toHaveLength(5);

      const { data: contributionsAfter, error: contribAfterError } = await e2e.from("contributions").select("id, occurred_on");
      expect(contribAfterError).toBeNull();
      expect(contributionsAfter).toHaveLength(6);
      expect(contributionsAfter!.some((c) => c.occurred_on === STRAY_DATE)).toBe(false);

      const { data: projectionsAfter, error: projAfterError } = await e2e.from("goal_projections").select("goal_id");
      expect(projAfterError).toBeNull();
      expect(projectionsAfter).toHaveLength(5);
    },
    60_000,
  );
});
