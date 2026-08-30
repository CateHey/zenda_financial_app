"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import type { OverviewMove } from "./money-overview";

// Progress → Recent moves, with each row correctable in place (PATCH/DELETE
// /api/contributions/[id]). Client component because editing is the whole point; the list itself
// is still rendered from server-supplied rows, so nothing new is computed here.
//
// What a row means, and therefore what may be edited, comes from its `kind` (migration 0002):
//   manual        — a bonus in, or money taken out. May be negative, may never be zero: a move of
//                   nothing is a deleted row, so the editor says so rather than failing the check
//                   constraint. Carries an optional note.
//   checkin_*     — a payday. Never negative; 0 is a legitimate "not this time". The server
//                   re-labels full vs part after an edit, so the label here follows the data.
//   seed          — the balance carried in at discovery.

const sub: React.CSSProperties = { color: "rgba(60,60,67,0.78)", fontSize: 13 };
const k: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#8E8E93" };

function dayMonth(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Cents -> the dollars string the input shows, without a trailing ".00" for whole dollars. */
function centsToInput(cents: number): string {
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? String(abs / 100) : (abs / 100).toFixed(2);
}

export function RecentMoves({ moves, currency }: { moves: OverviewMove[]; currency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recent = [...moves]
    .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : a.occurredOn > b.occurredOn ? -1 : 0))
    .slice(0, 8);

  function open(m: OverviewMove) {
    setEditing(m.id);
    setAmount(centsToInput(m.amountCents));
    setNote(m.note ?? "");
    setError(null);
  }

  function close() {
    setEditing(null);
    setError(null);
  }

  async function send(m: OverviewMove, method: "PATCH" | "DELETE") {
    if (busy) return;
    let body: string | undefined;

    if (method === "PATCH") {
      const dollars = Number(amount.replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(dollars)) {
        setError("Enter an amount in dollars.");
        return;
      }
      // The row's own sign is preserved: money that went out stays money that went out. Someone
      // correcting "$200 out" to "$250" means $250 out, not a $250 deposit.
      const magnitude = Math.round(dollars * 100);
      const signed = m.amountCents < 0 ? -magnitude : magnitude;
      if (m.kind === "manual" && signed === 0) {
        setError("A money move can't be nothing — remove it instead.");
        return;
      }
      body = JSON.stringify({ amount_cents: signed, note: note.trim() === "" ? null : note.trim() });
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contributions/${m.id}`, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(
          data?.error === "needs_migration"
            ? "That needs the latest migration. Run it, then try again."
            : data?.issues?.[0]?.message
              ? String(data.issues[0].message)
              : "Couldn't save that. Try again.",
        );
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Couldn't reach Zenda. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 20, padding: "16px 16px 18px", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" }}>
      <span style={k}>Recent moves</span>
      {recent.length === 0 && <span style={sub}>No money has moved yet — your first check-in will show here.</span>}

      {recent.map((m) => {
        const out = m.amountCents < 0;
        const manual = m.kind === "manual";
        const skipped = !manual && m.amountCents === 0;
        const label = manual
          ? out ? `Taken out of ${m.goalTitle}` : `Extra into ${m.goalTitle}`
          : skipped ? `Skipped payday · ${m.goalTitle}`
          : m.kind === "checkin_partial" ? `Part payday → ${m.goalTitle}`
          : m.kind === "seed" ? `Starting balance · ${m.goalTitle}`
          : `Payday → ${m.goalTitle}`;
        const color = out ? "#FF3B30" : skipped ? "rgba(60,60,67,0.55)" : manual ? "#0057D9" : "#1C1C1E";
        const isOpen = editing === m.id;

        return (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14 }}>
              <span style={{ ...sub, width: 52, flexShrink: 0 }}>{dayMonth(m.occurredOn)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {label}
                {m.note ? <span style={sub}> · {m.note}</span> : null}
              </span>
              <span style={{ fontWeight: 700, color, whiteSpace: "nowrap" }}>
                {out ? "−" : skipped ? "" : "+"}
                {formatMoney(Math.abs(m.amountCents), currency)}
              </span>
              <button
                type="button"
                data-testid={`edit-move-${m.id}`}
                onClick={() => (isOpen ? close() : open(m))}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Stop editing" : "Edit"} ${label}, ${formatMoney(Math.abs(m.amountCents), currency)}`}
                style={{ flexShrink: 0, border: 0, background: "none", padding: "2px 0 2px 6px", font: "inherit", fontSize: 13, fontWeight: 600, color: "#5856D6", cursor: "pointer" }}
              >
                {isOpen ? "Close" : "Edit"}
              </button>
            </div>

            {isOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "#F2F2F7" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <label style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", height: 44, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(60,60,67,0.2)", background: "#FFFFFF", fontSize: 16 }}>
                    <span aria-hidden="true" style={{ color: "rgba(60,60,67,0.55)", marginRight: 6 }}>{out ? "−$" : "$"}</span>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="decimal"
                      aria-label={`Amount for ${label}`}
                      style={{ flex: 1, minWidth: 0, width: "100%", border: 0, outline: "none", font: "inherit", fontSize: 16, background: "transparent" }}
                    />
                  </label>
                  <button
                    type="button"
                    data-testid="save-move"
                    onClick={() => send(m, "PATCH")}
                    disabled={busy}
                    style={{ flexShrink: 0, height: 44, padding: "0 18px", borderRadius: 999, border: 0, background: "#5856D6", color: "#FFFFFF", font: "inherit", fontSize: 15, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, whiteSpace: "nowrap" }}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>

                {manual && (
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={120}
                    placeholder="Note (optional)"
                    aria-label={`Note for ${label}`}
                    style={{ height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(60,60,67,0.2)", background: "#FFFFFF", font: "inherit", fontSize: 15, minWidth: 0 }}
                  />
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...sub, fontSize: 12, flex: 1, minWidth: 140 }}>
                    {out
                      ? "Still money out of this goal — the amount is what changes."
                      : m.kind === "seed"
                        ? "What you had already put aside when you started."
                        : manual
                          ? "Money in, on top of your paydays."
                          : "A payday. 0 is fine — it records that you skipped this one."}
                  </span>
                  <button
                    type="button"
                    data-testid="delete-move"
                    onClick={() => send(m, "DELETE")}
                    disabled={busy}
                    style={{ border: 0, background: "none", padding: 0, font: "inherit", fontSize: 13, fontWeight: 600, color: "#FF3B30", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
                  >
                    Remove this move
                  </button>
                </div>

                <span style={{ ...sub, fontSize: 12 }}>Every date after it moves; nothing else you&apos;ve saved changes.</span>
                {error && <span role="alert" style={{ fontSize: 13, color: "#FF3B30" }}>{error}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
