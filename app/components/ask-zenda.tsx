"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

type Proposal = { goal_id: string; label: string; target_cents?: number; target_date?: string };
type Msg = { role: "me" | "zenda"; text: string; proposal?: Proposal | null; applied?: boolean };

// The Zenda Coach: a personal, goal-based coach that knows the person's whole picture. Answers
// questions, takes ideas and situations ("a $180 ticket", "rent went up"), and can propose a
// concrete change to a goal that the person applies with one tap. Server-side only; the engine's
// numbers are its only context.
export function AskZenda({ enabled }: { enabled: boolean }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "zenda", text: "I'm your coach and I know your whole path. Ask me anything, or tell me what's going on — a purchase you're weighing, a change in pay — and I'll show what moves." },
  ]);
  if (!enabled || pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    const history = msgs.slice(-8).map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "me", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }) });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.answer) {
        setMsgs((m) => [...m, { role: "zenda", text: data.answer, proposal: data.proposal ?? null }]);
      } else {
        setMsgs((m) => [...m, { role: "zenda", text: data?.error === "ai_off" ? "Your coach is resting right now — the numbers on your path are still exact." : "I couldn't answer that just now. Try again in a moment." }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "zenda", text: "Couldn't reach Zenda. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  async function apply(index: number, p: Proposal) {
    setBusy(true);
    try {
      const res = await fetch(`/api/goals/${p.goal_id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(p.target_cents ? { target_cents: p.target_cents } : {}), ...(p.target_date ? { target_date: p.target_date } : {}) }),
      });
      if (res.ok) {
        setMsgs((m) => m.map((msg, i) => (i === index ? { ...msg, applied: true } : msg)).concat({ role: "zenda", text: `Done — ${p.label}. Your roadmap is updated.` }));
        router.refresh();
      } else {
        setMsgs((m) => [...m, { role: "zenda", text: "I couldn't apply that change. Try it from the roadmap." }]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="ask-panel" role="dialog" aria-label="Zenda Coach">
          <div className="ask-head">
            <span style={{ fontWeight: 600 }}>Zenda Coach <span style={{ fontSize: 12, fontWeight: 500, color: "#8E8E93" }}>· knows your whole path</span></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: 0, fontSize: 20, cursor: "pointer", width: 44, height: 44 }}>×</button>
          </div>
          <div className="ask-msgs">
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "me" ? "flex-end" : "flex-start", gap: 6 }}>
                <div className={`ask-msg${m.role === "me" ? " me" : ""}`}>{m.text}</div>
                {m.proposal && (
                  <div style={{ maxWidth: "88%", padding: "10px 12px", borderRadius: 14, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                    <span style={{ flex: 1 }}>{m.proposal.label}</span>
                    {m.applied ? (
                      <span style={{ fontWeight: 700, color: "#5856D6" }}>Applied</span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => apply(i, m.proposal!)} style={{ height: 36, padding: "0 14px", borderRadius: 999, border: 0, background: "#5856D6", color: "#fff", font: "inherit", fontWeight: 600, cursor: "pointer" }}>Apply</button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="ask-msg">…</div>}
          </div>
          <form className="ask-form" onSubmit={send}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask, or share a plan: a $180 ticket, a raise…" aria-label="Your message" />
            <button type="submit" disabled={busy || !q.trim()}>Send</button>
          </form>
          <p style={{ margin: 0, padding: "0 14px 10px", fontSize: 11, color: "#8E8E93" }}>General information, not personal financial advice.</p>
        </div>
      )}
      <button type="button" className="ask-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        Zenda Coach
      </button>
    </>
  );
}
