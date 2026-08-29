import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { signInDbClient } from "./db-client";

// e2e/adapt.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "adapt.spec.ts", as e2e@.
//
// Substitution (engine-derived, not the mockup's "Rent 400 -> 440"): the numbers sheet on
// /progress/adapt (app/progress/adapt/adapt-client.tsx) prefills its single "Rent" row from
// `profile.essentials_cents` — the *combined* rent+food+petrol figure the schema actually stores
// (ZENDA_SCREEN_BINDINGS.md S1's own "Decision": those three inputs collapse into one column) —
// not just the $400 rent component, because the other two inputs (Food, Petrol) start blank with
// no way to recover their original split. e2e's essentials_cents is $590, so filling "Rent" with
// "440" is a *decrease* to $440 (down $150), not an increase. Filling it with "630" ($590+$40)
// reproduces exactly the spec's intended scenario — a $40 increase — and was verified live to
// give the exact copy the spec names: title "Rent went up $40.", sub "engine is now $220". Filed
// as a finding (T2 report): AdaptClient's and DiscoverClient's Rent field can't actually
// represent "just rent" once a combined essentials_cents already exists.
//
// Each test resets e2e@ for itself (same reasoning as progress.spec.ts — a profile edit here
// persists, so the next test needs its own pristine copy) and runs serially for the same reason.

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

function resetE2e(): void {
  execSync("npx tsx scripts/reset-e2e.ts", { cwd: process.cwd(), stdio: "pipe" });
}

test.describe("adapt", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    resetE2e();
  });

  test("Rent up $40 -> title, sub, before/after table, deposit line", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    await page.goto("/progress/adapt");
    await expect(page.getByText("What changed?")).toBeVisible();

    await page.getByLabel("Rent").fill("630"); // $590 (stored essentials_cents) + $40
    await expect(page.getByText("Rent went up $40.")).toBeVisible();
    await expect(page.getByText("engine is now $220", { exact: false })).toBeVisible();

    const table = page.locator("body");
    await expect(table).toContainText("January 2027");
    await expect(table).toContainText("February 2027");
    await expect(table).toContainText("Deposit by 2033");
    await expect(table).toContainText("$76.4k");
  });

  test("Accept the new path -> /roadmap \"$220 -> Peru\"; an adapted event exists", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    await page.goto("/progress/adapt");
    await page.getByLabel("Rent").fill("630");
    await page.getByRole("button", { name: "Accept the new path" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
    await expect(page.getByText("This week $220 → Peru")).toBeVisible();

    const db = await signInDbClient(E2E_EMAIL, E2E_PASSWORD);
    const { data, error } = await db.from("motivational_events").select("id").eq("kind", "adapted");
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });

  test("Trim fun, keep the dates -> /roadmap still \"$260 -> Peru\"; Fun now 210 on /progress/adapt", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    await page.goto("/progress/adapt");
    await page.getByLabel("Rent").fill("630");
    await page.getByRole("button", { name: "Trim fun, keep the dates" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
    await expect(page.getByText("This week $260 → Peru")).toBeVisible();

    await page.goto("/progress/adapt");
    await expect(page.getByLabel("Fun")).toHaveValue("210");
  });
});
