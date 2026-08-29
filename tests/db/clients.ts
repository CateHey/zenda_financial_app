// tests/db/clients.ts — layer 2 setup (ZENDA_TEST_SPEC.md "Layer 2"). Anon-key clients signed in
// as each test account via auth.signInWithPassword, plus an anon() client with no session. No
// service role here — RLS is exactly what's under test.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DEMO_PASSWORD = "Zenda-demo-2026!";
export const E2E_EMAIL = "e2e@demo.zenda.app";
export const ADMIN_EMAIL = "admin@demo.zenda.app";
export const JUDGE_EMAIL = "judge@demo.zenda.app";

/** True when the two env vars layer 2 needs are present (tests/db/env.ts loads them). */
export function hasDbEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function requireUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set — layer 2 should have skipped.");
  return url;
}

function requireAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set — layer 2 should have skipped.");
  return key;
}

/** A client with no session — RLS as an unauthenticated request sees it. */
export function anon(): SupabaseClient {
  return createClient(requireUrl(), requireAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A fresh anon-key client signed in as `email` (one of the D8 test accounts). */
export async function signIn(email: string): Promise<SupabaseClient> {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return client;
}

export async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("currentUserId: no signed-in user on this client");
  return data.user.id;
}
