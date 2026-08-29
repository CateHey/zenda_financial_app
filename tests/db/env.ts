// tests/db/env.ts — vitest `db` project setupFile (ZENDA_TEST_SPEC.md, "Commands").
// Loads .env.local programmatically — read here only, never printed — for exactly the two names
// layer 2 needs: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (no service role in
// this project). Also sets DEMO_TODAY so lib/engine's today() reads the demo clock (A12) — a
// harmless no-op today, since no product code currently reads it (see the T1 report's findings).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!ALLOWED.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();
if (!process.env.DEMO_TODAY) process.env.DEMO_TODAY = "2026-10-20";
