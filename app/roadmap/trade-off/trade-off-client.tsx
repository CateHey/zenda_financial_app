"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { waterfall } from "@/lib/engine/waterfall";
import type { Assumptions, EngineGoal } from "@/lib/engine/types";
import { formatMoneyCompact, monthYearLabel } from "@/lib/format";
import { GoalSheet, type GoalSheetValues } from "@/app/discover/goal-sheet";

// S5 · The trade-off — consequence card (a client-side waterfall re-run, D5: lib/engine is
// importable by the browser too) plus the two action buttons. The "on time" (option A) and
// "goal removed" scenarios both change the growth goal's start month/curve, which the stored
// projection (computed for the goal's *original*, currently-unaffordable numbers) doesn't
// reflect — so both need a fresh, local waterfall() call, exactly like app/roadmap/what-if.tsx.

export function TradeoffClient({
  goalId,
  goalKind,
  goalTitle,
  optionACents,
  optionADate,
  engineGoals,
  assumptions,
  capacityMonthlyCents,
  todayFraction,
  startedOn,
  currency,
  growthGoalId,
  growthGoalTitle,
}: {
  goalId: string;
  goalKind: string;
  goalTitle: string;
  optionACents: number;
  optionADate: string;
  engineGoals: (EngineGoal & { title: string })[];
  assumptions: Assumptions;
  capacityMonthlyCents: number;
  todayFraction: number;
  startedOn: string;
  currency: string;
  growthGoalId: string | null;
  growthGoalTitle: string | null;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const consequence = useMemo(() => {
    if (!growthGoalId || !growthGoalTitle) return null;

    const onTimeGoals = engineGoals.map((g) => (g.id === goalId ? { ...g, targetCents: optionACents } : g));
    const onTimeProjections = waterfall(onTimeGoals, capacityMonthlyCents, assumptions, todayFraction);
    const onTimeGrowth = onTimeProjections.find((p) => p.goalId === growthGoalId);
    const onTimeEnd = onTimeGrowth?.curve[onTimeGrowth.curve.length - 1]?.balanceCents ?? null;

    const withoutGoals = engineGoals.filter((g) => g.id !== goalId);
    const withoutProjections = waterfall(withoutGoals, capacityMonthlyCents, assumptions, todayFraction);
    const withoutGrowth = withoutProjections.find((p) => p.goalId === growthGoalId);
    const withoutGoalEnd = withoutGrowth?.curve[withoutGrowth.curve.length - 1]?.balanceCents ?? null;

    if (onTimeEnd === null || withoutGoalEnd === null) return null;
    const year = monthYearLabel(optionADate).split(" ").pop();
    return `${formatMoneyCompact(optionACents)} ${goalKind} → ${growthGoalTitle} ~${formatMoneyCompact(onTimeEnd)} by ${year}. No ${goalKind} → ~${formatMoneyCompact(withoutGoalEnd)} by ${year}.`;
  }, [engineGoals, goalId, goalKind, optionACents, optionADate, assumptions, capacityMonthlyCents, todayFraction, growthGoalId, growthGoalTitle]);

  async function chooseOptionA() {
    setError(null);
    setSubmitting(true);
    await adjust({ target_cents: optionACents, target_date: optionADate });
  }

  async function adjust(body: { target_cents?: number; target_date?: string }) {
    try {
      const response = await fetch(`/api/goals/${goalId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setError("Couldn't reach Zenda. Try again.");
        setSubmitting(false);
        return;
      }
      router.push(data.redirect ?? "/roadmap");
    } catch {
      setError("Couldn't reach Zenda. Try again.");
      setSubmitting(false);
    }
  }

  function handleSheetDone(values: GoalSheetValues) {
    setSheetOpen(false);
    setError(null);
    setSubmitting(true);
    void adjust({ target_cents: values.targetCents, target_date: values.targetDate });
  }

  return (
    <>
      {consequence && (
        <div style={{ margin: "20px 20px 0 20px", padding: "14px 16px", borderRadius: 14, background: "#F2F2F7", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" }}>
            What this does to the {growthGoalTitle?.toLowerCase() ?? "rest of the path"}
          </span>
          <span style={{ fontSize: 14, lineHeight: 1.4, color: "rgba(60,60,67,0.85)" }}>{consequence}</span>
        </div>
      )}

      {error && <p style={{ margin: "12px 20px 0 20px", fontSize: 13, color: "var(--danger)" }}>{error}</p>}

      <div style={{ marginTop: "auto", padding: "20px 20px 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          onClick={chooseOptionA}
          disabled={submitting}
          style={{ height: 52, border: 0, borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 17, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "One moment…" : `Choose ${formatMoneyCompact(optionACents)} in ${monthYearLabel(optionADate).split(" ").pop()}`}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={submitting}
          style={{ height: 44, border: 0, borderRadius: 999, background: "transparent", color: "#5856D6", fontSize: 15, fontWeight: 600, cursor: submitting ? "default" : "pointer" }}
        >
          Try a different number
        </button>
      </div>

      {sheetOpen && (
        <GoalSheet
          title={goalTitle}
          initial={{ title: goalTitle, targetCents: optionACents, targetDate: optionADate }}
          onDone={handleSheetDone}
          onRemove={() => setSheetOpen(false)}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
