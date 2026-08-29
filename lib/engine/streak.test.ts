// lib/engine/streak.test.ts — ZENDA_TEST_SPEC.md Layer 1, "streak.test.ts" (A3). The spec names
// a `lib/engine/streak.ts` module; the real export is `streak()` in `lib/engine/progress.ts` —
// imported from there per the spec's instruction to adapt names to the real exports.
//
// GAP: the "already checked in this cycle" row has no product export to test against — it's the
// Progress screen's own derived boolean (D4 row 6, A3), and the Progress screen (task 8) hasn't
// landed yet (this session cannot touch app/ or non-test lib/ files to add one). The cases below
// exercise a local helper that implements A3's stated formula verbatim
// ("a contribution exists with occurred_on >= today - (cycle-1) days") so the expected behaviour
// is pinned; once task 8 exports the real check, point these assertions at it instead.

import { describe, expect, it } from "vitest";
import type { EngineContribution } from "./types";
import { streak } from "./progress";

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** A3, verbatim — see the GAP note above. */
function checkedInThisCycle(contributions: EngineContribution[], todayIso: string, cycleDays: number): boolean {
  const threshold = addDays(todayIso, -(cycleDays - 1));
  return contributions.some((c) => c.occurredOn >= threshold);
}

const TODAY = "2026-10-20";

describe("streak — A3", () => {
  it("six in a row weekly, 7 days apart, all $260 -> 6", () => {
    const contributions: EngineContribution[] = [0, 7, 14, 21, 28, 35].map((offset) => ({
      goalId: "g",
      amountCents: 26_000,
      occurredOn: addDays("2026-09-07", offset),
    }));
    expect(streak(contributions, 7)).toBe(6);
  });

  it("gap breaks: rows at -0, -7, -21 days -> 2", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, 0) },
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -7) },
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -21) },
    ];
    expect(streak(contributions, 7)).toBe(2);
  });

  it("skip breaks: latest row 0 cents -> 0", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 0, occurredOn: addDays(TODAY, 0) },
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -7) },
    ];
    expect(streak(contributions, 7)).toBe(0);
  });

  it("partial counts: latest 12,000 still counts (chain of 3 stands)", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 12_000, occurredOn: addDays(TODAY, 0) },
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -7) },
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -14) },
    ];
    expect(streak(contributions, 7)).toBe(3);
  });

  it("fortnightly gap tolerance: 15 days apart -> counts", () => {
    const contributions: EngineContribution[] = [
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, 0) },
      { goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -15) },
    ];
    expect(streak(contributions, 14)).toBe(2);
  });
});

describe("already checked in this cycle — A3 formula (see GAP note at the top of this file)", () => {
  it("latest today, weekly -> true", () => {
    const contributions: EngineContribution[] = [{ goalId: "g", amountCents: 26_000, occurredOn: TODAY }];
    expect(checkedInThisCycle(contributions, TODAY, 7)).toBe(true);
  });

  it("latest 7 days ago, weekly -> false", () => {
    const contributions: EngineContribution[] = [{ goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -7) }];
    expect(checkedInThisCycle(contributions, TODAY, 7)).toBe(false);
  });

  it("latest 6 days ago, weekly -> true", () => {
    const contributions: EngineContribution[] = [{ goalId: "g", amountCents: 26_000, occurredOn: addDays(TODAY, -6) }];
    expect(checkedInThisCycle(contributions, TODAY, 7)).toBe(true);
  });
});
