// lib/format/money.test.ts — ZENDA_TEST_SPEC.md Layer 1, "money.test.ts". The spec names
// `formatCents`; the real module is `lib/format.ts` (not `lib/format/money.ts`) and its money
// formatter is exported as `formatMoney` — imported from there and tested under that name, per
// the spec's instruction to adapt names to the real exports.

import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  monthlyFromPerCycleCents,
  perCycleFromMonthlyCents,
  weeklyFromMonthlyCents,
} from "../format";

describe("formatMoney (spec: formatCents)", () => {
  it('formatMoney(2600000, "AUD") -> "$26,000"', () => {
    expect(formatMoney(2_600_000, "AUD")).toBe("$26,000");
  });
});

describe("formatMoneyCompact", () => {
  it('compact(2600000) -> "$26k"', () => {
    expect(formatMoneyCompact(2_600_000)).toBe("$26k");
  });

  it('compact(100000000) -> "$1M"', () => {
    expect(formatMoneyCompact(100_000_000)).toBe("$1M");
  });
});

describe("weekly <-> monthly conversions round-trip within 1 cent", () => {
  it("monthlyFromPerCycleCents then perCycleFromMonthlyCents (weekly) round-trips", () => {
    const weekly = 26_000;
    const monthly = monthlyFromPerCycleCents(weekly, "weekly");
    const backToWeekly = perCycleFromMonthlyCents(monthly, "weekly");
    expect(Math.abs(backToWeekly - weekly)).toBeLessThanOrEqual(1);
  });

  it("monthlyFromPerCycleCents then perCycleFromMonthlyCents (fortnightly) round-trips", () => {
    const fortnightly = 52_000;
    const monthly = monthlyFromPerCycleCents(fortnightly, "fortnightly");
    const backToFortnightly = perCycleFromMonthlyCents(monthly, "fortnightly");
    expect(Math.abs(backToFortnightly - fortnightly)).toBeLessThanOrEqual(1);
  });

  it("weeklyFromMonthlyCents matches perCycleFromMonthlyCents(..., \"weekly\")", () => {
    const monthly = 112_667;
    expect(weeklyFromMonthlyCents(monthly)).toBe(perCycleFromMonthlyCents(monthly, "weekly"));
  });
});
