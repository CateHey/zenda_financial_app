// lib/data/templates.test.ts — ZENDA_TEST_SPEC.md Layer 1, "templates.test.ts" (D7 fallbacks).
//
// Written once lib/data/templates.ts (templateWhy / templateCelebration) existed with an
// exported surface to test — it did not exist yet at the start of this session (only a private,
// unexported `templateWhy` inside lib/data/recompute.ts, which this session could not touch or
// import from; see this session's report for that timeline). The parallel session building
// tasks 8-10 has since extracted it here, so this file now covers the D7 fallbacks for real.

import { describe, expect, it } from "vitest";
import { findBannedTerms } from "../ai/banned-terms";
import { templateCelebration, templateWhy } from "./templates";

const WHY_PATTERN = /^\$[\d,]+ by [A-Za-z]+ \d{4}\. At \$[\d,]+\/week that lands (on time|in [A-Za-z]+ \d{4}|later than planned)\.$/;

const STARTED_ON = "2026-09-01";
const CURRENCY = "AUD";
const WEEKLY_CAPACITY_CENTS = 26_000; // $260/wk

describe("templateWhy — D7 fallback, one case per goal state", () => {
  it("achievable -> \"...lands on time.\"", () => {
    const why = templateWhy(
      { target_cents: 400_000, target_date: "2027-01-10" },
      { achievable: true, completionMonth: 4 },
      STARTED_ON,
      WEEKLY_CAPACITY_CENTS,
      CURRENCY,
    );
    expect(why).toMatch(WHY_PATTERN);
    expect(why).toContain("$4,000");
    expect(why).toContain("January 2027");
    expect(why).toContain("lands on time");
    expect(findBannedTerms(why)).toEqual([]);
  });

  it("not achievable -> \"...lands in <Month YYYY>.\"", () => {
    const why = templateWhy(
      { target_cents: 5_000_000, target_date: "2028-09-01" },
      { achievable: false, completionMonth: 41 },
      STARTED_ON,
      WEEKLY_CAPACITY_CENTS,
      CURRENCY,
    );
    expect(why).toMatch(WHY_PATTERN);
    expect(why).toContain("$50,000");
    expect(why).toContain("September 2028");
    expect(why).toContain("lands in");
    expect(findBannedTerms(why)).toEqual([]);
  });

  it("growth_required (long-horizon, not achievable at capacity) -> \"...lands in <Month YYYY>.\"", () => {
    const why = templateWhy(
      { target_cents: 24_000_000, target_date: "2033-09-01" },
      { achievable: false, completionMonth: 128 },
      STARTED_ON,
      WEEKLY_CAPACITY_CENTS,
      CURRENCY,
    );
    expect(why).toMatch(WHY_PATTERN);
    expect(why).toContain("$240,000");
    expect(why).toContain("September 2033");
    expect(findBannedTerms(why)).toEqual([]);
  });

  it("reached (already fully funded — immediate, on-time completion) -> \"...lands on time.\"", () => {
    const why = templateWhy(
      { target_cents: 50_000, target_date: "2026-10-01" },
      { achievable: true, completionMonth: 0 },
      STARTED_ON,
      WEEKLY_CAPACITY_CENTS,
      CURRENCY,
    );
    expect(why).toMatch(WHY_PATTERN);
    expect(why).toContain("$500");
    expect(why).toContain("October 2026");
    expect(why).toContain("lands on time");
    expect(findBannedTerms(why)).toEqual([]);
  });

  it("no contribution and short of target (completionMonth null) -> \"...lands later than planned.\"", () => {
    const why = templateWhy(
      { target_cents: 400_000, target_date: "2027-01-10" },
      { achievable: false, completionMonth: null },
      STARTED_ON,
      WEEKLY_CAPACITY_CENTS,
      CURRENCY,
    );
    expect(why).toMatch(WHY_PATTERN);
    expect(why).toContain("lands later than planned");
    expect(findBannedTerms(why)).toEqual([]);
  });
});

describe("templateCelebration — D7 fallback", () => {
  it("contains the amount and the next goal's title", () => {
    const celebration = templateCelebration(50_000, "Breathing room", "Peru", CURRENCY);
    expect(celebration).toContain("$500");
    expect(celebration).toContain("Breathing room");
    expect(celebration).toContain("Peru");
    expect(findBannedTerms(celebration)).toEqual([]);
  });

  it("no next goal -> a closing line that doesn't name a next title", () => {
    const celebration = templateCelebration(50_000, "Breathing room", null, CURRENCY);
    expect(celebration).toContain("$500");
    expect(celebration).toContain("Breathing room");
    expect(findBannedTerms(celebration)).toEqual([]);
  });
});
