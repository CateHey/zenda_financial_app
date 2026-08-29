// lib/format.ts — money and date formatting shared by server (recompute, pages) and client
// components (Discover, WhatIf). Framework-free like lib/engine, importable from either side.
// A8: "Dollar formatting everywhere: Intl.NumberFormat("en-AU", { style: "currency", currency,
// maximumFractionDigits: 0 })." Bindings doc header: "Month YYYY" =
// Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).

import type { PayCycle } from "./engine/types";

export function formatMoney(cents: number, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Compact form for chips and node amounts (S1/S4 bindings): "$1M", "$50k", "$4k", "$260". */
export function formatMoneyCompact(cents: number): string {
  const dollars = Math.round(cents / 100);
  const sign = dollars < 0 ? "-" : "";
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `${sign}$${trimZero(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trimZero(abs / 1_000)}k`;
  return `${sign}$${abs}`;
}

function trimZero(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Compact magnitude with no leading "$" (e.g. "75k", "1.2M", "260") — for building a range. */
export function compactNumberLabel(cents: number): string {
  const dollars = Math.round(Math.abs(cents) / 100);
  if (dollars >= 1_000_000) return `${trimZero(dollars / 1_000_000)}M`;
  if (dollars >= 1_000) return `${trimZero(dollars / 1_000)}k`;
  return String(dollars);
}

/** "$75k–130k" (S4 growth_required node amount): one leading "$", each side compact. */
export function formatMoneyRangeCompact(lowCents: number, highCents: number): string {
  return `$${compactNumberLabel(lowCents)}–${compactNumberLabel(highCents)}`;
}

/** "Month YYYY" (e.g. "January 2027") from a YYYY-MM-DD calendar date, read as UTC (A2). */
export function monthYearLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** "Month" only, no year (e.g. "December") — used for the nearer of the two what-if dates (S4). */
export function monthOnlyLabel(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-AU", { month: "long", timeZone: "UTC" }).format(date);
}

/** Per-pay-cycle amount -> monthly amount (D6 preamble: weekly x52/12, fortnightly x26/12). */
export function monthlyFromPerCycleCents(perCycleCents: number, payCycle: PayCycle): number {
  if (payCycle === "weekly") return Math.round((perCycleCents * 52) / 12);
  if (payCycle === "fortnightly") return Math.round((perCycleCents * 26) / 12);
  return Math.round(perCycleCents);
}

/** Monthly amount -> per-pay-cycle amount (D4: "display converts monthly <-> weekly with x12/52"). */
export function perCycleFromMonthlyCents(monthlyCents: number, payCycle: PayCycle): number {
  if (payCycle === "weekly") return Math.round((monthlyCents * 12) / 52);
  if (payCycle === "fortnightly") return Math.round((monthlyCents * 12) / 26);
  return Math.round(monthlyCents);
}

/** Monthly amount -> weekly amount, the fixed display unit for `why` templates and roadmap copy (D4). */
export function weeklyFromMonthlyCents(monthlyCents: number): number {
  return Math.round((monthlyCents * 12) / 52);
}

export const CYCLE_WORD: Record<PayCycle, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
};

/** "<a>." / "<a> and <b>." / "<a>, <b>, <c>." (S4 title-join rule: no "and" before the last of 3+). */
export function joinTitles(titles: string[]): string {
  if (titles.length === 0) return "";
  if (titles.length === 1) return `${titles[0]}.`;
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}.`;
  return `${titles.join(", ")}.`;
}

export const KIND_LABEL: Record<string, string> = {
  travel: "Travel",
  car: "Car",
  home: "Home",
  study: "Study",
  business: "Business",
  buffer: "Buffer",
  emergency: "Emergency",
  other: "Other",
};

/** Ramp colour by kind (S2 binding, reused on S4 node dots). */
export const KIND_COLOR: Record<string, string> = {
  travel: "#007AFF",
  car: "#5856D6",
  home: "#AF52DE",
  buffer: "#0057D9",
  emergency: "#0057D9",
  study: "#8450DA",
  business: "#8450DA",
  other: "#8450DA",
};
