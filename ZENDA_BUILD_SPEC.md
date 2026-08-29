# ZENDA_BUILD_SPEC.md — the build specification for Sonnet

> Authored by Fable as technical architect. **This document is the only handoff.** Sonnet
> implements from it and makes no product decisions. Where a decision was open, it has been
> made below and marked *Decision*. Where the designs and the architecture conflict, it is
> marked *Conflict* and left for the owner. No application code appears here; SQL, schemas,
> types, env lists and configs do.
>
> Working directory for everything: `C:\Users\uqcvaras\Downloads\zenda\zenda_app` (= project root).
> Sibling reference repo (copy from, never build in): `C:\Users\uqcvaras\Downloads\zenda\hackathon_uqies`.

**Companion specs (read all three before task 1):** `ZENDA_SPEC_ADDENDUM.md` — precision items found in
validation; **it overrides this document where they differ** (notably D3's session proxy, which is specified
there from scratch). `ZENDA_SCREEN_BINDINGS.md` — element-level data bindings for every screen. `ZENDA_TEST_SPEC.md` — the
five-layer test plan; its T1/T2/T3 sessions slot into D10 after tasks 7, 10 and 12, and **its definition
of done supersedes D1's "engine tests only"**: `npm run test:all` green locally and `test:smoke` green
against the public URL.

**Blocking questions: none.** Three assumptions stated up front instead — correct any of them and the
affected section changes, nothing else:

1. The "old, unrelated schema" to drop is Free Me's `public.sessions` / `public.plans` (+ one trigger, one
   function, two policies). Rows in `auth.users` from the old demo are left in place — harmless.
2. The demo organisation is joined with a company code, `DEMO`, typed at signup. No invite emails.
3. The landing page's two buttons become links (`/signup`, `/login?demo=vinuy`). That is the only
   edit to a design asset.

---

## D0 · Codebase audit

### What is in `zenda_app` (project root)

| Path | What it is | Mark |
|---|---|---|
| `new_app.md` | The product brief: three modules, palette, continuity law, MVP scope, cut list | **REUSE** as product truth; not shipped |
| `CLAUDE.md` | Working rules: numbers from the engine never the LLM, banned-terms gate, server-only keys, no raw hex | **EXTEND** — D1 replaces the stack section (no monorepo, no Tailwind); rules stay |
| `ZENDA_DESIGN.md` | Tokens (the actual values), type scale, motion, palette contrast table, landing-scene plan | **REUSE** — §1 token values become `app/tokens.css` verbatim |
| `ZENDA_MOTION_DEMO.md` | Documents the landing prototype | REUSE as reference only |
| `VINUY_JOURNEY.md` | The persona profile and the computed roadmap (source of every seed number) | **REUSE** — seed data + engine test vector |
| `demo/zenda-path.html` | The landing page: hero, three-circle module row, CTAs, WebGL scene, poster fallback, reduced-motion handling | **REUSE** — becomes `public/landing.html`, served at `/`; buttons → links (assumption 3) |
| `design/screens/Main.dc.html` | Discover screen (chat + goal chips + "where you are today" sheet + engine box) | **REUSE** — port 1:1 to `/discover` |
| `design/screens/Achievable.dc.html` | Verdict cards per goal | **REUSE** → `/achievable` |
| `design/screens/Priorities.dc.html` | Ranked goals + "where the $260 goes" bar | **REUSE** → `/prioritise` |
| `design/screens/Roadmap.dc.html` | The path, status tags, what-if slider | **REUSE** → `/roadmap` |
| `design/screens/Tradeoff.dc.html` | Three car options + consequence | **REUSE** → `/roadmap/trade-off` |
| `design/screens/Tracking.dc.html` | Nudge, progress line, streak dots, "Life changed?", check-in sheet | **REUSE** → `/progress` |
| `design/screens/Adapt.dc.html` | Before/after table + two choices | **REUSE** → `/progress/adapt` |
| `design/screens/Celebration.dc.html` | The loud moment | **REUSE** → `/celebrate` |
| `design/screens/canvas.json` | Canvas layout for the design tool | DELETE from the app tree (keep in `design/`) |
| `.env.local` | Real keys. Names present: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`, `DEMO_MODE` | **REUSE**; gitignored (D9). Note the names already follow the `NEXT_PUBLIC_` convention, not the §3 list — D9 reconciles |
| `.env.example` | Placeholders | EXTEND to the D9 list |

There is **no application code** in `zenda_app` yet: no `package.json`, no `app/`, no migrations.

### Copyable assets in `hackathon_uqies` (copy the file, adapt the import paths, nothing else)

| Path | Why it matters | Mark |
|---|---|---|
| `apps/web/lib/supabase/browser.ts` | `createBrowserClient` singleton, null when unconfigured | **REUSE** verbatim → `lib/supabase/browser.ts` |
| `apps/web/lib/supabase/server.ts` | `createServerClient` bound to request cookies (`getAll`/`setAll`), plus a service-role admin client | **REUSE** the cookie client; **DELETE** the admin client from runtime code (D5: service role is seed-only) |
| `packages/ai/src/client.ts` | Anthropic wrapper: `MODEL = "claude-opus-5"`, `messages.parse` + `zodOutputFormat`, effort, `cache_control` on the system prefix, refusal handling, usage accounting | **REUSE** verbatim → `lib/ai/client.ts` |
| `packages/ai/src/validate.ts` (lines 1–44: `BANNED_PATTERNS`, `findBannedTerms`, `containsBannedTerms`) | The education-not-advice gate | **REUSE** those functions only → `lib/ai/banned-terms.ts`; the rest is Free Me plan validation — do not copy |
| `supabase/migrations/0001_init.sql` | Names every object the teardown must drop | Reference only (D2 teardown) |
| `apps/web/package.json` | Proven version set: `next ^16.3.3`, `react ^19.2.8`, `@supabase/ssr ^0.12.5`, `@supabase/supabase-js ^2.112.4`, `zod ^4.4.3`; `@anthropic-ai/sdk ^0.121.0` from `packages/ai` | **REUSE** the versions |
| `.gitignore` | Correct for Next + env | **REUSE** verbatim |
| `apps/web/app/api/**`, `packages/core/**`, `packages/api-client`, `apps/mobile`, evals | Free Me's plan/region/bridge domain model — different product | **DO NOT COPY** |

**What we are actually starting from.** Eight finished, token-faithful screens as plain HTML with inline
styles (≈90% valid JSX already), a landing page that runs, a persona whose every number has been computed
and cross-checked, a proven Supabase + Anthropic wiring pattern one folder away, and real keys in place.
The gap is exactly: one Next.js app, one schema, one engine module, five route handlers, one seed script.

---

## D1 · Stack decision

| Layer | Decision | Justification |
|---|---|---|
| Framework | **Next.js 16 App Router, one app at the project root** (`package.json` in `zenda_app`) | Same major the sibling repo already runs with `@supabase/ssr`. One app, no monorepo, no Turbo: with one Sonnet session the workspace machinery costs more than it returns. |
| Hosting | **Vercel**, root directory `.` | The account already deploys a Next app this way; `next/server`'s `after()` gives us post-response AI work without a queue. |
| Database + auth | **Supabase** (existing project): Postgres, Auth (email + password), RLS | Auth and the employer-blindness promise are both native features; nothing to build. |
| Data fetching | **Server Components read directly with the cookie-bound user client** (RLS scopes every query). **Writes go through Route Handlers** with Zod validation, also using the user client. **No service role at runtime.** | Fewest moving parts: RLS is the authorisation layer, the API is a thin validated door. The service key exists only in the seed script. |
| State | **None.** URL + server data. The what-if slider is local React state calling the pure engine in the browser. | Nothing is shared across screens that the database doesn't already hold. |
| Styling | **`app/tokens.css` (the ZENDA_DESIGN §1 values as CSS custom properties) + the screens' inline styles ported as-is** | The designs are already inline-styled; porting them is transcription. A utility framework would be a second design system. |
| Validation | **Zod 4** for every request body and every AI output | One schema serves the route handler and the structured-output call. |
| AI | **`@anthropic-ai/sdk`**, `claude-opus-5`, `messages.parse` + `zodOutputFormat`, `output_config.effort: "low"` | Two small copy tasks; low effort is fast and cheap; the wrapper is already written. |
| Testing | **Vitest** for `lib/engine` only (the D6 vector); nothing else is tested for the hackathon | Deterministic maths is the one thing a judge can be shown proof of. |

**Deliberately not using:** Tailwind, pnpm workspaces/Turbo, TanStack Query, Zustand, Prisma/Drizzle (migrations are SQL files run in the Supabase SQL editor), NextAuth (Supabase Auth), tRPC, Expo/React Native (web is the priority — see §D12 for the PWA line), React Three Fiber (the landing scene stays the static HTML file it already is), PostHog/Sentry (keys exist; not wired), the mobile push layer (in-app nudges only).

**Package manifest** (`package.json` dependencies — exact set):
`next ^16.3.3`, `react ^19.2.8`, `react-dom ^19.2.8`, `@supabase/ssr ^0.12.5`, `@supabase/supabase-js ^2.112.4`, `@anthropic-ai/sdk ^0.121.0`, `zod ^4.4.3`; dev: `typescript ^5`, `@types/node`, `@types/react`, `@types/react-dom`, `vitest ^3`. Scripts: `dev`, `build`, `start`, `test` (vitest run), `seed` (node scripts/seed.mjs).

**Config files to create:** `next.config.ts` with one rewrite `{ source: "/", destination: "/landing.html" }`; `tsconfig.json` (Next default, `strict: true`, path alias `@/*` → `./*`); `.gitignore` copied from the sibling; `vitest.config.ts` (node environment, include `lib/engine/**/*.test.ts`).

---

## D2 · Data model

Money is stored as **integer cents** (`bigint`), rates as **basis points** (`integer`) or `numeric` in the assumptions table, never floats. Currency is a column, defaulted to `AUD`, never hardcoded in logic.

### Migration `supabase/migrations/0000_teardown.sql` — run first, once

```sql
-- Free Me schema teardown. Safe to re-run.
drop trigger  if exists sessions_touch on public.sessions;
drop policy   if exists "read own sessions" on public.sessions;
drop policy   if exists "read own plans"    on public.plans;
drop table    if exists public.plans;
drop table    if exists public.sessions;
drop function if exists public.touch_updated_at();
-- auth.users rows from the old demo are intentionally kept.
```

### Migration `supabase/migrations/0001_zenda.sql`

```sql
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
```

**Employer-blindness proof (D10 task 4 acceptance):** as the `admin@demo.zenda.app` session, `select * from
goals` returns zero rows and `select * from profiles` returns exactly one row (the admin's own). As Vinuy,
`select org_seat_stats('<org id>')` returns zero rows. Both are RLS outcomes, not application checks.

---

## D3 · Auth

**Provider:** Supabase Auth, email + password. **Email confirmation: OFF for the demo** — reason: judges
create accounts live and have no inbox we control; the Supabase dashboard toggle (Authentication → Providers →
Email → *Confirm email*) is flipped off in D9 and noted in the submission as a demo setting.

**Session:** cookies via `@supabase/ssr` (copied `browser.ts` / `server.ts`). A `proxy.ts` at the root
(Next 16's middleware file) refreshes the session on every request and **protects** `/discover`, `/achievable`,
`/prioritise`, `/roadmap`, `/roadmap/*`, `/progress`, `/progress/*`, `/celebrate`, `/admin`: no session →
redirect to `/login?next=<path>`. `/`, `/landing.html`, `/login`, `/signup` are public.

**Redirect after login** (also after signup): if the user has ≥1 goal → `/roadmap`; else → `/discover`.
Honour `?next=` when present and protected.

**Logout:** a "Log out" text link in the small header the app screens share (D4 missing-screen note) → `signOut()` → `/`.

**Mapping onto `zenda-path.html`** (the only auth surfaces the design has):

| Design element | Becomes | Supabase call |
|---|---|---|
| `#ctaStart` "Start your journey 🚀" | `<a href="/signup">` | — |
| `#ctaVinuy` "See Vinuy's journey" | `<a href="/login?demo=vinuy">` | — (login page prefills the D8 credentials when `demo=vinuy`) |

**Missing screens — login and signup are not designed.** Build both from the tokens, single column, 390px max
width centred, the eyebrow + title pattern of the Discover screen:

| Screen | Fields | Call | Success | Errors rendered inline under the form |
|---|---|---|---|---|
| `/signup` | Display name, Email, Password (min 8), Company code (default `DEMO`) | `auth.signUp({ email, password })` then `POST /api/profile { display_name, join_code }` | redirect rule above | "That email already has an account — log in instead." · "Password needs at least 8 characters." · "We don't know that company code." · "Couldn't reach Zenda. Try again." |
| `/login` | Email, Password | `auth.signInWithPassword` | redirect rule above | "Email or password didn't match." · "Couldn't reach Zenda. Try again." |

Both pages: submit button is the 52px indigo pill; a quiet link swaps between them; loading state = button text "One moment…" and disabled.

---

## D4 · Screen ↔ route ↔ data contract map

Every app screen shares a 44px header row: back chevron (where the design has one), the eyebrow, and a "Log out" quiet link at the right. Loading state for every server-rendered page: the page shell with copy replaced by "Loading your path…" in `labelSecondary` — no skeletons are designed. Error state: a `#F2F2F7` card with the message and a "Try again" quiet button.

| # | Screen (design file) | Route | Auth | Reads | Writes | Endpoint | Empty / edge state |
|---|---|---|---|---|---|---|---|
| 0 | Landing (`demo/zenda-path.html`) | `/` → `public/landing.html` | public | — | — | — | — |
| 1 | Discover (`Main`) | `/discover` | user | `profiles` (prefill if exists), `assumptions` | profile numbers, `freedom_text`, goals | `POST /api/discover` | First visit: empty numbers, chips unselected. Returning: prefilled, chips reflect goals. Submitting with no goal selected → inline "Pick at least one place to go." |
| 2 | What's achievable (`Achievable`) | `/achievable` | user | `goals` + `goal_projections` (joined, ordered by `target_date`) | — | — | No goals → redirect `/discover` |
| 3 | Prioritise (`Priorities`) | `/prioritise` | user | `goals`, `goal_projections` | `goals.priority` (ordered ids) | `POST /api/prioritise` | Drag is **not** implemented (static design); up/down chevron buttons per row reorder. No goals → `/discover` |
| 4 | Roadmap (`Roadmap`) | `/roadmap` | user | `goals`, `goal_projections`, `contributions` (current goal), `assumptions`, latest `motivational_events` | — (what-if is client-side, never persisted) | — | No goals → `/discover`. All goals reached → the Celebration of the last one with "Add a new goal" → `/discover` |
| 5 | The trade-off (`Tradeoff`) | `/roadmap/trade-off?goal=<id>` | user | that goal + projection + the home goal's projection | `goals.target_cents`, `goals.target_date` | `POST /api/goals/[id]/adjust` | Opened for a goal that is achievable → redirect `/roadmap` |
| 6 | Progress (`Tracking`) | `/progress` | user | current goal (soonest active), its `contributions`, streak, unseen events | contribution | `POST /api/checkin` | No active goal → `/roadmap`. Already checked in this pay cycle → sheet replaced by "Done for this payday. Next: <date>." |
| 7 | Life changed (`Adapt`) | `/progress/adapt` | user | `profiles`, `goals`, `goal_projections` | profile numbers | `POST /api/adapt` | Before/after is computed **client-side** with the engine before commit; committing calls the endpoint |
| 8 | Goal reached (`Celebration`) | `/celebrate?event=<id>` | user | that `motivational_events` row + its goal + the next goal | marks `seen_at` | `POST /api/events/[id]/seen` | Event not found / not owned → `/roadmap` |
| 9 | Employer view — **MISSING SCREEN, cuttable** | `/admin` | user with `role = admin` | `org_seat_stats(org)` | — | — | Non-admin → `/roadmap`. Below cohort → "Not enough people yet." |

**Missing screens (not designed — build minimal from tokens, listed here so nothing is invented silently):**
`/login`, `/signup` (D3); goal detail entry — the Discover chips carry amounts in the design but no entry
form exists: **Decision** — tapping a chip opens a 3-field inline sheet (title prefilled from kind, target
amount, target date) using the Discover sheet's row style; the app header with "Log out"; the reached-all-goals
state; the "already checked in" state; `/admin`.

**Conflicts flagged, not resolved:**
- *Weekly vs monthly.* Every screen speaks in weeks and paydays; the engine compounds monthly (D6). Display converts monthly ↔ weekly with `× 12 / 52`; the "11 paydays to go" style numbers are `ceil(remaining_cents / weekly_capacity_cents)`. Owner may prefer a weekly-compounding engine later; not for now.
- *Discover chat is static in the design.* The AI reflection (D7 call 1) fills the third bubble asynchronously; until it arrives the bubble shows the template line. The design shows the final state only.
- *Prioritise shows drag handles.* Implemented as chevron buttons (above). Visual handle kept.

---

## D5 · API and middleware layer

**Boundary rule.** `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are read only in server files:
`lib/ai/*`, route handlers under `app/api/**`, `scripts/seed.mjs`. No client component imports `lib/ai` or
`@anthropic-ai/sdk`. `next.config.ts` does not expose them. There is **no client-callable AI endpoint**: AI
runs inside the handlers below, after the response, via `after()` from `next/server`.

All handlers: reject with **401** if no session; parse the body with Zod → **400** `{ error: "validation", issues }`;
operate through the user-scoped client so RLS applies; a goal that RLS hides is a **404** `{ error: "not_found" }`;
unexpected → **500** `{ error: "internal" }`. Responses are JSON. Every response that includes projections also
includes `disclaimer: DISCLAIMER` (D6 constant).

| Method · path | Body (Zod) | Effect | Response |
|---|---|---|---|
| `POST /api/profile` | `{ display_name: string(1–60), join_code: string }` | `org_id_for_join_code` → null → **404** `{ error: "unknown_join_code" }`; upsert `profiles` (role `employee`) | `{ ok: true }` |
| `POST /api/discover` | `{ freedom_text: string ≤ 600, pay_cycle, take_home_cents, essentials_cents, lifestyle_cents, buffer_cents, savings_cents, debt_cents, debt_rate_bps, risk_comfort, goals: Array<{ id?: uuid, kind, title, target_cents, target_date (ISO date, future), starting_balance_cents? }> (1–6) }` | Upsert profile numbers; replace the user's **active** goals with the list (ids kept when given; reached goals untouched); ensure a `buffer` goal exists (`first_milestone_cents`, due `started_on + 1 month`) unless one is reached; **run the engine (D6 waterfall)**; upsert `goal_projections`; write template `why` on each goal; `after()` → AI call 1 (reflection) and call 2 (copy) | `{ ok: true, redirect: "/achievable", disclaimer }` |
| `POST /api/prioritise` | `{ ordered_goal_ids: uuid[] }` | Set `priority = index + 1`; re-run engine; upsert projections | `{ ok: true, redirect: "/roadmap" }` |
| `POST /api/goals/[id]/adjust` | `{ target_cents?: int > 0, target_date?: ISO future }` (at least one) | Update goal; insert event `trade_off` with payload `{ before, after }`; re-run engine | `{ ok: true, redirect: "/roadmap", disclaimer }` |
| `POST /api/checkin` | `{ goal_id: uuid, kind: "full" \| "partial" \| "skip", amount_cents?: int ≥ 0 }` (`partial` requires amount < capacity per cycle; `skip` records 0) | Insert contribution (`checkin_full` / `checkin_partial` / `checkin_full` with 0 for skip); recompute progress (D6 §6); if saved ≥ target → goal `reached`, `reached_at`, insert event `milestone_reached` with template copy, and the next goal's `start_month` recomputed; `after()` → AI call 2 for the event copy | `{ ok: true, reached: boolean, event_id?: uuid, streak: int, redirect: reached ? "/celebrate?event=…" : "/progress" }` |
| `POST /api/adapt` | Same numbers block as `/api/discover` (no goals, no freedom_text) + `{ strategy: "accept" \| "protect_dates" }` | Update profile; re-run engine; insert event `adapted` with `{ before, after }` (capacities and every goal's completion month) | `{ ok: true, redirect: "/roadmap" }` |
| `POST /api/events/[id]/seen` | — | Set `seen_at` | `{ ok: true }` |

**Server-only modules (where logic must live, and why):**
- `lib/engine/*` — pure functions, no I/O, importable by the browser too (what-if, adapt preview). *Why:* determinism and one implementation.
- `lib/data/recompute.ts` — loads profile + goals + assumptions with the user client, calls the engine, upserts projections. *Why:* the single place projections are written; every handler calls it.
- `lib/ai/*` — the wrapper, prompts, banned-terms gate. *Why:* the key.
- `proxy.ts` — session refresh + protected routes. *Why:* Next 16's request boundary.

---

## D6 · The calculation engine (`lib/engine/`)

Pure, deterministic, framework-free. Money in **integer cents** in and out; internal maths in `number`
with rounding only at the boundary (`Math.round`). Monthly compounding: `r = annualRate / 12`.
Month index `m` counts from `profiles.started_on` (month 0). Monthly capacity from a weekly amount:
`monthly = weekly × 52 / 12` (fortnightly `× 26 / 12`).

**Types (`lib/engine/types.ts`):**

```ts
export type Assumptions = {
  cashRateAnnual: number; growthRateAnnual: number; upsideRateAnnual: number;
  glideCashBelowMonths: number; glideGrowthAboveMonths: number;
  firstMilestoneCents: number; emergencyWeeks: number;
};
export type EngineGoal = {
  id: string; kind: string; targetCents: number; startingBalanceCents: number;
  targetMonth: number;          // months from started_on to target_date (ceil)
  priority: number; goalType: "savings_achievable" | "growth_required"; status: "active" | "reached" | "paused";
};
export type CurvePoint = { m: number; balanceCents: number };
export type GoalProjection = {
  goalId: string; rateAnnual: number; capacityMonthlyCents: number;
  startMonth: number; completionMonth: number | null; requiredMonthlyCents: number; achievable: boolean;
  altLaterMonths: number | null; altSmallerTargetCents: number | null; altExtraMonthlyCents: number | null;
  curve: CurvePoint[];
};
export type Progress = {
  savedCents: number; expectedByNowCents: number; onTrack: boolean; pctComplete: number;  // 0–100, integer
  paydaysRemaining: number; streak: number;
};
export const DISCLAIMER =
  "Zenda gives general information, not personal financial advice. Projections are arithmetic on the numbers you entered and the planning rates shown; real outcomes will differ.";
```

**Functions (signature → behaviour):**

1. `capacityMonthlyCents(profile)` → `max(0, takeHome − essentials − lifestyle)`, converted per `pay_cycle` to monthly. The buffer line is **inside** this number, not added to it — it is savings the person already sets aside, and the design's "$260 = $156 unallocated + $100 buffer" is the same figure decomposed. (Vinuy: 1100 − 590 − 250 = 260/wk → **112,667 cents/month**.) *Corrected after task 4: an earlier draft double-counted the buffer; the implemented engine is right.*
2. `glideRate(monthsToHorizon, a)` → `a.cashRateAnnual` when `< glideCashBelowMonths`; `a.growthRateAnnual` when `≥ glideGrowthAboveMonths`; linear blend between. A `growth_required` goal never goes below the blend; a goal with `< glideCashBelowMonths` to go is always cash. *Risk reduces as the deadline approaches.*
3. `requiredMonthlyCents(targetCents, startingBalanceCents, months, rateAnnual)` → PMT: `(FV − PV·g)·r / (g − 1)` with `g = (1+r)^months`; `months ≤ 0` → `FV − PV` (immediate); `r = 0` → `(FV − PV)/months`.
4. `monthsToReach(targetCents, startingBalanceCents, monthlyCents, rateAnnual)` → smallest integer `n` with `FV(n) ≥ target`: `n = ceil( ln((FV + P/r)/(PV + P/r)) / ln(1+r) )`; `null` when `monthlyCents ≤ 0` and `PV < target`.
5. `projectCurve(startingBalanceCents, monthlyCents, rateAnnual, months)` → `CurvePoint[]` for `m = 0..months`, `balance(m) = PV·(1+r)^m + P·((1+r)^m − 1)/r`.
6. `progress(goal, contributions, projection, todayMonthFraction, weeklyCapacityCents)` → `saved = starting + Σ amount`; `expectedByNow = balance on the projection curve at floor(todayMonth − startMonth)` (0 before start); `onTrack = saved ≥ 0.9 × expectedByNow`; `pctComplete = round(100 × saved / target)` capped 100; `paydaysRemaining = ceil((target − saved) / weeklyCapacity)`; `streak` = consecutive most-recent contributions with `amount > 0`, one per pay cycle, counted backwards from the latest.
7. `alternatives(goal, capacityMonthly, rate)` when not achievable → `{ altLaterMonths: monthsToReach(...) − startMonth (relative to target), altSmallerTargetCents: FV at capacity by targetMonth, altExtraMonthlyCents: requiredMonthly − capacity }`. Never throws; never returns "impossible" — the three numbers *are* the answer.
8. `waterfall(goals, capacityMonthlyCents, a)` — the roadmap. Active goals sorted by `targetMonth` ascending (ties: `priority`). `cursor = 0`. For each goal: `rate = glideRate(targetMonth − cursor)`; `n = monthsToReach(target, startingBalance, capacity, rate)`; `startMonth = cursor`; `completionMonth = cursor + n`; `requiredMonthly = requiredMonthlyCents(target, startingBalance, targetMonth − cursor, rate)`; `achievable = completionMonth ≤ targetMonth`; `curve = projectCurve(...)` from start to `min(completionMonth, targetMonth) + 1`; if not achievable → `alternatives`. **Only `savings_achievable` goals advance the cursor**; a `growth_required` goal (the home deposit) receives capacity from the cursor onward until its `targetMonth` and does not block anything after it. Returns one `GoalProjection` per goal. Priority is used for tie-breaks and for the Prioritise screen's copy; date order drives funding — *stated in the design as "different on purpose".*
9. `goalType(goal, capacity, a)` → `growth_required` when `requiredMonthlyCents > capacity` **and** horizon `≥ glideGrowthAboveMonths`; else `savings_achievable`. Applied at `/api/discover` unless the client sent an explicit type.

**Worked example — Vinuy (turn into `lib/engine/engine.test.ts`; expected values are exact to the cent-rounded dollar, tolerance ±1 dollar):**

Inputs: weekly take-home 1,100 · essentials 590 · lifestyle 250 · buffer 100 → capacity **$1,126.67/month**. Rates: cash 5%, growth 9%. `started_on` 2026-09-01.

| Function | Inputs | Expected |
|---|---|---|
| `requiredMonthlyCents` | Peru 4,000 · PV 0 · 4 months · 5% | **$993.77** |
| `monthsToReach` | Peru 4,000 · capacity · 5% | **4** |
| `monthsToReach` | buffer 500 | **1** |
| `monthsToReach` | emergency 2,360 | **3** |
| `requiredMonthlyCents` | car 50,000 · 24 months · 5% | **$1,985.24** → not achievable |
| `projectCurve` last point | car at capacity, 24 months, 5% | **$28,376.14** (= `altSmallerTargetCents`) |
| `monthsToReach` | car 50,000 at capacity, 5% | **41** (`altLaterMonths` = 41 − 24 = 17) |
| `monthsToReach` | car 25,000 at capacity, 5% | **22** |
| `requiredMonthlyCents` | home deposit 240,000 · 84 months · 9% | **$2,061.38** → `growth_required` |
| `projectCurve` last point | deposit at capacity, 84 months, 9% | **$131,174.34** |
| `monthsToReach` | deposit 240,000 at capacity, 9% | **128** (≈ 10.6 years — "2037") |
| `glideRate` | 4 / 24 / 36 / 48 / 60 / 84 months | 0.05 / 0.05 / 0.05 / 0.07 / 0.09 / 0.09 |
| `waterfall` completion months | buffer → Peru → emergency → car 25k → deposit | **1 → 5 → 8 → 30**; deposit curve from month 30 to 84 ends at **$74,666.22** |
| `progress` | Peru: saved 1,040 (4 × 260), target 4,000, weekly 260 | pct **26**, paydaysRemaining **12** (2,960 / 260 = 11.4 → 12), streak **6** with the two buffer contributions before |

*(The screens say "11 paydays to go" — the design rounded down; the engine rounds up. **Conflict**, flagged: use the engine's number.)*

**Unreachable branch — what the app proposes instead of failing.** For any goal with `achievable = false` the
projection carries the three alternatives above, and the Achievable/Trade-off screens render them as options
with dates (car: $25k in month 22 from its start; $50k in month 41; +$858/month to make the original date).
The word "impossible" never appears in copy.

---

## D7 · AI integration

Model `claude-opus-5`, `output_config.effort: "low"`, `max_tokens 600`, structured outputs via
`messages.parse` + `zodOutputFormat`, `cache_control: {type: "ephemeral"}` on the system prompt block, `stop_reason === "refusal"` treated as failure. Every string that reaches a person passes `containsBannedTerms` — a hit means **the template stands** and the AI text is discarded. **Never on the render path:** every call runs in `after()`; screens always render the template first and pick up the upgrade on the next load.

**Call 1 — Discover reflection + goal extraction.** Trigger: `POST /api/discover` (after response).
System prompt (exact):

> You are Zenda, a calm financial-wellbeing guide. You are given what a person said they want their life to look like, and the goals they selected. Write one warm reflection sentence (max 22 words) that names their goals in their own words, without praise words like "amazing". Then return the goals as structured data. Never give financial advice, never name products, banks, funds or tickers, never use the words "should buy" or "should sell". Plain language.

User content: `freedom_text` + the selected goals (kind, title, target, date). Output schema:
`{ reflection: string, goals: Array<{ kind, title: string ≤ 40, target_cents: int, target_date: ISO }> }`. Effect: store
`reflection` in `motivational_events` (`kind: nudge`, `payload.reflection = true`) — the Discover screen's third
bubble shows it on the next visit; extracted titles replace goal titles only where the user left the default.
Fallback: template bubble "A house, a car, and Peru. Got it. Now the numbers — quick, no judgement." built
from goal kinds. Cache: none (once per submit).

**Call 2 — Roadmap copy.** Trigger: after `/api/discover`, `/api/prioritise`, `/api/goals/[id]/adjust`, and a
`milestone_reached` event. System prompt (exact):

> You are Zenda. For each goal you receive computed numbers: target, date, monthly capacity, whether it is achievable, the months it takes, and any alternatives. Write for each goal a "why" of at most 26 words that states the numbers plainly and names the lever if it is not achievable. If a milestone was just reached, also write one celebration line of at most 18 words that says the amount and how much closer the next goal is. Never say "impossible". Never give financial advice, name products, banks, funds or tickers, or say "should buy/sell". No exclamation marks except in the celebration line.

Output schema: `{ whys: Array<{ goal_id: uuid, why: string }>, celebration?: string }`. Effect: update
`goals.why`; update the event `message`. Fallback templates (used first, always): why =
`"$<target> by <Month YYYY>. At $<capacity>/week that lands <on time | in <Month YYYY>>."`; celebration =
`"$<amount> — <title>, done. <Next title> just moved closer."`. Cache: `goals.why` is the cache; re-run only when
the goal's projection row changes (`computed_at` newer than `goals.updated_at`).

**Cost per user session** (Opus 5 at $5/$25 per M tokens): call 1 ≈ 1.2k in + 150 out; call 2 ≈ 1.6k in + 400 out (×2 in a
full demo) → ≈ **$0.05 per session**, ≈ $2.50 for fifty judges.

---

## D8 · Seed data and test credentials

`scripts/seed.mjs` (Node, uses `@supabase/supabase-js` with the **service role** — the only runtime use of that key;
reads `.env.local`). Idempotent: looks up by email/join code and updates rather than duplicating. Steps, in order:

1. Organisation: `{ name: "Demo Co Pty Ltd", join_code: "DEMO", seat_limit: 50 }`.
2. Auth users via `auth.admin.createUser({ email, password, email_confirm: true })`:
   - **`vinuy@demo.zenda.app` / `Zenda-demo-2026!`** — the populated persona (publish this pair)
   - `judge@demo.zenda.app` / `Zenda-demo-2026!` — fresh account, lands on Discover (for showing onboarding)
   - `admin@demo.zenda.app` / `Zenda-demo-2026!` — role `admin`, for the blindness proof and `/admin`
3. Vinuy's profile: weekly; take-home 110,000; essentials 59,000; lifestyle 25,000; buffer 10,000; savings 0; debt 3,000,000 at 280 bps; risk `high`; `freedom_text` = "A house — a real one, around a million. A car I don't have to worry about. And Peru in January."; `started_on` 2026-09-01; `last_seen_at` now.
4. Vinuy's goals (priority · kind · title · target · date · type · status):
   1 · home · "A first home" · 24,000,000 · 2033-09-01 · `growth_required` · active (**Decision:** the goal row holds the *deposit* target; `why` explains the $1M price)
   2 · car · "The car, no loan" · 2,500,000 · 2029-01-14 · savings · active (the trade-off already taken; a `trade_off` event records before 5,000,000 / 2028-09-01)
   3 · travel · "Peru" · 400,000 · 2027-01-10 · savings · active
   4 · emergency · "Emergency fund" · 236,000 · 2027-03-07 · savings · active
   5 · buffer · "Breathing room" · 50,000 · 2026-10-01 · savings · **reached** 2026-09-14
5. Contributions (all `seed`, 26,000 each): buffer 2026-09-07, 2026-09-14; Peru 2026-09-21, 09-28, 10-05, 10-12.
6. Run the engine (import `lib/engine` — the script is ESM; build once or use `tsx`) and upsert `goal_projections` for all five.
7. Events: `milestone_reached` (buffer, "$500 of breathing room — done. Peru just moved closer.", seen); `streak` ("Six paydays in a row.", unseen); `trade_off` (car, payload before/after).
8. Lessons (5 rows, `body_md` ≤ 120 words each, content lifted from VINUY_JOURNEY.md §5): `debt-vs-savings`, `match-money-to-horizon`, `twelve-percent-is-upside`, `buffer-double-duty`, `super-already-running`.

**Publish in the submission:** `vinuy@demo.zenda.app` · `Zenda-demo-2026!` (and the judge account for a fresh run).

---

## D9 · Deployment runbook

1. **Repo.** In `zenda_app`: `git init`, copy the sibling `.gitignore`, confirm `.env.local` is ignored (`git check-ignore .env.local` prints the path), first commit, push to a new GitHub repo `zenda`.
2. **Env vars — the canonical list** (`.env.example` carries these names with empty values):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (seed only; **do not set on Vercel**), `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL`. The §3 names `SUPABASE_URL` / `SUPABASE_ANON_KEY` are *not* used — the Next convention (already in `.env.local`) is. `DEMO_MODE`, PostHog and Sentry keys: unused, may stay.
3. **Supabase (dashboard, SQL editor).** Run `0000_teardown.sql`, then `0001_zenda.sql`. Authentication → Providers → Email → *Confirm email* **off**. Authentication → URL configuration → Site URL = the Vercel URL; Redirect URLs += `http://localhost:3000/**` and `https://<vercel-url>/**`.
4. **Seed.** Locally: `node scripts/seed.mjs` (reads `.env.local`). Re-runnable.
5. **Vercel.** Import the repo; framework Next.js; root `.`; add the four runtime env vars (not the service key); deploy from `main`. Build settings default.
6. **Custom domain.** Optional; skip for the hackathon. `NEXT_PUBLIC_APP_URL` = the Vercel URL.
7. **Smoke test against the live URL** (all must pass before the submission is written):
   - `/` renders the landing; both CTAs navigate.
   - `/login?demo=vinuy` → credentials prefilled → Log in → lands on `/roadmap` showing **$260 / week**, Peru **26%**, **12 paydays**.
   - `/achievable` shows three verdicts with **$481** and **$474** per week.
   - `/progress` → **Yes** → `/progress` again shows streak **7**.
   - `/progress/adapt` → rent +$40 → before/after shows engine **$220**; Accept → roadmap dates move.
   - `judge@…` login → lands on `/discover` → submit numbers + one goal → `/achievable` in under 3 s (AI not awaited).
   - `admin@…` login → `/admin` shows seats/members; as admin, the network tab's `goals` query returns `[]`.
   - Kill the Anthropic key on Vercel → every page still renders (templates).

---

## D10 · Build order for Sonnet

Each task is one session or less. **★ = demo-critical**, ○ = cuttable. Every task ends with `npm run build` passing.

| # | Goal | Files | Acceptance |
|---|---|---|---|
| 1 ★ | Scaffold the app at the root with the D1 manifest, tokens, landing rewrite | `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore`, `app/layout.tsx`, `app/tokens.css`, `public/landing.html` (moved, buttons→links) | `npm run dev` serves the landing at `/`; both CTAs link |
| 2 ★ | Migrations written and applied | `supabase/migrations/0000_teardown.sql`, `0001_zenda.sql` (verbatim from D2) | Both run clean in the SQL editor; `select count(*) from assumptions` = 8 |
| 3 ★ | Supabase clients + auth pages + proxy | `lib/supabase/browser.ts`, `server.ts`, `proxy.ts`, `app/login/page.tsx`, `app/signup/page.tsx`, `app/api/profile/route.ts` | Signup with code `DEMO` creates a profile; login redirects per D3; protected routes bounce to `/login` |
| 4 ★ | Engine + tests | `lib/engine/{types,rates,solver,waterfall,progress}.ts`, `lib/engine/engine.test.ts` | `npm test` green on every row of the D6 table |
| 5 ★ | Recompute service + Discover | `lib/data/recompute.ts`, `app/discover/page.tsx` (+ goal-detail sheet), `app/api/discover/route.ts` | Submitting Vinuy's numbers produces 5 projection rows matching D6 |
| 6 ★ | Seed script | `scripts/seed.mjs`, `supabase/seed-lessons.sql` | D8 accounts exist; Vinuy login shows populated data |
| 7 ★ | Roadmap + what-if | `app/roadmap/page.tsx`, client `WhatIf` component importing `lib/engine` | Slider at $300 shows "Peru in December, the car in August 2028" recomputed live |
| 8 ★ | Progress + check-in + Celebration | `app/progress/page.tsx`, `app/api/checkin/route.ts`, `app/celebrate/page.tsx`, `app/api/events/[id]/seen/route.ts` | Yes → streak 7; a check-in that completes a goal redirects to `/celebrate` |
| 9 ★ | Achievable + Prioritise | `app/achievable/page.tsx`, `app/prioritise/page.tsx`, `app/api/prioritise/route.ts` | Reorder persists; verdict tags match `achievable` |
| 10 ★ | Trade-off + Adapt | `app/roadmap/trade-off/page.tsx`, `app/api/goals/[id]/adjust/route.ts`, `app/progress/adapt/page.tsx`, `app/api/adapt/route.ts` | Choosing $25k updates the goal and re-runs the engine; adapt shows the D4 before/after |
| 11 ○ | AI calls | `lib/ai/client.ts` (copied), `lib/ai/banned-terms.ts` (copied), `lib/ai/prompts.ts`, `lib/ai/run.ts`, `after()` wiring in discover/checkin/adjust handlers | With the key present, `goals.why` upgrades within ~10 s; with the key absent, nothing breaks |
| 12 ★ | Deploy + smoke test | Vercel project, env vars, D9 checklist | Every D9 smoke line passes on the public URL |
| 13 ○ | `/admin` | `app/admin/page.tsx` | Admin sees counts; Vinuy is redirected |
| 14 ○ | Installable on a phone | `public/manifest.json`, icons, `<meta name="theme-color">`, viewport meta | Add-to-home-screen opens standalone |

Order is the dependency order. Tasks 7–10 can be split across sessions without conflict.

---

## D11 · Judge demo script — 90 seconds

| t | Click | Say | On screen |
|---|---|---|---|
| 0:00 | Open `/` | "Zenda is the path from your paycheck to your goal. Vinuy, 23, wants a house, a car, and Peru." | Landing, the path scene |
| 0:10 | "See Vinuy's journey" → Log in | "He told us where he is and where he wants to go. One number came out." | Roadmap · **$260 / week** |
| 0:20 | Scroll the roadmap | "Peru is on track for January. The car needed a trade-off — February 2029, no loan. The house is adjusted, honestly." | Peru **26%** · **12 paydays** · tags |
| 0:35 | Drag what-if to $350 | "Every date moves live. This is arithmetic, not a model guessing." | "Peru in December, the car in June 2028" |
| 0:45 | `/achievable` | "This is the moment competitors skip: what $260 can actually reach." | **$481** vs $260 · **$474** · 2037 |
| 0:55 | `/progress` → **Yes** | "One question per payday. Partly counts." | Streak **7** |
| 1:05 | `/progress/adapt` → rent +$40 → Accept | "Life changes; the roadmap redraws. Nothing saved moves — only the dates." | Engine **$220** · Peru Feb |
| 1:15 | Log out → `admin@…` → `/admin` | "The employer sees this — seats and headcount. Never a goal, never a number. That's enforced in the database, not the UI." | Counts only |
| 1:25 | Back to landing | "We are your path to financial freedom." | — |

---

## D12 · Risks and cut list

**Most likely to break on demo day, in order:**
1. **Auth redirect loops** (cookie refresh in `proxy.ts`). Mitigation: copy the sibling's pattern exactly; test logged-out → `/roadmap` → `/login` → `/roadmap` on the live URL, not localhost.
2. **Email confirmation left on** → signup "succeeds" with no session. Mitigation: D9 step 3, verified with the judge account.
3. **Timezone / month-index drift** making "12 paydays" show as 11 or 13. Mitigation: compute month indices from `started_on` in UTC dates only; tests pin the vector.
4. **AI latency perceived as slowness.** Mitigation: `after()` + templates — the demo never waits for it; say so.
5. **Vercel missing an env var** → blank pages. Mitigation: smoke test line 1 runs before the demo slot.
6. **Seed script rerun creating duplicate goals.** Mitigation: idempotency keyed on `(user_id, kind, title)`.

**Cut list — dropped in this order if time runs out:**
1. `/admin` (task 13) — say the blindness line over the RLS file instead.
2. Installable PWA (task 14).
3. AI calls (task 11) — the templates are the product; the AI is polish.
4. `/progress/adapt` — keep the "Life changed?" row as a dead link; explain verbally.
5. `/prioritise` — seed the priority order; skip the screen.
6. The goal-detail sheet — Discover chips carry seeded amounts/dates for the demo persona only.

**Never cut:** the engine tests (task 4), RLS (task 2), the roadmap (task 7), the check-in (task 8), the deploy (task 12).
