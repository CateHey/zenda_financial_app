// lib/data/queries.test.ts — robustness pass: every lib/data/queries.ts function returns its
// "nothing" value (null / []) on a Postgrest error, after console.error, instead of throwing
// into a page (task brief item 4). Also covers assumptionsToEngine's D2-default fallback for
// missing/non-numeric rows (used when the `assumptions` table is empty or a value fails to
// parse — lib/data/recompute.ts's "never throws on ... missing assumptions rows" guard).

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assumptionsToEngine,
  getAssumptions,
  getContributions,
  getContributionsForGoals,
  getCurrentGoal,
  getEventById,
  getGoalById,
  getGoalsWithProjections,
  getLatestReflectionEvent,
  getProfile,
  getUnseenEvents,
} from "./queries";
import type { AssumptionRow } from "./types";

const DB_ERROR = { code: "500", message: "connection reset" };

/** A minimal fake of the Supabase query-builder surface these functions chain off — every
 * terminal method (`.maybeSingle` / awaiting the builder itself) resolves to `{ data, error }`. */
function erroringClient(): SupabaseClient {
  const result = { data: null, error: DB_ERROR };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    neq: chain,
    in: chain,
    is: chain,
    contains: chain,
    order: chain,
    limit: chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: typeof result) => void) => Promise.resolve(result).then(resolve),
  });
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("queries.ts — error swallowing (never throws into a page)", () => {
  it("getProfile returns null on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getProfile(erroringClient())).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("getGoalById returns null on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getGoalById(erroringClient(), "g1")).resolves.toBeNull();
    vi.restoreAllMocks();
  });

  it("getGoalsWithProjections returns [] on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getGoalsWithProjections(erroringClient())).resolves.toEqual([]);
    vi.restoreAllMocks();
  });

  it("getCurrentGoal returns null when the underlying goal list errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getCurrentGoal(erroringClient())).resolves.toBeNull();
    vi.restoreAllMocks();
  });

  it("getContributions returns [] on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getContributions(erroringClient(), "g1")).resolves.toEqual([]);
    vi.restoreAllMocks();
  });

  it("getContributionsForGoals returns [] on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getContributionsForGoals(erroringClient(), ["g1"])).resolves.toEqual([]);
    vi.restoreAllMocks();
  });

  it("getContributionsForGoals short-circuits to [] with no ids (no query at all)", async () => {
    await expect(getContributionsForGoals(erroringClient(), [])).resolves.toEqual([]);
  });

  it("getUnseenEvents returns [] on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getUnseenEvents(erroringClient())).resolves.toEqual([]);
    vi.restoreAllMocks();
  });

  it("getEventById returns null on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getEventById(erroringClient(), "e1")).resolves.toBeNull();
    vi.restoreAllMocks();
  });

  it("getLatestReflectionEvent returns null on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getLatestReflectionEvent(erroringClient())).resolves.toBeNull();
    vi.restoreAllMocks();
  });

  it("getAssumptions returns [] on error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getAssumptions(erroringClient())).resolves.toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("assumptionsToEngine — D2 default fallback", () => {
  it("fills every field with the D2 default from an empty row set, and warns", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = assumptionsToEngine([]);
    expect(a).toEqual({
      cashRateAnnual: 0.05,
      growthRateAnnual: 0.09,
      upsideRateAnnual: 0.12,
      glideCashBelowMonths: 36,
      glideGrowthAboveMonths: 60,
      firstMilestoneCents: 50_000,
      emergencyWeeks: 4,
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("uses real rows when present, defaults only for the rest", () => {
    const rows: AssumptionRow[] = [
      { key: "cash_rate_annual", value: 0.06, description: "" },
      { key: "emergency_weeks", value: 6, description: "" },
    ];
    const a = assumptionsToEngine(rows);
    expect(a.cashRateAnnual).toBe(0.06);
    expect(a.emergencyWeeks).toBe(6);
    expect(a.growthRateAnnual).toBe(0.09); // default, not present in rows
  });

  it("falls back to the default when a stored value isn't numeric (NaN guard)", () => {
    const rows: AssumptionRow[] = [{ key: "cash_rate_annual", value: Number("not-a-number"), description: "" }];
    const a = assumptionsToEngine(rows);
    expect(a.cashRateAnnual).toBe(0.05);
  });

  it("preserves a legitimate zero (0 is not treated as missing)", () => {
    const rows: AssumptionRow[] = [{ key: "emergency_weeks", value: 0, description: "" }];
    const a = assumptionsToEngine(rows);
    expect(a.emergencyWeeks).toBe(0);
  });
});
