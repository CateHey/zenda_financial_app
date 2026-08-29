// e2e/db-client.ts — shared layer-2-style Supabase access for the e2e specs that need to read
// engine-computed numbers (goal_projections, goals) directly rather than hardcoding a
// mockup-derived figure. ZENDA_TEST_SPEC.md's own instruction for tradeoff.spec.ts: "read the
// projection via the layer-2 client if needed rather than hardcoding" — the same need recurs in
// achievable-prioritise.spec.ts and celebrate.spec.ts (fresh-account flows whose dates depend on
// the real waterfall start, not a fixed mockup date), so this is factored out once.
//
// Playwright's own test process doesn't inherit `next dev`'s .env.local loading, so this file
// loads exactly the two public Supabase env names itself — the same allow-listed pattern
// tests/db/env.ts (layer 2) and e2e/ai.spec.ts use. Never read or printed beyond that; no
// service role here, same as every other test-side Supabase client in this repo.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let envLoaded = false;

export function loadPublicSupabaseEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const allowed = new Set(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!allowed.has(key)) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** True when the two public env vars this file needs are present. */
export function hasPublicSupabaseEnv(): boolean {
  loadPublicSupabaseEnv();
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** An anon-key client signed in as `email`/`password` — for reading a just-created account's own
 * rows (goals, goal_projections) straight from the database, RLS-scoped to that account. */
export async function signInDbClient(email: string, password: string): Promise<SupabaseClient> {
  loadPublicSupabaseEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set (.env.local) — cannot open a db client.");
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInDbClient(${email}) failed: ${error.message}`);
  return client;
}
