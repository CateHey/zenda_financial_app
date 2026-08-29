# ZENDA_TEST_SPEC.md — the test plan (Fable) for Sonnet to generate

> Goal: every functionality is proven by a test that runs green before the demo. Five layers, from
> pure maths to the public URL. Same rules as the build spec: no application code here; every case
> states its input, action and expected assertion so Sonnet has zero decisions.
>
> **Expected values are engine-derived, never copied from mockup text.** Where a design mock and the engine disagree, the engine wins and the mock copy is illustrative (the $300 what-if line, "11 paydays", the node months).
>
> **Standing rule for all layers:** tests never mutate `vinuy@demo.zenda.app` — the demo account stays
> pristine. Mutating tests use `e2e@demo.zenda.app` (a Vinuy clone) which is reset before every run.
> **All UI/API runs execute with `ANTHROPIC_API_KEY` unset** — the templates path is the product; AI
> is verified once, separately, in T-AI.

## Test data (additions to `scripts/seed.ts` — D8)

- Fourth account **`e2e@demo.zenda.app` / `Zenda-demo-2026!`**, profile/goals/contributions/projections/events
  identical to Vinuy's, `display_name` "E2E".
- **`scripts/reset-e2e.ts`** (service role, reads `.env.local` like the seed): deletes the e2e user's goals
  (cascades to contributions/projections), events, and profile, then re-creates them identical to Vinuy's
  seed state. Also deletes any auth user whose email matches `e2e-fresh-*@demo.zenda.app` (signup-test
  leftovers). Prints one line: `e2e reset: <n goals>, <n contributions>`. Run by Playwright's `globalSetup`
  and available as `npm run reset:e2e`.
- Env for tests: `.env.local` is read by the runners only for `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (layer 2) and `SUPABASE_SERVICE_ROLE_KEY` (reset script only). Never
  printed. When they are absent, layer 2 and 4 suites **skip with a visible reason**, never fail.

## Commands (`package.json` scripts)

| Script | Runs |
|---|---|
| `test` | `vitest run --project unit` — layer 1 (no network) |
| `test:db` | `vitest run --project db` — layer 2 (real Supabase, anon key + test accounts) |
| `test:e2e` | `playwright test` — layers 3–4 against `next dev` (Playwright starts it with the AI key blanked) |
| `test:smoke` | `E2E_BASE_URL=<url> playwright test --grep @smoke` — layer 5 against the public URL |
| `test:all` | `test` → `test:db` → `test:e2e`, stop on first failure |
| `reset:e2e` | the reset script |

`vitest.config.ts` gains two projects: `unit` (include `lib/**/*.test.ts`, environment node) and `db`
(include `tests/db/**/*.test.ts`, `testTimeout 20000`, `setupFiles tests/db/env.ts` which loads `.env.local`).
`playwright.config.ts`: `webServer` = `npm run dev` with `env: { ANTHROPIC_API_KEY: "" }`, port 3000,
`reuseExistingServer` false; `globalSetup` = reset; two projects: `mobile` (viewport 390×844) and
`desktop` (1280×800); `baseURL` = `E2E_BASE_URL ?? http://localhost:3000`; retries 1; trace on first retry.
Add devDependency `@playwright/test ^1.50` and run `npx playwright install chromium` once.

---

## Layer 0 — static gates (run first, always)

`npm run build` passes · `npx tsc --noEmit` passes · `npm test` passes. Any red here stops the pipeline.

## Layer 1 — unit (Vitest, `lib/**`)

**`lib/engine/engine.test.ts`** — exists (22 cases, D6 vector). Keep.

**`lib/engine/calendar.test.ts`** (A2):
| Case | Input | Expect |
|---|---|---|
| whole months | started 2026-09-01, date 2027-01-10 | `monthIndex` = 5 |
| same day of month | 2026-09-01 → 2026-12-01 | 3 |
| target in the past | 2026-09-01 → 2026-08-15 | 0 (floored) |
| fractional today | 2026-09-01, today 2026-10-13 | `todayMonth` ≈ 1.4 (±0.05) |
| month → date | started 2026-09-01, m=5 | "2027-02-01" ; m=0 → "2026-09-01" |
| clamping | started 2026-01-31, m=1 | "2026-02-28" |
| paydays | remaining 296,000 cents, weekly 26,000 | 12 |

**`lib/engine/streak.test.ts`** (A3):
| Case | Contributions (occurred_on, cents) | Expect |
|---|---|---|
| six in a row weekly | 6 rows, 7 days apart, all 26,000 | 6 |
| gap breaks | rows at −0, −7, −21 days | 2 |
| skip breaks | latest row 0 cents | 0 |
| partial counts | latest 12,000 | counts |
| already checked in | latest today, weekly | `checkedInThisCycle` true; latest 7 days ago → false; 6 days ago → true |
| fortnightly gap tolerance | 15 days apart, fortnightly | counts |

**`lib/data/templates.test.ts`** (D7 fallbacks): for each goal state (achievable / not achievable / growth_required / reached), the template `why` matches the documented pattern via regex, contains the formatted target and month, and `findBannedTerms(why)` is empty. Celebration template contains the amount and the next goal's title.

**`lib/ai/banned-terms.test.ts`**: hits on "you should buy shares", "$VOO", "commbank", "bitcoin", "guaranteed returns"; no hit on "growth assets", "a savings account paying 5%", "the deposit lands around 2037".

**`lib/api/schemas.test.ts`** (the Zod bodies from D5, exported from one module `lib/api/schemas.ts`): one valid sample parses and one invalid sample fails **per route** (`profile`, `discover`, `prioritise`, `adjust`, `checkin`, `adapt`), covering: negative cents rejected, past `target_date` rejected, `goals` length 0 and 7 rejected, `checkin.partial` without amount rejected, `adjust` with neither field rejected.

**`lib/format/money.test.ts`**: `formatCents(2600000,"AUD")` → "$26,000"; compact → "$26k"; `$1M` for 100,000,000; weekly↔monthly conversions round-trip within 1 cent.

## Layer 2 — database + RLS (Vitest `db` project, real Supabase, `tests/db/`)

Setup: `tests/db/clients.ts` builds anon-key clients and signs in as each test account with
`auth.signInWithPassword`; an `anon()` client with no session. Test accounts: `e2e@`, `admin@`, `judge@`
(read-only usage). No service role here.

**`rls.test.ts`** — the employer-blindness proof, each a separate case:
| As | Query | Expect |
|---|---|---|
| admin | `from('goals').select('*')` | `data` = `[]`, no error |
| admin | `from('profiles').select('user_id')` | exactly 1 row = admin's own |
| admin | `from('contributions')`, `goal_projections`, `motivational_events` | `[]` each |
| e2e | `rpc('org_seat_stats', { org })` | `data` = `[]` |
| admin | `rpc('org_seat_stats', { org })` | 1 row; `members ≥ 4`; `active_14d` is a number (cohort ≥ 5 after seed + accounts) or `null` if below |
| e2e | `from('goals').select('*')` | ≥ 5 rows, all `user_id` = e2e |
| e2e | `from('goals').select('*').eq('user_id', <judge id>)` | `[]` |
| e2e | insert into `goals` with `user_id` = judge id | error (RLS) |
| e2e | update judge's profile row | affects 0 rows |
| anon | `from('assumptions').select('*')` | `[]` or error (not authenticated) |
| e2e | `from('assumptions')` | 8 rows; `from('lessons')` | 5 rows |
| e2e | `from('organisations').select('name')` | 1 row "Demo Co Pty Ltd" |
| judge | `rpc('org_id_for_join_code', { code: 'demo' })` | the org uuid (case-insensitive); `'NOPE'` → `null` |

**`seed.test.ts`**: as e2e, goals count = 5, contributions = 6, projections = 5, events ≥ 2, buffer goal
`status = reached`; the Peru projection `completion_month` = **4** (= January 2027: the $1,040 already saved counts per A4 and the buffer is reached at month 1 — the no-contribution vector's 5 does not apply to seeded state) and `achievable` = true; the car projection
`achievable` = true (already the $25k version); the home projection `goal_type = growth_required`.

**`reset.test.ts`**: run the reset script via `execSync`; counts above hold again; a contribution inserted
before the reset is gone after it.

## Layer 3 — API through the browser session (inside Playwright, `e2e/api.spec.ts`)

After UI login as `e2e@`, use `page.request` (carries the session cookies):
| Call | Expect |
|---|---|
| `POST /api/checkin` with `{}` | 400, body `error: "validation"` |
| `POST /api/checkin` with judge's goal id (from `tests/fixtures/ids.json` written by reset) | 404 |
| `POST /api/goals/<own car id>/adjust` `{ target_cents: 2500000 }` | 200, `redirect: "/roadmap"` |
| `POST /api/adapt` with `strategy: "accept"` and current numbers | 200 |
| logged out: `POST /api/checkin` valid body | 401 |
| every 200 response with projections | includes `disclaimer` string |

## Layer 4 — end-to-end UI (Playwright, `e2e/*.spec.ts`, both viewports)

Selectors: prefer role/text (`getByRole('button', { name: 'Yes' })`, `getByText('$260')`); add
`data-testid` only where text is dynamic (`engine-value`, `whatif-sentence`, `streak-title`, `pct`).

**`auth.spec.ts`** (`@smoke` where marked)
1. `@smoke` `/` renders; "Start your journey" → `/signup`; "See Vinuy's journey" → `/login` with email prefilled `vinuy@demo.zenda.app`.
2. `@smoke` login `e2e@` → lands `/roadmap`.
3. wrong password → text "Email or password didn't match."
4. signup `e2e-fresh-<Date.now()>@demo.zenda.app`, code `DEMO` → lands `/discover`; wrong code `NOPE` → "We don't know that company code."; existing email → "already has an account".
5. logged out → `/roadmap` → redirected to `/login?next=%2Froadmap`; after login lands on `/roadmap`.
6. "Log out" → `/`; `/roadmap` bounces again.

**`discover.spec.ts`** — as the fresh account from (4):
1. Type freedom text; enter 1100 / 400,120,70 / 250 / 100 / 0 / 30000 @ 2.8 → engine box reads **$260 / week** live (testid `engine-value`).
2. Select the Travel chip (defaults) → submit → `/achievable` shows cards for Travel, Breathing room, Emergency fund; Travel tag "On track".
3. Submitting with no chip → "Pick at least one place to go."; no navigation.

**`roadmap.spec.ts`** — as `e2e@` (`@smoke`)
1. Header chips: "Priority Home › Car › Travel" (kind labels, per the bindings doc), "This week $260 → Peru".
2. Current card: "26%" bar width (style attribute contains `26%`), text "$1,040 saved", "12 paydays".
3. Tags visible: "On track" ×3 (Peru, the emergency fund, the $25k car), "Adjusted" ×1 (home). Node months, engine-derived from seeded state with `DEMO_TODAY=2026-10-20`: Peru **January 2027**, emergency fund **April 2027**, car **February 2029**. *The "Trade-off" tag is tested on the fresh account's $50k/2-year car in `achievable-prioritise.spec.ts`.*
4. What-if slider → set to **350** → sentence (testid `whatif-sentence`) contains "December" and "June 2028" (engine-derived: at $350/wk Peru completes month 3, the car month 21). At 300 the sentence still says "January" — monthly granularity, by design; do not assert the mockup's "$300 → December". Reload → sentence back to $260 (never persisted).
5. Disclaimer text present at the bottom.

**`achievable-prioritise.spec.ts`** — as fresh account with Home/Car/Travel at defaults (drive Discover first)
1. `/achievable`: Travel "On track"; Car $50k/2y "Needs a trade-off" with "needs $481 / wk"; Home "Adjusted" with "$474".
2. `/prioritise`: move Car above Home via the chevron → "Build my roadmap" → reload `/prioritise` → order persists; `/roadmap` title now begins with the car title.

**`tradeoff.spec.ts`** — same fresh account
1. `/roadmap/trade-off?goal=<car id>` (navigate by clicking the car node's Trade-off tag): options show "$28,000 · September 2028"-style A (rounded), "$50,000 · <alt later month>" B, C "Out of reach".
2. "Choose $28k…" → `/roadmap` → car node now "On track" and amount updated.
3. Opening trade-off for an achievable goal → redirected to `/roadmap`.

**`progress.spec.ts`** — as `e2e@` (reset guarantees streak 6, no check-in today)
1. `@smoke` `/progress`: nudge "$260 is ready for Peru. 12 paydays to go."; title "Six paydays in a row."; "26%".
2. "Yes" → back on `/progress`: title "Seven paydays in a row."; sheet replaced by "Done for this payday."
3. (reset) "Partly" → amount 100 → save → streak 7; saved shows "$1,140".
4. (reset) "Not this time" → streak title "Your first payday." (streak 0) and the done state.

**`celebrate.spec.ts`** — as fresh account: Discover with Travel target **$300** (edit via chip sheet) → the buffer goal is first in date order; check in "Yes" ×2 → the second completes the $500 buffer → lands `/celebrate?event=…`: "$500", "Breathing room, done.", pill "Your $260 a week now flows to Peru"…(next title) ; "Keep it there" → `/roadmap`, Today node reads "Today · Breathing room $500 done".

**`adapt.spec.ts`** — as `e2e@`
1. `/progress/adapt`: change Rent 400 → 440 → title "Rent went up $40."; sub "engine is now $220"; table row Peru "Jan 2027 → Feb 2027"; "Deposit by 2033" before "$75k".
2. "Accept the new path" → `/roadmap` → "This week $220 → Peru"; an `adapted` event exists (check via `/progress` nudge or layer 2 count).
3. (reset) "Trim fun, keep the dates" → `/roadmap` still "$260 → Peru" and Fun now 210 on `/progress/adapt`.

**`admin.spec.ts`**
1. login `admin@` → `/admin` shows "Seats", "Members" numbers; `goals` never appear (page has no "$" amounts).
2. login `e2e@` → `/admin` → redirected `/roadmap`.

**`resilience.spec.ts`** (`@smoke`): with the AI key blank (default), every route in the D4 table renders its heading for `e2e@`; no console errors of type `error` during the run (attach a `page.on('console')` listener).

**`responsive.spec.ts`**: the `desktop` project runs `roadmap.spec` and `progress.spec` unchanged (the phone-width column is centred; no horizontal scrollbar: `document.documentElement.scrollWidth <= window.innerWidth`).

## T-AI — the one AI verification (manual-trigger, `e2e/ai.spec.ts`, skipped unless `RUN_AI=1`)
With the real key: as a fresh account, complete Discover; poll `goals.why` (via layer-2 client) for up to 20 s
→ at least one `why` differs from the template pattern **and** `findBannedTerms(why)` is empty. Asserts
the upgrade path and the gate, once, costing about $0.05.

## Layer 5 — production smoke (`npm run test:smoke` against the Vercel URL)
Runs only the `@smoke` tagged tests (landing, login, roadmap numbers, progress read, resilience) against
`E2E_BASE_URL` using `e2e@`. No reset in production; the smoke tests are read-only except the "Yes"
check-in, which is excluded from `@smoke`.

---

## Generation order for Sonnet (added to D10; each is one session)

| # | After | Goal | Files |
|---|---|---|---|
| T1 | task 7 | Layer 1 files + `lib/api/schemas.ts` extraction + `lib/format/money.ts` if not present + seed e2e account + reset script + vitest projects + Playwright scaffold + `auth`, `discover`, `roadmap` specs | `lib/**/*.test.ts`, `tests/db/**`, `scripts/reset-e2e.ts`, `playwright.config.ts`, `e2e/{auth,discover,roadmap}.spec.ts` |
| T2 | task 10 | First: verify A12 — `lib/engine/today.ts` exists and `todayIso()` is used at every clock site (`lib/data/recompute.ts`, `app/api/discover/route.ts`, `app/discover/page.tsx`, `app/roadmap/page.tsx`, progress/check-in); implement it if missing. Then: `data-testid` hooks `engine-value` (/discover) and `pct` (/roadmap progress bar); `.gitignore` += `test-results/`, `playwright-report/`; `lib/api/schemas.test.ts`; remaining e2e specs + layer 3; re-run T1's suites and fix the four expectation corrections above | `e2e/{achievable-prioritise,tradeoff,progress,celebrate,adapt,admin,resilience,responsive,api}.spec.ts`, `lib/api/schemas.test.ts`, hook-only edits in app/** |
| T3 | task 12 | `test:smoke` run against the public URL; T-AI run once | report only |

**Definition of done for testing:** `npm run test:all` green locally with the AI key blank; `npm run test:smoke`
green against the public URL; T-AI passed once. Any test that cannot be made to pass is reported with the
failing assertion — never skipped, never loosened to pass.
