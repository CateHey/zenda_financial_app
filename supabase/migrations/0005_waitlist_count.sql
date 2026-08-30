-- 0005 · waitlist count: the one thing about the waitlist anyone may read — how many are on it.
-- Run once in the Supabase SQL editor after 0003_waitlist.sql.
--
-- 0003 made the table write-only for every client role (no select policy). That stays. This
-- function runs as its owner (security definer), so it can count rows the caller cannot see,
-- and it returns a single integer — never a row, never an address. GET /api/waitlist calls it
-- for the counter on public/landing.html.

create or replace function public.waitlist_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.waitlist;
$$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon, authenticated;
