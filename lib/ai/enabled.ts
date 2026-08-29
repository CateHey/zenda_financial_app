// lib/ai/enabled.ts — the one gate every AI call site checks before doing any work.
// "With the key absent, nothing breaks" (D10 task 11 acceptance): callers check this (or
// lib/ai/run.ts checks it internally) instead of letting a missing key surface as a thrown
// error from the Anthropic SDK.

export function aiEnabled(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}
