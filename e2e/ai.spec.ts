import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { findBannedTerms } from "../lib/ai/banned-terms";

// e2e/ai.spec.ts — ZENDA_TEST_SPEC.md "T-AI — the one AI verification" (manual-trigger).
//
// This is the *only* place in the whole test suite that is allowed to call the real Anthropic
// API, and it only does so when a human explicitly opts in: `test.skip(!process.env.RUN_AI)`
// below turns every test in this file into a no-op unless RUN_AI is set. The task's exact
// command for the owner to run this once:
//
//   RUN_AI=1 npm run test:e2e -- ai
//
// Operational note, checked against node_modules/playwright/lib/runner/index.js: webServer spawns
// `npm run dev` with `env: { ...process.env, ...webServer.env }` — playwright.config.ts's own
// webServer.env (which hard-codes `ANTHROPIC_API_KEY: ""`, by design — D12: "the templates path
// is what's demoed") is spread LAST and wins, so merely exporting a real key in the parent shell
// is not enough to reach the `next dev` this config launches. That config is owned by a parallel
// session (T1/T2), not this one, so making this file's real key actually reach the server (e.g.
// temporarily clearing that one line, or pointing E2E_BASE_URL at a separately-started `next dev`
// that already has the real key — mind `reuseExistingServer: false`, which still tries to bind
// :3000 either way) is the owner's call at run time, not something wired here.

// The same fallback shape lib/data/templates.ts's templateWhy always produces (mirrored from
// lib/data/templates.test.ts's WHY_PATTERN — kept local rather than imported since that file is
// a *.test.ts this session doesn't own and could change shape independently). A `why` that does
// NOT match this is, by construction, not the untouched template — i.e. the AI upgrade landed.
const WHY_PATTERN =
  /^\$[\d,]+ by [A-Za-z]+ \d{4}\. At \$[\d,]+\/week that lands (on time|in [A-Za-z]+ \d{4}|later than planned)\.$/;

const SIGNUP_PASSWORD = "TestPass123!";

/** Reads exactly the two public Supabase env names from .env.local, the same allow-listed
 * pattern tests/db/env.ts uses for layer 2 — never read or printed beyond that. Playwright's own
 * test process doesn't inherit `next dev`'s env loading, so this file needs its own copy to build
 * the "layer-2 style anon client" the task calls for. */
function loadPublicSupabaseEnv(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const allowed = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!allowed.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function signUpFresh(page: Page, displayName: string): Promise<{ email: string; password: string }> {
  const email = `e2e-fresh-${Date.now()}-${Math.floor(Math.random() * 10_000)}@demo.zenda.app`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(SIGNUP_PASSWORD);
  await page.getByLabel("Company code").fill("DEMO");
  await page.getByRole("button", { name: "Start your journey" }).click();
  await expect(page).toHaveURL(/\/discover$/, { timeout: 15_000 });
  return { email, password: SIGNUP_PASSWORD };
}

/** Vinuy's numbers (ZENDA_BUILD_SPEC.md D8): weekly take-home $1,100, essentials $590 (rent 400
 * + food 120 + petrol/internet 70), lifestyle $250, buffer $100, savings $0, debt $30,000 at
 * 2.8%. Plus the Travel chip (A6 default: "A trip", $4,000, +4 months) — the task's "Vinuy's
 * numbers and the Travel chip". */
async function completeDiscoverWithVinuysNumbersAndTravel(page: Page): Promise<void> {
  await page.getByPlaceholder("Tell us in your words…").fill("And Peru in January.");
  await page.getByLabel("Income").fill("1100");
  await page.getByLabel("Rent").fill("400");
  await page.getByLabel("Food").fill("120");
  await page.getByLabel("Petrol · internet").fill("70");
  await page.getByLabel("Fun").fill("250");
  await page.getByLabel("Buffer").fill("100");
  await page.getByLabel("Savings").fill("0");
  await page.getByLabel("Debt").fill("30000");
  await page.locator('input[step="0.1"]').fill("2.8");

  await page.getByRole("button", { name: "Travel", exact: true }).click();
  await expect(page.getByRole("button", { name: /A trip · \$4k/ })).toBeVisible();

  await page.getByRole("button", { name: "See what's achievable" }).click();
  await expect(page).toHaveURL(/\/achievable$/, { timeout: 15_000 });
}

/** Signs in as `email` on a fresh anon-key client (tests/db/clients.ts's pattern, self-contained
 * here since this file runs under Playwright, not Vitest) and polls `goals.why` for up to 20s
 * (T-AI) until at least one row's `why` no longer matches the fallback template shape — i.e. the
 * D7 call 2 AI upgrade has landed via after(). Returns every `why` seen that differs from the
 * template on the last poll. */
async function pollForUpgradedWhys(email: string, password: string): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set (.env.local) — T-AI needs a real Supabase project to poll.",
    );
  }

  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`T-AI poll: sign-in failed for ${email}: ${signInError.message}`);

  const deadline = Date.now() + 20_000;
  let upgraded: string[] = [];
  do {
    const { data, error } = await client.from("goals").select("why");
    if (error) throw new Error(`T-AI poll: goals read failed: ${error.message}`);
    const whys = (data ?? []).map((g) => g.why as string | null).filter((w): w is string => Boolean(w));
    upgraded = whys.filter((w) => !WHY_PATTERN.test(w));
    if (upgraded.length > 0) break;
    await new Promise((r) => setTimeout(r, 1_000));
  } while (Date.now() < deadline);

  return upgraded;
}

test.describe("T-AI — AI upgrade verification (manual-trigger, costs money)", () => {
  test("fresh signup, Discover with Vinuy's numbers + Travel -> goals.why upgrades within 20s and is clean", async ({
    page,
  }) => {
    test.skip(!process.env.RUN_AI, "RUN_AI not set — this test calls the real Anthropic API and costs money.");

    loadPublicSupabaseEnv();

    const { email, password } = await signUpFresh(page, "AI E2E");
    await completeDiscoverWithVinuysNumbersAndTravel(page);

    const upgraded = await pollForUpgradedWhys(email, password);

    expect(upgraded.length).toBeGreaterThan(0);
    for (const why of upgraded) {
      expect(findBannedTerms(why)).toEqual([]);
    }
  });
});
