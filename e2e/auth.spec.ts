import { expect, test } from "@playwright/test";

// e2e/auth.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "auth.spec.ts" (@smoke where marked).

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";
const VINAY_EMAIL = "vinay@demo.zenda.app";

test.describe("auth", () => {
  test("@smoke / renders; \"Start your journey\" -> /signup", async ({ page }) => {
    await page.goto("/");
    const startLink = page.getByRole("link", { name: /Start your journey/i });
    await expect(startLink).toBeVisible();
    await startLink.click();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("@smoke / \"See Vinay's journey\" -> /login with email prefilled", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /See Vinay.s journey/i }).click();
    await expect(page).toHaveURL(/\/login\?demo=vinay$/);
    await expect(page.getByLabel("Email")).toHaveValue(VINAY_EMAIL);
  });

  test("@smoke login e2e@ -> lands /roadmap", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
  });

  test("wrong password -> \"Email or password didn't match.\"", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Email or password didn't match.")).toBeVisible();
  });

  // Three independent tests (not one, each reusing the page): a successful signup leaves the
  // browser session logged in, and proxy.ts (A1 §5) redirects a signed-in visitor away from
  // /signup to /roadmap — so a second signup attempt in the *same* context never sees the form.
  test("signup: fresh email + DEMO code -> /discover", async ({ page }) => {
    const freshEmail = `e2e-fresh-${Date.now()}@demo.zenda.app`;

    await page.goto("/signup");
    await page.getByLabel("Display name").fill("Fresh Signup");
    await page.getByLabel("Email").fill(freshEmail);
    await page.getByLabel("Password").fill("TestPass123!");
    await page.getByLabel("Company code").fill("DEMO");
    await page.getByRole("button", { name: "Start your journey" }).click();
    await expect(page).toHaveURL(/\/discover$/, { timeout: 15_000 });
  });

  test("signup: wrong company code -> \"We don't know that company code.\"", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Display name").fill("Wrong Code");
    await page.getByLabel("Email").fill(`e2e-fresh-${Date.now()}@demo.zenda.app`);
    await page.getByLabel("Password").fill("TestPass123!");
    await page.getByLabel("Company code").fill("NOPE");
    await page.getByRole("button", { name: "Start your journey" }).click();
    await expect(page.getByText("We don't know that company code.")).toBeVisible();
  });

  test("signup: existing email -> \"already has an account\"", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Display name").fill("Existing Email");
    await page.getByLabel("Email").fill(VINAY_EMAIL);
    await page.getByLabel("Password").fill("TestPass123!");
    await page.getByLabel("Company code").fill("DEMO");
    await page.getByRole("button", { name: "Start your journey" }).click();
    await expect(page.getByText(/already has an account/i)).toBeVisible();
  });

  test("logged out -> /roadmap redirected to /login?next=%2Froadmap; after login lands on /roadmap", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page).toHaveURL(/\/login\?next=%2Froadmap$/);

    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });
  });

  test("\"Log out\" -> /; /roadmap bounces again", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

    await page.goto("/roadmap");
    await expect(page).toHaveURL(/\/login\?next=%2Froadmap$/);
  });
});
