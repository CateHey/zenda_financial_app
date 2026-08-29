# ZENDA_SPEC_ADDENDUM.md — precision items found in validation

> Read after `ZENDA_BUILD_SPEC.md`. Each item here **overrides** the main spec where they differ.
> Same rules: no application code in this document; exact behaviour in prose, types and configs.

## A1 · Session proxy — specified from scratch (D3 correction)

The sibling repo has no middleware; do not look for one. File: **`proxy.ts` at the project root**, and the exported function
**must be named `proxy`** (Next 16.3 rejects `middleware` as the export name in this file — confirmed in
task 3). Behaviour, exactly:

1. Create a `NextResponse.next({ request })`.
2. Create a Supabase server client with the anon key and a cookies adapter whose `getAll` reads
   `request.cookies.getAll()` and whose `setAll` writes each cookie to **both** `request.cookies` and
   `response.cookies` (this is what refreshes an expiring session).
3. Call `auth.getUser()` (never `getSession()` — it does not validate the JWT).
4. If the path matches a protected prefix — `/discover`, `/achievable`, `/prioritise`, `/roadmap`,
   `/progress`, `/celebrate`, `/admin` — and there is no user: redirect to `/login?next=<pathname>`,
   copying the refreshed cookies onto the redirect response.
5. If the path is `/login` or `/signup` and there **is** a user: redirect to `/roadmap` (the page then
   applies the has-goals rule and may forward to `/discover`).
6. Otherwise return the response.
7. `config.matcher`: everything except `_next/static`, `_next/image`, `favicon.ico`, `landing.html`, and files
   with an image extension.

## A2 · Calendar arithmetic (D6 addition)

All dates are `YYYY-MM-DD` strings interpreted as UTC calendar dates; never construct a `Date` from a local
timezone.

- `monthIndex(startedOn, date)` = `(Y₂ − Y₁) × 12 + (M₂ − M₁) + (D₂ > D₁ ? 1 : 0)`. A goal's `targetMonth`
  uses this; it is never below 1 for a future date.
- `todayMonth(startedOn, today)` = same formula but **fractional**: integer part as above minus the `D₂ > D₁`
  term, plus `(D₂ − D₁) / 30`, floored at 0.
- Month `m` on a curve corresponds to the calendar date `startedOn + m months` (same day-of-month, clamped to
  month end). Screens format that as "Jan 2027" / "January 2027".
- "N paydays" = `ceil(remainingCents / perCycleCapacityCents)` where per-cycle capacity is the profile's
  pay-cycle amount (Vinuy: 26,000 cents weekly).

## A3 · Streak and pay-cycle rules (D6 §6 precision)

- Cycle length in days: weekly 7, fortnightly 14, monthly 30.
- **Streak** = walk contributions ordered by `occurred_on` desc; count while `amount_cents > 0` **and** the gap to
  the previous counted row is `≤ cycle + 1` days; stop at the first `amount_cents = 0` row or gap. Zero rows → 0.
- **Already checked in this cycle** = a contribution exists with `occurred_on ≥ today − (cycle − 1)` days.
  The Progress screen then shows the "Done for this payday. Next: <today's occurred_on + cycle>" state
  instead of the sheet.
- A `skip` check-in inserts `amount_cents = 0`, `kind = checkin_full`; it **breaks** the streak and counts as
  checked-in for the cycle (one nudge maximum — the design rule).

## A4 · Waterfall with reached goals (D6 §8 precision)

Iterate **all** non-paused goals sorted by `target_date`, including `reached` ones:

- `reached` goal → its projection is frozen (keep the stored row; do not recompute); the cursor becomes
  `max(cursor, monthIndex(startedOn, reached_at))`.
- `active` goal → as D6 §8, with `startMonth = max(cursor, floor(todayMonth))` so a goal never "starts" in the
  past, and `startingBalanceCents` = the goal's stored starting balance **plus** the sum of its contributions
  to date (money already in counts).
- The D6 test vector runs with all goals active and no contributions, so its numbers are unchanged.

## A5 · Auto-created foundation goals (D5 `/api/discover` precision)

On every `/api/discover` submit, ensure two goals exist for the user unless a goal of that kind is already
`reached`:

| kind | title | target | target_date | goal_type |
|---|---|---|---|---|
| `buffer` | "Breathing room" | `first_milestone_cents` (50,000) | `started_on + 1 month` | savings |
| `emergency` | "Emergency fund" | `essentials per cycle × emergency_weeks` converted to weeks (weekly: `essentials_cents × 4`) | `started_on + 6 months` | savings |

They are not chips on the Discover screen; they appear on Achievable/Roadmap like any goal. If the user's
chosen goals leave capacity for neither, the waterfall still orders by date — the buffer lands first by
construction.

## A6 · Goal detail sheet (D4 missing screen — exact fields)

Tapping a goal chip on `/discover` toggles it; a selected chip shows its amount. Editing opens a bottom
sheet in the Discover sheet's row style with three rows: **Title** (text, prefilled per kind: Travel →
"A trip", Car → "A car", Home → "A first home", Study → "Study", Business → "A business"), **Target**
(currency, integer dollars → cents), **By** (month picker, `YYYY-MM`, stored as the first of that month).
"Done" closes it. Defaults when the judge account picks a chip and edits nothing: Travel 4,000 / +4 months;
Car 25,000 / +2 years; Home 240,000 / +7 years; Study 12,000 / +2 years; Business 30,000 / +3 years.

## A7 · Seed runner (D8 precision)

`scripts/seed.ts` (TypeScript so it imports `lib/engine` directly). Run with **`npx tsx scripts/seed.ts`**.
The script parses `.env.local` itself (read the file, split lines, `KEY=VALUE`, ignore `#` and blanks, do not
override already-set env). Add `tsx` to devDependencies. Lessons are inserted by the same script (not a
separate SQL file — one runner). Idempotency keys: organisations by `join_code`; users by email (look up via
`auth.admin.listUsers`, create if absent); profiles by `user_id`; goals by `(user_id, kind, title)`;
contributions by `(goal_id, occurred_on)`; events by `(user_id, kind, goal_id)`; lessons by `slug`.

## A8 · Row types and data access (D5 precision)

- `lib/data/types.ts`: hand-written TypeScript types mirroring every D2 table, one per table, cents as
  `number`, dates as `string`. No Supabase codegen.
- `lib/data/queries.ts`: one function per read the D4 table names (`getProfile`, `getGoalsWithProjections`,
  `getCurrentGoal`, `getContributions(goalId)`, `getUnseenEvents`, `getAssumptions`), all taking the
  user-scoped server client. Pages call these; they never write SQL inline.
- `lib/data/recompute.ts` is the only writer of `goal_projections`.
- Dollar formatting everywhere: `Intl.NumberFormat("en-AU", { style: "currency", currency: profile.currency, maximumFractionDigits: 0 })`.

## A9 · `app/tokens.css` — the variable names

From `ZENDA_DESIGN.md` §1, light values only (single-theme, as the screens are):
`--surface #FFFFFF`, `--surface-sunken #F2F2F7`, `--label #000000`, `--label-2 rgba(60,60,67,0.78)`,
`--label-3 #8E8E93`, `--separator rgba(60,60,67,0.18)`, `--accent #5856D6`, `--blue #007AFF`,
`--indigo #5856D6`, `--violet #8450DA`, `--purple #AF52DE`, `--navy #10265F`, `--danger #FF3B30`,
`--font` (the system stack), `--radius-sm 10px`, `--radius-md 14px`, `--radius-lg 20px`,
`--shadow-card 0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)`,
`--shadow-sheet 0 -8px 40px rgba(0,0,0,0.12)`. `body` sets background, colour, font, `font-variant-numeric:
tabular-nums`, margin 0. Ported screens keep their literal inline hex (they match these values); the new
login/signup/header use the variables.

## A10 · Package manifest correction (D1)

Add devDependency `tsx ^4`. Scripts: `"seed": "tsx scripts/seed.ts"`.

## A11 · Actions only the owner can perform (Sonnet stops and reports at these points)

1. Running the two migration files in the Supabase SQL editor (Sonnet writes them; cannot execute DDL with
   the keys available).
2. Turning off *Confirm email* and setting the auth URLs in the Supabase dashboard.
3. Creating the Vercel project and entering env vars.

Everything else — including running the seed script locally, which needs only `.env.local` — Sonnet does.

## A12 · The demo clock — `DEMO_TODAY` (found in task 6)

The persona timeline starts 2026-09-01 and the seeded contributions run to 2026-10-12, but the real
clock at build time is earlier than that, which makes every "today" computation wrong (contributions
in the future, "already checked in" forever true, `todayMonth` = 0).

**Rule:** every place the app needs today's date calls one helper, `todayIso()` in `lib/engine/today.ts`:
it returns `process.env.DEMO_TODAY` when that variable is set and a valid `YYYY-MM-DD`, otherwise the real
UTC date. No other code reads the clock. `Date.now()`/`new Date()` for *dates* is forbidden outside that
file (timestamps like `created_at` stay database defaults).

- `.env.local`, Vercel, `vitest.config.ts` (`db` project) and `playwright.config.ts` (webServer env) all set
  **`DEMO_TODAY=2026-10-20`**. With the seed as written: latest contribution 2026-10-12 is 8 days back →
  not checked in this cycle; streak still 6 (counted from the latest contribution); `todayMonth` ≈ 1.63;
  Peru 26% / 12 paydays unchanged. Every month name in the demo script and the test spec stays as written.
- A fresh judge account gets `started_on = todayIso()` = 2026-10-20; its goal defaults are relative to that.
- Remove the variable after the hackathon and the app runs on the real clock with no code change.
- `D9` env list gains `DEMO_TODAY` (optional; set for the demo). Seed contributions and dates stay absolute.

## A13 · Web layout — the screens on a desktop browser (found in owner testing)

The pages were built as fixed 390×844 phone frames centred on the page. The web is the priority
platform, so every app screen gets a **responsive shell**: unchanged phone layout below 900px; a
real web layout at ≥ 900px. Components, copy, tokens and bindings do not change — only placement.

**Shell (`app/components/app-shell.tsx` + `app/web.css`, imported once in `app/layout.tsx`):**
- Page root: `className="screen"` with `data-web` = `two-col` | `grid` | `center` (per table below).
  Mobile: `width: 390px; margin: 0 auto; min-height: 100dvh` — **remove every fixed `height: 844`**;
  content flows. Web (`@media (min-width: 900px)`): `width: auto; max-width: 1120px; padding: 40px`.
- Web top bar (rendered by the shell at ≥ 900px only; hidden on mobile where the existing in-page top
  row stays): 64px, wordmark **Zenda** in `--accent` 17px/700 at left, the page eyebrow next to it in
  `--label-3` uppercase 12px, "Log out" quiet link at right. Mobile keeps the current row.
- `two-col`: CSS grid `grid-template-columns: minmax(0, 1fr) 420px; gap: 40px; align-items: start`;
  children carry `data-col="main"` or `data-col="side"`; the side child is `position: sticky; top: 88px`
  and rendered as a card (`--surface`, `--radius-lg`, `--shadow-card`, padding 24px). Bottom-sheet styling
  (top radius, upward shadow, drag handle) is mobile-only — hidden at ≥ 900px.
- `grid`: `grid-template-columns: repeat(2, minmax(0, 1fr))` at ≥ 900px, `repeat(3, …)` at ≥ 1200px,
  gap 20px, with a full-width footer row for the CTA.
- `center`: max-width 560px centred (Celebration keeps its full-bleed gradient on `body`-height).

| Screen | `data-web` | main | side / cells |
|---|---|---|---|
| Discover | two-col | conversation + goal chips | "Where you are today" sheet + engine box (card) |
| Achievable | grid | verdict cards as cells | CTA row full width |
| Prioritise | two-col | ranked list | "Where the $260 goes" bar + note + CTA |
| Roadmap | two-col | the path (max-width 640) | what-if card |
| Trade-off | grid (3 cells at ≥ 900px) | option cards as cells | consequence card + buttons full width |
| Progress | two-col | nudge, progress line, dots, "Life changed?", dimmed path | check-in sheet (card) |
| Adapt | two-col | numbers sheet (editable) | before/after table + the two choices |
| Celebration | center | as is | — |
| Admin | grid | stat tiles as cells | sentence full width |
| Login / Signup | center | the form as a 420px card | — |

Touch targets stay ≥ 44px; type sizes unchanged (the phone type scale reads correctly at desktop
distances for this density); the `desktop` Playwright project (1280×800) must still pass every spec,
and `document.documentElement.scrollWidth <= innerWidth` on every page.
