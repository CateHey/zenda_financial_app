// lib/engine/solver.ts — the compound-interest maths (D6 §3–5).
// Monthly compounding throughout: r = annualRate / 12. All money in integer cents in and out;
// internal maths in `number`, rounded only at the boundary (Math.round / Math.ceil).

import type { CurvePoint } from "./types";

/**
 * requiredMonthlyCents(targetCents, startingBalanceCents, months, rateAnnual) — D6 §3.
 * PMT for a future value FV, present value PV, over `months` periods at monthly rate r:
 *   (FV − PV·g)·r / (g − 1),  g = (1+r)^months
 * months <= 0 -> the gap is needed immediately (FV − PV); r === 0 -> straight division.
 */
export function requiredMonthlyCents(
  targetCents: number,
  startingBalanceCents: number,
  months: number,
  rateAnnual: number,
): number {
  const fv = targetCents;
  const pv = startingBalanceCents;
  if (months <= 0) return Math.round(fv - pv);
  const r = rateAnnual / 12;
  if (r === 0) return Math.round((fv - pv) / months);
  const g = Math.pow(1 + r, months);
  return Math.round(((fv - pv * g) * r) / (g - 1));
}

/**
 * monthsToReach(targetCents, startingBalanceCents, monthlyCents, rateAnnual) — D6 §4.
 * Smallest integer n with FV(n) >= target:
 *   n = ceil( ln((FV + P/r) / (PV + P/r)) / ln(1+r) )
 * Already there -> 0. No contribution and short of target -> null (never reaches).
 */
export function monthsToReach(
  targetCents: number,
  startingBalanceCents: number,
  monthlyCents: number,
  rateAnnual: number,
): number | null {
  if (startingBalanceCents >= targetCents) return 0;
  if (monthlyCents <= 0) return null;
  const r = rateAnnual / 12;
  if (r === 0) {
    return Math.ceil((targetCents - startingBalanceCents) / monthlyCents);
  }
  const k = monthlyCents / r;
  const ratio = (targetCents + k) / (startingBalanceCents + k);
  return Math.ceil(Math.log(ratio) / Math.log(1 + r));
}

/**
 * projectCurve(startingBalanceCents, monthlyCents, rateAnnual, months) — D6 §5.
 * balance(m) = PV·(1+r)^m + P·((1+r)^m − 1)/r  for m = 0..months (r === 0 -> PV + P·m).
 */
export function projectCurve(
  startingBalanceCents: number,
  monthlyCents: number,
  rateAnnual: number,
  months: number,
): CurvePoint[] {
  const r = rateAnnual / 12;
  const n = Math.max(0, Math.floor(months));
  const points: CurvePoint[] = [];
  for (let m = 0; m <= n; m++) {
    let balance: number;
    if (r === 0) {
      balance = startingBalanceCents + monthlyCents * m;
    } else {
      const g = Math.pow(1 + r, m);
      balance = startingBalanceCents * g + (monthlyCents * (g - 1)) / r;
    }
    points.push({ m, balanceCents: Math.round(balance) });
  }
  return points;
}
