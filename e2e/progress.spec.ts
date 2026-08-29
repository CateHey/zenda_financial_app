import { execSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

// e2e/progress.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "progress.spec.ts", as e2e@ (reset
// guarantees streak 6, no check-in today). Every scenario below was verified live against a
// running server (AI key blank, DEMO_TODAY=2026-10-20) before being written, including the exact
// post-action text.
//
// A3's "one nudge maximum" rule means only one check-in (Yes / Partly / Not this time) can
// succeed per cycle for the current goal — once any of them runs, the sheet on /progress is
// replaced by "Done for this payday." for the rest of that cycle (verified live: a 2nd "Yes"
// click the same day never finds an enabled button). ZENDA_TEST_SPEC.md's own "(reset)" markers
// before scenarios 3 and 4 say as much. Since Playwright's globalSetup resets e2e@ only once for
// the whole run, each test here re-runs scripts/reset-e2e.ts itself (same pattern as
// tests/db/reset.test.ts) so every scenario starts from the same pristine "streak 6, no
// check-in today" state regardless of run order.

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

function resetE2e(): void {
  execSync("npx tsx scripts/reset-e2e.ts", { cwd: process.cwd(), stdio: "pipe" });
}

async function loginAsE2e(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
}

/** Polls a locator's text until it differs from `oldText` (a check-in's `router.refresh()` lands
 * asynchronously; no navigation occurs on /progress -> /progress, so `waitForURL` doesn't help). */
async function waitForTextChange(locator: Locator, oldText: string, timeoutMs = 10_000): Promise<void> {
  await expect(async () => {
    const text = await locator.innerText();
    expect(text).not.toBe(oldText);
  }).toPass({ timeout: timeoutMs });
}

test.describe("progress", () => {
  // Serial, not the config's default `fullyParallel`: each test resets e2e@ for itself (see the
  // file header) and a concurrent test's reset would wipe out another in-flight test's state.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(() => {
    resetE2e();
  });

  test("@smoke nudge, streak title, pct — then Yes -> Seven paydays, Done for this payday", async ({ page }) => {
    await loginAsE2e(page);
    await page.goto("/progress");
    await expect(page.getByText("$260 is ready for Peru. 12 paydays to go.")).toBeVisible();

    const streakTitle = page.getByTestId("streak-title");
    await expect(streakTitle).toHaveText("Six paydays in a row.");
    await expect(page.getByTestId("pct")).toHaveText("26");

    await page.getByRole("button", { name: "Yes" }).click();
    await waitForTextChange(streakTitle, "Six paydays in a row.");
    await expect(streakTitle).toHaveText("Seven paydays in a row.");
    await expect(page.getByText("Done for this payday.")).toBeVisible();
  });

  test("Partly 100 -> save -> streak 7; roadmap shows $1,140 saved", async ({ page }) => {
    await loginAsE2e(page);
    await page.goto("/progress");
    const streakTitle = page.getByTestId("streak-title");
    await expect(streakTitle).toHaveText("Six paydays in a row.");

    await page.getByRole("button", { name: "Partly" }).click();
    await page.getByLabel("Amount").fill("100");
    await page.getByRole("button", { name: "Save" }).click();
    await waitForTextChange(streakTitle, "Six paydays in a row.");
    await expect(streakTitle).toHaveText("Seven paydays in a row.");

    await page.goto("/roadmap");
    await expect(page.getByText("$1,140 saved", { exact: false })).toBeVisible();
  });

  test("Not this time -> Your first payday (streak 0), done state", async ({ page }) => {
    await loginAsE2e(page);
    await page.goto("/progress");
    const streakTitle = page.getByTestId("streak-title");
    await expect(streakTitle).toHaveText("Six paydays in a row.");

    await page.getByRole("button", { name: "Not this time" }).click();
    await waitForTextChange(streakTitle, "Six paydays in a row.");
    await expect(streakTitle).toHaveText("Your first payday.");
    await expect(page.getByText("Done for this payday.")).toBeVisible();
  });
});
