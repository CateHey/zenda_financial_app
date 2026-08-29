// lib/ai/run.ts — D7 calls 1 & 2, orchestrated. Trigger points are route handlers' after()
// callbacks (D5, D10 task 11) — wired in app/api/discover, app/api/checkin and
// app/api/goals/[id]/adjust (task 11).
//
// Both functions take the cookie-bound user Supabase client (never the service role — D5's
// boundary rule) plus the ids they need, load data via lib/data/queries.ts, call the Anthropic
// wrapper (lib/ai/client.ts) directly (there is no client-callable AI endpoint — D5), gate every
// string that would reach a person through lib/ai/banned-terms.ts, and never throw: a failure is
// always a logged, returned { ok: false, reason } so a route's after() callback can never affect
// the response it already sent.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnthropicClient } from "./client";
import { aiEnabled } from "./enabled";
import { findBannedTerms } from "./banned-terms";
import {
  DISCOVER_REFLECTION_SYSTEM,
  ROADMAP_COPY_SYSTEM,
  discoverReflectionOutput,
  roadmapCopyOutput,
} from "./prompts";
import { getCurrentGoal, getGoalsWithProjections, getProfile } from "@/lib/data/queries";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";
import type { GoalProjectionRow, GoalWithProjection } from "@/lib/data/types";

export type RunResult = { ok: true } | { ok: false; reason: string };

/**
 * A6's per-kind default titles — a goal whose title still equals this is "the user left the
 * default" (D7 call 1: "extracted titles replace goal titles only where the user left the
 * default"). Kept local rather than imported from app/discover/discover-client.tsx (a file this
 * session doesn't own, per the D10 task-11 file-ownership split) — both are transcriptions of
 * the same addendum A6 table and can drift independently without breaking either side.
 */
const DEFAULT_TITLE: Record<string, string> = {
  travel: "A trip",
  car: "A car",
  home: "A first home",
  study: "Study",
  business: "A business",
};

/** Returns the string when it passes the banned-terms gate, otherwise null (D7: "a hit → keep the template, discard the AI text"). */
function clean(text: string | undefined | null): string | null {
  if (!text) return null;
  return findBannedTerms(text).length > 0 ? null : text;
}

/**
 * Call 1 (D7) — Discover reflection + goal extraction. Trigger: POST /api/discover, after the
 * response. Loads the profile's `freedom_text` and the user's active, chip-selectable goals
 * (buffer/emergency are foundation goals, A5, and are never part of this call). On success:
 * writes the reflection into a `motivational_events` row (`kind: "nudge"`,
 * `payload: { reflection: true }`) that the Discover screen's third bubble picks up on its next
 * load (lib/data/queries.ts's getLatestReflectionEvent); a banned-terms hit on the reflection
 * means nothing is written — the template bubble already shown stands. Extracted goal titles
 * overwrite a goal's title only where that goal's title is still the A6 default for its kind,
 * matched by kind, and only when the extracted title itself is clean.
 */
export async function runDiscoverReflection(supabase: SupabaseClient, userId: string): Promise<RunResult> {
  try {
    if (!aiEnabled()) return { ok: false, reason: "ai_disabled" };

    const [profile, goals] = await Promise.all([getProfile(supabase), getGoalsWithProjections(supabase)]);
    if (!profile) return { ok: false, reason: "no_profile" };

    const choosable = new Set<string>(CHOOSABLE_GOAL_KINDS);
    const selected = goals.filter((g) => g.status === "active" && choosable.has(g.kind));
    if (selected.length === 0) return { ok: false, reason: "no_goals" };

    const client = createAnthropicClient();
    const user = JSON.stringify({
      freedom_text: profile.freedom_text ?? "",
      goals: selected.map((g) => ({
        kind: g.kind,
        title: g.title,
        target_cents: g.target_cents,
        target_date: g.target_date,
      })),
    });

    const result = await client.structured({
      system: [{ type: "text", text: DISCOVER_REFLECTION_SYSTEM, cache_control: { type: "ephemeral" } }],
      user,
      schema: discoverReflectionOutput,
      effort: "low",
      maxTokens: 600,
    });

    if (result.output === null) {
      return { ok: false, reason: `no_output (stop_reason=${result.stopReason ?? "unknown"})` };
    }

    const reflection = clean(result.output.reflection);
    if (reflection) {
      const { error } = await supabase.from("motivational_events").insert({
        user_id: userId,
        kind: "nudge",
        message: reflection,
        payload: { reflection: true },
      });
      if (error) return { ok: false, reason: `insert_failed: ${error.message}` };
    }

    const selectedByKind = new Map(selected.map((g) => [g.kind, g]));
    for (const extracted of result.output.goals) {
      const goal = selectedByKind.get(extracted.kind);
      if (!goal) continue;
      if (goal.title !== DEFAULT_TITLE[extracted.kind]) continue; // user already renamed it
      const title = clean(extracted.title);
      if (!title) continue;
      const { error } = await supabase.from("goals").update({ title }).eq("id", goal.id).eq("user_id", userId);
      if (error) return { ok: false, reason: `title_update_failed: ${error.message}` };
    }

    return { ok: true };
  } catch (err) {
    console.error("runDiscoverReflection failed", err);
    return { ok: false, reason: "exception" };
  }
}

type GoalWithProjectionRow = GoalWithProjection & { projection: GoalProjectionRow };

/**
 * D7's cache rule: "goals.why is the cache; re-run only when the goal's projection row changes
 * (computed_at newer than goals.updated_at)." A goal with no `why` yet has nothing cached and
 * always regenerates; otherwise regenerate only when the projection is strictly newer than the
 * goal row's last write (parsed to epoch ms — computed_at and updated_at can come back from
 * PostgREST with different ISO formatting, e.g. "+00:00" vs "Z", so a raw string compare isn't
 * safe). This is a cost guard, not a clock read (A12): it orders two stored timestamps, it never
 * asks what time it is now.
 */
function needsRegeneration(goal: GoalWithProjectionRow): boolean {
  if (!goal.why) return true;
  return new Date(goal.projection.computed_at).getTime() > new Date(goal.updated_at).getTime();
}

/**
 * Call 2 (D7) — Roadmap copy. Trigger: after POST /api/discover, POST /api/prioritise,
 * POST /api/goals/[id]/adjust, and (pass the new event's id as `eventId`) a `milestone_reached`
 * check-in. Loads every active goal that has a projection (lib/data/recompute.ts has already run
 * by the time after() fires) and, when `eventId` is given, the reached goal + the new current
 * goal (via getCurrentGoal — by the time this runs the reached goal is already marked `reached`,
 * so "current" already means "next"). The request sent to the model is narrowed to the goals
 * `needsRegeneration` flags (the D7 cache rule, above) — a goal whose why is already caught up
 * with its latest projection is never re-sent, which is the actual cost saving (fewer goals in,
 * fewer whys out). On success: each returned `why` overwrites its goal's `why`; a `celebration`
 * line overwrites the given event's `message`, but only when `eventId` was passed (a
 * discover/prioritise/adjust call has no event to attach one to, so any `celebration` the model
 * still returned is ignored). A banned-terms hit discards only that one string — the template
 * lib/data/recompute.ts / the checkin route already wrote stands for it.
 */
export async function runRoadmapCopy(
  supabase: SupabaseClient,
  userId: string,
  eventId?: string,
): Promise<RunResult> {
  try {
    if (!aiEnabled()) return { ok: false, reason: "ai_disabled" };

    const goals = await getGoalsWithProjections(supabase);
    const active = goals.filter(
      (g): g is GoalWithProjectionRow => g.status === "active" && g.projection !== null,
    );
    if (active.length === 0) return { ok: false, reason: "no_goals" };

    let milestone: { goal_id: string; amount_cents: number; title: string; next_goal_title: string | null } | null =
      null;

    if (eventId) {
      const { data: eventRow, error: eventError } = await supabase
        .from("motivational_events")
        .select("id, user_id, goal_id, kind")
        .eq("id", eventId)
        .eq("user_id", userId)
        .maybeSingle();
      if (eventError) return { ok: false, reason: `event_read_failed: ${eventError.message}` };

      if (eventRow && eventRow.kind === "milestone_reached" && eventRow.goal_id) {
        const { data: reachedGoal, error: reachedError } = await supabase
          .from("goals")
          .select("id, title, target_cents")
          .eq("id", eventRow.goal_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (reachedError) return { ok: false, reason: `reached_goal_read_failed: ${reachedError.message}` };

        if (reachedGoal) {
          const next = await getCurrentGoal(supabase);
          milestone = {
            goal_id: reachedGoal.id as string,
            amount_cents: reachedGoal.target_cents as number,
            title: reachedGoal.title as string,
            next_goal_title: next && next.id !== reachedGoal.id ? next.title : null,
          };
        }
      }
    }

    // D7 cache rule (cost guard): only ask the model to rewrite a `why` whose projection has
    // moved since it was last written. A milestone still gets its celebration line even when no
    // goal's why needs a rewrite — those are independent outputs of the one call.
    const toRegen = active.filter(needsRegeneration);
    if (toRegen.length === 0 && !milestone) {
      return { ok: false, reason: "up_to_date" };
    }

    const client = createAnthropicClient();
    const user = JSON.stringify({
      goals: toRegen.map((g) => ({
        goal_id: g.id,
        title: g.title,
        target_cents: g.target_cents,
        target_date: g.target_date,
        capacity_monthly_cents: g.projection.capacity_monthly_cents,
        achievable: g.projection.achievable,
        completion_month: g.projection.completion_month,
        alt_later_months: g.projection.alt_later_months,
        alt_smaller_target_cents: g.projection.alt_smaller_target_cents,
        alt_extra_monthly_cents: g.projection.alt_extra_monthly_cents,
      })),
      milestone,
    });

    const result = await client.structured({
      system: [{ type: "text", text: ROADMAP_COPY_SYSTEM, cache_control: { type: "ephemeral" } }],
      user,
      schema: roadmapCopyOutput,
      effort: "low",
      maxTokens: 600,
    });

    if (result.output === null) {
      return { ok: false, reason: `no_output (stop_reason=${result.stopReason ?? "unknown"})` };
    }

    const knownIds = new Set(toRegen.map((g) => g.id));
    for (const w of result.output.whys) {
      if (!knownIds.has(w.goal_id)) continue;
      const why = clean(w.why);
      if (!why) continue;
      const { error } = await supabase.from("goals").update({ why }).eq("id", w.goal_id).eq("user_id", userId);
      if (error) return { ok: false, reason: `why_update_failed: ${error.message}` };
    }

    if (milestone && eventId) {
      const celebration = clean(result.output.celebration);
      if (celebration) {
        const { error } = await supabase
          .from("motivational_events")
          .update({ message: celebration })
          .eq("id", eventId)
          .eq("user_id", userId);
        if (error) return { ok: false, reason: `celebration_update_failed: ${error.message}` };
      }
    }

    return { ok: true };
  } catch (err) {
    console.error("runRoadmapCopy failed", err);
    return { ok: false, reason: "exception" };
  }
}
