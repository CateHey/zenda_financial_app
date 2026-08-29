import { expect, test } from "@playwright/test";
import { signInDbClient } from "./db-client";

// e2e/resilience.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "resilience.spec.ts" (@smoke): with the AI
// key blank (the default — playwright.config.ts's webServer.env), every route in the D4 table
// renders its heading for e2e@; no console error-type messages during the run.
//
// Headings are the same eyebrow/title text every other spec in this suite already asserts
// (verified live against a running server): each is stable regardless of the account's exact
// numbers, so this file doesn't need a reset — it only reads.

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

const ROUTES: { path: string; heading: string | RegExp }[] = [
  { path: "/", heading: /Zenda/i },
  { path: "/discover", heading: "Getting to know you" },
  { path: "/achievable", heading: "What's achievable" },
  { path: "/prioritise", heading: "Prioritise" },
  { path: "/roadmap", heading: "Your roadmap" },
  { path: "/progress", heading: "Progress" },
  { path: "/progress/adapt", heading: "Life changed" },
];

test.describe("resilience", () => {
  test("@smoke every D4 route renders its heading for e2e@; no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    for (const route of ROUTES) {
      await page.goto(route.path);
      await expect(page.getByText(route.heading).first()).toBeVisible({ timeout: 10_000 });
    }

    // /roadmap/trade-off and /celebrate both need a valid id — read e2e's own achievable car and
    // its one seen milestone event straight from the database (RLS-scoped to this account) rather
    // than guessing one, so the route under test is exercised for real rather than skipped.
    const db = await signInDbClient(E2E_EMAIL, E2E_PASSWORD);
    const { data: goals } = await db.from("goals").select("id, kind");
    const car = goals?.find((g) => g.kind === "car");
    if (car) {
      await page.goto(`/roadmap/trade-off?goal=${car.id}`);
      // e2e's seeded car is already achievable -> redirected to /roadmap (D4); either landing is
      // a real render, not a crash.
      await expect(page.getByText(/Your roadmap|Trade-off/i).first()).toBeVisible({ timeout: 10_000 });
    }

    const { data: events } = await db.from("motivational_events").select("id, goal_id").not("goal_id", "is", null);
    const event = events?.[0];
    if (event) {
      await page.goto(`/celebrate?event=${event.id}`);
      await expect(page.getByText(/Milestone|Your roadmap/i).first()).toBeVisible({ timeout: 10_000 });
    }

    // /admin as a non-admin redirects to /roadmap (still a real render, D4).
    await page.goto("/admin");
    await expect(page.getByText("Your roadmap")).toBeVisible({ timeout: 10_000 });

    expect(consoleErrors, `console errors during the resilience run:\n${consoleErrors.join("\n")}`).toEqual([]);
  });
});
