// lib/engine/guards.test.ts — the robustness-pass engine guards (D6 addendum): capacity <= 0,
// a goal already reached by its starting balance (n=0), a `reached` goal with no reached_at, a
// target_date at/before started_on, and NaN/Infinity inputs clamping/nulling instead of
// propagating. These are guards on top of the existing D6 worked-example behaviour
// (engine.test.ts) — none of them change a valid input's result, only an invalid/edge one.

import { describe, expect, it } from "vitest";
import type { Assumptions, EngineGoal } from "./types";
import { capacityMonthlyCents, glideRate, monthIndex } from "./rates";
import { monthsToReach, projectCurve, requiredMonthlyCents } from "./solver";
import { waterfall } from "./waterfall";

const assumptions: Assumptions = {
  cashRateAnnual: 0.05,
  growthRateAnnual: 0.09,
  upsideRateAnnual: 0.12,
  glideCashBelowMonths: 36,
  glideGrowthAboveMonths: 60,
  firstMilestoneCents: 50_000,
  emergencyWeeks: 4,
};

describe("capacityMonthlyCents — capacity <= 0 and NaN guards", () => {
  it("floors at 0 when lifestyle spend exceeds take-home (capacity <= 0)", () => {
    const capacity = capacityMonthlyCents({
      payCycle: "weekly",
      takeHomeCents: 50_000,
      essentialsCents: 40_000,
      lifestyleCents: 30_000, // 50,000 - 40,000 - 30,000 - 0 < 0
      bufferCents: 0,
    });
    expect(capacity).toBe(0);
  });

  it("clamps a NaN profile field to 0 instead of returning NaN", () => {
    const capacity = capacityMonthlyCents({
      payCycle: "weekly",
      takeHomeCents: Number("not-a-number"),
      essentialsCents: 40_000,
      lifestyleCents: 10_000,
      bufferCents: 0,
    });
    expect(Number.isFinite(capacity)).toBe(true);
    expect(capacity).toBe(0);
  });
});

describe("glideRate — misconfigured assumptions and non-finite horizon", () => {
  it("never returns NaN when glideGrowthAboveMonths <= glideCashBelowMonths (div-by-zero span)", () => {
    const broken: Assumptions = { ...assumptions, glideCashBelowMonths: 60, glideGrowthAboveMonths: 36 };
    const rate = glideRate(48, broken);
    expect(Number.isFinite(rate)).toBe(true);
  });

  it("treats a non-finite horizon as 0 rather than propagating NaN", () => {
    const rate = glideRate(Number.NaN, assumptions);
    expect(rate).toBe(assumptions.cashRateAnnual);
  });
});

describe("monthIndex — target_date before/at started_on clamps to 0", () => {
  it("a date well before startedOn clamps to 0, not negative", () => {
    expect(monthIndex("2026-09-01", "2026-01-01")).toBe(0);
  });

  it("startedOn itself is month 0", () => {
    expect(monthIndex("2026-09-01", "2026-09-01")).toBe(0);
  });
});

describe("requiredMonthlyCents — NaN/Infinity inputs clamp to a finite number", () => {
  it("a NaN rate clamps rather than propagating", () => {
    const result = requiredMonthlyCents(400_000, 0, 4, Number.NaN);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("a NaN target clamps to a finite number", () => {
    const result = requiredMonthlyCents(Number.NaN, 0, 4, 0.05);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe("monthsToReach — already reached (n=0) and non-finite guards", () => {
  it("starting balance already at/above target -> 0, regardless of a zero/negative capacity", () => {
    expect(monthsToReach(400_000, 400_000, 0, 0.05)).toBe(0);
    expect(monthsToReach(400_000, 500_000, 0, 0.05)).toBe(0);
  });

  it("a NaN monthly contribution resolves to null, not NaN", () => {
    expect(monthsToReach(400_000, 0, Number.NaN, 0.05)).toBeNull();
  });

  it("a NaN rate resolves to a finite number or null, never NaN", () => {
    const result = monthsToReach(400_000, 0, 100_000, Number.NaN);
    expect(result === null || Number.isFinite(result)).toBe(true);
  });
});

describe("projectCurve — non-finite inputs never produce a NaN/Infinite point", () => {
  it("a NaN monthly contribution still returns a curve of finite balances", () => {
    const curve = projectCurve(0, Number.NaN, 0.05, 6);
    expect(curve.length).toBe(7);
    for (const point of curve) expect(Number.isFinite(point.balanceCents)).toBe(true);
  });

  it("a NaN months length clamps to a single point (m=0) rather than throwing", () => {
    expect(() => projectCurve(0, 100_000, 0.05, Number.NaN)).not.toThrow();
    const curve = projectCurve(0, 100_000, 0.05, Number.NaN);
    expect(curve.length).toBe(1);
    expect(curve[0].m).toBe(0);
  });
});

describe("waterfall — a reached goal with no reached_at never throws", () => {
  it("falls back to the goal's own targetMonth to advance the cursor", () => {
    const reached: EngineGoal = {
      id: "buffer",
      kind: "buffer",
      targetCents: 50_000,
      startingBalanceCents: 50_000,
      targetMonth: 1,
      priority: 1,
      goalType: "savings_achievable",
      status: "reached",
      reachedAtMonth: null, // reached, but reached_at was never set
    };
    const next: EngineGoal = {
      id: "peru",
      kind: "travel",
      targetCents: 400_000,
      startingBalanceCents: 0,
      targetMonth: 5,
      priority: 2,
      goalType: "savings_achievable",
      status: "active",
    };
    expect(() => waterfall([reached, next], 112_667, assumptions)).not.toThrow();
    const projections = waterfall([reached, next], 112_667, assumptions);
    // The frozen goal emits no projection row (A4); the active one starts from its targetMonth.
    expect(projections.map((p) => p.goalId)).toEqual(["peru"]);
    expect(projections[0].startMonth).toBe(1);
  });

  it("an empty goal list returns an empty projection list, not a throw", () => {
    expect(() => waterfall([], 112_667, assumptions)).not.toThrow();
    expect(waterfall([], 112_667, assumptions)).toEqual([]);
  });
});
