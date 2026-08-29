create extension if not exists pgcrypto;

-- ---------- enums ----------
create type public.org_role          as enum ('admin', 'employee');
create type public.goal_kind         as enum ('travel', 'car', 'home', 'study', 'business', 'buffer', 'emergency', 'other');
create type public.goal_type         as enum ('savings_achievable', 'growth_required');
create type public.goal_status       as enum ('active', 'reached', 'paused');
create type public.contribution_kind as enum ('checkin_full', 'checkin_partial', 'manual', 'seed');
create type public.event_kind        as enum ('milestone_reached', 'streak', 'nudge', 'adapted', 'trade_off');

-- ---------- organisations ----------
create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,              -- typed at signup, e.g. 'DEMO'
  seat_limit  integer not null default 50 check (seat_limit > 0),
  created_at  timestamptz not null default now()
);

-- ---------- profiles: one per auth user; "where you are today" ----------
create table public.profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  org_id           uuid not null references public.organisations (id),
  role             public.org_role not null default 'employee',
  display_name     text not null check (char_length(display_name) between 1 and 60),
  currency         char(3) not null default 'AUD',
  pay_cycle        text not null default 'weekly' check (pay_cycle in ('weekly', 'fortnightly', 'monthly')),
  take_home_cents  bigint not null default 0 check (take_home_cents >= 0),   -- per pay cycle
  essentials_cents bigint not null default 0 check (essentials_cents >= 0),
  lifestyle_cents  bigint not null default 0 check (lifestyle_cents >= 0),
  buffer_cents     bigint not null default 0 check (buffer_cents >= 0),     -- the "buffer" line, banked
  savings_cents    bigint not null default 0 check (savings_cents >= 0),    -- existing savings today
  debt_cents       bigint not null default 0 check (debt_cents >= 0),
  debt_rate_bps    integer not null default 0 check (debt_rate_bps >= 0),
  risk_comfort     text not null default 'medium' check (risk_comfort in ('low', 'medium', 'high')),
  freedom_text     text,                                   -- verbatim answer to the anchor question
  started_on       date not null default current_date,     -- month 0 of every projection
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (org_id);

-- ---------- goals ----------
create table public.goals (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  kind                   public.goal_kind not null,
  title                  text not null check (char_length(title) between 1 and 80),
  target_cents           bigint not null check (target_cents > 0),
  starting_balance_cents bigint not null default 0 check (starting_balance_cents >= 0),
  target_date            date not null,
  priority               integer not null default 1 check (priority >= 1),   -- 1 = most important
  goal_type              public.goal_type not null default 'savings_achievable',
  status                 public.goal_status not null default 'active',
  why                    text,                     -- plain-language why (template first, AI upgrade later)
  reached_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index goals_user_date_idx on public.goals (user_id, target_date);
create index goals_user_priority_idx on public.goals (user_id, priority);

-- ---------- contributions: every check-in is a row ----------
create table public.contributions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  goal_id      uuid not null references public.goals (id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),   -- 0 allowed: "not this time" is recorded
  occurred_on  date not null default current_date,
  kind         public.contribution_kind not null,
  created_at   timestamptz not null default now()
);
create index contributions_user_date_idx on public.contributions (user_id, occurred_on desc);
create index contributions_goal_idx on public.contributions (goal_id, occurred_on desc);

-- ---------- assumptions: rates are data ----------
create table public.assumptions (
  key         text primary key,
  value       numeric not null,
  description text not null
);
insert into public.assumptions (key, value, description) values
  ('cash_rate_annual',          0.05,  'Annual rate applied to money needed within the cash horizon'),
  ('growth_rate_annual',        0.09,  'Planning rate for money with a 5+ year horizon'),
  ('upside_rate_annual',        0.12,  'Shown as the upside case only, never the plan'),
  ('glide_cash_below_months',   36,    'Horizons under this many months use the cash rate'),
  ('glide_growth_above_months', 60,    'Horizons at or above this many months use the growth rate'),
  ('first_milestone_cents',     50000, 'The breathing-room buffer suggested first'),
  ('emergency_weeks',           4,     'Emergency fund = this many weeks of essentials'),
  ('min_cohort',                5,     'Org aggregates render only at or above this many members');

-- ---------- goal_projections: the engine output, one row per goal (latest only) ----------
create table public.goal_projections (
  goal_id                 uuid primary key references public.goals (id) on delete cascade,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  computed_at             timestamptz not null default now(),
  rate_annual             numeric not null,
  capacity_monthly_cents  bigint not null,
  start_month             integer not null,            -- waterfall start, months after profile.started_on
  completion_month        integer,                     -- null when never at this capacity
  required_monthly_cents  bigint not null,             -- to hit target_date from start_month
  achievable              boolean not null,
  alt_later_months        integer,                     -- same target, when it lands at capacity
  alt_smaller_target_cents bigint,                     -- same date, what capacity reaches
  alt_extra_monthly_cents bigint,                      -- capacity shortfall to hit the date
  curve                   jsonb not null               -- [{"m":0,"balance_cents":0}, ...]
);

-- ---------- motivational_events ----------
create table public.motivational_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  goal_id    uuid references public.goals (id) on delete set null,
  kind       public.event_kind not null,
  message    text not null,                -- the line shown; template first, AI may upgrade
  payload    jsonb not null default '{}',  -- e.g. before/after for 'adapted'
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);
create index events_user_idx on public.motivational_events (user_id, created_at desc);

-- ---------- lessons: catalogue content ----------
create table public.lessons (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  body_md      text not null,
  trigger_tag  text not null,     -- 'debt_vs_savings' | 'horizon' | 'optimism' | 'buffer' | 'super'
  created_at   timestamptz not null default now()
);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger goals_touch    before update on public.goals    for each row execute function public.touch_updated_at();

-- ---------- join code lookup (non-members cannot read organisations) ----------
create or replace function public.org_id_for_join_code(code text)
returns uuid language sql security definer stable as $$
  select id from public.organisations where join_code = upper(trim(code)) limit 1
$$;
revoke all on function public.org_id_for_join_code(text) from public;
grant execute on function public.org_id_for_join_code(text) to authenticated;

-- ---------- employer view: counts only, cohort-gated, admin-only ----------
create or replace function public.org_seat_stats(org uuid)
returns table (seats integer, members integer, active_14d integer)
language plpgsql security definer stable as $$
declare min_c integer := (select value::integer from public.assumptions where key = 'min_cohort');
begin
  if not exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.org_id = org and p.role = 'admin') then
    return;                                    -- not an admin of this org: no rows
  end if;
  return query
    select o.seat_limit,
           (select count(*)::integer from public.profiles p where p.org_id = org),
           case when (select count(*) from public.profiles p where p.org_id = org) >= min_c
                then (select count(*)::integer from public.profiles p where p.org_id = org and p.last_seen_at > now() - interval '14 days')
                else null end
    from public.organisations o where o.id = org;
end $$;
revoke all on function public.org_seat_stats(uuid) from public;
grant execute on function public.org_seat_stats(uuid) to authenticated;

-- ---------- ROW LEVEL SECURITY: every table, no exceptions ----------
alter table public.organisations       enable row level security;
alter table public.profiles            enable row level security;
alter table public.goals               enable row level security;
alter table public.contributions       enable row level security;
alter table public.assumptions         enable row level security;
alter table public.goal_projections    enable row level security;
alter table public.motivational_events enable row level security;
alter table public.lessons             enable row level security;

-- organisations: members read their own org's name; nobody writes from a client.
create policy "org members read own org" on public.organisations
  for select using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.org_id = organisations.id));

-- profiles: a person owns exactly their row. No org-admin policy exists: an admin cannot select
-- another member's profile. That absence IS the employer-blindness guarantee.
create policy "read own profile"   on public.profiles for select using (user_id = auth.uid());
create policy "insert own profile" on public.profiles for insert with check (user_id = auth.uid());
create policy "update own profile" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- goals / contributions / projections / events: own rows, all four operations.
create policy "own goals"         on public.goals               for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own contributions" on public.contributions       for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own projections"   on public.goal_projections    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own events"        on public.motivational_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reference data: any signed-in person reads; nobody writes from a client.
create policy "read assumptions" on public.assumptions for select to authenticated using (true);
create policy "read lessons"     on public.lessons     for select to authenticated using (true);
