"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { capacityMonthlyCents } from "@/lib/engine/rates";
import { CYCLE_WORD, KIND_LABEL, formatMoney, formatMoneyCompact, perCycleFromMonthlyCents } from "@/lib/format";
import type { PayCycle } from "@/lib/data/types";
import { LogoutLink } from "@/app/components/logout-link";
import { GoalSheet, type GoalSheetValues } from "./goal-sheet";

// S1 · Discover — design/screens/Main.dc.html ported 1:1, bound per ZENDA_SCREEN_BINDINGS.md.

export type DiscoverProfile = {
  currency: string;
  payCycle: PayCycle;
  takeHomeCents: number;
  essentialsCents: number;
  lifestyleCents: number;
  bufferCents: number;
  savingsCents: number;
  debtCents: number;
  debtRateBps: number;
  freedomText: string | null;
};

export type DiscoverGoal = {
  id: string;
  kind: string;
  title: string;
  targetCents: number;
  targetDate: string;
};

type SelectedGoal = { id?: string; title: string; targetCents: number; targetDate: string };

const CHIP_ORDER = ["home", "car", "travel", "study", "business"] as const;
type ChipKind = (typeof CHIP_ORDER)[number];

// A6: title prefilled per kind, default target, default "by" (months from today).
const KIND_DEFAULTS: Record<ChipKind, { title: string; targetCents: number; months: number }> = {
  travel: { title: "A trip", targetCents: 400_000, months: 4 },
  car: { title: "A car", targetCents: 2_500_000, months: 24 },
  home: { title: "A first home", targetCents: 24_000_000, months: 84 },
  study: { title: "Study", targetCents: 1_200_000, months: 24 },
  business: { title: "A business", targetCents: 3_000_000, months: 36 },
};

const NEXT_CYCLE: Record<PayCycle, PayCycle> = { weekly: "fortnightly", fortnightly: "monthly", monthly: "weekly" };

function firstOfMonthPlus(baseIso: string, monthsToAdd: number): string {
  const [y, m] = baseIso.split("-").map(Number);
  const total = m - 1 + monthsToAdd;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, "0")}-01`;
}

// Bug 3: a blank money input is a valid "0", never NaN — `Number("")` is already 0, but the
// `Number.isFinite` guard also protects against a stray non-numeric string surviving browser
// autofill/paste. Negative entries clamp to 0 too (money fields are never negative here).
function toCents(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Same blank/NaN-safe treatment as toCents, for the debt-rate percentage -> basis points. */
function toBps(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// Bug 2 (D3/D5 error copy): map an /api/discover error response onto the exact copy the spec
// calls for. `showLoginLink` tells the render side to append a "Log in" link (401 only).
type SubmitError = { message: string; showLoginLink?: boolean };

const DISCOVER_FIELD_LABELS: Record<string, string> = {
  freedom_text: "Freedom text",
  pay_cycle: "Pay cycle",
  take_home_cents: "Income",
  essentials_cents: "Essentials",
  lifestyle_cents: "Fun",
  buffer_cents: "Buffer",
  savings_cents: "Savings",
  debt_cents: "Debt",
  debt_rate_bps: "Debt rate",
  risk_comfort: "Risk comfort",
  goals: "Goals",
  kind: "type",
  title: "title",
  target_cents: "target amount",
  target_date: "target date",
  starting_balance_cents: "starting balance",
  id: "id",
};

/** "essentials_cents" -> "Essentials"; "goals.0.target_cents" -> "Goal 1 target amount". */
function humaniseIssuePath(path: Array<string | number>): string {
  if (path.length === 0) return "That";
  if (path[0] === "goals") {
    const index = typeof path[1] === "number" ? path[1] + 1 : null;
    const field = path[path.length - 1];
    const label = typeof field === "string" ? (DISCOVER_FIELD_LABELS[field] ?? field) : "value";
    return index !== null ? `Goal ${index} ${label}` : `Goal ${label}`;
  }
  const field = path[0];
  return typeof field === "string" ? (DISCOVER_FIELD_LABELS[field] ?? field) : "That";
}

/** D3/D5: "400 validation -> 'Check the numbers - <first Zod issue message, humanised>'." */
function buildValidationError(issues: unknown): string {
  const first = Array.isArray(issues) ? (issues[0] as { path?: Array<string | number>; message?: string } | undefined) : undefined;
  if (!first?.message) return "Check the numbers and try again.";
  const label = humaniseIssuePath(first.path ?? []);
  return `Check the numbers — ${label}: ${first.message}`;
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

export function DiscoverClient({
  initialProfile,
  initialGoals,
  reflectionMessage,
  todayIso,
}: {
  initialProfile: DiscoverProfile | null;
  initialGoals: DiscoverGoal[];
  reflectionMessage: string | null;
  todayIso: string;
}) {
  const router = useRouter();

  const [selected, setSelected] = useState<Record<ChipKind, SelectedGoal | null>>(() => {
    const initial = Object.fromEntries(CHIP_ORDER.map((k) => [k, null])) as Record<ChipKind, SelectedGoal | null>;
    for (const g of initialGoals) {
      if ((CHIP_ORDER as readonly string[]).includes(g.kind)) {
        initial[g.kind as ChipKind] = { id: g.id, title: g.title, targetCents: g.targetCents, targetDate: g.targetDate };
      }
    }
    return initial;
  });
  const [sheetKind, setSheetKind] = useState<ChipKind | null>(null);

  const [freedomText] = useState(initialProfile?.freedomText ?? "");
  const [freedomDraft, setFreedomDraft] = useState("");

  const [payCycle, setPayCycle] = useState<PayCycle>(initialProfile?.payCycle ?? "weekly");
  const [incomeDollars, setIncomeDollars] = useState(initialProfile ? String(initialProfile.takeHomeCents / 100) : "");
  const [rentDollars, setRentDollars] = useState(initialProfile ? String(initialProfile.essentialsCents / 100) : "");
  const [foodDollars, setFoodDollars] = useState("");
  const [petrolDollars, setPetrolDollars] = useState("");
  const [funDollars, setFunDollars] = useState(initialProfile ? String(initialProfile.lifestyleCents / 100) : "");
  const [bufferDollars, setBufferDollars] = useState(initialProfile ? String(initialProfile.bufferCents / 100) : "");
  const [savingsDollars, setSavingsDollars] = useState(initialProfile ? String(initialProfile.savingsCents / 100) : "");
  const [debtDollars, setDebtDollars] = useState(initialProfile ? String(initialProfile.debtCents / 100) : "");
  const [debtRatePercent, setDebtRatePercent] = useState(
    initialProfile ? String(initialProfile.debtRateBps / 100) : "",
  );

  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currency = initialProfile?.currency ?? "AUD";
  const selectedKinds = CHIP_ORDER.filter((k) => selected[k] !== null);

  const capacityPerCycleCents = useMemo(() => {
    const essentialsCents = toCents(rentDollars) + toCents(foodDollars) + toCents(petrolDollars);
    const monthly = capacityMonthlyCents({
      payCycle,
      takeHomeCents: toCents(incomeDollars),
      essentialsCents,
      lifestyleCents: toCents(funDollars),
      bufferCents: toCents(bufferDollars),
    });
    return perCycleFromMonthlyCents(monthly, payCycle);
  }, [payCycle, incomeDollars, rentDollars, foodDollars, petrolDollars, funDollars, bufferDollars]);

  const bubble3Text = useMemo(() => {
    if (reflectionMessage) return reflectionMessage;
    if (selectedKinds.length === 0) return "Tell us where you're going. Then the numbers.";
    const labels = selectedKinds.map((k) => KIND_LABEL[k]);
    const joined =
      labels.length === 1
        ? labels[0]
        : labels.length === 2
          ? `${labels[0]} and ${labels[1]}`
          : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    return `${joined}. Got it. Now the numbers — quick, no judgement.`;
  }, [reflectionMessage, selectedKinds]);

  function handleChipClick(kind: ChipKind) {
    const current = selected[kind];
    if (!current) {
      const def = KIND_DEFAULTS[kind];
      const targetDate = firstOfMonthPlus(todayIso, def.months);
      setSelected((prev) => ({ ...prev, [kind]: { title: def.title, targetCents: def.targetCents, targetDate } }));
    } else {
      setSheetKind(kind);
    }
  }

  function handleSheetDone(values: GoalSheetValues) {
    if (!sheetKind) return;
    setSelected((prev) => ({ ...prev, [sheetKind]: { ...prev[sheetKind], ...values } }));
    setSheetKind(null);
  }

  function handleSheetRemove() {
    if (!sheetKind) return;
    setSelected((prev) => ({ ...prev, [sheetKind]: null }));
    setSheetKind(null);
  }

  async function handleSubmit() {
    setSubmitError(null);
    const goalsPayload = selectedKinds.map((k) => {
      const g = selected[k] as SelectedGoal;
      return { id: g.id, kind: k, title: g.title, target_cents: g.targetCents, target_date: g.targetDate };
    });
    if (goalsPayload.length === 0) {
      setSubmitError({ message: "Pick at least one place to go." });
      return;
    }
    setSubmitting(true);

    // Bug 2 fix: the fetch itself failing (offline, DNS, CORS, etc.) is the only case that gets
    // the generic "Couldn't reach Zenda" copy — a response that came back with a non-2xx status
    // is reached-and-answered, so it gets the specific D3/D5 copy for its status code below.
    let response: Response;
    try {
      response = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freedom_text: (freedomText || freedomDraft) || undefined,
          pay_cycle: payCycle,
          take_home_cents: toCents(incomeDollars),
          essentials_cents: toCents(rentDollars) + toCents(foodDollars) + toCents(petrolDollars),
          lifestyle_cents: toCents(funDollars),
          buffer_cents: toCents(bufferDollars),
          savings_cents: toCents(savingsDollars),
          debt_cents: toCents(debtDollars),
          debt_rate_bps: toBps(debtRatePercent),
          risk_comfort: "medium",
          goals: goalsPayload,
        }),
      });
    } catch (err) {
      console.error("POST /api/discover — network/fetch failure:", err);
      setSubmitError({ message: "Couldn't reach Zenda. Try again." });
      setSubmitting(false);
      return;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      // D5: every handler's error body carries `error` (and 400 carries `issues`) — always log
      // both for debugging, whether or not the copy below surfaces the detail to the person.
      console.error("POST /api/discover", response.status, data?.error, data?.issues);
      if (response.status === 400) {
        setSubmitError({ message: buildValidationError(data?.issues) });
      } else if (response.status === 401) {
        setSubmitError({ message: "Your session ended. Log in again.", showLoginLink: true });
      } else {
        // 500, 404, and anything else unexpected — D3's server-side copy.
        setSubmitError({ message: "Something went wrong on our side. Try again in a moment." });
      }
      setSubmitting(false);
      return;
    }

    router.push(data.redirect ?? "/achievable");
  }

  return (
    <main style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href="/"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, marginLeft: -12, borderRadius: 999 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </a>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>
            Getting to know you
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                style={{ width: 18, height: 4, borderRadius: 2, background: i < 3 || selectedKinds.length > 0 ? "#5856D6" : "#E5E5EA" }}
              />
            ))}
          </div>
          <LogoutLink />
        </div>
      </div>

      {/* where you want to go */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 20px 0 20px" }}>
        <div style={{ maxWidth: 290, padding: "11px 15px", background: "#F2F2F7", borderRadius: "20px 20px 20px 6px", fontSize: 16, lineHeight: 1.38, color: "#000000" }}>
          Where do you want to go in three years?
        </div>
        {freedomText ? (
          <div style={{ alignSelf: "flex-end", maxWidth: 300, padding: "11px 15px", background: "#5856D6", color: "#FFFFFF", borderRadius: "20px 20px 6px 20px", fontSize: 16, lineHeight: 1.38 }}>
            {freedomText}
          </div>
        ) : (
          <textarea
            value={freedomDraft}
            onChange={(e) => setFreedomDraft(e.target.value)}
            placeholder="Tell us in your words…"
            maxLength={600}
            rows={3}
            style={{
              alignSelf: "flex-end",
              maxWidth: 300,
              width: "100%",
              padding: "11px 15px",
              background: "#5856D6",
              color: "#FFFFFF",
              borderRadius: "20px 20px 6px 20px",
              fontSize: 16,
              lineHeight: 1.38,
              border: "none",
              outline: "none",
              resize: "none",
              font: "inherit",
            }}
          />
        )}
      </div>

      {/* bubble 3 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 20px 0 20px" }}>
        <div style={{ maxWidth: 290, padding: "11px 15px", background: "#F2F2F7", borderRadius: "20px 20px 20px 6px", fontSize: 16, lineHeight: 1.38, color: "#000000" }}>
          {bubble3Text}
        </div>
      </div>

      {/* goal chips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px 20px 0 20px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(60,60,67,0.78)" }}>
          Where you want to go
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {CHIP_ORDER.map((kind) => {
            const goal = selected[kind];
            const isSelected = goal !== null;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => handleChipClick(kind)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  height: 36,
                  padding: "0 11px",
                  borderRadius: 999,
                  background: isSelected ? "#5856D6" : "#F2F2F7",
                  color: isSelected ? "#FFFFFF" : "rgba(60,60,67,0.78)",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
                {isSelected && goal ? `${goal.title} · ${formatMoneyCompact(goal.targetCents)}` : KIND_LABEL[kind]}
              </button>
            );
          })}
        </div>
      </div>

      {submitError && (
        <p style={{ margin: "10px 20px 0 20px", fontSize: 13, color: "var(--danger)" }}>
          {submitError.message}
          {submitError.showLoginLink && (
            <>
              {" "}
              <a href="/login" style={{ color: "#5856D6", fontWeight: 600, textDecoration: "underline" }}>
                Log in
              </a>
            </>
          )}
        </p>
      )}

      {/* where you are today */}
      <div
        style={{
          marginTop: "auto",
          background: "#FFFFFF",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.10)",
          padding: "12px 20px 14px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#D1D1D6", alignSelf: "center", marginBottom: 4 }} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>Where you are today</span>
          <button
            type="button"
            onClick={() => setPayCycle((c) => NEXT_CYCLE[c])}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#5856D6",
              padding: "5px 12px",
              borderRadius: 999,
              background: "#F2F2F7",
              border: "none",
              cursor: "pointer",
            }}
          >
            {payCycle}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Income</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={incomeDollars} onChange={(e) => setIncomeDollars(e.target.value)} style={{ ...rowInputStyle, fontWeight: 600 }} />
          </label>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Rent</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={rentDollars} onChange={(e) => setRentDollars(e.target.value)} style={rowInputStyle} />
          </label>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Food</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={foodDollars} onChange={(e) => setFoodDollars(e.target.value)} style={rowInputStyle} />
          </label>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Petrol · internet</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={petrolDollars} onChange={(e) => setPetrolDollars(e.target.value)} style={rowInputStyle} />
          </label>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Fun</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={funDollars} onChange={(e) => setFunDollars(e.target.value)} style={rowInputStyle} />
          </label>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Buffer</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={bufferDollars} onChange={(e) => setBufferDollars(e.target.value)} style={rowInputStyle} />
          </label>
          <label style={rowStyle}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Savings</span>
            <input type="number" inputMode="numeric" min={0} placeholder="0" value={savingsDollars} onChange={(e) => setSavingsDollars(e.target.value)} style={rowInputStyle} />
          </label>
          <label style={{ ...rowStyle, borderBottom: "none" }}>
            <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Debt</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" inputMode="numeric" min={0} placeholder="0" value={debtDollars} onChange={(e) => setDebtDollars(e.target.value)} style={rowInputStyle} />
              <span style={{ color: "rgba(60,60,67,0.6)", fontSize: 13 }}>·</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.1}
                placeholder="0"
                value={debtRatePercent}
                onChange={(e) => setDebtRatePercent(e.target.value)}
                style={{ ...rowInputStyle, width: 44 }}
              />
              <span style={{ color: "rgba(60,60,67,0.6)", fontSize: 13 }}>%</span>
            </span>
          </label>
        </div>

        {/* the engine */}
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 18px", borderRadius: 14, background: "#5856D6", color: "#FFFFFF" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>Your engine</span>
            <span data-testid="engine-value" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              {formatMoney(capacityPerCycleCents, currency)}
              <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.85 }}> / {CYCLE_WORD[payCycle]}</span>
            </span>
            <span style={{ fontSize: 13, opacity: 0.9 }}>What&apos;s left after everything. See what it can reach.</span>
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            aria-label={submitting ? "One moment…" : "See what's achievable"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 999,
              background: "#FFFFFF",
              flexShrink: 0,
              border: "none",
              cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        {submitting && <span style={{ fontSize: 13, color: "var(--label-2)", textAlign: "right" }}>One moment…</span>}
      </div>

      {sheetKind && (
        <GoalSheet
          title={KIND_LABEL[sheetKind]}
          initial={selected[sheetKind] ?? { title: KIND_DEFAULTS[sheetKind].title, targetCents: KIND_DEFAULTS[sheetKind].targetCents, targetDate: firstOfMonthPlus(todayIso, KIND_DEFAULTS[sheetKind].months) }}
          onDone={handleSheetDone}
          onRemove={handleSheetRemove}
          onClose={() => setSheetKind(null)}
        />
      )}
    </main>
  );
}
