"use client";

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";

type Msg = { role: "me" | "zenda"; text: string };

// "Ask Zenda": a small assistant that answers questions about the person's own roadmap, with
// the engine's numbers as context. Server-side only; it never does the arithmetic itself.
export function AskZenda({ enabled }: { enabled: boolean }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "zenda", text: "Ask me anything about your path — why a date lands where it does, what moves it, what to do this payday." },
  ]);
  if (!enabled || pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "me", text: question }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const data = await res.json().catch(() => null);
      const text = res.ok && data?.answer ? data.answer : data?.error === "ai_off"
        ? "Zenda's assistant is resting right now — the numbers on your path are still exact."
        : "I couldn't answer that just now. Try again in a moment.";
      setMsgs((m) => [...m, { role: "zenda", text }]);
    } catch {
      setMsgs((m) => [...m, { role: "zenda", text: "Couldn't reach Zenda. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="ask-panel" role="dialog" aria-label="Ask Zenda">
          <div className="ask-head">
            <span style={{ fontWeight: 600 }}>Ask Zenda</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: "none", border: 0, fontSize: 20, cursor: "pointer", width: 44, height: 44 }}>×</button>
          </div>
          <div className="ask-msgs">
            {msgs.map((m, i) => (
              <div key={i} className={`ask-msg${m.role === "me" ? " me" : ""}`}>{m.text}</div>
            ))}
            {busy && <div className="ask-msg">…</div>}
          </div>
          <form className="ask-form" onSubmit={send}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Why is the car in 2029?" aria-label="Your question" />
            <button type="submit" disabled={busy || !q.trim()}>Ask</button>
          </form>
          <p style={{ margin: 0, padding: "0 14px 10px", fontSize: 11, color: "#8E8E93" }}>General information, not personal financial advice.</p>
        </div>
      )}
      <button type="button" className="ask-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        Ask Zenda
      </button>
    </>
  );
}
