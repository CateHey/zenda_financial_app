import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

// e2e/roadmap.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "roadmap.spec.ts" (@smoke), as e2e@.
//
// T2 corrections over T1's version (ZENDA_TEST_SPEC.md's addendum + this session's own live
// verification against a running server — see the report for the full derivation):
//  - The priority chip joins *kind labels* (app/roadmap/page.tsx's own documented choice,
//    ZENDA_SCREEN_BINDINGS.md's rule overriding the design mockup's literal "Peru"): "Priority
//    Home › Car › Travel", not "...Peru". T1 kept a spec-literal test asserting the mockup text,
//    which never passes against the real app — replaced with the correct assertion.
//  - Tags: three "On track" (Peru, the emergency fund, the $25k car), one "Adjusted" (home) — the
//    seeded car is already the $25k version (achievable), not "On track" x2 as T1 had it.
//  - Node months: verified live against `next start` (AI key blank, DEMO_TODAY=2026-10-20) that
//    a non-growth node's eyebrow renders `monthYearLabel(goal.target_date)` (app/roadmap/page.tsx),
//    NOT the projection's completion_month — so Peru's target_date (2027-01-10) gives "January
//    2027", the emergency fund's target_date (2027-03-07) gives "March 2027", and the car's
//    target_date (2029-01-14) gives "January 2029". (The completion-month-derived "April 2027" /
//    "February 2029" figures are real too, but they're what the *What-if* sentence and the Adapt
//    screen's before/after table show for these goals — not the roadmap node eyebrow itself.)
//  - The what-if slider is driven to $350 (not $300): 9 ArrowRight presses of the $10 step from
//    the $260 default. Verified live: "At $350 a week: Peru in December, The car, no loan in June
//    2028." At $300 (5 presses back), Peru's own completion month doesn't change (monthly
//    granularity — A2) — the sentence still says "January", not the mockup's "$300 → December"
//    (ZENDA_TEST_SPEC.md is explicit: do not assert that mockup line).
//  - `data-testid="pct"` (added this session on the current-goal progress bar fill,
//    app/roadmap/page.tsx) replaces the old `div[style*="width: 26%"]` selector, which is
//    genuinely flaky: a hard `page.reload()` serves React's raw SSR style string
//    (`width:26%;height:6px;...`, no spaces), while a client-side navigation's *live* DOM
//    attribute is browser-renormalized with spaces and rgb() — `div[style*="width: 26%"]`
//    (with a space) only matches the second form. Verified both forms live; the testid sidesteps
//    the whole issue.

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

test.describe("roadmap", () => {
  // Guarantees a pristine e2e@ regardless of what ran before this file in the global test order
  // (playwright.config.ts's `workers: 1` serialises every test, but doesn't order *files* —
  // progress.spec.ts and adapt.spec.ts both mutate e2e@'s numbers) — every assertion below is a
  // specific stored figure ($260, 26%, $1,040, 12 paydays, the exact tags), so this file can't
  // rely on whatever state a previous file left behind the way a state-independent file
  // (resilience.spec.ts, responsive.spec.ts) safely can.
  test.beforeAll(() => {
    execSync("npx tsx scripts/reset-e2e.ts", { cwd: process.cwd(), stdio: "pipe" });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
  });

  test("@smoke header chips: priority order (kind labels) and this week's allocation", async ({ page }) => {
    await expect(page.getByText("Priority Home › Car › Travel")).toBeVisible();
    await expect(page.getByText("This week $260 → Peru")).toBeVisible();
  });

  test("@smoke current card: pct bar 26%, $1,040 saved, 12 paydays", async ({ page }) => {
    await expect(page.getByTestId("pct")).toHaveAttribute("style", /width:\s?26%/);
    await expect(page.getByText("$1,040 saved", { exact: false })).toBeVisible();
    await expect(page.getByText("12 paydays")).toBeVisible();
  });

  test("tags: On track x3 (Peru, emergency fund, the $25k car), Adjusted x1 (home); node months", async ({ page }) => {
    await expect(page.getByText("January 2027 · Travel")).toBeVisible();
    await expect(page.getByText("March 2027 · Emergency")).toBeVisible();
    await expect(page.getByText("January 2029 · Car")).toBeVisible();

    const carCard = page.getByText("The car, no loan", { exact: true }).locator("xpath=../..");
    await expect(carCard.getByText("On track", { exact: true })).toBeVisible();

    const homeCard = page.getByText("A first home", { exact: true }).locator("xpath=../..");
    await expect(homeCard.getByText("Adjusted", { exact: true })).toBeVisible();

    await expect(page.getByText("On track", { exact: true })).toHaveCount(3);
    await expect(page.getByText("Adjusted", { exact: true })).toHaveCount(1);
  });

  test("@smoke what-if slider -> $350 gives December / June 2028; $300 still says January; reload resets to $260 (never persisted)", async ({ page }) => {
    await expect(page.getByTestId("engine-value")).toContainText("$260");

    // Real keyboard interaction (not a scripted `el.value =`) — React tracks the native input
    // value setter, so a JS-only assignment is silently swallowed; ArrowRight is a genuine
    // browser-level step increment (step = $10 = 1,000 cents) that both DOM and React see.
    const slider = page.getByRole("slider", { name: "Weekly savings amount" });
    await slider.focus();
    for (let i = 0; i < 9; i++) await slider.press("ArrowRight"); // $260 -> $350

    await expect(page.getByTestId("engine-value")).toContainText("$350");
    const sentence = page.getByTestId("whatif-sentence");
    await expect(sentence).toContainText("December");
    await expect(sentence).toContainText("June 2028");

    for (let i = 0; i < 5; i++) await slider.press("ArrowLeft"); // $350 -> $300
    await expect(page.getByTestId("engine-value")).toContainText("$300");
    // Monthly granularity (A2): Peru's completion month doesn't move between $260 and $340/wk,
    // so the sentence still says "January" at $300 — not the mockup's "$300 -> December".
    await expect(sentence).toContainText("January");

    await page.reload();
    await expect(page.getByTestId("engine-value")).toContainText("$260");
  });

  test("@smoke disclaimer text present at the bottom", async ({ page }) => {
    await expect(page.getByText(/Zenda gives general information, not personal financial advice\./)).toBeVisible();
  });
});
