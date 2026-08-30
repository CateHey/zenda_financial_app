-- 0004 . locked savings: "keep sending exactly this much". Run once in the Supabase SQL editor
-- after 0003_waitlist.sql.
--
-- Capacity is normally derived (take-home - essentials - fun - buffer, + buffer back). That means
-- a pay rise, a rent rise or an edit to the fun line silently changes what reaches the goals.
-- Locking is the standing decision that it should not: while locked_monthly_cents is set, the
-- engine uses it as the capacity outright and the derived surplus becomes the thing that moves.
-- null = not locked, which is every profile until someone presses Lock on the what-if card.
--
-- Stored monthly because the engine's capacity unit is monthly (lib/engine/rates.ts); the UI
-- converts to the profile's own cycle for display, exactly as it already does for capacity.

alter table public.profiles add column if not exists locked_monthly_cents bigint;

alter table public.profiles drop constraint if exists profiles_locked_monthly_cents_check;
alter table public.profiles
  add constraint profiles_locked_monthly_cents_check
  check (locked_monthly_cents is null or (locked_monthly_cents > 0 and locked_monthly_cents < 100000000));

comment on column public.profiles.locked_monthly_cents is
  'When set, the engine uses this as monthly capacity instead of the derived surplus. Null = derive.';
