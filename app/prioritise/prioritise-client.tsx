"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { KIND_COLOR, formatMoneyCompact } from "@/lib/format";

// S3 · Prioritise — the ranked cards. Reordering is chevron buttons, not drag (D4: "Drag is not
// implemented (static design); up/down chevron buttons per row reorder"). Each card's
// consequence line is computed server-side and travels with its goal id — reordering doesn't
// change it (priority never changes waterfall dates, D6 §8).

export type PrioritiseCard = {
  id: string;
  title: string;
  kind: string;
  targetCents: number;
  consequence: string;
};

export function PrioritiseClient({
  cards: initialCards,
  children,
}: {
  cards: PrioritiseCard[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= cards.length) return;
    setCards((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/prioritise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_goal_ids: cards.map((c) => c.id) }),
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

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "20px 20px 0 20px" }}>
        {cards.map((card, index) => (
          <div key={card.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, background: KIND_COLOR[card.kind] ?? "#5856D6", color: "#FFFFFF", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              {index + 1}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexGrow: 1, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{card.title} · {formatMoneyCompact(card.targetCents)}</span>
              {card.consequence && <span style={{ fontSize: 13, lineHeight: 1.3, color: "rgba(60,60,67,0.78)" }}>{card.consequence}</span>}
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" strokeWidth={2} strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M5 8h14" />
              <path d="M5 12h14" />
              <path d="M5 16h14" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${card.title} up`}
                style={{ width: 44, height: 22, border: "none", background: "transparent", cursor: index === 0 ? "default" : "pointer", opacity: index === 0 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === cards.length - 1}
                aria-label={`Move ${card.title} down`}
                style={{ width: 44, height: 22, border: "none", background: "transparent", cursor: index === cards.length - 1 ? "default" : "pointer", opacity: index === cards.length - 1 ? 0.3 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {children}

      {error && <p style={{ margin: "10px 20px 0 20px", fontSize: 13, color: "var(--danger)" }}>{error}</p>}

      <div style={{ marginTop: "auto", padding: "20px 20px 20px 20px" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ width: "100%", height: 52, border: 0, borderRadius: 999, background: "#5856D6", color: "#FFFFFF", fontSize: 17, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "One moment…" : "Build my roadmap"}
        </button>
      </div>
    </>
  );
}
