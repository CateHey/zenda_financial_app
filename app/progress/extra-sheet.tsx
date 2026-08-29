"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

// Progress — "extra money in": a one-off amount toward any active goal, chosen here. Posts to
// /api/contribute (a `manual` contribution outside the payday rhythm), then the page re-renders
// with the new balance — or jumps to the celebration when the amount finishes a goal.

type GoalOption = { id: string; title: string; kind: string; remainingCents: number };

const KIND_COLOR: Record<string, string> = {
  travel: "#AF52DE", car: "#8450DA", home: "#10265F", emergency: "#007AFF", buffer: "#5856D6", debt: "#0057D9", other: "#5856D6",
};

export function ExtraSheet({ goals, currency, defaultGoalId }: { goals: GoalOption[]; currency: string; defaultGoalId: string }) {
  const router = useRouter();
  const [goalId, setGoalId] = useState(goals.some((g) => g.id === defaultGoalId) ? defaultGoalId : goals[0]?.id ?? "");
  const [dollars, setDollars] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const chosen = goals.find((g) => g.id === goalId) ?? null;
  const cents = Math.round(Number(dollars.replace(/[^0-9.]/g, "")) * 100);
  const valid = chosen !== null && Number.isFinite(cents) && cents > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy || !chosen) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_id: chosen.id, amount_cents: cents }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(res.status === 404 ? "That goal isn't active any more — refresh and pick another." : res.status === 400 ? "Enter a whole amount in dollars, like 250." : "Couldn't reach Zenda. Try again.");
        return;
      }
      if (data.reached && typeof data.redirect === "string") {
        router.push(data.redirect);
        return;
      }
      setDone(`Done — ${formatMoney(cents, currency)} toward ${chosen.title}. ${formatMoney(data.remaining_cents ?? Math.max(0, chosen.remainingCents - cents), currency)} to go.`);
      setDollars("");
      router.refresh();
    } catch {
      setError("Couldn't reach Zenda. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (goals.length === 0) return null;

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(60,60,67,0.12)" }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Extra money in?</span>
      <span style={{ fontSize: 14, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>A bonus, a refund, a gift — put it toward any goal. Every date after it moves earlier.</span>

      <div role="radiogroup" aria-label="Which goal" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {goals.map((g) => {
          const on = g.id === goalId;
          const color = KIND_COLOR[g.kind] ?? "#5856D6";
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setGoalId(g.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 999, border: `1.5px solid ${on ? color : "rgba(60,60,67,0.18)"}`, background: on ? color : "#FFFFFF", color: on ? "#FFFFFF" : "rgba(60,60,67,0.9)", font: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? "#FFFFFF" : color }} />
              {g.title}
            </button>
          );
        })}
      </div>
      {chosen && <span style={{ fontSize: 13, color: "rgba(60,60,67,0.78)" }}>{formatMoney(chosen.remainingCents, currency)} to go for {chosen.title}.</span>}

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ flex: 1, display: "flex", alignItems: "center", height: 44, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(60,60,67,0.2)", background: "#FFFFFF", fontSize: 16 }}>
          <span style={{ color: "rgba(60,60,67,0.6)", marginRight: 4 }}>$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            placeholder="250"
            aria-label="Amount in dollars"
            style={{ flex: 1, minWidth: 0, border: 0, outline: "none", font: "inherit", fontSize: 16, background: "transparent" }}
          />
        </label>
        <button
          type="submit"
          disabled={!valid || busy}
          style={{ height: 44, padding: "0 16px", borderRadius: 999, border: 0, background: valid && !busy ? "#5856D6" : "#D1D1D6", color: "#FFFFFF", font: "inherit", fontSize: 15, fontWeight: 600, cursor: valid && !busy ? "pointer" : "default", whiteSpace: "nowrap" }}
        >
          {busy ? "Adding…" : `Add to ${chosen?.title ?? "goal"}`}
        </button>
      </div>

      {done && <span role="status" style={{ fontSize: 14, fontWeight: 600, color: "#0057D9" }}>{done}</span>}
      {error && <span role="alert" style={{ fontSize: 14, color: "#FF3B30" }}>{error}</span>}
    </form>
  );
}
