// lib/data/types.ts — A8: hand-written row types mirroring every D2 table, one per table.
// Cents as `number` (Supabase returns bigint columns as JS numbers/strings; PostgREST returns
// bigint as a JS number when it fits safely, which every cents value in this app does — no
// codegen, per A8). Dates are `string` (YYYY-MM-DD for `date` columns, ISO timestamp for
// `timestamptz` columns).

export type OrgRole = "admin" | "employee";
export type GoalKind = "travel" | "car" | "home" | "study" | "business" | "buffer" | "emergency" | "other";
export type GoalType = "savings_achievable" | "growth_required";
export type GoalStatus = "active" | "reached" | "paused";
export type ContributionKind = "checkin_full" | "checkin_partial" | "manual" | "seed";
export type EventKind = "milestone_reached" | "streak" | "nudge" | "adapted" | "trade_off";
export type PayCycle = "weekly" | "fortnightly" | "monthly";
export type RiskComfort = "low" | "medium" | "high";

export type OrganisationRow = {
  id: string;
  name: string;
  join_code: string;
  seat_limit: number;
  created_at: string;
};

export type ProfileRow = {
  user_id: string;
  org_id: string;
  role: OrgRole;
  display_name: string;
  currency: string;
  pay_cycle: PayCycle;
  take_home_cents: number;
  essentials_cents: number;
  lifestyle_cents: number;
  buffer_cents: number;
  savings_cents: number;
  debt_cents: number;
  debt_rate_bps: number;
  risk_comfort: RiskComfort;
  freedom_text: string | null;
  started_on: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type GoalRow = {
  id: string;
  user_id: string;
  kind: GoalKind;
  title: string;
  target_cents: number;
  starting_balance_cents: number;
  target_date: string;
  priority: number;
  goal_type: GoalType;
  status: GoalStatus;
  why: string | null;
  reached_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContributionRow = {
  id: string;
  user_id: string;
  goal_id: string;
  amount_cents: number;
  occurred_on: string;
  kind: ContributionKind;
  note?: string | null;
  created_at: string;
};

export type AssumptionRow = {
  key: string;
  value: number;
  description: string;
};

export type CurveJsonPoint = { m: number; balance_cents: number };

export type GoalProjectionRow = {
  goal_id: string;
  user_id: string;
  computed_at: string;
  rate_annual: number;
  capacity_monthly_cents: number;
  start_month: number;
  completion_month: number | null;
  required_monthly_cents: number;
  achievable: boolean;
  alt_later_months: number | null;
  alt_smaller_target_cents: number | null;
  alt_extra_monthly_cents: number | null;
  curve: CurveJsonPoint[];
};

export type MotivationalEventRow = {
  id: string;
  user_id: string;
  goal_id: string | null;
  kind: EventKind;
  message: string;
  payload: Record<string, unknown>;
  seen_at: string | null;
  created_at: string;
};

export type LessonRow = {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  trigger_tag: string;
  created_at: string;
};

/** A goal joined with its latest (possibly absent) projection row — the shape every screen wants. */
export type GoalWithProjection = GoalRow & { projection: GoalProjectionRow | null };

/**
 * The chip-selectable goal kinds (S1 goal chips, A5). `buffer` and `emergency` are the two
 * foundation kinds `/api/discover` creates itself and are never part of a submitted goals list.
 */
export const CHOOSABLE_GOAL_KINDS = ["travel", "car", "home", "study", "business", "other"] as const;

