"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { waterfall } from "@/lib/engine/waterfall";
import { capacityMonthlyCents, monthDate } from "@/lib/engine/rates";
import type { Assumptions, EngineGoal } from "@/lib/engine/types";
import { formatMoney, formatMoneyCompact, monthYearLabel, perCycleFromMonthlyCents } from "@/lib/format";
import type { PayCycle, RiskComfort } from "@/lib/data/types";

// S7 · Life changed — design/screens/Adapt.dc.html ported 1:1, bound per
// ZENDA_SCREEN_BINDINGS.md. The numbers sheet is the same rows as Discover's, inline (not a
// bottom sheet) per S7's "First load: 'What changed?' with the S1 numbers sheet inline
// (prefilled)". Every edit re-runs the engine locally (D4 edge state) — nothing is written until
// "Accept the new path" / "Trim fun, keep the dates".

export type AdaptBaselineGoal = { id: string; title: string; completionMonth: number | null };
export type AdaptBaselineGrowth = { id: string; title: string; targetDate: string; curveEndCents: number };

type InitialProfile = {
  payCycle: PayCycle;
  takeHomeCents: number;
  essentialsCents: number;
  lifestyleCents: number;
  bufferCents: number;
  savingsCents: number;
  debtCents: number;
  debtRateBps: number;
  riskComfort: RiskComfort;
  currency: string;
};

function toCents(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  height: 30,
  borderBottom: "1px solid rgba(60,60,67,0.18)",
};
const rowInputStyle: CSSProperties = {
  fontSize: 15,
  textAlign: "right",
  border: "none",
  outline: "none",
  width: 90,
  font: "inherit",
  color: "inherit",
};

const NEXT_CYCLE: Record<PayCycle, PayCycle> = { weekly: "fortnightly", fortnightly: "monthly", monthly: "weekly" };

export function AdaptClient({
  initialProfile,
  capacityPerCycleCents,
  startedOn,
  todayFraction,
  assumptions,
  engineGoals,
  baselineGoals,
  baselineGrowth,
  paydaysRemaining,
}: {
  initialProfile: InitialProfile;
  capacityPerCycleCents: number;
  startedOn: string;
  todayFraction: number;
  assumptions: Assumptions;
  engineGoals: (EngineGoal & { title: string })[];
  baselineGoals: AdaptBaselineGoal[];
  baselineGrowth: AdaptBaselineGrowth | null;
  paydaysRemaining: number;
}) {
  const router = useRouter();
  const currency = initialProfile.currency;

  const [payCycle, setPayCycle] = useState<PayCycle>(initialProfile.payCycle);
  const [incomeDollars, setIncomeDollars] = useState(String(initialProfile.takeHomeCents / 100));
  const [rentDollars, setRentDollars] = useState(String(initialProfile.essentialsCents / 100));
  const [foodDollars, setFoodDollars] = useState("");
  const [petrolDollars, setPetrolDollars] = useState("");
  const [funDollars, setFunDollars] = useState(String(initialProfile.lifestyleCents / 100));
  const [bufferDollars, setBufferDollars] = useState(String(initialProfile.bufferCents / 100));
  const [savingsDollars, setSavingsDollars] = useState(String(initialProfile.savingsCents / 100));
  const [debtDollars, setDebtDollars] = useState(String(initialProfile.debtCents / 100));
  const [debtRatePercent, setDebtRatePercent] = useState(String(initialProfile.debtRateBps / 100));

  const [submitting, setSubmitting] = useState<"accept" | "protect_dates" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track only the initial value of each field once, for the "what changed" title (S7).
  const [initial] = useState({
    income: incomeDollars, rent: rentDollars, food: "", petrol: "", fun: funDollars, buffer: bufferDollars, savings: savingsDollars, debt: debtDollars,
  });

  const fields = [
    { key: "income", label: "Income", current: incomeDollars },
    { key: "rent", label: "Rent", current: rentDollars },
    { key: "food", label: "Food", current: foodDollars },
    { key: "petrol", label: "Petrol · internet", current: petrolDollars },
    { key: "fun", label: "Fun", current: funDollars },
    { key: "buffer", label: "Buffer", current: bufferDollars },
    { key: "savings", label: "Savings", current: savingsDollars },
    { key: "debt", label: "Debt", current: debtDollars },
  ] as const;

  const changed = fields.filter((f) => toCents(f.current) !== toCents(initial[f.key as keyof typeof initial]));
  let title: string;
  if (changed.length === 0) {
    title = "What changed?";
  } else if (changed.length === 1) {
    const f = changed[0];
    const deltaCents = toCents(f.current) - toCents(initial[f.key as keyof typeof initial]);
    const direction = deltaCents > 0 ? "up" : "down";
    title = `${f.label} went ${direction} ${formatMoney(Math.abs(deltaCents), currency)}.`;
  } else {
    title = "Your numbers changed.";
  }

  const essentialsCents = toCents(rentDollars) + toCents(foodDollars) + toCents(petrolDollars);
  const newCapacityMonthly = capacityMonthlyCents({
    payCycle,
    takeHomeCents: toCents(incomeDollars),
    essentialsCents,
    lifestyleCents: toCents(funDollars),
    bufferCents: toCents(bufferDollars),
  });
  const newCapacityPerCycle = perCycleFromMonthlyCents(newCapacityMonthly, payCycle);

  const afterById = useMemo(() => {
    const projections = waterfall(engineGoals, newCapacityMonthly, assumptions, todayFraction);
    return new Map(projections.map((p) => [p.goalId, p]));
  }, [engineGoals, newCapacityMonthly, assumptions, todayFraction]);

  const afterGrowthEndCents = baselineGrowth
    ? (() => {
        const p = afterById.get(baselineGrowth.id);
        return p && p.curve.length > 0 ? p.curve[p.curve.length - 1].balanceCents : baselineGrowth.curveEndCents;
      })()
    : 0;

  const deltaPerCycle = capacityPerCycleCents - newCapacityPerCycle; // > 0 when capacity dropped
  const trimmedFunCents = Math.max(0, toCents(funDollars) - Math.max(0, deltaPerCycle));

  function dateCell(monthIdx: number | null): string {
    return monthIdx !== null ? monthYearLabel(monthDate(startedOn, monthIdx)) : "later than planned";
  }

  async function submit(strategy: "accept" | "protect_dates") {
    setError(null);
    setSubmitting(strategy);
    // The server computes the protect_dates trim itself (POST /api/adapt), from the same
    // capacity delta this page already shows — both strategies submit the numbers as typed.
    const lifestyleCents = toCents(funDollars);
    try {
      const response = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pay_cycle: payCycle,
          take_home_cents: toCents(incomeDollars),
          essentials_cents: essentialsCents,
          lifestyle_cents: lifestyleCents,
          buffer_cents: toCents(bufferDollars),
          savings_cents: toCents(savingsDollars),
          debt_cents: toCents(debtDollars),
          debt_rate_bps: Math.max(0, Math.round((Number(debtRatePercent) || 0) * 100)),
          risk_comfort: initialProfile.riskComfort,
          strategy,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError("Couldn't reach Zenda. Try again.");
        setSubmitting(null);
        return;
      }
      router.push(data.redirect ?? "/roadmap");
    } catch {
      setError("Couldn't reach Zenda. Try again.");
      setSubmitting(null);
    }
  }

  return (
    <main className="screen" data-web="center" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a href="/progress" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -12, borderRadius: 999 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </a>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Life changed</span>
        </div>
      </div>

      <div style={{ padding: "4px 20px 0 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{title}</span>
        <span style={{ fontSize: 15, lineHeight: 1.4, color: "rgba(60,60,67,0.78)" }}>
          Your engine is now {formatMoney(newCapacityPerCycle, currency)} a week. Nothing you&apos;ve saved moves — only the dates. Here&apos;s the redrawn path.
        </span>
      </div>

      {/* the numbers sheet, inline (S7: "the S1 numbers sheet inline (prefilled)") */}
      <div style={{ margin: "16px 20px 0 20px", padding: "12px 18px 14px 18px", borderRadius: 14, background: "#F2F2F7", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Your numbers</span>
          <button
            type="button"
            onClick={() => setPayCycle((c) => NEXT_CYCLE[c])}
            style={{ fontSize: 13, fontWeight: 600, color: "#5856D6", padding: "5px 12px", borderRadius: 999, background: "#FFFFFF", border: "none", cursor: "pointer" }}
          >
            {payCycle}
          </button>
        </div>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Income</span>
          <input type="number" inputMode="numeric" min={0} value={incomeDollars} onChange={(e) => setIncomeDollars(e.target.value)} style={{ ...rowInputStyle, fontWeight: 600 }} />
        </label>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Rent</span>
          <input type="number" inputMode="numeric" min={0} value={rentDollars} onChange={(e) => setRentDollars(e.target.value)} style={rowInputStyle} />
        </label>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Food</span>
          <input type="number" inputMode="numeric" min={0} value={foodDollars} onChange={(e) => setFoodDollars(e.target.value)} style={rowInputStyle} />
        </label>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Petrol · internet</span>
          <input type="number" inputMode="numeric" min={0} value={petrolDollars} onChange={(e) => setPetrolDollars(e.target.value)} style={rowInputStyle} />
        </label>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Fun</span>
          <input type="number" inputMode="numeric" min={0} value={funDollars} onChange={(e) => setFunDollars(e.target.value)} style={rowInputStyle} />
        </label>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Buffer</span>
          <input type="number" inputMode="numeric" min={0} value={bufferDollars} onChange={(e) => setBufferDollars(e.target.value)} style={rowInputStyle} />
        </label>
        <label style={rowStyle}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Savings</span>
          <input type="number" inputMode="numeric" min={0} value={savingsDollars} onChange={(e) => setSavingsDollars(e.target.value)} style={rowInputStyle} />
        </label>
        <label style={{ ...rowStyle, borderBottom: "none" }}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Debt</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" inputMode="numeric" min={0} value={debtDollars} onChange={(e) => setDebtDollars(e.target.value)} style={rowInputStyle} />
            <span style={{ color: "rgba(60,60,67,0.6)", fontSize: 13 }}>·</span>
            <input type="number" inputMode="decimal" min={0} step={0.1} value={debtRatePercent} onChange={(e) => setDebtRatePercent(e.target.value)} style={{ ...rowInputStyle, width: 44 }} />
            <span style={{ color: "rgba(60,60,67,0.6)", fontSize: 13 }}>%</span>
          </span>
        </label>
      </div>

      {/* before / after */}
      <div style={{ margin: "20px 20px 0 20px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "10px 16px", background: "#F2F2F7", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" }}>
          <span />
          <span style={{ textAlign: "right" }}>Before</span>
          <span style={{ textAlign: "right", color: "#5856D6" }}>Now</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "12px 16px", borderBottom: "1px solid rgba(60,60,67,0.12)", fontSize: 15, alignItems: "baseline" }}>
          <span style={{ fontWeight: 600 }}>Engine</span>
          <span style={{ textAlign: "right", color: "rgba(60,60,67,0.6)" }}>{formatMoney(capacityPerCycleCents, currency)}</span>
          <span style={{ textAlign: "right", fontWeight: newCapacityPerCycle !== capacityPerCycleCents ? 700 : 400, color: newCapacityPerCycle !== capacityPerCycleCents ? "#5856D6" : "inherit" }}>
            {formatMoney(newCapacityPerCycle, currency)}
          </span>
        </div>
        {baselineGoals.map((g) => {
          const before = dateCell(g.completionMonth);
          const after = dateCell(afterById.get(g.id)?.completionMonth ?? null);
          const differs = before !== after;
          return (
            <div key={g.id} style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "12px 16px", borderBottom: "1px solid rgba(60,60,67,0.12)", fontSize: 15, alignItems: "baseline" }}>
              <span>{g.title}</span>
              <span style={{ textAlign: "right", color: "rgba(60,60,67,0.6)" }}>{before}</span>
              <span style={{ textAlign: "right", fontWeight: differs ? 700 : 400 }}>{after}</span>
            </div>
          );
        })}
        {baselineGrowth && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "12px 16px", fontSize: 15, alignItems: "baseline" }}>
            <span>Deposit by {baselineGrowth.targetDate.slice(0, 4)}</span>
            <span style={{ textAlign: "right", color: "rgba(60,60,67,0.6)" }}>{formatMoneyCompact(baselineGrowth.curveEndCents)}</span>
            <span style={{ textAlign: "right", fontWeight: afterGrowthEndCents !== baselineGrowth.curveEndCents ? 700 : 400 }}>{formatMoneyCompact(afterGrowthEndCents)}</span>
          </div>
        )}
      </div>

      {deltaPerCycle !== 0 && (
        <div style={{ margin: "18px 20px 0 20px", padding: "14px 16px", borderRadius: 14, background: "#F2F2F7", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" }}>Or keep it on time</span>
          <span style={{ fontSize: 14, lineHeight: 1.4, color: "rgba(60,60,67,0.85)" }}>
            {deltaPerCycle > 0
              ? `Trim fun from ${formatMoney(toCents(funDollars), currency)} to ${formatMoney(trimmedFunCents, currency)} for ${paydaysRemaining} weeks and every date stays where it was.`
              : "Every date just moved closer. Nothing to trim."}
          </span>
        </div>
      )}

      {error && <p style={{ margin: "12px 20px 0 20px", fontSize: 13, color: "var(--danger)" }}>{error}</p>}

      <div style={{ marginTop: "auto", padding: "20px 20px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          onClick={() => submit("accept")}
          disabled={submitting !== null}
          style={{ height: 52, border: 0, borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 17, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting === "accept" ? "One moment…" : "Accept the new path"}
        </button>
        <button
          type="button"
          onClick={() => submit("protect_dates")}
          disabled={submitting !== null || deltaPerCycle <= 0}
          style={{ height: 52, border: "2px solid #5856D6", borderRadius: 999, background: "#FFFFFF", color: "#5856D6", fontSize: 17, fontWeight: 600, cursor: submitting || deltaPerCycle <= 0 ? "default" : "pointer", opacity: deltaPerCycle <= 0 ? 0.5 : 1 }}
        >
          {submitting === "protect_dates" ? "One moment…" : "Trim fun, keep the dates"}
        </button>
      </div>
    </main>
  );
}
