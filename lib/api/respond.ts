// lib/api/respond.ts — shared response shape + error handling for every route this session
// owns (D5 "Boundary rule" / response shapes). Three exports:
//   - ok(data, init?)      -> 200 (or init.status) JSON, always `{ ok: true, ...data }`.
//   - fail(status, error, extra?) -> JSON `{ error, ...extra }` at the given status.
//   - withHandler(fn)      -> wraps a route handler so every failure mode funnels through one
//     place instead of being hand-rolled per route: no signed-in user -> 401
//     `{ error: "unauthenticated" }`; a thrown HttpError -> its own status/body; a thrown
//     Postgres error with code 23505 (unique_violation) or 23514 (check_violation) -> 409
//     `{ error: "conflict", detail: code }`; anything else thrown -> 500
//     `{ error: "internal", ref }` with `console.error(ref, err)` so the ref can be grepped out
//     of server logs. D5's other shapes (400 validation, 404 not_found) are raised the same way,
//     via `HttpError`, by the routes themselves (they know their own Zod issues / row lookups).

import { NextResponse } from "next/server";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Postgrest/Postgres error codes this layer treats as a 409 conflict rather than a 500. */
const CONFLICT_CODES = new Set(["23505", "23514"]);

/**
 * A deliberately-thrown HTTP failure. Route handlers (and helpers like `requireUser`) throw one
 * of these to short-circuit straight to a specific status/body; `withHandler` is the only place
 * that catches it. Anything else thrown (a bare Error, a Postgrest error object, a TypeError from
 * a bug) is treated as unexpected and mapped generically below.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly error: string;
  readonly extra?: Record<string, unknown>;

  constructor(status: number, error: string, extra?: Record<string, unknown>) {
    super(error);
    this.name = "HttpError";
    this.status = status;
    this.error = error;
    this.extra = extra;
  }
}

/** `{ ok: true, ...data }` at `status` (default 200). D5's success shapes all start this way. */
export function ok(data: Record<string, unknown> = {}, init?: { status?: number }): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status: init?.status ?? 200 });
}

/** `{ error, ...extra }` at `status`. The one place every error body is assembled. */
export function fail(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Duck-types a thrown value as a Postgrest/Postgres error (it carries a string `.code`). */
function postgresErrorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/**
 * requireUser() — the 401 half of D5's "reject with 401 if no session", as a throw so route
 * bodies can stay linear (`const { userId, supabase } = await requireUser();`) instead of an
 * early-return per call site. Also covers the (practically unreachable outside missing env vars)
 * "Supabase client didn't build" case with a 500, so callers never see a null client.
 */
export async function requireUser(): Promise<{ userId: string; supabase: SupabaseClient }> {
  const userId = await currentUserId();
  if (!userId) throw new HttpError(401, "unauthenticated");
  const supabase = await supabaseServer();
  if (!supabase) throw new HttpError(500, "internal");
  return { userId, supabase: supabase as unknown as SupabaseClient };
}

/** Throws the D5 "a goal that RLS hides is a 404" shape when `row` is null/undefined. */
export function orNotFound<T>(row: T | null | undefined, extra?: Record<string, unknown>): T {
  if (row === null || row === undefined) throw new HttpError(404, "not_found", extra);
  return row;
}

/**
 * Wraps a route handler (any arity/shape — plain `(request)` or `(request, { params })`) so
 * every thrown failure lands on the right D5 shape instead of a raw 500 or an uncaught exception
 * turning into Next's own error page:
 *  - HttpError            -> its own status/error/extra, verbatim.
 *  - Postgres 23505/23514 -> 409 { error: "conflict", detail: code }.
 *  - anything else        -> 500 { error: "internal", ref }, logged via console.error(ref, err)
 *                            so the ref printed to the caller can be grepped in server logs
 *                            without ever leaking the underlying error/stack to the client.
 */
export function withHandler<Args extends unknown[]>(
  fn: (request: Request, ...args: Args) => Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request: Request, ...args: Args) => {
    try {
      return await fn(request, ...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return fail(err.status, err.error, err.extra);
      }
      const code = postgresErrorCode(err);
      if (code && CONFLICT_CODES.has(code)) {
        return fail(409, "conflict", { detail: code });
      }
      const ref = crypto.randomUUID();
      console.error(ref, err);
      return fail(500, "internal", { ref });
    }
  };
}
