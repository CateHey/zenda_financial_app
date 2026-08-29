// lib/ai/prompts.ts — D7's two system prompts, verbatim, and their Zod output schemas.
// Both prompts are quoted exactly as ZENDA_BUILD_SPEC.md §D7 states them — do not reword.

import { z } from "zod";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Call 1 — Discover reflection + goal extraction ----------

/** D7 call 1 system prompt — verbatim. */
export const DISCOVER_REFLECTION_SYSTEM =
  'You are Zenda, a calm financial-wellbeing guide. You are given what a person said they want their life to look like, and the goals they selected. Write one warm reflection sentence (max 22 words) that names their goals in their own words, without praise words like "amazing". Then return the goals as structured data. Never give financial advice, never name products, banks, funds or tickers, never use the words "should buy" or "should sell". Plain language.';

/** D7 call 1 output schema — `{ reflection, goals: [{ kind, title <=40, target_cents, target_date }] }`. */
export const discoverReflectionOutput = z.object({
  reflection: z.string(),
  goals: z.array(
    z.object({
      kind: z.enum(CHOOSABLE_GOAL_KINDS),
      title: z.string().max(40),
      target_cents: z.number().int(),
      target_date: z.string().regex(ISO_DATE),
    }),
  ),
});
export type DiscoverReflectionOutput = z.infer<typeof discoverReflectionOutput>;

// ---------- Call 2 — Roadmap copy ----------

/** D7 call 2 system prompt — verbatim. */
export const ROADMAP_COPY_SYSTEM =
  'You are Zenda. For each goal you receive computed numbers: target, date, monthly capacity, whether it is achievable, the months it takes, and any alternatives. Write for each goal a "why" of at most 26 words that states the numbers plainly and names the lever if it is not achievable. If a milestone was just reached, also write one celebration line of at most 18 words that says the amount and how much closer the next goal is. Never say "impossible". Never give financial advice, name products, banks, funds or tickers, or say "should buy/sell". No exclamation marks except in the celebration line.';

/** D7 call 2 output schema — `{ whys: [{ goal_id, why }], celebration? }`. */
export const roadmapCopyOutput = z.object({
  whys: z.array(
    z.object({
      goal_id: z.string().uuid(),
      why: z.string(),
    }),
  ),
  celebration: z.string().optional(),
});
export type RoadmapCopyOutput = z.infer<typeof roadmapCopyOutput>;
