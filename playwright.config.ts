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
//
// webServer is conditional on E2E_BASE_URL for the same reason: `test:smoke` targets a running
// public URL (no local server to spawn) and the opt-in T-AI run (`e2e/ai.spec.ts`, RUN_AI=1)
// targets a separately started `next dev` that has the *real* ANTHROPIC_API_KEY — spawning a
// second webServer here (with the key blanked) would either conflict with that server's port or
// silently blank the key T-AI needs. Only the default local run (no E2E_BASE_URL) spawns one.
//
// workers: 1 (T2 correction over T1's implicit multi-worker default). Both projects below run
// the *same* spec files against the *same* seeded accounts (there is no per-project account
// split) — e2e@ in particular is mutated by progress.spec.ts (3 resets) and adapt.spec.ts (a
// profile edit), and read for exact stored numbers by roadmap.spec.ts, admin.spec.ts and
// resilience.spec.ts. `fullyParallel: true` with more than one worker lets any of those race a
// concurrent reset or edit on the same account — observed live while writing these specs (a
// reset started by one script mid-read of another produced a different `completion_month` across
// otherwise-identical runs, the same failure mode vitest.config.ts's `fileParallelism: false`
// comment describes for the "db" project). One worker serialises every test across every project
// and file, trading suite runtime for a shared-fixture suite that isn't flaky by construction.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 1,
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
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        port: 3000,
        reuseExistingServer: false,
        env: {
          ANTHROPIC_API_KEY: "",
          DEMO_TODAY: "2026-10-20",
        },
      },
});
