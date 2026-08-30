-- 0003 · waitlist: the one table anyone on the internet may write to, and nobody may read from a
-- client. Run once in the Supabase SQL editor after 0002_money_moves.sql.
--
-- Everything else in this schema is owned by a signed-in person (RLS: `user_id = auth.uid()`).
-- A waitlist entry has no owner: it is left by a visitor on public/landing.html before they have
-- an account. So the policy shape is inverted — insert is open to `anon`, and there is no select
-- policy at all, for any role. An address left here cannot be read back by the browser that left
-- it, cannot be enumerated by a signed-in employee, and cannot leak through PostgREST. The owner
-- reads the list in the Supabase SQL editor (or the dashboard's table view), which bypasses RLS.

do $$ begin
  create type public.waitlist_kind as enum ('company', 'individual');
exception when duplicate_object then null; end $$;

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  kind       public.waitlist_kind not null,
  email      text not null unique
               check (char_length(email) between 5 and 160 and position('@' in email) > 1),
  company    text check (char_length(company) between 1 and 80),
  team_size  text check (team_size in ('1-50', '51-200', '201-500', '500+')),
  note       text check (char_length(note) <= 300),
  source     text check (char_length(source) <= 60),   -- which CTA sent them ('pricing_company', …)
  created_at timestamptz not null default now(),
  -- a company entry names the company; an individual's company is optional ("I'd like Zenda at…")
  constraint waitlist_company_required_for_company
    check (kind <> 'company' or (company is not null and char_length(company) >= 1))
);
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);

-- ---------- RLS: write-only, to everyone ----------
alter table public.waitlist enable row level security;

-- Supabase's default privileges grant all on new public tables to anon/authenticated. Narrow that
-- to insert here, so the write-only property holds at the grant level as well as the policy level.
revoke all on table public.waitlist from anon, authenticated;
grant insert on table public.waitlist to anon, authenticated;

-- The only policy on this table. No select / update / delete policy exists for any client role:
-- with RLS on, that absence is a denial, the same way the missing org-admin policy in 0001 IS the
-- employer-blindness guarantee.
drop policy if exists "anyone may join the waitlist" on public.waitlist;
create policy "anyone may join the waitlist" on public.waitlist
  for insert to anon, authenticated with check (true);

-- The unique email above turns a second sign-up into a unique_violation (23505). POST
-- /api/waitlist swallows exactly that code and answers with its ordinary thank-you, rather than
-- letting the shared handler turn it into a 409: "you are already on the list" would tell an
-- anonymous caller whether a given address is on it, one address at a time.
