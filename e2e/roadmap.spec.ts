import { expect, test } from "@playwright/test";

// e2e/roadmap.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "roadmap.spec.ts" (@smoke), as e2e@.
//
// GAP: the spec's selector preamble names a `pct` testid for the progress-bar width; no such
// hook exists on app/roadmap/page.tsx (this session cannot add one — file ownership). Selected
// structurally instead via the bar's inline `width: 26%` style, noted as the wanted hook.

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

test.describe("roadmap", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
  });

  // Split in two: the spec (ZENDA_TEST_SPEC.md) states the priority chip reads "Priority Home ›
  // Car › Peru", but app/roadmap/page.tsx deliberately joins *kind labels*, not goal titles (its
  // own comment cites ZENDA_SCREEN_BINDINGS.md's rule overriding the raw design mockup's literal
  // "Peru") — so it renders "...Car › Travel". Kept as a separate, spec-literal assertion (see
  // this session's report) rather than silently matching the app's choice instead.
  test("@smoke header chip: priority order reads \"Priority Home › Car › Peru\" (spec-literal)", async ({ page }) => {
    await expect(page.getByText("Priority Home › Car › Peru")).toBeVisible();
  });

  test("@smoke header chip: this week's allocation", async ({ page }) => {
    await expect(page.getByText("This week $260 → Peru")).toBeVisible();
  });

  test("@smoke current card: 26% bar, $1,040 saved, 12 paydays", async ({ page }) => {
    await expect(page.locator('div[style*="width: 26%"]')).toBeVisible();
    await expect(page.getByText("$1,040 saved", { exact: false })).toBeVisible();
    await expect(page.getByText("12 paydays")).toBeVisible();
  });

  test("tags: On track x2 (Peru, car — reset's $25k car is achievable), Adjusted (home)", async ({ page }) => {
    const carCard = page.getByText("The car, no loan", { exact: true }).locator("xpath=../..");
    await expect(carCard.getByText("On track", { exact: true })).toBeVisible();

    const homeCard = page.getByText("A first home", { exact: true }).locator("xpath=../..");
    await expect(homeCard.getByText("Adjusted", { exact: true })).toBeVisible();

    await expect(page.getByText("On track", { exact: true })).toHaveCount(2);
  });

  test("@smoke what-if slider -> live sentence; reload resets to $260 (never persisted)", async ({ page }) => {
    await expect(page.getByTestId("engine-value")).toContainText("$260");

    // A real keyboard interaction (not a scripted `el.value =`) — React tracks the native input
    // value setter, so a JS-only assignment is silently swallowed; ArrowRight is a genuine
    // browser-level step increment (step = $10 = 1,000 cents) that both DOM and React see.
    const slider = page.getByRole("slider", { name: "Weekly savings amount" });
    await slider.focus();
    for (let i = 0; i < 4; i++) await slider.press("ArrowRight");

    await expect(page.getByTestId("engine-value")).toContainText("$300");
    const sentence = page.getByTestId("whatif-sentence");
    await expect(sentence).toContainText("December");
    await expect(sentence).toContainText("August 2028");

    await page.reload();
    await expect(page.getByTestId("engine-value")).toContainText("$260");
  });

  test("@smoke disclaimer text present at the bottom", async ({ page }) => {
    await expect(page.getByText(/Zenda gives general information, not personal financial advice\./)).toBeVisible();
  });
});
