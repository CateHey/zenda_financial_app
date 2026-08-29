"use client";

import { useState } from "react";

// Three small, honest charts for the Progress screen. Inline SVG, the journey palette, no library.
// Every number comes from the engine or the person's own rows; the charts only draw them.

type Contribution = { occurredOn: string; amountCents: number };
type CurvePoint = { m: number; balanceCents: number };

type Props = {
  contributions: Contribution[];      // newest first is fine; we sort
  today: string;                      // demo clock, for the period filter
  perCycleCapacityCents: number;      // what "a full payday" means
  curve: CurvePoint[];                // the current goal's projection curve, from its start month
  targetCents: number;
  savedCents: number;
  goalTitle: string;
  cycleWord: string;                  // "week" | "fortnight" | "month"
  takeHomeCents: number;
  essentialsCents: number;
  lifestyleCents: number;
  bufferCents: number;
  currency: string;
};

const fmt = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(Math.round(cents / 100));

function dayLabel(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}`;
}

export function ProgressCharts(p: Props) {
  const NAVY = "#10265F", BLUE = "#007AFF", INDIGO = "#5856D6", VIOLET = "#8450DA", PURPLE = "#AF52DE", GREY = "#E5E5EA";

  // --- 1. paydays: the last 12 contributions as bars, full = capacity ---
  const [period, setPeriod] = useState<"12" | "3m" | "all">("12");
  const sorted = [...p.contributions].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  const since = (days: number) => { const d = new Date(`${p.today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
  const recent = period === "12" ? sorted.slice(-12) : period === "3m" ? sorted.filter((c) => c.occurredOn >= since(91)) : sorted;
  const barMax = Math.max(p.perCycleCapacityCents, ...recent.map((c) => c.amountCents), 1);
  const bw = 100 / Math.max(recent.length, 1);

  // --- 2. the path ahead: projected balance vs target ---
  const pts = p.curve.length > 1 ? p.curve : [{ m: 0, balanceCents: p.savedCents }, { m: 1, balanceCents: p.savedCents }];
  const maxY = Math.max(p.targetCents, ...pts.map((q) => q.balanceCents), 1);
  const W = 320, H = 120, PADL = 8, PADR = 8, PADT = 10, PADB = 18;
  const x = (i: number) => PADL + (i / Math.max(pts.length - 1, 1)) * (W - PADL - PADR);
  const y = (v: number) => PADT + (1 - v / maxY) * (H - PADT - PADB);
  const line = pts.map((q, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(q.balanceCents).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(H - PADB).toFixed(1)} L${x(0).toFixed(1)},${(H - PADB).toFixed(1)} Z`;
  const targetY = y(p.targetCents);
  const savedPct = Math.min(100, Math.round((p.savedCents / Math.max(p.targetCents, 1)) * 100));

  // --- 3. where a payday goes ---
  const engine = Math.max(0, p.takeHomeCents - p.essentialsCents - p.lifestyleCents);
  const slices = [
    { label: "Essentials", value: p.essentialsCents, color: NAVY },
    { label: "Fun", value: p.lifestyleCents, color: VIOLET },
    { label: "Your engine", value: engine, color: INDIGO },
  ].filter((s) => s.value > 0);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const R = 44, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * C;
    const el = { ...s, dash: `${len.toFixed(2)} ${(C - len).toFixed(2)}`, off: (-offset).toFixed(2) };
    offset += len;
    return el;
  });

  const card: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, padding: "14px 16px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" };
  const k: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" };
  const sub: React.CSSProperties = { fontSize: 13, color: "rgba(60,60,67,0.78)" };

  return (
    <div className="charts" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px 0 20px" }}>
      {/* 1 · paydays */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={k}>{period === "all" ? `All ${recent.length} paydays` : period === "3m" ? `Last 3 months · ${recent.length} paydays` : `Your last ${recent.length} paydays`}</span>
          <div role="tablist" style={{ display: "flex", gap: 4 }}>
            {(["12", "3m", "all"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setPeriod(v)} aria-pressed={period === v} style={{ height: 26, padding: "0 10px", borderRadius: 999, border: 0, background: period === v ? "#5856D6" : "#F2F2F7", color: period === v ? "#FFFFFF" : "rgba(60,60,67,0.8)", font: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {v === "12" ? "12 paydays" : v === "3m" ? "3 months" : "All"}
              </button>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 100 44" width="100%" height="88" preserveAspectRatio="none" role="img" aria-label="Amount set aside per payday">
          <line x1="0" x2="100" y1={(44 - (p.perCycleCapacityCents / barMax) * 40).toFixed(1)} y2={(44 - (p.perCycleCapacityCents / barMax) * 40).toFixed(1)} stroke={GREY} strokeWidth="0.6" strokeDasharray="1.5 1.5" />
          {recent.map((c, i) => {
            const h = (c.amountCents / barMax) * 40;
            const full = c.amountCents >= p.perCycleCapacityCents;
            return <rect key={c.occurredOn + i} x={(i * bw + bw * 0.18).toFixed(2)} y={(44 - h).toFixed(2)} width={(bw * 0.64).toFixed(2)} height={Math.max(h, c.amountCents > 0 ? 1.2 : 0.6).toFixed(2)} rx="0.8" fill={c.amountCents === 0 ? GREY : full ? BLUE : VIOLET} />;
          })}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", ...sub }}>
          <span>{recent[0] ? dayLabel(recent[0].occurredOn) : ""}</span>
          <span>full {fmt(p.perCycleCapacityCents, p.currency)} · partly · skipped</span>
          <span>{recent[recent.length - 1] ? dayLabel(recent[recent.length - 1].occurredOn) : ""}</span>
        </div>
      </div>

      {/* 2 · the path ahead */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={k}>{p.goalTitle}: the path ahead</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: INDIGO }}>{savedPct}% · {fmt(p.savedCents, p.currency)} of {fmt(p.targetCents, p.currency)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="120" role="img" aria-label="Projected balance until the goal">
          <defs>
            <linearGradient id="pathFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={BLUE} stopOpacity="0.28" /><stop offset="1" stopColor={PURPLE} stopOpacity="0.02" /></linearGradient>
            <linearGradient id="pathLine" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={BLUE} /><stop offset="1" stopColor={PURPLE} /></linearGradient>
          </defs>
          <path d={area} fill="url(#pathFill)" />
          <path d={line} fill="none" stroke="url(#pathLine)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1={PADL} x2={W - PADR} y1={targetY.toFixed(1)} y2={targetY.toFixed(1)} stroke={PURPLE} strokeWidth="1" strokeDasharray="3 3" />
          <text x={W - PADR} y={(targetY - 4).toFixed(1)} textAnchor="end" fontSize="10" fill={PURPLE} fontWeight="700">goal {fmt(p.targetCents, p.currency)}</text>
          <circle cx={x(0).toFixed(1)} cy={y(pts[0].balanceCents).toFixed(1)} r="3.5" fill={NAVY} />
          <text x={PADL} y={H - 4} fontSize="10" fill="rgba(60,60,67,0.7)">now</text>
          <text x={W - PADR} y={H - 4} textAnchor="end" fontSize="10" fill="rgba(60,60,67,0.7)">{pts.length - 1} months</text>
        </svg>
      </div>

      {/* 3 · where a payday goes */}
      <div style={{ ...card, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <svg viewBox="0 0 110 110" width="96" height="96" role="img" aria-label="Where a payday goes">
          <circle cx="55" cy="55" r={R} fill="none" stroke={GREY} strokeWidth="14" />
          {arcs.map((a) => (
            <circle key={a.label} cx="55" cy="55" r={R} fill="none" stroke={a.color} strokeWidth="14" strokeDasharray={a.dash} strokeDashoffset={a.off} transform="rotate(-90 55 55)" />
          ))}
          <text x="55" y="52" textAnchor="middle" fontSize="11" fill="rgba(60,60,67,0.7)">engine</text>
          <text x="55" y="68" textAnchor="middle" fontSize="14" fontWeight="700" fill={INDIGO}>{Math.round((engine / total) * 100)}%</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <span style={k}>Where a {p.cycleWord} goes</span>
          {slices.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color }} />
              <span style={{ flex: 1 }}>{s.label}</span>
              <span style={{ fontWeight: 600 }}>{fmt(s.value, p.currency)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
