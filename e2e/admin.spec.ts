import { expect, test } from "@playwright/test";

// e2e/admin.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "admin.spec.ts". Verified live: admin@ lands
// on /discover after login (D3: no goals yet -> /discover), so this navigates to /admin directly
// rather than asserting a post-login redirect target.

const ADMIN_EMAIL = "admin@demo.zenda.app";
const E2E_EMAIL = "e2e@demo.zenda.app";
const DEMO_PASSWORD = "Zenda-demo-2026!";

test.describe("admin", () => {
  test("admin@ -> /admin shows Seats, Members numbers; no goal amounts ($) anywhere", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    await page.goto("/admin");
    await expect(page.getByText("Seats", { exact: true })).toBeVisible();
    await expect(page.getByText("Members", { exact: true })).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("$");
  });

  test("e2e@ -> /admin redirected to /roadmap", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
  });
});
