"use client";

import { useMemo, useState } from "react";
import { waterfall } from "@/lib/engine/waterfall";
import { monthDate } from "@/lib/engine/rates";
import type { Assumptions, EngineGoal } from "@/lib/engine/types";
import { formatMoney, monthOnlyLabel, monthYearLabel } from "@/lib/format";
import { CHOOSABLE_GOAL_KINDS } from "@/lib/data/types";

// S4 · What-if card (Roadmap.dc.html). Client component: recomputes the whole waterfall live in
// the browser as the slider moves, using the same pure lib/engine functions the server uses —
// per D5, lib/engine is "importable by the browser too" for exactly this. Never persisted.

export type WhatIfEngineGoal = EngineGoal & { title: string };

const CHOOSABLE = new Set<string>(CHOOSABLE_GOAL_KINDS);
const STEP_CENTS = 1_000; // $10, per cycle (here: per week — see below)

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
}: {
  engineGoals: WhatIfEngineGoal[];
  assumptions: Assumptions;
  weeklyCapacityCents: number;
  todayFraction: number;
  startedOn: string;
  currency: string;
}) {
  // S4's what-if card always speaks in "/ week" and "a week" literally (unlike the header chip,
  // which binds an explicit "<cycle word>") — so the slider runs in weekly cents regardless of
  // the profile's actual pay cycle; only Vinuy (weekly) is demoed, so this never diverges.
  const min = Math.max(STEP_CENTS, roundToStep(weeklyCapacityCents * 0.5, STEP_CENTS));
  const max = roundToStep(weeklyCapacityCents * 2, STEP_CENTS);
  const [valueWeeklyCents, setValueWeeklyCents] = useState(roundToStep(weeklyCapacityCents, STEP_CENTS));

  const sliderPct = max > min ? ((valueWeeklyCents - min) / (max - min)) * 100 : 0;

  const sentence = useMemo(() => {
    const monthlyCents = Math.round((valueWeeklyCents * 52) / 12);
    const projections = waterfall(engineGoals, monthlyCents, assumptions, todayFraction);
    const byId = new Map(projections.map((p) => [p.goalId, p]));

    const chosenSoonest = [...engineGoals]
      .filter((g) => CHOOSABLE.has(g.kind) && g.status === "active")
      .sort((a, b) => a.targetMonth - b.targetMonth)
      .slice(0, 2);

    if (chosenSoonest.length === 0) return "";

    const parts = chosenSoonest.map((g, i) => {
      const completion = byId.get(g.id)?.completionMonth ?? null;
      const dateIso = completion !== null ? monthDate(startedOn, completion) : null;
      const label = dateIso ? (i === 0 ? monthOnlyLabel(dateIso) : monthYearLabel(dateIso)) : "later than planned";
      return `${g.title} in ${label}`;
    });

    return `At ${formatMoney(valueWeeklyCents, currency)} a week: ${parts.join(", ")}.`;
  }, [valueWeeklyCents, engineGoals, assumptions, todayFraction, startedOn, currency]);

  return (
    <div
      style={{
        margin: "0 12px 12px 12px",
        padding: "12px 16px 14px 16px",
        borderRadius: 20,
        background: "#F2F2F7",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
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
      <span data-testid="whatif-sentence" style={{ fontSize: 13, color: "rgba(60,60,67,0.78)" }}>
        {sentence}
      </span>
    </div>
  );
}
