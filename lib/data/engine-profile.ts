import type { EngineProfile } from "@/lib/engine/types";
import type { ProfileRow } from "@/lib/data/types";

/**
 * The one place a `profiles` row becomes the engine's view of it.
 *
 * Every screen and route used to spell this mapping out inline — seven copies of the same five
 * fields. That was harmless while the five were fixed, but `locked_monthly_cents` (migration 0004)
 * changes what capacity *is*, and a copy that forgets to pass it reports a different number for
 * the same person on a different screen. One mapper, one answer, per CLAUDE.md's "ONE engine".
 */
export type EngineProfileFields = Pick<
  ProfileRow,
  "pay_cycle" | "take_home_cents" | "essentials_cents" | "lifestyle_cents" | "buffer_cents" | "locked_monthly_cents"
>;

/**
 * The one place a `profiles` row becomes the engine's view of it.
 *
 * Every screen and route used to spell this mapping out inline — seven copies of the same five
 * fields. That was harmless while the five were fixed, but `locked_monthly_cents` (migration 0004)
 * changes what capacity *is*, and a copy that forgets to pass it reports a different number for
 * the same person on a different screen. One mapper, one answer, per CLAUDE.md's "ONE engine".
 */

export function toEngineProfile(profile: EngineProfileFields): EngineProfile {
  return {
    payCycle: profile.pay_cycle,
    takeHomeCents: profile.take_home_cents,
    essentialsCents: profile.essentials_cents,
    lifestyleCents: profile.lifestyle_cents,
    bufferCents: profile.buffer_cents,
    lockedMonthlyCents: profile.locked_monthly_cents,
  };
}
