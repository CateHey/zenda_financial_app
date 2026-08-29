// lib/engine/calendar.test.ts — ZENDA_TEST_SPEC.md Layer 1, "calendar.test.ts" (A2). The spec
// names a `lib/engine/calendar.ts` module; the real exports live in `lib/engine/rates.ts`
// (monthIndex, todayMonth, monthDate) — imported from there, per the spec's own instruction to
// adapt names to the real exports. The "paydays" row isn't a standalone export either (A2:
// "'N paydays' = ceil(remainingCents / perCycleCapacityCents)"); it's exercised through
// lib/engine/progress.ts's `progress()`, which implements exactly that formula for
// `paydaysRemaining` — isolated here with a minimal goal/projection so only that formula is
// under test.

import { describe, expect, it } from "vitest";
import { monthDate, monthIndex, todayMonth } from "./rates";
import { progress } from "./progress";
import type { GoalProjection } from "./types";

describe("monthIndex — A2", () => {
  it("whole months: 2026-09-01 -> 2027-01-10 = 5", () => {
    expect(monthIndex("2026-09-01", "2027-01-10")).toBe(5);
  });

  it("same day of month: 2026-09-01 -> 2026-12-01 = 3", () => {
    expect(monthIndex("2026-09-01", "2026-12-01")).toBe(3);
  });

  it("target in the past: 2026-09-01 -> 2026-08-15 = 0 (floored)", () => {
    expect(monthIndex("2026-09-01", "2026-08-15")).toBe(0);
  });
});

describe("todayMonth — A2 (fractional)", () => {
  it("2026-09-01, today 2026-10-13 -> ~1.4 (+/-0.05)", () => {
    const result = todayMonth("2026-09-01", "2026-10-13");
    expect(Math.abs(result - 1.4)).toBeLessThanOrEqual(0.05);
  });
});

describe("monthDate — A2 (the inverse of monthIndex)", () => {
  it("started 2026-09-01, m=5 -> 2027-02-01", () => {
    expect(monthDate("2026-09-01", 5)).toBe("2027-02-01");
  });

  it("started 2026-09-01, m=0 -> 2026-09-01", () => {
    expect(monthDate("2026-09-01", 0)).toBe("2026-09-01");
  });

  it("clamping: started 2026-01-31, m=1 -> 2026-02-28", () => {
    expect(monthDate("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("paydays — A2 (\"N paydays\" = ceil(remainingCents / perCycleCapacityCents))", () => {
  it("remaining 296,000 cents, weekly capacity 26,000 -> 12", () => {
    // Isolates the formula via progress(): target 296,000, no starting balance/contributions
    // (saved = 0), so remaining = target exactly; the projection's own curve/rate is irrelevant
    // to paydaysRemaining, so a minimal one-point curve stands in.
    const projection: GoalProjection = {
      goalId: "g",
      rateAnnual: 0.05,
      capacityMonthlyCents: 112_667,
      startMonth: 0,
      completionMonth: null,
      requiredMonthlyCents: 0,
      achievable: false,
      altLaterMonths: null,
      altSmallerTargetCents: null,
      altExtraMonthlyCents: null,
      curve: [{ m: 0, balanceCents: 0 }],
    };
    const result = progress(
      { id: "g", targetCents: 296_000, startingBalanceCents: 0 },
      [],
      projection,
      0,
      26_000,
    );
    expect(result.paydaysRemaining).toBe(12);
  });
});
