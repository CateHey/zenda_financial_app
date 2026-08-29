// lib/api/respond.test.ts — the shared response/error-handling layer (D5 shapes) every route
// this session owns now funnels through. Covers: ok()/fail() shapes, withHandler's three catch
// branches (HttpError passthrough, Postgres 23505/23514 -> 409 conflict, anything else -> 500
// with a logged ref), and requireUser()'s 401 when there is no signed-in user.

import { afterEach, describe, expect, it, vi } from "vitest";

const currentUserIdMock = vi.fn<() => Promise<string | null>>();
const supabaseServerMock = vi.fn<() => Promise<unknown>>();

vi.mock("@/lib/supabase/server", () => ({
  currentUserId: () => currentUserIdMock(),
  supabaseServer: () => supabaseServerMock(),
}));

const { ok, fail, HttpError, withHandler, requireUser, orNotFound } = await import("./respond");

afterEach(() => {
  vi.clearAllMocks();
});

describe("ok", () => {
  it("wraps data with ok: true at 200 by default", async () => {
    const res = ok({ redirect: "/roadmap" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/roadmap" });
  });

  it("honours a custom status", async () => {
    const res = ok({}, { status: 201 });
    expect(res.status).toBe(201);
  });
});

describe("fail", () => {
  it("shapes { error, ...extra } at the given status", async () => {
    const res = fail(409, "conflict", { detail: "23505" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "conflict", detail: "23505" });
  });

  it("omits extra fields when none are given", async () => {
    const res = fail(404, "not_found");
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("withHandler", () => {
  it("passes a successful response straight through", async () => {
    const handler = withHandler(async () => ok({ value: 1 }));
    const res = await handler(new Request("http://x/"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, value: 1 });
  });

  it("forwards extra args (dynamic route params) to the wrapped fn", async () => {
    const handler = withHandler(async (_req, ctx: { params: Promise<{ id: string }> }) => {
      const { id } = await ctx.params;
      return ok({ id });
    });
    const res = await handler(new Request("http://x/"), { params: Promise.resolve({ id: "g1" }) });
    expect(await res.json()).toEqual({ ok: true, id: "g1" });
  });

  it("maps a thrown HttpError to its own status/error/extra", async () => {
    const handler = withHandler(async () => {
      throw new HttpError(404, "not_found");
    });
    const res = await handler(new Request("http://x/"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("maps a Postgres 23505 (unique_violation) to 409 conflict", async () => {
    const handler = withHandler(async () => {
      throw { code: "23505", message: "duplicate key value" };
    });
    const res = await handler(new Request("http://x/"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "conflict", detail: "23505" });
  });

  it("maps a Postgres 23514 (check_violation) to 409 conflict", async () => {
    const handler = withHandler(async () => {
      throw { code: "23514", message: "violates check constraint" };
    });
    const res = await handler(new Request("http://x/"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "conflict", detail: "23514" });
  });

  it("maps an unrelated thrown error to 500 { error: internal, ref } and logs it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withHandler(async () => {
      throw new Error("boom");
    });
    const res = await handler(new Request("http://x/"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal");
    expect(typeof body.ref).toBe("string");
    expect(body.ref.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledWith(body.ref, expect.any(Error));
    spy.mockRestore();
  });

  it("does not treat an unrelated Postgres code (e.g. a foreign-key violation) as a conflict", async () => {
    const handler = withHandler(async () => {
      throw { code: "23503", message: "violates foreign key constraint" };
    });
    const res = await handler(new Request("http://x/"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("internal");
  });
});

describe("requireUser", () => {
  it("throws HttpError(401, unauthenticated) when there is no signed-in user", async () => {
    currentUserIdMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ status: 401, error: "unauthenticated" });
  });

  it("returns userId + supabase when a user is signed in", async () => {
    const fakeClient = { from: () => null };
    currentUserIdMock.mockResolvedValue("user-1");
    supabaseServerMock.mockResolvedValue(fakeClient);
    const result = await requireUser();
    expect(result.userId).toBe("user-1");
    expect(result.supabase).toBe(fakeClient);
  });
});

describe("orNotFound", () => {
  it("returns the row when present", () => {
    expect(orNotFound({ id: "g1" })).toEqual({ id: "g1" });
  });

  it("throws HttpError(404, not_found) when null", () => {
    expect(() => orNotFound(null)).toThrowError(HttpError);
  });

  it("throws HttpError(404, not_found) when undefined", () => {
    expect(() => orNotFound(undefined)).toThrowError(HttpError);
  });
});
