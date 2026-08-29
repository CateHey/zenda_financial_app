import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { aiEnabled } from "@/lib/ai/enabled";
import { findBannedTerms } from "@/lib/ai/banned-terms";
import { todayIso } from "@/lib/engine/today";

const KINDS = ["home", "car", "travel", "study", "business"] as const;
type Kind = (typeof KINDS)[number];

const body = z.object({
  messages: z.array(z.object({ role: z.enum(["zenda", "me"]), text: z.string().trim().min(1).max(600) })).min(1).max(30),
});

const output = z.object({
  reply: z.string().max(400),
  goals: z.array(
    z.object({
      kind: z.enum(KINDS),
      title: z.string().min(1).max(40),
      target_cents: z.number().int().positive().optional(),
      target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  ),
});
type Output = z.infer<typeof output>;

const SYSTEM = `You are Zenda's onboarding guide — calm, warm, plain-spoken, never salesy. The person is telling you what they want their life to look like. From ALL of their messages so far (later corrections win), extract their financial goals as structured data: kind is one of home, car, travel, study, business; title is short and in their words (e.g. "Peru in January", "A $20k car"); target_cents is the amount in cents when they state or clearly imply one ("20k" = 2000000, "a million" = 100000000, "around 240k deposit" = 24000000); target_date is YYYY-MM-DD when they give a time ("in January" = the next January 1st, "in 3 years" = three years from today, "next year" = January 1st next year). Leave target_cents or target_date out when unknown. For a home, if they only give the house price, set target_cents to 20% of it (the deposit) and say so in the reply. Reply in at most 40 words: reflect their goals back in their own words, and if something is missing ask ONE short question (an amount or a date). If no goal is detectable, ask what they would like to reach and roughly when. Never give financial advice, never name products, banks, funds or tickers, never say "should buy/sell", never say "impossible".`;

const LABEL: Record<Kind, string> = { home: "a home", car: "a car", travel: "a trip", study: "study", business: "a business" };

function parseAmountCents(text: string): number | undefined {
  const m = text.match(/\$?\s?(\d+(?:[.,]\d+)?)\s*(k|m|million|thousand|mil)?\b/i);
  if (!m) return undefined;
  let n = Number(m[1].replace(",", "."));
  const u = (m[2] ?? "").toLowerCase();
  if (u === "k" || u === "thousand" || u === "mil") n *= 1_000;
  if (u === "m" || u === "million") n *= 1_000_000;
  if (!Number.isFinite(n) || n < 50) return undefined;
  return Math.round(n * 100);
}

// Deterministic fallback when the model is off or fails: keyword goals, amounts near them.
function fallback(messages: { role: string; text: string }[]): Output {
  const text = messages.filter((m) => m.role === "me").map((m) => m.text).join(". ");
  const sentences = text.split(/[.!?\n]+/);
  const rules: Array<[Kind, RegExp]> = [
    ["home", /\b(house|home|apartment|unit|deposit|property)\b/i],
    ["car", /\b(car|ute|vehicle|motorbike)\b/i],
    ["travel", /\b(trip|travel|holiday|vacation|fly|flight|peru|japan|europe|bali|thailand|overseas)\b/i],
    ["study", /\b(study|studies|uni|university|degree|course|masters?|mba)\b/i],
    ["business", /\b(business|startup|start-up|company|shop|cafe)\b/i],
  ];
  const goals: Output["goals"] = [];
  for (const [kind, re] of rules) {
    const sentence = sentences.find((s) => re.test(s));
    if (!sentence) continue;
    let cents = parseAmountCents(sentence);
    if (kind === "home" && cents && cents >= 30_000_000) cents = Math.round(cents * 0.2);
    goals.push({ kind, title: kind === "travel" ? "A trip" : kind === "home" ? "A first home" : kind === "car" ? "A car" : kind === "study" ? "Study" : "A business", ...(cents ? { target_cents: cents } : {}) });
  }
  const labels = goals.map((g) => LABEL[g.kind]);
  const reply =
    labels.length === 0
      ? "Tell me what you'd like to reach — a trip, a car, a home, study, a business — and roughly when."
      : `${labels.join(", ").replace(/, ([^,]*)$/, " and $1")} — got it. Tap a goal below to set the amount and the date, or tell me more.`;
  return { reply, goals };
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });
  const messages = parsed.data.messages;

  if (!aiEnabled()) return NextResponse.json({ ...fallback(messages), source: "template" });

  try {
    const client = new Anthropic();
    const transcript = messages.map((m) => `${m.role === "me" ? "Person" : "Zenda"}: ${m.text}`).join("\n");
    const res = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 500,
      output_config: { effort: "low", format: zodOutputFormat(output) },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Today is ${todayIso()}.\n\nConversation so far:\n${transcript}` }],
    });
    if (res.stop_reason === "refusal") return NextResponse.json({ ...fallback(messages), source: "template" });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const out = output.safeParse(JSON.parse(text));
    if (!out.success || findBannedTerms(out.data.reply).length > 0) return NextResponse.json({ ...fallback(messages), source: "template" });
    return NextResponse.json({ ...out.data, source: "ai" });
  } catch (err) {
    console.error("POST /api/discover/chat", err);
    return NextResponse.json({ ...fallback(messages), source: "template" });
  }
}
