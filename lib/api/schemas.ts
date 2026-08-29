// lib/api/schemas.ts — the Zod body schemas for all six D5 routes, in one module so the route
// handlers and any test session import the same source of truth. Names are exact per the task
// brief: profileBody, discoverBody, prioritiseBody, adjustBody, checkinBody, adaptBody.

import { z } from "zod";
import { todayIso } from "@/lib/engine/today";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";

export const PAY_CYCLES = ["weekly", "fortnightly", "monthly"] as const;
export const RISK_LEVELS = ["low", "medium", "high"] as const;

/** ISO YYYY-MM-DD, strictly after today (A12's todayIso — never a raw new Date()). */
export const isoFutureDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)")
  .refine((d) => d > todayIso(), "must be a future date");

// ---------- POST /api/profile ----------
export const profileBody = z.object({
  display_name: z.string().min(1).max(60),
  join_code: z.string().min(1),
});

// ---------- POST /api/discover ----------
export const discoverGoalBody = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(CHOOSABLE_GOAL_KINDS),
  title: z.string().min(1).max(80),
  target_cents: z.number().int().positive(),
  target_date: isoFutureDate,
  starting_balance_cents: z.number().int().nonnegative().optional(),
});

export const discoverBody = z.object({
  freedom_text: z.string().max(600).optional(),
  pay_cycle: z.enum(PAY_CYCLES),
  take_home_cents: z.number().int().nonnegative(),
  essentials_cents: z.number().int().nonnegative(),
  lifestyle_cents: z.number().int().nonnegative(),
  buffer_cents: z.number().int().nonnegative(),
  savings_cents: z.number().int().nonnegative(),
  debt_cents: z.number().int().nonnegative(),
  debt_rate_bps: z.number().int().nonnegative(),
  risk_comfort: z.enum(RISK_LEVELS),
  goals: z.array(discoverGoalBody).min(1).max(6),
});

// ---------- POST /api/prioritise ----------
export const prioritiseBody = z.object({
  ordered_goal_ids: z.array(z.string().uuid()).min(1),
});

// ---------- POST /api/goals/[id]/adjust ----------
export const adjustBody = z
  .object({
    target_cents: z.number().int().positive().optional(),
    target_date: isoFutureDate.optional(),
  })
  .refine((b) => b.target_cents !== undefined || b.target_date !== undefined, {
    message: "at least one of target_cents or target_date is required",
  });

// ---------- POST /api/checkin ----------
export const checkinBody = z
  .object({
    goal_id: z.string().uuid(),
    kind: z.enum(["full", "partial", "skip"]),
    amount_cents: z.number().int().nonnegative().optional(),
  })
  .refine((b) => b.kind !== "partial" || b.amount_cents !== undefined, {
    message: "partial check-in requires amount_cents",
    path: ["amount_cents"],
  });

// ---------- POST /api/adapt ----------
// "Same numbers block as /api/discover (no goals, no freedom_text) + strategy" (D5).
export const adaptBody = z.object({
  pay_cycle: z.enum(PAY_CYCLES),
  take_home_cents: z.number().int().nonnegative(),
  essentials_cents: z.number().int().nonnegative(),
  lifestyle_cents: z.number().int().nonnegative(),
  buffer_cents: z.number().int().nonnegative(),
  savings_cents: z.number().int().nonnegative(),
  debt_cents: z.number().int().nonnegative(),
  debt_rate_bps: z.number().int().nonnegative(),
  risk_comfort: z.enum(RISK_LEVELS),
  strategy: z.enum(["accept", "protect_dates"]),
});
