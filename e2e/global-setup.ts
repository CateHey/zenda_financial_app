// e2e/global-setup.ts — Playwright's globalSetup (playwright.config.ts). Resets e2e@'s data to
// the seed state before every LOCAL run so tests never depend on the previous run's mutations
// (ZENDA_TEST_SPEC.md, "Commands": "globalSetup = reset"). Skipped against a public URL — see the
// decision note in playwright.config.ts and Layer 5's "No reset in production".

import { execSync } from "node:child_process";

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_BASE_URL) {
    console.log(
      "e2e/global-setup: E2E_BASE_URL is set — skipping the e2e reset (Layer 5: \"No reset in production\").",
    );
    return;
  }
  console.log("e2e/global-setup: resetting e2e@demo.zenda.app…");
  execSync("npx tsx scripts/reset-e2e.ts", { stdio: "inherit" });
}
