import { waitlistBody as bodySchema } from "@/lib/api/schemas";
import { HttpError, ok, withHandler } from "@/lib/api/respond";
import { supabaseServer } from "@/lib/supabase/server";

// POST /api/waitlist — the one public write in the app. Called by the form on
// public/landing.html by someone who has no account and may never get one from their employer.
//
// Two departures from the six D5 routes, both deliberate:
//  1. No requireUser(). The caller is `anon`, and the anon-key cookie client is used exactly as
//     everywhere else, so migration 0003's insert-only policy is still the authorisation layer —
//     there is no service role here either.
//  2. A duplicate email is a success, not a 409. Answering "conflict" to an anonymous caller
//     would turn this route into an oracle for "is this address on the list?", one address per
//     request; `already` is returned so the server logs still distinguish the two.

/** Postgres unique_violation — the `waitlist.email` unique constraint from migration 0003. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === UNIQUE_VIOLATION
  );
}

export const POST = withHandler(async (request: Request) => {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw new HttpError(400, "validation", { issues: parsed.error.issues });
  }
  const { kind, email, company, team_size, note, source, trap } = parsed.data;

  // Honeypot: a field hidden from people and irresistible to form-filling bots. Answer exactly as
  // a real submission would — a distinguishable rejection just teaches the next bot to skip it.
  if (trap) return ok({ joined: true });

  const supabase = await supabaseServer();
  if (!supabase) throw new HttpError(500, "internal");

  const { error } = await supabase.from("waitlist").insert({
    kind,
    email,
    company: company ?? null,
    // A team size is a company's answer; it says nothing about one employee.
    team_size: kind === "company" ? (team_size ?? null) : null,
    note: note ?? null,
    source: source ?? null,
  });

  if (error) {
    if (isUniqueViolation(error)) return ok({ joined: true, already: true });
    throw error;
  }

  return ok({ joined: true });
});

// GET /api/waitlist — the counter on the landing page. The table itself stays unreadable from
// any client role (0003); public.waitlist_count() (0005) runs as its owner and returns one
// integer. Until that migration exists the call fails and `count` is null, and the landing page
// simply shows no number. Cached for a minute at the edge — it is a vanity number, not a ledger.
export const GET = withHandler(async () => {
  const supabase = await supabaseServer();
  if (!supabase) throw new HttpError(500, "internal");
  const { data, error } = await supabase.rpc("waitlist_count");
  const count = error || typeof data !== "number" ? null : data;
  const res = ok({ count });
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res;
});
