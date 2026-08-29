// lib/engine/today.ts — A12: the demo clock.
//
// The persona timeline starts 2026-09-01 and the seeded contributions run to 2026-10-12, but the
// real clock at build/demo time is earlier than that, which makes every "today" computation wrong
// (contributions in the future, "already checked in" forever true, todayMonth = 0).
//
// Rule (A12): every place the app needs today's date calls this one helper. It returns
// process.env.DEMO_TODAY when that variable is set and a valid YYYY-MM-DD, otherwise the real UTC
// date. No other code reads the clock — Date.now()/new Date() for *dates* is forbidden outside
// this file (timestamps like created_at/computed_at stay real "now", per A12's own carve-out).

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(): string {
  const demo = process.env.DEMO_TODAY;
  if (demo && ISO_DATE_RE.test(demo)) return demo;
  return new Date().toISOString().slice(0, 10);
}
