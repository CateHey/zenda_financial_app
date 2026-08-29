import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { aiEnabled } from "@/lib/ai/enabled";
import { findBannedTerms } from "@/lib/ai/banned-terms";
import { DISCLAIMER } from "@/lib/engine/types";
import { HttpError, ok, requireUser, withHandler } from "@/lib/api/respond";

const body = z.object({ question: z.string().trim().min(1).max(500) });

const SYSTEM = `You are Zenda, a calm financial-wellbeing guide inside the Zenda app. You answer questions about the person's own roadmap using ONLY the numbers provided below — they were computed by a deterministic engine; never recompute or contradict them, never invent figures. Plain language, at most 90 words, no bullet lists unless asked. Never give personal financial advice: never name products, banks, funds, tickers or coins, never say "you should buy/sell", never use the word "impossible". If the question is outside the person's roadmap, say so briefly and point them back to their path.`;

// Ask Zenda: server-side only, the key never leaves the server, the engine's numbers are the
// context, and every answer passes the banned-terms gate.
export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();
  if (!aiEnabled()) throw new HttpError(503, "ai_off");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "validation", { issues: parsed.error.issues });

  const [{ data: profile }, { data: goals }, { data: projections }] = await Promise.all([
    supabase.from("profiles").select("display_name, pay_cycle, take_home_cents, essentials_cents, lifestyle_cents, buffer_cents, savings_cents, debt_cents, debt_rate_bps, started_on").eq("user_id", userId).maybeSingle(),
    supabase.from("goals").select("id, kind, title, target_cents, target_date, priority, goal_type, status, why").eq("user_id", userId).order("target_date"),
    supabase.from("goal_projections").select("goal_id, completion_month, required_monthly_cents, capacity_monthly_cents, achievable, alt_later_months, alt_smaller_target_cents, alt_extra_monthly_cents").eq("user_id", userId),
  ]);
  const money = (c: number | null | undefined) => `$${Math.round((c ?? 0) / 100).toLocaleString("en-AU")}`;
  const projByGoal = new Map((projections ?? []).map((p) => [p.goal_id, p]));
  const lines: string[] = [];
  if (profile) {
    lines.push(`Person: ${profile.display_name}. Pay cycle: ${profile.pay_cycle}. Started on ${profile.started_on}.`);
    lines.push(`Per cycle: take-home ${money(profile.take_home_cents)}, essentials ${money(profile.essentials_cents)}, lifestyle ${money(profile.lifestyle_cents)}, buffer line ${money(profile.buffer_cents)}, savings ${money(profile.savings_cents)}, debt ${money(profile.debt_cents)} at ${(profile.debt_rate_bps ?? 0) / 100}%.`);
  }
  for (const g of goals ?? []) {
    const p = projByGoal.get(g.id);
    lines.push(
      `Goal "${g.title}" (${g.kind}, priority ${g.priority}, ${g.status}, ${g.goal_type}): target ${money(g.target_cents)} by ${g.target_date}.` +
        (p
          ? ` Engine: monthly capacity ${money(p.capacity_monthly_cents)}, needs ${money(p.required_monthly_cents)}/month, ${p.achievable ? "achievable" : "not achievable at this capacity"}, completion month ${p.completion_month ?? "not yet"}` +
            (p.alt_later_months ? `, or ${p.alt_later_months} months later at capacity` : "") +
            (p.alt_smaller_target_cents ? `, or ${money(p.alt_smaller_target_cents)} by the same date` : "") +
            (p.alt_extra_monthly_cents ? `, or ${money(p.alt_extra_monthly_cents)} more per month` : "") +
            "."
          : "") +
        (g.why ? ` Why: ${g.why}` : ""),
    );
  }
  lines.push(`Planning rates: 5% cash for money needed within 3 years, 9% growth for 5+ years, 12% shown only as upside.`);

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 400,
    output_config: { effort: "low" },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `The person's roadmap:\n${lines.join("\n")}\n\nTheir question: ${parsed.data.question}` }],
  });
  if (res.stop_reason === "refusal") throw new HttpError(502, "refused");
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!text || findBannedTerms(text).length > 0) {
    return ok({
      answer: "I can explain your path, but not recommend products. Every number on your roadmap comes from your own figures — open a milestone to read its why.",
    });
  }
  return ok({ answer: text, disclaimer: DISCLAIMER });
});
