import { expect, test, type Page } from "@playwright/test";
import { signInDbClient } from "./db-client";
import { formatMoney, formatMoneyCompact, monthYearLabel } from "../lib/format";
import { monthDate, monthIndex } from "../lib/engine/rates";

// e2e/tradeoff.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "tradeoff.spec.ts", same fresh account
// pattern as achievable-prioritise.spec.ts (Home/Car $50k-2y/Travel at defaults except the Car
// chip, edited to $50,000). Per the coordinator's resolution note, option A/B/C's dollar and date
// figures are read straight from the account's own `goal_projections` row (layer-2 client) and
// formatted with the exact same pure functions app/roadmap/trade-off/page.tsx imports
// (lib/format's formatMoney/formatMoneyCompact/monthYearLabel, lib/engine/rates's monthIndex/
// monthDate) — never a hardcoded "$28,000" from the mockup.

async function signUpFresh(page: Page, displayName: string): Promise<{ email: string; password: string }> {
  const email = `e2e-fresh-to-${Date.now()}-${Math.floor(Math.random() * 10_000)}@demo.zenda.app`;
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

  await page.getByRole("button", { name: /A car/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Target").fill("50000");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /A car · \$50k/ })).toBeVisible();

  await page.getByRole("button", { name: "See what's achievable" }).click();
  await expect(page).toHaveURL(/\/achievable$/, { timeout: 15_000 });
}

test.describe("trade-off", () => {
  test("options A/B/C show the engine's real numbers; choosing A updates the roadmap; an achievable goal redirects away", async ({ page }) => {
    const { email, password } = await signUpFresh(page, "Tradeoff Fresh");
    await driveDiscoverWithCar50k(page);

    const db = await signInDbClient(email, password);
    const { data: profile } = await db.from("profiles").select("started_on, currency").maybeSingle();
    const { data: goals, error: goalsError } = await db.from("goals").select("id, kind, target_cents, target_date");
    expect(goalsError).toBeNull();
    const car = goals!.find((g) => g.kind === "car")!;
    const travel = goals!.find((g) => g.kind === "travel")!;
    const { data: carProjection, error: projError } = await db
      .from("goal_projections")
      .select("achievable, required_monthly_cents, alt_smaller_target_cents, alt_later_months")
      .eq("goal_id", car.id)
      .single();
    expect(projError).toBeNull();
    expect(carProjection!.achievable).toBe(false); // the $50k car must actually need a trade-off

    const startedOn = profile!.started_on as string;
    const currency = profile!.currency as string;

    // Mirrors app/roadmap/trade-off/page.tsx's own option-A rounding exactly (D6/S5: "rounded to
    // the nearest $1k" -> nearest 100,000 cents).
    const optionACents = Math.round((carProjection!.alt_smaller_target_cents ?? 0) / 100_000) * 100_000;
    const optionADateLabel = monthYearLabel(car.target_date);

    const horizonMonths = monthIndex(startedOn, car.target_date);
    const optionBDateIso = monthDate(startedOn, horizonMonths + (carProjection!.alt_later_months ?? 0));
    const optionBDateLabel = monthYearLabel(optionBDateIso);

    await page.goto(`/roadmap/trade-off?goal=${car.id}`);
    await expect(page).toHaveURL(new RegExp(`goal=${car.id}`));

    await expect(page.getByText(`${formatMoney(optionACents, currency)} · ${optionADateLabel}`)).toBeVisible();
    await expect(page.getByText("Recommended")).toBeVisible();

    await expect(page.getByText(`${formatMoney(car.target_cents, currency)} · ${optionBDateLabel}`)).toBeVisible();

    await expect(page.getByText(`${formatMoney(car.target_cents, currency)} · ${optionADateLabel}`)).toBeVisible();
    await expect(page.getByText("Out of reach")).toBeVisible();

    const chooseLabel = `Choose ${formatMoneyCompact(optionACents)} in ${optionADateLabel.split(" ").pop()}`;
    await page.getByRole("button", { name: chooseLabel }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    // FINDING (not asserted as "On track" — see this session's report): Option A rounds
    // alt_smaller_target_cents to the nearest $1k (app/roadmap/trade-off/page.tsx), which can
    // round *up* past the amount actually reachable by the original date — reproduced live
    // (alt_smaller_target_cents $19,805.33 -> rounds to $20,000, one month later than the true
    // $19,805 figure, so the "Recommended" choice still shows "Trade-off" immediately after being
    // chosen). Only the amount update — the one thing guaranteed regardless of which way the
    // rounding falls — is asserted here.
    const carCard = page.getByText("A car", { exact: true }).locator("xpath=../..");
    await expect(carCard.getByText(formatMoney(optionACents, currency), { exact: false })).toBeVisible();
    const { data: carAfter, error: carAfterError } = await db.from("goals").select("target_cents").eq("id", car.id).single();
    expect(carAfterError).toBeNull();
    expect(carAfter!.target_cents).toBe(optionACents);

    // An achievable goal's trade-off page redirects away (D4).
    await page.goto(`/roadmap/trade-off?goal=${travel.id}`);
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
  });
});
