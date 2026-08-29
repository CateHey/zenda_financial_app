// lib/ai/banned-terms.ts — the education-not-advice gate (D0: "REUSE those functions only").
// Copied verbatim from ../hackathon_uqies/packages/ai/src/validate.ts (lines 1–44): only
// BANNED_PATTERNS, findBannedTerms, containsBannedTerms. The rest of that file (ValidationError,
// postValidate, SPINE, …) is Free Me plan validation — not copied, per D0.

/** Phrases and names that turn education into advice. Extend freely; every entry is a gate. */
export const BANNED_PATTERNS: RegExp[] = [
  /\byou (should|must|need to) (buy|sell|purchase|invest in|put (your )?money in(to)?)\b/i,
  /\b(guaranteed|risk[- ]free) (returns?|profits?|gains?|income)\b/i,
  /\b(can't|cannot|won't) lose\b/i,
  // brokers, platforms, fund managers
  /\b(vanguard|betashares|blackrock|ishares|state street|commsec|selfwealth|superhero|raiz|spaceship|pearler|stake|moomoo|coinbase|binance|kraken|swyftx|coinspot|robinhood|etoro|fidelity|schwab|webull|interactive brokers)\b/i,
  // banks
  /\b(commbank|commonwealth bank|westpac|anz|nab|macquarie|ing|up bank|ubank)\b/i,
  // specific coins
  /\b(bitcoin|btc|ethereum|eth|solana|dogecoin|xrp|cardano|tether)\b/i,
  // tickers: VAS.AX, $VOO, NASDAQ:AAPL
  /\b[A-Z]{2,5}\.(AX|ASX|L|NYSE|NASDAQ)\b/,
  /\$[A-Z]{2,5}\b/,
  /\b(ASX|NYSE|NASDAQ):[A-Z]{1,5}\b/,
];

export function findBannedTerms(text: string): string[] {
  const hits: string[] = [];
  for (const re of BANNED_PATTERNS) {
    const m = text.match(re);
    if (m?.[0]) hits.push(m[0]);
  }
  return hits;
}

export function containsBannedTerms(text: string): boolean {
  return findBannedTerms(text).length > 0;
}
