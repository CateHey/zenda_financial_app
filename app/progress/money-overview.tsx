import Link from "next/link";
import { formatMoney } from "@/lib/format";

// Progress — "where your money is": every goal on the path with what it holds, one stacked bar
// of everything set aside, where this payday's engine goes next, and the recent moves (paydays,
// extras in, money taken out — with the note). Server component: numbers only, nothing new.

export type OverviewGoal = {
  id: string;
  title: string;
  kind: string;
  status: "active" | "reached" | "paused";
  targetCents: number;
  savedCents: number;
  targetDate: string;
};
export type OverviewMove = { id: string; goalId: string; goalTitle: string; amountCents: number; occurredOn: string; kind: string; note: string | null };

const KIND_COLOR: Record<string, string> = {
  travel: "#AF52DE", car: "#8450DA", home: "#10265F", emergency: "#007AFF", buffer: "#5856D6", debt: "#0057D9", other: "#5856D6",
};

function monthYear(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}
function dayMonth(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function MoneyOverview({
  goals,
  moves,
  currentGoalId,
  soonestGoalId,
  capacityPerCycleCents,
  cycleWord,
  currency,
}: {
  goals: OverviewGoal[];
  moves: OverviewMove[];
  currentGoalId: string;
  soonestGoalId: string | null;
  capacityPerCycleCents: number;
  cycleWord: string;
  currency: string;
}) {
  const shown = goals.filter((g) => g.status !== "paused");
  const totalSaved = shown.reduce((a, g) => a + Math.max(0, g.savedCents), 0);
  const totalTarget = shown.reduce((a, g) => a + g.targetCents, 0);
  const soonest = shown.find((g) => g.id === soonestGoalId) ?? null;
  const after = soonest ? shown.filter((g) => g.status === "active" && g.id !== soonest.id).sort((x, y) => (x.targetDate < y.targetDate ? -1 : 1))[0] ?? null : null;
  const recent = [...moves].sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0)).slice(0, 8);

  const card: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" };
  const k: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" };
  const sub: React.CSSProperties = { fontSize: 13, color: "rgba(60,60,67,0.78)" };

  return (
    <div className="charts" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px 20px 0 20px" }}>
      {/* everything set aside, by goal */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={k}>Where your money is</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#5856D6" }}>
            {formatMoney(totalSaved, currency)} set aside · {formatMoney(totalTarget, currency)} of goals
          </span>
        </div>
        <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "#F2F2F7" }} role="img" aria-label="Money set aside, by goal">
          {shown.map((g) => {
            const w = totalSaved > 0 ? (Math.max(0, g.savedCents) / totalSaved) * 100 : 0;
            return w > 0 ? <span key={g.id} title={`${g.title} ${formatMoney(g.savedCents, currency)}`} style={{ width: `${w}%`, background: KIND_COLOR[g.kind] ?? "#5856D6" }} /> : null;
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((g) => {
            const color = KIND_COLOR[g.kind] ?? "#5856D6";
            const pct = Math.min(100, Math.round((Math.max(0, g.savedCents) / Math.max(1, g.targetCents)) * 100));
            const state = g.status === "reached" ? "Funded" : g.id === soonestGoalId ? `Getting every ${cycleWord}'s ${formatMoney(capacityPerCycleCents, currency)}` : g.id === after?.id ? "Next in line" : `Then · ${monthYear(g.targetDate)}`;
            const on = g.id === currentGoalId;
            return (
              <Link key={g.id} href={`/progress?goal=${g.id}`} style={{ display: "flex", flexDirection: "column", gap: 4, textDecoration: "none", color: "inherit", padding: "6px 8px", margin: "0 -8px", borderRadius: 10, background: on ? "rgba(88,86,214,0.06)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{g.title}{g.status === "reached" ? " ✓" : ""}</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{formatMoney(Math.max(0, g.savedCents), currency)}</span>
                  <span style={sub}>/ {formatMoney(g.targetCents, currency)}</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "#F2F2F7", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: 4, background: color }} />
                </div>
                <span style={sub}>{state}</span>
              </Link>
            );
          })}
        </div>
        {soonest && (
          <span style={{ ...sub, borderTop: "1px solid rgba(60,60,67,0.10)", paddingTop: 8 }}>
            Each {cycleWord}, {formatMoney(capacityPerCycleCents, currency)} goes to {soonest.title} until it is funded{after ? `, then to ${after.title}` : ""}. Extra money in or out moves every date after it.
          </span>
        )}
      </div>

      {/* recent moves */}
      <div style={card}>
        <span style={k}>Recent moves</span>
        {recent.length === 0 && <span style={sub}>No money has moved yet — your first check-in will show here.</span>}
        {recent.map((m) => {
          const out = m.amountCents < 0;
          const manual = m.kind === "manual";
          const skipped = !manual && m.amountCents === 0;
          const label = manual ? (out ? `Taken out of ${m.goalTitle}` : `Extra into ${m.goalTitle}`) : skipped ? `Skipped payday · ${m.goalTitle}` : m.kind === "checkin_partial" ? `Part payday → ${m.goalTitle}` : `Payday → ${m.goalTitle}`;
          const color = out ? "#FF3B30" : skipped ? "rgba(60,60,67,0.55)" : manual ? "#0057D9" : "#1C1C1E";
          return (
            <div key={m.id} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14 }}>
              <span style={{ ...sub, width: 52, flexShrink: 0 }}>{dayMonth(m.occurredOn)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {label}
                {m.note ? <span style={sub}> · {m.note}</span> : null}
              </span>
              <span style={{ fontWeight: 700, color, whiteSpace: "nowrap" }}>{out ? "−" : skipped ? "" : "+"}{formatMoney(Math.abs(m.amountCents), currency)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
