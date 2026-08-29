-- Free Me schema teardown. Safe to re-run.
drop trigger  if exists sessions_touch on public.sessions;
drop policy   if exists "read own sessions" on public.sessions;
drop policy   if exists "read own plans"    on public.plans;
drop table    if exists public.plans;
drop table    if exists public.sessions;
drop function if exists public.touch_updated_at();
-- auth.users rows from the old demo are intentionally kept.
