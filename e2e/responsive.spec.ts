import { expect, test } from "@playwright/test";

// e2e/responsive.spec.ts — ZENDA_TEST_SPEC.md Layer 4, "responsive.spec.ts": the `desktop`
// project already runs every spec file in this suite unchanged (playwright.config.ts defines two
// projects, `mobile` and `desktop`, with no per-project testMatch narrowing either — every file,
// roadmap.spec.ts and progress.spec.ts included, runs once under each viewport as-is). This file
// adds the responsive-layout assertions the spec calls for that no other file checks: the
// phone-width column stays centred at wide viewports, and no page ever grows a horizontal
// scrollbar (ZENDA_SCREEN_BINDINGS.md, "Common": "desktop shows the phone-width column centred;
// that is the intended web layout").

const E2E_EMAIL = "e2e@demo.zenda.app";
const E2E_PASSWORD = "Zenda-demo-2026!";

const ROUTES = ["/roadmap", "/progress"];

test.describe("responsive", () => {
  test("phone-width column centred, no horizontal scrollbar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/roadmap$/, { timeout: 15_000 });

    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const noHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(noHorizontalScroll, `${route}: document.documentElement.scrollWidth <= window.innerWidth`).toBe(true);

      const main = page.locator("main").first();
      const box = await main.boundingBox();
      const viewportWidth = page.viewportSize()?.width ?? 0;
      expect(box).not.toBeNull();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(390 + 1); // the 390px max-width column (Common rule)
        if (viewportWidth > 390) {
          // Centred: roughly equal space on both sides (a few px of tolerance for scrollbars).
          const leftGap = box.x;
          const rightGap = viewportWidth - (box.x + box.width);
          expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(4);
        }
      }
    }
  });
});
