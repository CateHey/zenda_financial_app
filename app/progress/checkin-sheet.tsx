"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

// S6 · Progress — the check-in sheet (design/screens/Tracking.dc.html), the only recurring
// input. A3: already-checked-in-this-cycle replaces the sheet with a quiet "Done" line instead.

export function CheckinSheet({
  goalId,
  capacityPerCycleCents,
  currency,
  alreadyCheckedIn,
  nextPaydayLabel,
}: {
  goalId: string;
  capacityPerCycleCents: number;
  currency: string;
  alreadyCheckedIn: boolean;
  nextPaydayLabel: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"buttons" | "partial">("buttons");
  const [partialDollars, setPartialDollars] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "full" | "partial" | "skip", amountCents?: number) {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_id: goalId, kind, ...(amountCents !== undefined ? { amount_cents: amountCents } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError("Couldn't reach Zenda. Try again.");
        setSubmitting(false);
        return;
      }
      router.push(data.redirect ?? "/progress");
      router.refresh();
    } catch {
      setError("Couldn't reach Zenda. Try again.");
      setSubmitting(false);
    }
  }

  if (alreadyCheckedIn) {
    return (
      <div style={{ background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.12)", padding: "22px 20px 26px 20px", display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#D1D1D6", marginBottom: 8 }} />
        <span style={{ fontSize: 17, fontWeight: 600 }}>Done for this payday.</span>
        <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Next: {nextPaydayLabel}.</span>
      </div>
    );
  }

  return (
    <div style={{ background: "#FFFFFF", borderRadius: "20px 20px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.12)", padding: "14px 20px 22px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: "#D1D1D6", alignSelf: "center" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
          Did you put {formatMoney(capacityPerCycleCents, currency)} aside?
        </span>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(60,60,67,0.78)" }}>Partly still counts. Tell us what you managed.</span>
      </div>

      {error && <p style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}

      {mode === "buttons" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => submit("full")}
            disabled={submitting}
            style={{ height: 52, border: 0, borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 17, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setMode("partial")}
            disabled={submitting}
            style={{ height: 52, border: "2px solid #5856D6", borderRadius: 999, background: "#FFFFFF", color: "#5856D6", fontSize: 17, fontWeight: 600, cursor: submitting ? "default" : "pointer" }}
          >
            Partly
          </button>
          <button
            type="button"
            onClick={() => submit("skip")}
            disabled={submitting}
            style={{ height: 44, border: 0, borderRadius: 999, background: "transparent", color: "rgba(60,60,67,0.78)", fontSize: 15, fontWeight: 600, cursor: submitting ? "default" : "pointer" }}
          >
            Not this time
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 44, borderBottom: "1px solid rgba(60,60,67,0.18)" }}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Amount</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 15 }}>$</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                autoFocus
                value={partialDollars}
                onChange={(e) => setPartialDollars(e.target.value)}
                style={{ fontSize: 15, textAlign: "right", border: "none", outline: "none", width: 110, font: "inherit" }}
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => submit("partial", Math.max(0, Math.round(Number(partialDollars) || 0)) * 100)}
            disabled={submitting}
            style={{ height: 52, border: 0, borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 17, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setMode("buttons")}
            disabled={submitting}
            style={{ height: 40, border: 0, borderRadius: 999, background: "transparent", color: "rgba(60,60,67,0.78)", fontSize: 14, fontWeight: 600, cursor: submitting ? "default" : "pointer" }}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
