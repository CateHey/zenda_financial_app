import { expect, test, type Page } from "@playwright/test";
import { signInDbClient } from "./db-client";
import { formatMoney, weeklyFromMonthlyCents } from "../lib/format";

// e2e/achievable-prioritise.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "achievable-prioritise.spec.ts",
// as a fresh account with Home/Car/Travel at defaults — except the Car chip, which is edited via
// its detail sheet (A6) to target $50,000/+2y so it lands non-achievable ("Needs a trade-off"),
// per the coordinator's resolution note: Discover's Car chip default is $25,000/+2y (A6), which
// is already achievable for a $260/wk engine — $50k never appears unless a test puts it there.
//
// The "needs $X / wk" figures are never hardcoded: app/achievable/page.tsx renders
// `weeklyFromMonthlyCents(projection.required_monthly_cents)` for both the car and the (growth_
// required) home goal, and `required_monthly_cents` depends on each goal's own waterfall start
// month (the house starts after the car finishes, so its figure is larger than a from-month-0
// calculation would give) — so this spec signs in as the fresh account on a second, DB-scoped
// client (tests/db/clients.ts's pattern, layer-2 style) right after Discover submits, reads the
// real `goal_projections` row, and asserts the UI shows exactly that number formatted the way the
// page does (same lib/format functions the page itself imports).

async function signUpFresh(page: Page, displayName: string): Promise<{ email: string; password: string }> {
  const email = `e2e-fresh-ap-${Date.now()}-${Math.floor(Math.random() * 10_000)}@demo.zenda.app`;
  const password = "TestPass123!";
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel("Company code").fill("DEMO");
  await page.getByRole("button", { name: "Start your journey" }).click();
  await expect(page).toHaveURL(/\/discover$/, { timeout: 15_000 });
  return { email, password };
}

async function driveDiscoverWithCar50k(page: Page): Promise<void> {
  await page.getByPlaceholder("Tell us in your words…").fill("A place to breathe, a place to grow.");
  await page.getByLabel("Income").fill("1100");
  await page.getByLabel("Rent").fill("400");
  await page.getByLabel("Food").fill("120");
  await page.getByLabel("Petrol · internet").fill("70");
  await page.getByLabel("Fun").fill("250");
  await page.getByLabel("Buffer").fill("100");
  await page.getByLabel("Savings").fill("0");
  await page.getByLabel("Debt").fill("30000");
  await page.locator('input[step="0.1"]').fill("2.8");

  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Car", exact: true }).click();
  await page.getByRole("button", { name: "Travel", exact: true }).click();

  // 2nd click on the now-selected Car chip opens its A6 detail sheet; edit Target to $50,000
  // (keep the default +2y "by" date).
  await page.getByRole("button", { name: /A car/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Target").fill("50000");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /A car · \$50k/ })).toBeVisible();
}

test.describe("achievable-prioritise", () => {
  test("/achievable: Travel On track; Car Needs a trade-off; Home Adjusted (engine-derived weekly figures)", async ({ page }) => {
    const { email, password } = await signUpFresh(page, "Achievable Fresh");
    await driveDiscoverWithCar50k(page);

    await page.getByRole("button", { name: "See what's achievable" }).click();
    await expect(page).toHaveURL(/\/achievable$/, { timeout: 15_000 });

    const travelRow = page.getByText("Travel · A trip", { exact: true }).locator("xpath=../..");
    await expect(travelRow.getByText("On track", { exact: true })).toBeVisible();

    const carRow = page.getByText("Car · A car", { exact: true }).locator("xpath=../..");
    await expect(carRow.getByText("Needs a trade-off", { exact: true })).toBeVisible();

    const homeRow = page.getByText("Home · A first home", { exact: true }).locator("xpath=../..");
    await expect(homeRow.getByText("Adjusted", { exact: true })).toBeVisible();

    const db = await signInDbClient(email, password);
    const { data: goals, error: goalsError } = await db.from("goals").select("id, kind");
    expect(goalsError).toBeNull();
    const { data: profile } = await db.from("profiles").select("currency").maybeSingle();
    const currency = profile?.currency ?? "AUD";

    const car = goals!.find((g) => g.kind === "car")!;
    const home = goals!.find((g) => g.kind === "home")!;
    const { data: projections, error: projError } = await db
      .from("goal_projections")
      .select("goal_id, required_monthly_cents")
      .in("goal_id", [car.id, home.id]);
    expect(projError).toBeNull();
    const carProjection = projections!.find((p) => p.goal_id === car.id)!;
    const homeProjection = projections!.find((p) => p.goal_id === home.id)!;

    const carWeekly = formatMoney(weeklyFromMonthlyCents(carProjection.required_monthly_cents), currency);
    const homeWeekly = formatMoney(weeklyFromMonthlyCents(homeProjection.required_monthly_cents), currency);

    await expect(carRow.getByText(`needs ${carWeekly} / wk`)).toBeVisible();
    await expect(homeRow.getByText(`needs ${homeWeekly} / wk`)).toBeVisible();
  });

  test("/prioritise: move Car above Home persists across reload; /roadmap title begins with the car's title", async ({ page }) => {
    await signUpFresh(page, "Prioritise Fresh");
    await driveDiscoverWithCar50k(page);
    await page.getByRole("button", { name: "See what's achievable" }).click();
    await expect(page).toHaveURL(/\/achievable$/, { timeout: 15_000 });

    await page.getByRole("link", { name: "Prioritise my goals" }).click();
    await expect(page).toHaveURL(/\/prioritise$/, { timeout: 15_000 });

    await page.getByRole("button", { name: /Move A car up/ }).click();
    await page.getByRole("button", { name: "Build my roadmap" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    await page.goto("/prioritise");
    // Rank badges are plain numbers (not uniquely selectable), so persistence is asserted via
    // document order: the car's card must appear before the home card in the reloaded DOM.
    const bodyText = await page.locator("body").innerText();
    const carIndex = bodyText.indexOf("A car");
    const homeIndex = bodyText.indexOf("A first home");
    expect(carIndex).toBeGreaterThan(-1);
    expect(homeIndex).toBeGreaterThan(-1);
    expect(carIndex).toBeLessThan(homeIndex);

    await page.goto("/roadmap");
    await expect(page.getByText(/^A car,/)).toBeVisible();
  });
});
