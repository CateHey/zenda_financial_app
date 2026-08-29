import { defineConfig } from "@playwright/test";

// ZENDA_TEST_SPEC.md, "Commands" + "Layer 4". `webServer` starts `next dev` with the AI key
// blanked (D5/D12: the templates path is what's demoed; AI is verified once, separately, in
// T-AI) and DEMO_TODAY set (A12). Two viewport projects; retries 1 with trace on first retry.
//
// Decision (trivial, listed per CLAUDE.md): globalSetup runs the e2e reset script only for a
// local run (no E2E_BASE_URL). ZENDA_TEST_SPEC.md's Layer 5 states "No reset in production" for
// `test:smoke` (which reuses this same config with `--grep @smoke` and E2E_BASE_URL set); running
// the local-only reset script there would be both wrong (D9: the service role key is never
// meant to run against random state during a public smoke pass) and pointless (no local
// `next dev` to wait on). See e2e/global-setup.ts.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: false,
    env: {
      ANTHROPIC_API_KEY: "",
      DEMO_TODAY: "2026-10-20",
    },
  },
});
