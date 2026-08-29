// lib/engine/engine.test.ts — every row of the D6 worked example (Vinuy), tolerance ±1 dollar
// (±100 cents) on money values, exact match on months/rates, plus the A3 streak rule.

import { describe, expect, it } from "vitest";
import type { Assumptions, EngineContribution, EngineGoal, EngineProfile } from "./types";
import { capacityMonthlyCents, glideRate, monthDate, monthIndex, todayMonth } from "./rates";
import { monthsToReach, projectCurve, requiredMonthlyCents } from "./solver";
import { waterfall } from "./waterfall";
import { progress, streak } from "./progress";

/** Money assertions are exact to the cent-rounded dollar, tolerance ±1 dollar (D6). */
function expectCentsClose(actualCents: number, expectedCents: number) {
  expect(Math.abs(actualCents - expectedCents)).toBeLessThanOrEqual(100);
}

const STARTED_ON = "2026-09-01";

const assumptions: Assumptions = {
  cashRateAnnual: 0.05,
  growthRateAnnual: 0.09,
  upsideRateAnnual: 0.12,
  glideCashBelowMonths: 36,
  glideGrowthAboveMonths: 60,
  firstMilestoneCents: 50_000,
  emergencyWeeks: 4,
};

const profile: EngineProfile = {
  payCycle: "weekly",
  takeHomeCents: 110_000, // $1,100/wk
  essentialsCents: 59_000, // $590/wk
  lifestyleCents: 25_000, // $250/wk
  bufferCents: 10_000, // $100/wk
};

const capacity = capacityMonthlyCents(profile);

describe("capacityMonthlyCents", () => {
  it("Vinuy: (1,100 − 590 − 250 − 100) + 100 = $260/wk -> $1,126.67/month", () => {
    expectCentsClose(capacity, 112_667);
  });
});

describe("requiredMonthlyCents", () => {
  it("Peru $4,000, PV 0, 4 months, 5% -> $993.77", () => {
    expectCentsClose(requiredMonthlyCents(400_000, 0, 4, 0.05), 99_377);
  });

  it("car $50,000, 24 months, 5% -> $1,985.24 (not achievable at $260/wk)", () => {
    const required = requiredMonthlyCents(5_000_000, 0, 24, 0.05);
    expectCentsClose(required, 198_524);
    expect(required).toBeGreaterThan(capacity);
  });

  it("home deposit $240,000, 84 months, 9% -> $2,061.38 (-> growth_required)", () => {
    const required = requiredMonthlyCents(24_000_000, 0, 84, 0.09);
    expectCentsClose(required, 206_138);
    expect(required).toBeGreaterThan(capacity);
  });
});

describe("monthsToReach", () => {
  it("Peru $4,000 at capacity, 5% -> 4", () => {
    expect(monthsToReach(400_000, 0, capacity, 0.05)).toBe(4);
  });

  it("buffer $500 at capacity, 5% -> 1", () => {
    expect(monthsToReach(50_000, 0, capacity, 0.05)).toBe(1);
  });

  it("emergency $2,360 at capacity, 5% -> 3", () => {
    expect(monthsToReach(236_000, 0, capacity, 0.05)).toBe(3);
  });

  it("car $50,000 at capacity, 5% -> 41 (altLaterMonths = 41 − 24 = 17)", () => {
    const n = monthsToReach(5_000_000, 0, capacity, 0.05);
    expect(n).toBe(41);
    expect((n ?? 0) - 24).toBe(17);
  });

  it("car $25,000 at capacity, 5% -> 22", () => {
    expect(monthsToReach(2_500_000, 0, capacity, 0.05)).toBe(22);
  });

  it("deposit $240,000 at capacity, 9% -> 128 (~10.6 years, 2037)", () => {
    expect(monthsToReach(24_000_000, 0, capacity, 0.09)).toBe(128);
  });
});

describe("projectCurve (last point)", () => {
  it("car at capacity, 24 months, 5% -> $28,376.14 (= altSmallerTargetCents)", () => {
    const curve = projectCurve(0, capacity, 0.05, 24);
    expectCentsClose(curve[curve.length - 1].balanceCents, 2_837_614);
  });

  it("deposit at capacity, 84 months, 9% -> $131,174.34", () => {
    const curve = projectCurve(0, capacity, 0.09, 84);
    expectCentsClose(curve[curve.length - 1].balanceCents, 13_117_434);
  });
});

describe("glideRate", () => {
  it("4 / 24 / 36 / 48 / 60 / 84 months -> 0.05 / 0.05 / 0.05 / 0.07 / 0.09 / 0.09", () => {
    expect(glideRate(4, assumptions)).toBeCloseTo(0.05, 6);
    expect(glideRate(24, assumptions)).toBeCloseTo(0.05, 6);
    expect(glideRate(36, assumptions)).toBeCloseTo(0.05, 6);
    expect(glideRate(48, assumptions)).toBeCloseTo(0.07, 6);
    expect(glideRate(60, assumptions)).toBeCloseTo(0.09, 6);
    expect(glideRate(84, assumptions)).toBeCloseTo(0.09, 6);
  });
});

describe("waterfall — Vinuy's full roadmap", () => {
  const bufferGoal: EngineGoal = {
    id: "buffer",
    kind: "buffer",
    targetCents: 50_000,
    startingBalanceCents: 0,
    targetMonth: monthIndex(STARTED_ON, "2026-10-01"),
    priority: 5,
    goalType: "savings_achievable",
    status: "active",
  };
  const peruGoal: EngineGoal = {
    id: "peru",
    kind: "travel",
    targetCents: 400_000,
    startingBalanceCents: 0,
    targetMonth: monthIndex(STARTED_ON, "2027-01-10"),
    priority: 3,
    goalType: "savings_achievable",
    status: "active",
  };
  const emergencyGoal: EngineGoal = {
    id: "emergency",
    kind: "emergency",
    targetCents: 236_000,
    startingBalanceCents: 0,
    targetMonth: monthIndex(STARTED_ON, "2027-03-07"),
    priority: 4,
    goalType: "savings_achievable",
    status: "active",
  };
  const carGoal: EngineGoal = {
    id: "car",
    kind: "car",
    targetCents: 2_500_000,
    startingBalanceCents: 0,
    targetMonth: monthIndex(STARTED_ON, "2029-01-14"),
    priority: 2,
    goalType: "savings_achievable",
    status: "active",
  };
  const depositGoal: EngineGoal = {
    id: "deposit",
    kind: "home",
    targetCents: 24_000_000,
    startingBalanceCents: 0,
    targetMonth: monthIndex(STARTED_ON, "2033-09-01"),
    priority: 1,
    goalType: "growth_required",
    status: "active",
  };

  const projections = waterfall(
    [bufferGoal, peruGoal, emergencyGoal, carGoal, depositGoal],
    capacity,
    assumptions,
  );
  const byId = Object.fromEntries(projections.map((p) => [p.goalId, p]));

  it("completion months: buffer -> Peru -> emergency -> car25k = 1 -> 5 -> 8 -> 30", () => {
    expect(byId.buffer.completionMonth).toBe(1);
    expect(byId.peru.completionMonth).toBe(5);
    expect(byId.emergency.completionMonth).toBe(8);
    expect(byId.car.completionMonth).toBe(30);
  });

  it("deposit curve runs from month 30 to 84 and ends at $74,666.22", () => {
    expect(byId.deposit.startMonth).toBe(30);
    const last = byId.deposit.curve[byId.deposit.curve.length - 1];
    expect(last.m).toBe(84 - 30);
    expectCentsClose(last.balanceCents, 7_466_622);
  });

  describe("progress — Peru", () => {
    // D8 seed contributions ($260 each): buffer x2, then Peru x4, one per week, no gaps.
    const contributions: EngineContribution[] = [
      { goalId: "buffer", amountCents: 26_000, occurredOn: "2026-09-07" },
      { goalId: "buffer", amountCents: 26_000, occurredOn: "2026-09-14" },
      { goalId: "peru", amountCents: 26_000, occurredOn: "2026-09-21" },
      { goalId: "peru", amountCents: 26_000, occurredOn: "2026-09-28" },
      { goalId: "peru", amountCents: 26_000, occurredOn: "2026-10-05" },
      { goalId: "peru", amountCents: 26_000, occurredOn: "2026-10-12" },
    ];
    const weeklyCapacityCents = 26_000; // $260/wk

    it("saved $1,040 (4 x $260), pct 26, paydaysRemaining 12, streak 6 (the two buffer contributions before)", () => {
      const today = todayMonth(STARTED_ON, "2026-10-12");
      const result = progress(peruGoal, contributions, byId.peru, today, weeklyCapacityCents);
      expectCentsClose(result.savedCents, 104_000);
      expect(result.pctComplete).toBe(26);
      expect(result.paydaysRemaining).toBe(12);
      expect(result.streak).toBe(6);
    });
  });
});

describe("monthDate — A2, the inverse of monthIndex on first-of-month dates", () => {
  it("returns startedOn + m months, same day-of-month", () => {
    expect(monthDate(STARTED_ON, 0)).toBe(STARTED_ON);
    expect(monthDate(STARTED_ON, 1)).toBe("2026-10-01");
    expect(monthDate(STARTED_ON, 84)).toBe("2033-09-01");
    expect(monthIndex(STARTED_ON, monthDate(STARTED_ON, 84))).toBe(84);
  });

  it("clamps to month end (Jan 31 + 1 month -> Feb 28)", () => {
    expect(monthDate("2027-01-31", 1)).toBe("2027-02-28");
  });
});

describe("A3 — streak rule", () => {
  it("zero contributions -> streak 0", () => {
    expect(streak([], 7)).toBe(0);
  });

  it("a gap longer than cycle + 1 days stops the streak", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-30" },
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-07" }, // 23-day gap
    ];
    expect(streak(contributions, 7)).toBe(1);
  });

  it("a gap of exactly cycle + 1 days still counts", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-15" },
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-07" }, // 8-day gap = cycle(7) + 1
    ];
    expect(streak(contributions, 7)).toBe(2);
  });

  it("a gap one day beyond cycle + 1 breaks the streak", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-16" },
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-07" }, // 9-day gap > cycle(7) + 1
    ];
    expect(streak(contributions, 7)).toBe(1);
  });

  it("a skip (amount 0) breaks the streak", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-21" },
      { goalId: "g", amountCents: 0, occurredOn: "2026-09-14" }, // "not this time"
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-07" },
    ];
    expect(streak(contributions, 7)).toBe(1);
  });

  it("consecutive weekly contributions with no gap or skip all count", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-07" },
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-14" },
      { goalId: "g", amountCents: 26_000, occurredOn: "2026-09-21" },
    ];
    expect(streak(contributions, 7)).toBe(3);
  });
});
