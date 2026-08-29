// lib/api/schemas.test.ts — ZENDA_TEST_SPEC.md Layer 1, "schemas.test.ts": one valid sample
// parses and one invalid sample fails per route (profile, discover, prioritise, adjust, checkin,
// adapt), covering: negative cents rejected, past target_date rejected, goals length 0 and 7
// rejected, checkin.partial without amount rejected, adjust with neither field rejected.
//
// Names match the real exports in lib/api/schemas.ts exactly: profileBody, discoverBody,
// prioritiseBody, adjustBody, checkinBody, adaptBody (plus discoverGoalBody, isoFutureDate,
// PAY_CYCLES, RISK_LEVELS — the schema module's own building blocks).

import { describe, expect, it } from "vitest";
import {
  adaptBody,
  adjustBody,
  checkinBody,
  discoverBody,
  discoverGoalBody,
  isoFutureDate,
  prioritiseBody,
  profileBody,
} from "./schemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const FUTURE_DATE = "2099-01-01"; // always after "today" for the life of this test suite
const PAST_DATE = "2020-01-01";

function validDiscoverGoal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    kind: "travel",
    title: "A trip",
    target_cents: 400_000,
    target_date: FUTURE_DATE,
    ...overrides,
  };
}

/** The numbers block shared by discoverBody and adaptBody (D5: "adapt = discover's numbers
 * block, no goals/freedom_text, + strategy"). */
function validNumbersBlock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pay_cycle: "weekly",
    take_home_cents: 110_000,
    essentials_cents: 59_000,
    lifestyle_cents: 25_000,
    buffer_cents: 10_000,
    savings_cents: 0,
    debt_cents: 3_000_000,
    debt_rate_bps: 280,
    risk_comfort: "high",
    ...overrides,
  };
}

describe("isoFutureDate", () => {
  it("accepts a future ISO date", () => {
    expect(isoFutureDate.safeParse(FUTURE_DATE).success).toBe(true);
  });

  it("rejects a past date", () => {
    const result = isoFutureDate.safeParse(PAST_DATE);
    expect(result.success).toBe(false);
  });

  it("rejects a non-ISO string", () => {
    expect(isoFutureDate.safeParse("01/01/2099").success).toBe(false);
  });
});

describe("profileBody — POST /api/profile", () => {
  it("valid: display_name + join_code", () => {
    const result = profileBody.safeParse({ display_name: "Cat", join_code: "DEMO" });
    expect(result.success).toBe(true);
  });

  it("invalid: empty display_name", () => {
    const result = profileBody.safeParse({ display_name: "", join_code: "DEMO" });
    expect(result.success).toBe(false);
  });

  it("invalid: missing join_code", () => {
    const result = profileBody.safeParse({ display_name: "Cat" });
    expect(result.success).toBe(false);
  });
});

describe("discoverGoalBody", () => {
  it("valid sample", () => {
    expect(discoverGoalBody.safeParse(validDiscoverGoal()).success).toBe(true);
  });

  it("rejects a non-positive target_cents", () => {
    expect(discoverGoalBody.safeParse(validDiscoverGoal({ target_cents: 0 })).success).toBe(false);
  });

  it("rejects a past target_date", () => {
    expect(discoverGoalBody.safeParse(validDiscoverGoal({ target_date: PAST_DATE })).success).toBe(false);
  });

  it("rejects a kind outside CHOOSABLE_GOAL_KINDS (buffer/emergency are foundation-only, A5)", () => {
    expect(discoverGoalBody.safeParse(validDiscoverGoal({ kind: "buffer" })).success).toBe(false);
  });
});

describe("discoverBody — POST /api/discover", () => {
  it("valid: one goal, non-negative numbers", () => {
    const result = discoverBody.safeParse({ ...validNumbersBlock(), goals: [validDiscoverGoal()] });
    expect(result.success).toBe(true);
  });

  it("invalid: negative cents (take_home_cents)", () => {
    const result = discoverBody.safeParse({
      ...validNumbersBlock({ take_home_cents: -100 }),
      goals: [validDiscoverGoal()],
    });
    expect(result.success).toBe(false);
  });

  it("invalid: a goal with a past target_date", () => {
    const result = discoverBody.safeParse({
      ...validNumbersBlock(),
      goals: [validDiscoverGoal({ target_date: PAST_DATE })],
    });
    expect(result.success).toBe(false);
  });

  it("invalid: goals length 0 (min 1)", () => {
    const result = discoverBody.safeParse({ ...validNumbersBlock(), goals: [] });
    expect(result.success).toBe(false);
  });

  it("invalid: goals length 7 (max 6)", () => {
    const sevenGoals = Array.from({ length: 7 }, (_, i) => validDiscoverGoal({ title: `Goal ${i}` }));
    const result = discoverBody.safeParse({ ...validNumbersBlock(), goals: sevenGoals });
    expect(result.success).toBe(false);
  });

  it("accepts goals length 6 (the max)", () => {
    const sixGoals = Array.from({ length: 6 }, (_, i) => validDiscoverGoal({ title: `Goal ${i}` }));
    const result = discoverBody.safeParse({ ...validNumbersBlock(), goals: sixGoals });
    expect(result.success).toBe(true);
  });
});

describe("prioritiseBody — POST /api/prioritise", () => {
  it("valid: one ordered goal id", () => {
    expect(prioritiseBody.safeParse({ ordered_goal_ids: [VALID_UUID] }).success).toBe(true);
  });

  it("invalid: empty array (min 1)", () => {
    expect(prioritiseBody.safeParse({ ordered_goal_ids: [] }).success).toBe(false);
  });

  it("invalid: not a uuid", () => {
    expect(prioritiseBody.safeParse({ ordered_goal_ids: ["not-a-uuid"] }).success).toBe(false);
  });
});

describe("adjustBody — POST /api/goals/[id]/adjust", () => {
  it("valid: target_cents only", () => {
    expect(adjustBody.safeParse({ target_cents: 2_500_000 }).success).toBe(true);
  });

  it("valid: target_date only", () => {
    expect(adjustBody.safeParse({ target_date: FUTURE_DATE }).success).toBe(true);
  });

  it("invalid: neither field present", () => {
    const result = adjustBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("invalid: negative target_cents", () => {
    expect(adjustBody.safeParse({ target_cents: -500_000 }).success).toBe(false);
  });

  it("invalid: past target_date", () => {
    expect(adjustBody.safeParse({ target_date: PAST_DATE }).success).toBe(false);
  });
});

describe("checkinBody — POST /api/checkin", () => {
  it("valid: kind full, no amount required", () => {
    expect(checkinBody.safeParse({ goal_id: VALID_UUID, kind: "full" }).success).toBe(true);
  });

  it("valid: kind partial with amount_cents", () => {
    expect(checkinBody.safeParse({ goal_id: VALID_UUID, kind: "partial", amount_cents: 10_000 }).success).toBe(true);
  });

  it("valid: kind skip, no amount required", () => {
    expect(checkinBody.safeParse({ goal_id: VALID_UUID, kind: "skip" }).success).toBe(true);
  });

  it("invalid: kind partial without amount_cents", () => {
    const result = checkinBody.safeParse({ goal_id: VALID_UUID, kind: "partial" });
    expect(result.success).toBe(false);
  });

  it("invalid: negative amount_cents", () => {
    expect(checkinBody.safeParse({ goal_id: VALID_UUID, kind: "partial", amount_cents: -1 }).success).toBe(false);
  });

  it("invalid: goal_id not a uuid", () => {
    expect(checkinBody.safeParse({ goal_id: "nope", kind: "full" }).success).toBe(false);
  });
});

describe("adaptBody — POST /api/adapt", () => {
  it("valid: numbers block + strategy accept", () => {
    expect(adaptBody.safeParse({ ...validNumbersBlock(), strategy: "accept" }).success).toBe(true);
  });

  it("valid: strategy protect_dates", () => {
    expect(adaptBody.safeParse({ ...validNumbersBlock(), strategy: "protect_dates" }).success).toBe(true);
  });

  it("invalid: negative cents (essentials_cents)", () => {
    const result = adaptBody.safeParse({ ...validNumbersBlock({ essentials_cents: -1 }), strategy: "accept" });
    expect(result.success).toBe(false);
  });

  it("invalid: missing strategy", () => {
    expect(adaptBody.safeParse(validNumbersBlock()).success).toBe(false);
  });

  it("invalid: unknown strategy value", () => {
    expect(adaptBody.safeParse({ ...validNumbersBlock(), strategy: "give_up" }).success).toBe(false);
  });
});
