-- 0002 · money moves: taking money out of a goal (an emergency, a change of plan) and a note on
-- every manual move. Run once in the Supabase SQL editor after 0001_zenda.sql.
--
-- A withdrawal is a `manual` contribution with a negative amount; every read that sums a goal's
-- contributions already handles it. Payday check-ins stay >= 0 (0 = "not this time").

alter table public.contributions drop constraint if exists contributions_amount_cents_check;
alter table public.contributions
  add constraint contributions_amount_cents_check
  check (
    (kind = 'manual' and amount_cents <> 0 and amount_cents > -100000000 and amount_cents < 100000000)
    or (kind <> 'manual' and amount_cents >= 0)
  );

alter table public.contributions add column if not exists note text check (char_length(note) <= 120);
