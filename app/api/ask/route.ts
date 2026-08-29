import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { aiEnabled } from "@/lib/ai/enabled";
import { findBannedTerms } from "@/lib/ai/banned-terms";
import { DISCLAIMER } from "@/lib/engine/types";
import { todayIso } from "@/lib/engine/today";
import { waterfall } from "@/lib/engine/waterfall";
import { capacityMonthlyCents, monthDate, monthIndex, todayMonth } from "@/lib/engine/rates";
import { assumptionsToEngine } from "@/lib/data/queries";
import type { AssumptionRow } from "@/lib/data/types";
import type { EngineGoal } from "@/lib/engine/types";
import { HttpError, ok, requireUser, withHandler } from "@/lib/api/respond";

const body = z.object({
  question: z.string().trim().min(1).max(600),
  history: z.array(z.object({ role: z.enum(["me", "zenda"]), text: z.string().max(1200) })).max(12).optional(),
});

const output = z.object({
  reply: z.string().max(700),
  proposal: z
    .object({
      goal_id: z.string().uuid(),
      label: z.string().max(80),
      target_cents: z.number().int().positive().optional(),
      target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .nullable(),
});

const SYSTEM = `You are the Zenda Coach: a personal, goal-based financial coach inside the Zenda app. You know this person's whole picture (below): their pay, expenses, weekly capacity, every goal with its engine-computed dates, their progress and streak. They may ask questions OR share ideas and situations ("I want to buy a $180 concert ticket", "my rent went up", "I got a $1,000 bonus", "can we move the car later?").

Rules:
- Use ONLY the numbers provided. The engine computed them; never recompute or invent figures. Where a "precomputed effect" is listed for the amounts they mentioned, use it verbatim.
- Be warm, direct and plain. At most 80 words. No lists unless asked. Name the goal and the date that moves.
- Never shame. A spend is a choice; show what it costs in paydays and offer one way to protect the date.
- When a concrete change to a goal would help and they seem to want it, return a proposal with the goal_id and the new target_date and/or target_cents (only values you can justify from the numbers given) and a short label like "Move Peru to 17 January 2027". Otherwise proposal is null. Never propose changes they did not ask for.
- ORDER: money flows to goals in date order. If the person wants one goal to come after/before another ("Peru after the car", "car first"), use the matching "Reorder scenario" below verbatim — its dates come from the engine — and return exactly its proposal (goal_id + target_date + the label given). Say what moves earlier and what moves later. Never invent a reorder date yourself.
- Never give personal financial advice: no products, banks, funds, tickers or coins, never "you should buy/sell", never the word "impossible". If asked, say Zenda gives general information only.`;

function isoPlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function money(c: number | null | undefined) {
  return `$${Math.round((c ?? 0) / 100).toLocaleString("en-AU")}`;
}

export const POST = withHandler(async (request: Request) => {
  const { userId, supabase } = await requireUser();
  if (!aiEnabled()) throw new HttpError(503, "ai_off");
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "validation", { issues: parsed.error.issues });
  const { question, history = [] } = parsed.data;

  const [{ data: profile }, { data: goals }, { data: projections }, { data: contributions }, { data: assumptionRows }] = await Promise.all([
    supabase.from("profiles").select("display_name, pay_cycle, take_home_cents, essentials_cents, lifestyle_cents, buffer_cents, savings_cents, debt_cents, debt_rate_bps, started_on").eq("user_id", userId).maybeSingle(),
    supabase.from("goals").select("id, kind, title, target_cents, target_date, priority, goal_type, status, why, starting_balance_cents").eq("user_id", userId).order("target_date"),
    supabase.from("goal_projections").select("goal_id, completion_month, required_monthly_cents, capacity_monthly_cents, achievable, alt_later_months, alt_smaller_target_cents, alt_extra_monthly_cents").eq("user_id", userId),
    supabase.from("contributions").select("goal_id, amount_cents, occurred_on").eq("user_id", userId).order("occurred_on", { ascending: false }).limit(60),
    supabase.from("assumptions").select("*"),
  ]);

  const today = todayIso();
  const cycleDays = profile?.pay_cycle === "fortnightly" ? 14 : profile?.pay_cycle === "monthly" ? 30 : 7;
  const perCycleCapacity = Math.max(0, (profile?.take_home_cents ?? 0) - (profile?.essentials_cents ?? 0) - (profile?.lifestyle_cents ?? 0));
  const projByGoal = new Map((projections ?? []).map((p) => [p.goal_id, p]));
  const savedByGoal = new Map<string, number>();
  for (const c of contributions ?? []) savedByGoal.set(c.goal_id, (savedByGoal.get(c.goal_id) ?? 0) + (c.amount_cents ?? 0));
  const active = (goals ?? []).filter((g) => g.status === "active");
  const current = active[0] ?? null;

  const lines: string[] = [`Today: ${today}.`];
  if (profile) {
    lines.push(`Person: ${profile.display_name}. Pay cycle: ${profile.pay_cycle} (${cycleDays} days). Per cycle: take-home ${money(profile.take_home_cents)}, essentials ${money(profile.essentials_cents)}, lifestyle/fun ${money(profile.lifestyle_cents)}, buffer line ${money(profile.buffer_cents)}, savings ${money(profile.savings_cents)}, debt ${money(profile.debt_cents)} at ${(profile.debt_rate_bps ?? 0) / 100}%. Capacity per cycle: ${money(perCycleCapacity)}.`);
  }
  for (const g of goals ?? []) {
    const p = projByGoal.get(g.id);
    const saved = (g.starting_balance_cents ?? 0) + (savedByGoal.get(g.id) ?? 0);
    lines.push(
      `Goal id ${g.id} "${g.title}" (${g.kind}, priority ${g.priority}, ${g.status}, ${g.goal_type}): target ${money(g.target_cents)} by ${g.target_date}; saved so far ${money(saved)}.` +
        (p ? ` Engine: ${p.achievable ? "achievable" : "not achievable at this capacity"}, needs ${money(p.required_monthly_cents)}/month, completion month ${p.completion_month ?? "not yet"}${p.alt_later_months ? `, or ${p.alt_later_months} months later at capacity` : ""}${p.alt_smaller_target_cents ? `, or ${money(p.alt_smaller_target_cents)} by the same date` : ""}${p.alt_extra_monthly_cents ? `, or ${money(p.alt_extra_monthly_cents)} more per month` : ""}.` : "") +
        (g.why ? ` Why: ${g.why}` : ""),
    );
  }
  // streak
  let streak = 0;
  let prev: string | null = null;
  for (const c of contributions ?? []) {
    if ((c.amount_cents ?? 0) <= 0) break;
    if (prev) {
      const gap = (new Date(`${prev}T00:00:00Z`).getTime() - new Date(`${c.occurred_on}T00:00:00Z`).getTime()) / 86_400_000;
      if (gap > cycleDays + 1) break;
    }
    streak += 1;
    prev = c.occurred_on;
  }
  lines.push(`Streak: ${streak} paydays in a row.`);

  // Precomputed effects for amounts mentioned in the question — deterministic, never the model's arithmetic.
  if (current && perCycleCapacity > 0) {
    const saved = (current.starting_balance_cents ?? 0) + (savedByGoal.get(current.id) ?? 0);
    const remaining = Math.max(0, current.target_cents - saved);
    const paydays = Math.ceil(remaining / perCycleCapacity);
    const eta = isoPlusDays(today, paydays * cycleDays);
    lines.push(`Current goal: "${current.title}" — ${money(remaining)} to go, ${paydays} paydays at ${money(perCycleCapacity)} per payday → about ${eta}.`);
    const amounts = [...question.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?/gi)].map((m) => Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1) * 100)).filter((c) => c > 0).slice(0, 3);
    for (const cents of amounts) {
      const delayPaydays = Math.ceil(cents / perCycleCapacity);
      const recoverPerPayday = Math.ceil(cents / 3);
      lines.push(`Precomputed effect of a one-off ${money(cents)}: "${current.title}" moves ${delayPaydays} payday(s) later (to about ${isoPlusDays(today, (paydays + delayPaydays) * cycleDays)}); to keep the date, set aside ${money(perCycleCapacity + recoverPerPayday)} instead of ${money(perCycleCapacity)} on the next 3 paydays.`);
      lines.push(`Precomputed effect of ${money(cents)} extra toward "${current.title}" right now: ${Math.max(0, paydays - Math.ceil(Math.max(0, remaining - cents) / perCycleCapacity))} fewer paydays (about ${isoPlusDays(today, Math.ceil(Math.max(0, remaining - cents) / perCycleCapacity) * cycleDays)}).`);
      const weeklyDown = perCycleCapacity - cents;
      if (weeklyDown > 0 && cents < perCycleCapacity) {
        lines.push(`Precomputed effect if capacity per payday drops by ${money(cents)} (to ${money(weeklyDown)}): "${current.title}" takes ${Math.ceil(remaining / weeklyDown)} paydays (about ${isoPlusDays(today, Math.ceil(remaining / weeklyDown) * cycleDays)}); if it rises by ${money(cents)} (to ${money(perCycleCapacity + cents)}): ${Math.ceil(remaining / (perCycleCapacity + cents))} paydays (about ${isoPlusDays(today, Math.ceil(remaining / (perCycleCapacity + cents)) * cycleDays)}).`);
      }
    }
  }
  // Reorder scenarios ("Peru after the car"): the engine's waterfall funds goals in date order, so
  // putting A after B means giving A the first date it can land once B is funded. Computed here,
  // deterministically, for the two goals the question mentions — the model only relays them.
  if (profile && (goals ?? []).length > 1) {
    const q = question.toLowerCase();
    const SYN: Record<string, string[]> = { travel: ["trip", "holiday", "travel", "flight"], car: ["car"], home: ["home", "house", "deposit"], emergency: ["emergency"], buffer: ["buffer", "breathing"], debt: ["debt", "loan"] };
    const mentioned = (goals ?? [])
      .filter((g) => g.status !== "paused")
      .map((g) => {
        const words = [...String(g.title).toLowerCase().split(/[^a-z]+/).filter((w: string) => w.length >= 3 && !["the", "and", "for", "fund"].includes(w)), ...(SYN[g.kind] ?? [])];
        const at = words.map((w) => q.indexOf(w)).filter((i) => i >= 0);
        return { g, at: at.length ? Math.min(...at) : -1 };
      })
      .filter((m) => m.at >= 0)
      .sort((x, y) => x.at - y.at)
      .map((m) => m.g);
    if (mentioned.length >= 2 && /\b(after|before|first|behind|ahead|later than|earlier than|instead|priorit)/.test(q)) {
      const a = assumptionsToEngine((assumptionRows ?? []) as AssumptionRow[]);
      const capacity = capacityMonthlyCents({ payCycle: profile.pay_cycle, takeHomeCents: profile.take_home_cents, essentialsCents: profile.essentials_cents, lifestyleCents: profile.lifestyle_cents, bufferCents: profile.buffer_cents });
      const todayFraction = todayMonth(profile.started_on, today);
      const engineGoals: EngineGoal[] = (goals ?? []).map((g) => ({
        id: g.id,
        kind: g.kind,
        targetCents: g.target_cents,
        startingBalanceCents: (g.starting_balance_cents ?? 0) + (savedByGoal.get(g.id) ?? 0),
        targetMonth: monthIndex(profile.started_on, g.target_date),
        priority: g.priority,
        goalType: g.goal_type,
        status: g.status,
        reachedAtMonth: null,
      }));
      const monthLabel = (m: number | null) => (m === null ? "not reached" : new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthDate(profile.started_on, m)}T00:00:00Z`)));
      const current = new Map(waterfall(engineGoals, capacity, a, todayFraction).map((p) => [p.goalId, p]));
      const scenario = (A: EngineGoal, B: EngineGoal) => {
        if (A.status !== "active") return null;
        // pass 1: A sorted right after B → where does A actually land once B is funded?
        const p1 = waterfall(engineGoals.map((g) => (g.id === A.id ? { ...g, targetMonth: B.targetMonth + 1 } : g)), capacity, a, todayFraction);
        const aDone = p1.find((p) => p.goalId === A.id)?.completionMonth ?? null;
        if (aDone === null) return null;
        // pass 2: give A exactly that month as its date, and read every goal's new landing month
        const newTarget = Math.max(aDone, B.targetMonth + 1);
        const p2 = waterfall(engineGoals.map((g) => (g.id === A.id ? { ...g, targetMonth: newTarget } : g)), capacity, a, todayFraction);
        const changes = p2
          .map((p) => {
            const g = engineGoals.find((x) => x.id === p.goalId)!;
            const title = (goals ?? []).find((x) => x.id === p.goalId)?.title ?? g.kind;
            const was = current.get(p.goalId)?.completionMonth ?? null;
            return `${title}: lands ${monthLabel(p.completionMonth)}${was !== p.completionMonth ? ` (was ${monthLabel(was)})` : " (unchanged)"}${p.achievable ? "" : " — needs a trade-off"}`;
          })
          .join("; ");
        const date = monthDate(profile.started_on, newTarget);
        const titleA = (goals ?? []).find((x) => x.id === A.id)?.title ?? A.kind;
        const titleB = (goals ?? []).find((x) => x.id === B.id)?.title ?? B.kind;
        return `Reorder scenario — "${titleA}" after "${titleB}": set ${titleA}'s target date to ${date} (${monthLabel(newTarget)}). Result: ${changes}. Proposal to return if they want this: goal_id ${A.id}, target_date ${date}, label "${titleA} after ${titleB} → lands ${monthLabel(p2.find((p) => p.goalId === A.id)?.completionMonth ?? newTarget)}".`;
      };
      const [g1, g2] = mentioned;
      const e1 = engineGoals.find((g) => g.id === g1.id)!;
      const e2 = engineGoals.find((g) => g.id === g2.id)!;
      for (const line of [scenario(e1, e2), scenario(e2, e1)]) if (line) lines.push(line);
    }
  }
  lines.push(`Planning rates: 5% cash for money needed within 3 years, 9% growth for 5+ years, 12% shown only as upside.`);

  const transcript = history.slice(-8).map((m) => `${m.role === "me" ? "Person" : "Coach"}: ${m.text}`).join("\n");
  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 600,
    output_config: { effort: "low", format: zodOutputFormat(output) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `The person's full picture:\n${lines.join("\n")}\n\n${transcript ? `Recent conversation:\n${transcript}\n\n` : ""}Person now says: ${question}` }],
  });
  if (res.stop_reason === "refusal") throw new HttpError(502, "refused");
  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const out = output.safeParse(JSON.parse(text));
  if (!out.success || findBannedTerms(out.data.reply).length > 0) {
    return ok({ answer: "I can explain and adjust your path, but not recommend products. Every number here comes from your own figures — tell me what changed and I'll show what moves.", proposal: null });
  }
  const proposal = out.data.proposal && (goals ?? []).some((g) => g.id === out.data.proposal!.goal_id) ? out.data.proposal : null;
  return ok({ answer: out.data.reply, proposal, disclaimer: DISCLAIMER });
});
