# ZENDA_SCREEN_BINDINGS.md — element-level data bindings for the eight screens

> The `.dc.html` files in `design/screens/` are the visual truth. This document says, for every element
> that shows data, **which field fills it and how it is formatted**. Port each screen's markup and inline
> styles as-is (`class` → `className`, style strings → objects, `<x-dc>`/`<helmet>` wrappers dropped,
> `<script src="./support.js">` dropped); then bind per the tables. Copy that is not listed here is
> literal and stays exactly as designed. Currency format per A8. "Month YYYY" = `Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" })`.

Common: every app page wraps its screen in a 390px max-width centred column on the white surface (desktop
shows the phone-width column centred; that is the intended web layout for the hackathon). The header row
adds a "Log out" quiet link at the right edge of the existing top bar, `--label-2`, 15px.

## S1 · Discover — `design/screens/Main.dc.html` → `/discover`

| Element (as in the file) | Binding |
|---|---|
| Progress bars (4 pills) | Static: 3 filled on first load; all 4 after a goal is selected |
| Bubble 1 "Where do you want to go in three years?" | Literal |
| Bubble 2 (indigo, user) | `profile.freedom_text` when present; otherwise it is a **textarea** styled as the bubble, placeholder "Tell us in your words…" |
| Bubble 3 "A house, a car, and Peru. Got it…" | Latest `motivational_events` row with `payload.reflection = true` → its `message`; else the template: `"<Kind list joined with commas and 'and'>. Got it. Now the numbers — quick, no judgement."` where the kind list comes from selected chips, or "Tell us where you're going. Then the numbers." when none |
| Goal chips row | One chip per kind in this order: home, car, travel, study, business. Selected = has an active goal of that kind (or toggled on this visit): indigo fill + check icon + `"<Title> · $<target compact>"` (compact: `$1M`, `$50k`, `$4k`). Unselected = sunken fill, kind label only. Tap toggles; long-press/second tap on a selected chip opens the A6 sheet |
| Sheet title "Where you are today" · "weekly" pill | Pill shows `profile.pay_cycle`; tapping cycles weekly → fortnightly → monthly |
| Rows Income / Rent / Food / Petrol · internet / Fun / Buffer / Savings / Debt | Inputs (numeric, right-aligned, same row style). **Decision:** the design's four expense rows collapse into the schema's single `essentials_cents`: Rent + Food + Petrol · internet are three inputs whose **sum** is essentials; store the sum only. Fun → `lifestyle_cents`; Buffer → `buffer_cents`; Savings → `savings_cents`; Debt → `debt_cents` with a second small input for the rate (`debt_rate_bps`, shown as "2.8%") |
| Engine box "$260 / week" | Live: `engine.capacityMonthlyCents` converted back to the pay cycle, recomputed on every keystroke, client-side |
| Engine box arrow button | Submits `POST /api/discover`; disabled with "One moment…" while pending; on `ok` navigates to `redirect` |

## S2 · What's achievable — `Achievable.dc.html` → `/achievable`

Goals ordered by `target_date`; the buffer and emergency goals are shown **after** the chosen ones (they are
foundations, not choices). One card per goal:

| Element | Binding |
|---|---|
| Eyebrow "Travel · Peru" | `"<Kind label> · <title>"` in the goal's ramp colour by kind: travel `#007AFF`, car `#5856D6`, home `#AF52DE`, buffer/emergency `#0057D9`, study/business `#8450DA` |
| Tag | `achievable` → "On track" (blue tint); `goal_type = growth_required` → "Adjusted"; else "Needs a trade-off" |
| Amount line | left: `$<target>` (`growth_required`: `"$<target> in <years> years"`); right: achievable → "Month YYYY" of `completion_month`; else `"needs $<required weekly> / wk"` |
| Why line | `goals.why` (template or AI) |
| Footer "Already running underneath: super…" | Literal for the demo (no super field in the schema) |
| Button "Prioritise my goals" | → `/prioritise` |

## S3 · Prioritise — `Priorities.dc.html` → `/prioritise`

| Element | Binding |
|---|---|
| Ranked cards | User-chosen goals by `priority` asc; rank badge colour by kind as S2; title `"<title> · $<compact>"` |
| Consequence line | achievable → `"Engine from <Month YYYY of start_month> to <Month YYYY of completion_month>."`; not achievable → `"Needs $<required weekly>/wk — see the trade-off."`; the soonest goal → `"Goes first anyway: small and soon. Done by <Month>."` |
| Drag handle icon | Kept visually; **two 44px chevron buttons** (up/down) are added at the right of each card for reordering (the design's handle is decorative) |
| "Where the $260 goes" bar | Segments = every goal in waterfall order incl. buffer/emergency, width ∝ `(completion_month − start_month)` (a `growth_required` goal takes the remainder to its `target_month`); colours by kind; labels below = titles; dates row = `Month YYYY` of each segment's start, last = target month of the final goal |
| Note card | Literal |
| "Build my roadmap" | `POST /api/prioritise` with the current order → navigate to `redirect` |

## S4 · Roadmap — `Roadmap.dc.html` → `/roadmap`

| Element | Binding |
|---|---|
| Title "The house, the car, Peru." | User-chosen goals sorted by priority, titles joined: `"<a>, <b>, <c>."` (two: `"<a> and <b>."`; one: `"<a>."`) |
| Chip "Priority Home › Car › Peru" | Same order, kind labels joined with " › " |
| Chip "This week $260 → Peru" | `"This <cycle word> $<capacity per cycle> → <current goal title>"` where current goal = soonest active |
| Path nodes, top → bottom | All non-paused goals sorted by `target_date` **descending** (farthest first), then the Today node |
| Node eyebrow | `"<Month YYYY> · <Kind label>"`; for `growth_required`: `"<start Month YYYY> → <target Month YYYY> · $<weekly capacity> / wk allocated"` |
| Node tag | achievable → "On track" (blue); `growth_required` → "Adjusted"; not achievable → "Trade-off" (tapping a Trade-off node → `/roadmap/trade-off?goal=<id>`) |
| Node title / amount | `title` / `$<target>`; `growth_required` amount = `"$<curve end>–<curve end at upside rate>"` compact (`$75k–130k`) |
| Node why | `goals.why` |
| Current goal card (Peru) | The soonest active goal: progress bar width = `pctComplete%`; left text `"$<saved> saved · all $<capacity per cycle> / wk goes here"`; right `"<paydaysRemaining> paydays"` |
| Today node | `"Today · <last reached goal title> $<target> done"`; if none reached: `"Today · $<capacity per cycle> / wk"` |
| What-if card | Slider min = 50% of capacity, max = 200%, step $10 per cycle; value label `$<value> / week`; sentence recomputed client-side from `waterfall()` with the slider's capacity: `"At $<value> a week: <goal1 title> in <Month>, <goal2 title> in <Month YYYY>."` for the two soonest chosen goals. Never persisted |

## S5 · The trade-off — `Tradeoff.dc.html` → `/roadmap/trade-off?goal=<id>`

| Element | Binding |
|---|---|
| Eyebrow / title / sub | `"Trade-off · <Kind>"` · `"$<target> in <n> <years|months> needs $<required weekly> a week."` · `"You have $<capacity weekly>. Pick the version that's true — every option keeps <the goals before it in date order> on time."` |
| Option A (selected) | `"$<alt_smaller_target rounded to nearest $1k> · <Month YYYY of target>"` — "Recommended"; why: `"Lands at your current engine. <Next growth goal title> starts on time."` |
| Option B | `"$<target> · <Month YYYY of alt_later>"`; why: `"The <kind> you want, <months later> months later. <Next growth goal> starts <Month YYYY of its shifted start>."` |
| Option C (dimmed) | `"$<target> · <Month YYYY of target>"` — "Out of reach"; why: `"$<required weekly> a week is <ratio>× your engine. Reachable only with more income — a $10k raise adds about $<130> a week."` (the $130 figure = 10,000 × 0.68 / 52, rounded) |
| Consequence card | `"$<A amount> <kind> → <growth goal title> ~$<curve end> by <year>. No <kind> → ~$<curve end without this goal> by <year>."` (second figure = waterfall re-run with this goal removed, client-side) |
| Buttons | "Choose $<A> in <year>" → `POST /api/goals/[id]/adjust { target_cents: A, target_date }`; "Try a different number" → opens the A6 sheet for this goal |

## S6 · Progress — `Tracking.dc.html` → `/progress`

| Element | Binding |
|---|---|
| Nudge card | `"$<capacity per cycle> is ready for <current goal title>. <paydaysRemaining> paydays to go."`; hidden if already checked in this cycle |
| Progress title | `"<Streak as a word, capitalised> paydays in a row."` (0 → "Your first payday."); 1 → "One payday." |
| Progress sub | `"You're <pctComplete>% of the way to <current goal title>."` |
| Streak dots | One dot per contribution to the current goal and the goals before it in date order, oldest first, max 12 visible: filled with the goal's kind colour; then empty dots up to `paydaysRemaining` (cap total at 12; if more, show "+N" text after the row) |
| Dot caption | `"<Previous goal title>, then <current title>. Each dot is a payday."` |
| "Life changed?" row | Link → `/progress/adapt` |
| Dimmed path | The next goal after current, then the current (two nodes, as designed), same bindings as S4 |
| Sheet question | `"Did you put $<capacity per cycle> aside?"`; already-checked-in → sheet replaced by the A3 "Done for this payday" text |
| Yes | `POST /api/checkin { goal_id, kind: "full" }` |
| Partly | Reveals an amount input (row style) + "Save" → `kind: "partial", amount_cents` |
| Not this time | `kind: "skip"` → response `redirect` |

## S7 · Life changed — `Adapt.dc.html` → `/progress/adapt`

| Element | Binding |
|---|---|
| Title | First load: `"What changed?"` with the S1 numbers sheet inline (prefilled); after any edit the title becomes `"<Changed row label> went <up|down> $<delta>."` (multiple: `"Your numbers changed."`) |
| Sub | `"Your engine is now $<new capacity per cycle> a week. Nothing you've saved moves — only the dates. Here's the redrawn path."` |
| Before/after table | Rows: Engine; then each active goal in date order (`Month YYYY` before → after, from a client-side `waterfall()` with the edited numbers); last row `"Deposit by <year>"` = the growth goal's curve end before → after. Bold the "Now" column when it differs |
| "Or keep Peru on time" card | If capacity dropped: `"Trim fun from $<lifestyle> to $<lifestyle − delta> for <paydays remaining on current goal> weeks and every date stays where it was."`; if capacity rose: `"Every date just moved closer. Nothing to trim."` |
| Buttons | "Accept the new path" → `POST /api/adapt { …numbers, strategy: "accept" }`; "Trim fun, keep the dates" → same numbers with `lifestyle_cents` reduced by the delta and `strategy: "protect_dates"` |

## S8 · Goal reached — `Celebration.dc.html` → `/celebrate?event=<id>`

| Element | Binding |
|---|---|
| Big number | `$<goal.target>` |
| "Peru, funded." | `"<title>, funded."` (buffer: `"Breathing room, done."`) |
| Body | `event.message` (template first, AI upgrade later) |
| Pill "Your $260 a week now flows to the emergency fund · March" | `"Your $<capacity per cycle> a week now flows to <next goal title> · <Month YYYY of its completion>"`; no next goal → "You've reached every goal on the path." |
| "Book the flights" | Kind-specific label: travel "Book the flights", car "Go and see it", home "Talk to a broker", buffer/emergency "Keep it there", study/business/other "Take the next step" → `POST /api/events/[id]/seen` then `/roadmap` |
| "Back to the path" | Same call, same destination |

## Copy that must never appear (banned-terms gate applies to templates too)

"impossible", "you should buy/sell", any product, bank, fund, ticker or coin name (see `lib/ai/banned-terms.ts`).
Every projection surface (S2, S4, S5, S7) renders `DISCLAIMER` once, 12px `--label-3`, at the bottom of the screen.
