import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's `"@/*": ["./*"]` path alias (Vite/Vitest doesn't read tsconfig paths
// on its own). Needed because several non-test modules under test (e.g. lib/data/templates.ts)
// import via "@/lib/...". Vitest's `test.projects` entries are independent Vite configs, so the
// alias is repeated in each rather than relying on it inheriting from the root.
const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const resolve = { alias: { "@": projectRoot } };

// Two projects (ZENDA_TEST_SPEC.md, "Commands"):
//  - unit: lib/**/*.test.ts, no network (`npm test`).
//  - db:   tests/db/**/*.test.ts, real Supabase (anon key + test accounts), 20s timeout,
//          setupFiles tests/db/env.ts (loads .env.local programmatically, sets DEMO_TODAY).
export default defineConfig({
  resolve,
  test: {
    // Root-level only (Vitest's per-project `ProjectConfig` doesn't accept fileParallelism) —
    // see the "db" project's comment below for why layer 2 needs this. Harmless for "unit"
    // (stateless, no shared mutable data), so applying it suite-wide is simplest.
    fileParallelism: false,
    projects: [
      {
        resolve,
        test: {
          name: "unit",
          environment: "node",
          include: ["lib/**/*.test.ts"],
        },
      },
      {
        resolve,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          testTimeout: 20000,
          setupFiles: ["tests/db/env.ts"],
          // seed.test.ts and reset.test.ts share one mutable account (e2e@) — reset.test.ts
          // deletes and re-creates e2e's goals mid-run. Vitest's default file parallelism would
          // race that against seed.test.ts's own reads of the same account (observed: identical
          // input state producing a different `completion_month` across otherwise-identical
          // runs). The root-level `fileParallelism: false` above serialises this project's files
          // so layer 2 never reads mid-mutation.
        },
      },
    ],
  },
});
