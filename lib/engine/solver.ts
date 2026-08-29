// lib/engine/solver.ts — the compound-interest maths (D6 §3–5).
// Monthly compounding throughout: r = annualRate / 12. All money in integer cents in and out;
// internal maths in `number`, rounded only at the boundary (Math.round / Math.ceil).

import type { CurvePoint } from "./types";

/** Guard: a non-finite (NaN/±Infinity) number becomes `fallback` (D6 robustness pass:
 * "NaN/Infinity -> clamp/null"). Shared by every function below. */
function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * requiredMonthlyCents(targetCents, startingBalanceCents, months, rateAnnual) — D6 §3.
 * PMT for a future value FV, present value PV, over `months` periods at monthly rate r:
 *   (FV − PV·g)·r / (g − 1),  g = (1+r)^months
 * months <= 0 -> the gap is needed immediately (FV − PV); r === 0 -> straight division.
 * Non-finite inputs/outputs clamp to 0 (a "no extra needed" reading is the safest wrong answer —
 * never a NaN that would poison a DB write or a screen's dollar figure).
 */
export function requiredMonthlyCents(
  targetCents: number,
  startingBalanceCents: number,
  months: number,
  rateAnnual: number,
): number {
  const fv = finiteOr(targetCents, 0);
  const pv = finiteOr(startingBalanceCents, 0);
  const rate = finiteOr(rateAnnual, 0);
  if (months <= 0) return finiteOr(Math.round(fv - pv), 0);
  const r = rate / 12;
  if (r === 0) return finiteOr(Math.round((fv - pv) / months), 0);
  const g = Math.pow(1 + r, months);
  return finiteOr(Math.round(((fv - pv * g) * r) / (g - 1)), 0);
}

/**
 * monthsToReach(targetCents, startingBalanceCents, monthlyCents, rateAnnual) — D6 §4.
 * Smallest integer n with FV(n) >= target:
 *   n = ceil( ln((FV + P/r) / (PV + P/r)) / ln(1+r) )
 * Already there -> 0. No contribution and short of target -> null (never reaches). Non-finite
 * inputs, or a non-finite/negative-infinite result from the log ratio (e.g. a corrupted rate
 * that makes (1+r) <= 0), also resolve to null — "can't determine" is the honest answer the
 * nullable return type already models, never a NaN silently written to a projection row.
 */
export function monthsToReach(
  targetCents: number,
  startingBalanceCents: number,
  monthlyCents: number,
  rateAnnual: number,
): number | null {
  if (!Number.isFinite(targetCents) || !Number.isFinite(startingBalanceCents)) return null;
  if (startingBalanceCents >= targetCents) return 0;
  if (!Number.isFinite(monthlyCents) || monthlyCents <= 0) return null;
  const rate = Number.isFinite(rateAnnual) ? rateAnnual : 0;
  const r = rate / 12;
  if (r === 0) {
    const n = Math.ceil((targetCents - startingBalanceCents) / monthlyCents);
    return Number.isFinite(n) ? n : null;
  }
  const k = monthlyCents / r;
  const ratio = (targetCents + k) / (startingBalanceCents + k);
  if (!Number.isFinite(ratio) || ratio <= 0 || 1 + r <= 0) return null;
  const n = Math.ceil(Math.log(ratio) / Math.log(1 + r));
  return Number.isFinite(n) ? n : null;
}

/**
 * projectCurve(startingBalanceCents, monthlyCents, rateAnnual, months) — D6 §5.
 * balance(m) = PV·(1+r)^m + P·((1+r)^m − 1)/r  for m = 0..months (r === 0 -> PV + P·m).
 * Non-finite inputs clamp to 0 before the loop; a non-finite per-point balance (e.g. an extreme
 * rate overflowing to Infinity) clamps to the last good balance so the curve stays a valid,
 * monotonic-enough series for a chart rather than carrying a NaN/Infinity point into JSON.
 */
export function projectCurve(
  startingBalanceCents: number,
  monthlyCents: number,
  rateAnnual: number,
  months: number,
): CurvePoint[] {
  const pv = finiteOr(startingBalanceCents, 0);
  const p = finiteOr(monthlyCents, 0);
  const rate = finiteOr(rateAnnual, 0);
  const r = rate / 12;
  const n = Math.max(0, Math.floor(finiteOr(months, 0)));
  const points: CurvePoint[] = [];
  let lastGood = Math.round(pv);
  for (let m = 0; m <= n; m++) {
    let balance: number;
    if (r === 0) {
      balance = pv + p * m;
    } else {
      const g = Math.pow(1 + r, m);
      balance = pv * g + (p * (g - 1)) / r;
    }
    lastGood = finiteOr(Math.round(balance), lastGood);
    points.push({ m, balanceCents: lastGood });
  }
  return points;
}
