"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

// Progress — money moves outside the payday rhythm. "Add extra": a bonus, a refund, a gift, into
// any active goal (POST /api/contribute). "Take out": money you need now — an emergency, a change
// of plan — from any goal that holds some, with a note (POST /api/withdraw). Either way the
// engine re-runs and the page re-renders with the new numbers; a goal that gets fully funded
// jumps to its celebration, a funded goal that loses money comes back onto the roadmap.

export type MoneyGoal = { id: string; title: string; kind: string; status: "active" | "reached"; savedCents: number; remainingCents: number };

const KIND_COLOR: Record<string, string> = {
  travel: "#AF52DE", car: "#8450DA", home: "#10265F", emergency: "#007AFF", buffer: "#5856D6", debt: "#0057D9", other: "#5856D6",
};

export function MoneySheet({ goals, currency, defaultGoalId }: { goals: MoneyGoal[]; currency: string; defaultGoalId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "take">("add");
  const [goalId, setGoalId] = useState(defaultGoalId);
  const [dollars, setDollars] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const options = mode === "add" ? goals.filter((g) => g.status === "active") : goals.filter((g) => g.savedCents > 0);
  const chosen = options.find((g) => g.id === goalId) ?? options[0] ?? null;
  const cents = Math.round(Number(dollars.replace(/[^0-9.]/g, "")) * 100);
  const amountOk = Number.isFinite(cents) && cents > 0;

  function switchMode(m: "add" | "take") {
    setMode(m);
    setError(null);
    setDone(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setDone(null);
    if (!chosen) return setError(mode === "add" ? "Every goal is funded — nothing to add to." : "No goal holds money yet.");
    if (!amountOk) return setError("Type an amount in dollars first — for example 250.");
    if (mode === "take" && cents > chosen.savedCents) return setError(`${chosen.title} holds ${formatMoney(chosen.savedCents, currency)} — you can take out up to that.`);
    setBusy(true);
    try {
      const res = await fetch(mode === "add" ? "/api/contribute" : "/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_id: chosen.id, amount_cents: cents, ...(mode === "take" && reason.trim() ? { reason: reason.trim() } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(
          data?.error === "needs_migration"
            ? "Taking money out needs the latest database update (migrations/0002_money_moves.sql). Run it once and try again."
            : data?.error === "more_than_saved"
              ? `That's more than ${chosen.title} holds.`
              : res.status === 404
                ? "That goal isn't on your path any more — refresh and pick another."
                : "Couldn't reach Zenda. Try again.",
        );
        return;
      }
      if (mode === "add" && data.reached && typeof data.redirect === "string") {
        router.push(data.redirect);
        return;
      }
      if (mode === "take" && data.reactivated && typeof data.redirect === "string") {
        // back on the roadmap with a new date — show it
        router.push(data.redirect);
        router.refresh();
        return;
      }
      if (mode === "add") {
        setDone(`Done — ${formatMoney(cents, currency)} into ${chosen.title}. ${formatMoney(data.remaining_cents ?? 0, currency)} to go.`);
      } else {
        setDone(
          `Done — ${formatMoney(cents, currency)} out of ${chosen.title}${reason.trim() ? ` for ${reason.trim()}` : ""}. ${formatMoney(data.saved_cents ?? 0, currency)} still there${data.reactivated ? "; it's back on your roadmap with a new date" : ""}.`,
        );
      }
      setDollars("");
      setReason("");
      router.refresh();
    } catch {
      setError("Couldn't reach Zenda. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: "add" | "take", label: string) => (
    <button
      type="button"
      onClick={() => switchMode(m)}
      aria-pressed={mode === m}
      style={{ flex: 1, height: 36, borderRadius: 999, border: 0, background: mode === m ? "#FFFFFF" : "transparent", boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.12)" : "none", color: mode === m ? "#1C1C1E" : "rgba(60,60,67,0.7)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(60,60,67,0.12)" }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Move money</span>
      <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "#F2F2F7" }}>
        {tab("add", "Add extra")}
        {tab("take", "Take out")}
      </div>
      <span style={{ fontSize: 14, lineHeight: 1.35, color: "rgba(60,60,67,0.78)" }}>
        {mode === "add" ? "A bonus, a refund, a gift — into any goal. Every date after it moves earlier." : "Need it now? Take it from any goal. The roadmap recalculates — nothing is hidden."}
      </span>

      <div role="radiogroup" aria-label="Which goal" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((g) => {
          const on = chosen?.id === g.id;
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
              {g.status === "reached" ? " ✓" : ""}
            </button>
          );
        })}
        {options.length === 0 && <span style={{ fontSize: 13, color: "rgba(60,60,67,0.78)" }}>{mode === "add" ? "Every goal is funded." : "No goal holds money yet."}</span>}
      </div>
      {chosen && (
        <span style={{ fontSize: 13, color: "rgba(60,60,67,0.78)" }}>
          {chosen.title}: {formatMoney(chosen.savedCents, currency)} in{chosen.status === "active" ? ` · ${formatMoney(chosen.remainingCents, currency)} to go` : " · funded"}.
        </span>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", height: 44, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(60,60,67,0.2)", background: "#FFFFFF", fontSize: 16 }}>
          <span style={{ color: "rgba(60,60,67,0.6)", marginRight: 4 }}>$</span>
          <input
            inputMode="decimal"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            placeholder="Amount"
            aria-label="Amount in dollars"
            style={{ flex: 1, minWidth: 0, width: "100%", border: 0, outline: "none", font: "inherit", fontSize: 16, background: "transparent" }}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{ flexShrink: 0, height: 44, padding: "0 18px", borderRadius: 999, border: 0, background: mode === "add" ? "#5856D6" : "#10265F", color: "#FFFFFF", font: "inherit", fontSize: 15, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {busy ? "…" : mode === "add" ? "Add" : "Take out"}
        </button>
      </div>
      {mode === "take" && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={80}
          placeholder="What for? e.g. dentist, car repair"
          aria-label="What is it for"
          style={{ height: 44, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(60,60,67,0.2)", background: "#FFFFFF", font: "inherit", fontSize: 15, outline: "none" }}
        />
      )}

      {done && <span role="status" style={{ fontSize: 14, fontWeight: 600, color: "#0057D9" }}>{done}</span>}
      {error && <span role="alert" style={{ fontSize: 14, color: "#FF3B30" }}>{error}</span>}
    </form>
  );
}
