"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { waterfall } from "@/lib/engine/waterfall";
import { monthDate } from "@/lib/engine/rates";
import type { Assumptions, EngineGoal } from "@/lib/engine/types";
import { formatMoney, monthYearLabel, perCycleFromMonthlyCents } from "@/lib/format";
import type { PayCycle, RiskComfort } from "@/lib/data/types";

// S4 · What-if card. Client component: recomputes the WHOLE waterfall live in the browser as
// the slider moves, using the same pure lib/engine functions the server uses — and shows every
// goal's new landing month next to today's. "Make it $X / week" persists the change: the
// weekly engine is take-home − essentials − fun, so the slider's delta is applied to the fun
// line through POST /api/adapt (strategy "accept"), the server recomputes, and the roadmap
// redraws. Nothing is saved until that button is pressed.

export type WhatIfEngineGoal = EngineGoal & { title: string };

export type WhatIfProfile = {
  pay_cycle: PayCycle;
  take_home_cents: number;
  essentials_cents: number;
  lifestyle_cents: number;
  buffer_cents: number;
  savings_cents: number;
  debt_cents: number;
  debt_rate_bps: number;
  risk_comfort: RiskComfort;
};

const STEP_CENTS = 1_000; // $10 a week

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function WhatIf({
  engineGoals,
  assumptions,
  weeklyCapacityCents,
  todayFraction,
  startedOn,
  currency,
  profile,
}: {
  engineGoals: WhatIfEngineGoal[];
  assumptions: Assumptions;
  weeklyCapacityCents: number;
  todayFraction: number;
  startedOn: string;
  currency: string;
  profile: WhatIfProfile;
}) {
  const router = useRouter();
  // The card always speaks in "/ week": the slider runs in weekly cents whatever the pay cycle;
  // the apply step converts the delta back into the profile's own cycle.
  const min = Math.max(STEP_CENTS, roundToStep(weeklyCapacityCents * 0.5, STEP_CENTS));
  const max = Math.max(min + STEP_CENTS, roundToStep(weeklyCapacityCents * 2, STEP_CENTS));
  const base = roundToStep(weeklyCapacityCents, STEP_CENTS);
  const [valueWeeklyCents, setValueWeeklyCents] = useState(base);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sliderPct = max > min ? ((valueWeeklyCents - min) / (max - min)) * 100 : 0;
  const monthlyOf = (weekly: number) => Math.round((weekly * 52) / 12);

  const rows = useMemo(() => {
    const now = new Map(waterfall(engineGoals, monthlyOf(weeklyCapacityCents), assumptions, todayFraction).map((p) => [p.goalId, p]));
    const next = new Map(waterfall(engineGoals, monthlyOf(valueWeeklyCents), assumptions, todayFraction).map((p) => [p.goalId, p]));
    const label = (m: number | null) => (m === null ? "later than planned" : monthYearLabel(monthDate(startedOn, m)));
    return [...engineGoals]
      .filter((g) => g.status === "active")
      .sort((a, b) => a.targetMonth - b.targetMonth)
      .map((g) => {
        const was = now.get(g.id)?.completionMonth ?? null;
        const will = next.get(g.id)?.completionMonth ?? null;
        const delta = was !== null && will !== null ? will - was : null;
        return { id: g.id, title: g.title, was: label(was), will: label(will), delta, achievable: next.get(g.id)?.achievable ?? false };
      });
  }, [valueWeeklyCents, weeklyCapacityCents, engineGoals, assumptions, todayFraction, startedOn]);

  // Applying: the fun line absorbs the difference (more saving = less fun, and the other way).
  const deltaWeekly = valueWeeklyCents - weeklyCapacityCents;
  const deltaPerCycle = perCycleFromMonthlyCents(monthlyOf(Math.abs(deltaWeekly)), profile.pay_cycle) * Math.sign(deltaWeekly);
  const newLifestyle = profile.lifestyle_cents - deltaPerCycle;
  const canApply = valueWeeklyCents !== base && newLifestyle >= 0;
  const cycleWord = profile.pay_cycle === "fortnightly" ? "fortnight" : profile.pay_cycle === "monthly" ? "month" : "week";

  async function apply() {
    if (!canApply || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, lifestyle_cents: newLifestyle, strategy: "accept" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError("Couldn't save that. Try again, or edit your numbers.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach Zenda. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: "0 12px 12px 12px", padding: "12px 16px 14px 16px", borderRadius: 20, background: "#F2F2F7", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>What if?</span>
        <span data-testid="engine-value" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: "#5856D6" }}>
          {formatMoney(valueWeeklyCents, currency)}
          <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(60,60,67,0.78)" }}> / week</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 4, borderRadius: 2, background: "#D1D1D6" }} />
        <div style={{ position: "absolute", left: 0, width: `${sliderPct}%`, height: 4, borderRadius: 2, background: "#5856D6" }} />
        <input
          type="range"
          min={min}
          max={max}
          step={STEP_CENTS}
          value={valueWeeklyCents}
          onChange={(e) => setValueWeeklyCents(Number(e.target.value))}
          aria-label="Weekly savings amount"
          style={{ position: "relative", width: "100%", margin: 0, opacity: 0.999 }}
        />
      </div>

      {/* every goal, recomputed live */}
      <div data-testid="whatif-sentence" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((r) => {
          const changed = r.delta !== null && r.delta !== 0;
          const color = !changed ? "rgba(60,60,67,0.78)" : r.delta! < 0 ? "#0057D9" : "#AF52DE";
          return (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, lineHeight: 1.35 }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
              <span style={{ color, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {changed ? <><span style={{ color: "rgba(60,60,67,0.55)", textDecoration: "line-through" }}>{r.was}</span> → {r.will}{r.delta! < 0 ? ` (${-r.delta!} mo sooner)` : ` (${r.delta} mo later)`}</> : r.will}
              </span>
            </div>
          );
        })}
        <span style={{ fontSize: 12, color: "rgba(60,60,67,0.7)" }}>
          At {formatMoney(valueWeeklyCents, currency)} a week{valueWeeklyCents === base ? " — this is your path today." : deltaWeekly > 0 ? ` — ${formatMoney(deltaWeekly, currency)} a week less fun money.` : ` — ${formatMoney(-deltaWeekly, currency)} a week more fun money.`}
        </span>
      </div>

      {valueWeeklyCents !== base && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          {newLifestyle < 0 ? (
            <span style={{ fontSize: 13, color: "rgba(60,60,67,0.85)" }}>That&apos;s more than your fun money covers — <a href="/discover" style={{ color: "#5856D6", fontWeight: 600 }}>edit your numbers</a> to go that far.</span>
          ) : (
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              style={{ height: 44, borderRadius: 999, border: 0, background: "#5856D6", color: "#FFFFFF", font: "inherit", fontSize: 15, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Redrawing…" : `Make it ${formatMoney(valueWeeklyCents, currency)} a week`}
            </button>
          )}
          {newLifestyle >= 0 && (
            <span style={{ fontSize: 12, color: "rgba(60,60,67,0.7)" }}>
              Sets fun money to {formatMoney(newLifestyle, currency)} a {cycleWord} (now {formatMoney(profile.lifestyle_cents, currency)}); the roadmap redraws, nothing you&apos;ve saved moves.
            </span>
          )}
          {error && <span role="alert" style={{ fontSize: 13, color: "#FF3B30" }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
