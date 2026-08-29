"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// S8 · Goal reached — both buttons do the same thing (mark the event seen, then /roadmap); only
// the primary button's label is kind-specific (ZENDA_SCREEN_BINDINGS.md S8).

export function CelebrateActions({ eventId, nextStepLabel }: { eventId: string; nextStepLabel: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function markSeenAndGo() {
    setPending(true);
    try {
      await fetch(`/api/events/${eventId}/seen`, { method: "POST" });
    } catch {
      // Best-effort: the event just stays unseen if this fails — never blocks the navigation.
    }
    router.push("/roadmap");
  }

  return (
    <>
      <button
        type="button"
        onClick={markSeenAndGo}
        disabled={pending}
        style={{ height: 52, border: 0, borderRadius: 999, background: "#FFFFFF", color: "#5856D6", fontSize: 17, fontWeight: 600, cursor: pending ? "default" : "pointer", opacity: pending ? 0.85 : 1 }}
      >
        {nextStepLabel}
      </button>
      <button
        type="button"
        onClick={markSeenAndGo}
        disabled={pending}
        style={{ height: 48, border: "2px solid rgba(255,255,255,0.7)", borderRadius: 999, background: "transparent", color: "#FFFFFF", fontSize: 16, fontWeight: 600, cursor: pending ? "default" : "pointer" }}
      >
        Back to the path
      </button>
    </>
  );
}
