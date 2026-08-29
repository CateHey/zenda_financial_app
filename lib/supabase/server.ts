import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Public project settings (safe in the browser — RLS does the protecting). */
export function supabasePublicConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * Anon-key client bound to the request cookies. Every server read/write goes through this —
 * RLS is the authorisation layer (D1). There is no service-role client at runtime; the
 * service key is read only in scripts/seed.ts (D5, A7).
 */
export async function supabaseServer() {
  const config = supabasePublicConfig();
  if (!config) return null;
  const jar = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) jar.set(name, value, options);
        } catch {
          // Server components can't set cookies; route handlers can. Reads still work.
        }
      },
    },
  });
}

/** The signed-in user's id, or null (guest / auth not configured). */
export async function currentUserId(): Promise<string | null> {
  const client = await supabaseServer();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
