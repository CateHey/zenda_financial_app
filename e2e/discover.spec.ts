import { expect, test, type Page } from "@playwright/test";

// e2e/discover.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "discover.spec.ts". Run against a fresh
// signup (D8: judge@ is meant to stay the "shows onboarding" account for the live demo, and
// nothing resets it between runs — a self-contained UI signup keeps this test from leaving
// permanent goals on a shared account; e2e@ is reserved for the seeded-persona specs).
//
// GAP: step 1 ("engine box reads $260 / week live") names `data-testid="engine-value"`. That
// hook exists on the Roadmap what-if slider (app/roadmap/what-if.tsx) but not on Discover's own
// engine box (app/discover/discover-client.tsx) — this session cannot add one there (file
// ownership: app/ non-test files aren't ours to touch). Asserted via visible text instead.

async function signUpFresh(page: Page, displayName: string): Promise<string> {
  const email = `e2e-fresh-${Date.now()}-${Math.floor(Math.random() * 10_000)}@demo.zenda.app`;
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("TestPass123!");
  await page.getByLabel("Company code").fill("DEMO");
  await page.getByRole("button", { name: "Start your journey" }).click();
  await expect(page).toHaveURL(/\/discover$/, { timeout: 15_000 });
  return email;
}

async function fillTodayNumbers(page: Page) {
  await page.getByLabel("Income").fill("1100");
  await page.getByLabel("Rent").fill("400");
  await page.getByLabel("Food").fill("120");
  await page.getByLabel("Petrol · internet").fill("70");
  await page.getByLabel("Fun").fill("250");
  await page.getByLabel("Buffer").fill("100");
  await page.getByLabel("Savings").fill("0");
  // The "Debt" label implicitly associates with only the first (amount) input in that row
  // (HTML: a <label> without `for` associates its *first* descendant control); the rate input
  // has no label of its own, so it's selected structurally (it's the only step="0.1" input).
  await page.getByLabel("Debt").fill("30000");
  await page.locator('input[step="0.1"]').fill("2.8");
}

test.describe("discover", () => {
  test("freedom text + today's numbers drive a live engine box; travel chip; submit -> /achievable", async ({ page }) => {
    await signUpFresh(page, "Fresh Discover");

    await page.getByPlaceholder("Tell us in your words…").fill("A place to breathe, a place to grow.");
    await fillTodayNumbers(page);

    // Live: $1,100 - ($400+$120+$70) - $250 = $260/wk capacity (buffer counted back in, D6 §1).
    await expect(page.locator("body")).toContainText("$260");
    await expect(page.locator("body")).toContainText("/ week");

    await page.getByRole("button", { name: "Travel", exact: true }).click();
    // The chip now carries its default amount (A6: Travel -> "A trip", $4,000, +4 months).
    await expect(page.getByRole("button", { name: /A trip · \$4k/ })).toBeVisible();

    await page.getByRole("button", { name: "See what's achievable" }).click();
    await expect(page).toHaveURL(/\/achievable$/, { timeout: 15_000 });

    await expect(page.getByText("Travel · A trip")).toBeVisible();
    await expect(page.getByText("Breathing room")).toBeVisible();
    await expect(page.getByText("Emergency fund")).toBeVisible();

    const travelRow = page.getByText("Travel · A trip", { exact: true }).locator("xpath=..");
    await expect(travelRow.getByText("On track")).toBeVisible();
  });

  test("submitting with no chip selected shows the inline error and does not navigate", async ({ page }) => {
    await signUpFresh(page, "No Chip");
    await fillTodayNumbers(page);

    await page.getByRole("button", { name: "See what's achievable" }).click();
    await expect(page.getByText("Pick at least one place to go.")).toBeVisible();
    await expect(page).toHaveURL(/\/discover$/);
  });
});
