import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// e2e/api.spec.ts — ZENDA_TEST_SPEC.md Layer 3, "API through the browser session": after UI login
// as e2e@, `page.request` (carries the session cookies) hits the routes directly.
//
// The spec names "judge's goal id (from tests/fixtures/ids.json...)" for the RLS-hidden-goal 404
// case. Per the coordinator's instruction this session also reset judge@ to zero goals (the D8
// "fresh account" state), so tests/fixtures/ids.json no longer carries a judge goal id to
// reference — layer 2's rls.test.ts already proves the RLS-hidden case thoroughly (insert/update/
// select against another user's row). A syntactically valid but non-existent goal id exercises
// the exact same "not found or not owned" 404 branch in app/api/checkin/route.ts.
//
// Disclaimer coverage: only checked on the two routes whose 200 response actually includes one
// (app/api/goals/[id]/adjust/route.ts) — /api/adapt's 200 response does not include a disclaimer
// field despite redrawing every projection (app/api/adapt/route.ts returns only `{ ok, redirect
// }`), a finding noted in this session's report rather than asserted as if it were there.

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

function readE2eCarGoalId(): string {
  const path = resolve(process.cwd(), "tests", "fixtures", "ids.json");
  const ids = JSON.parse(readFileSync(path, "utf8")) as { e2eGoalIdsByKind: Record<string, string> };
  const carId = ids.e2eGoalIdsByKind.car;
  if (!carId) throw new Error("tests/fixtures/ids.json has no e2e car goal id — run npm run reset:e2e first.");
  return carId;
}

test.describe("api (layer 3)", () => {
  test("POST /api/checkin with {} -> 400, error: \"validation\"", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    const response = await page.request.post("/api/checkin", { data: {} });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("validation");
  });

  test("POST /api/checkin with a goal id that isn't the caller's -> 404", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    const response = await page.request.post("/api/checkin", {
      data: { goal_id: randomUUID(), kind: "full" },
    });
    expect(response.status()).toBe(404);
  });

  test("POST /api/goals/<own car id>/adjust {target_cents} -> 200, redirect /roadmap, disclaimer present", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    const carId = readE2eCarGoalId();
    // e2e's seeded car is already $25,000 (2_500_000 cents) — sending the same value back is a
    // no-op adjust that still exercises the full route (update + trade_off event + recompute)
    // without disturbing any other spec's assumptions about e2e's numbers.
    const response = await page.request.post(`/api/goals/${carId}/adjust`, {
      data: { target_cents: 2_500_000 },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/roadmap");
    expect(typeof body.disclaimer).toBe("string");
    expect(body.disclaimer.length).toBeGreaterThan(0);
  });

  test("POST /api/adapt with strategy accept and the current numbers -> 200", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    // e2e's own seeded numbers (scripts/reset-e2e.ts) — a no-op adapt (same numbers -> same
    // engine), still exercises the full route.
    const response = await page.request.post("/api/adapt", {
      data: {
        pay_cycle: "weekly",
        take_home_cents: 110_000,
        essentials_cents: 59_000,
        lifestyle_cents: 25_000,
        buffer_cents: 10_000,
        savings_cents: 0,
        debt_cents: 3_000_000,
        debt_rate_bps: 280,
        risk_comfort: "high",
        strategy: "accept",
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  test("logged out: POST /api/checkin with a valid body -> 401", async ({ request }) => {
    // The `request` fixture is a fresh APIRequestContext with no cookies from any `page` in this
    // file — genuinely logged out, unlike `page.request` after a prior login in the same test.
    const response = await request.post("/api/checkin", {
      data: { goal_id: randomUUID(), kind: "full" },
    });
    expect(response.status()).toBe(401);
  });
});
