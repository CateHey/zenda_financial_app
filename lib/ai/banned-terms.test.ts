// lib/ai/banned-terms.test.ts — ZENDA_TEST_SPEC.md Layer 1, "banned-terms.test.ts".

import { describe, expect, it } from "vitest";
import { findBannedTerms } from "./banned-terms";

describe("findBannedTerms — hits", () => {
  const hitCases = [
    "you should buy shares",
    "$VOO",
    "commbank",
    "bitcoin",
    "guaranteed returns",
  ];

  for (const text of hitCases) {
    it(`hits on "${text}"`, () => {
      expect(findBannedTerms(text)).not.toEqual([]);
    });
  }
});

describe("findBannedTerms — no hit", () => {
  const cleanCases = [
    "growth assets",
    "a savings account paying 5%",
    "the deposit lands around 2037",
  ];

  for (const text of cleanCases) {
    it(`no hit on "${text}"`, () => {
      expect(findBannedTerms(text)).toEqual([]);
    });
  }
});
