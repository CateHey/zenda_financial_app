# Zenda

**We are your path to financial freedom.** A B2B financial-wellbeing platform an employer buys for
its people: each employee sets a concrete, dated, costed goal and follows a personalised roadmap toward
it — with total privacy from the employer, enforced in the database.

Three modules, nothing else: **Discover** (where you are, where you want to go) → **Roadmap** (the product)
→ **Progress** (a check-in layer over the roadmap). Numbers come from a deterministic engine; the AI only
writes the words, and the app works with the AI switched off.

## Try it

Demo accounts (password for all: `Zenda-demo-2026!`):

| Account | What you see |
|---|---|
| `vinay@demo.zenda.app` | Vinay, 23 — a populated roadmap: Peru on track, the car after a trade-off, the house adjusted honestly |
| `judge@demo.zenda.app` | A fresh employee — start at Discover and build a roadmap in under two minutes |
| `admin@demo.zenda.app` | The employer's view: seats and headcount, never a goal or a number |

Landing page → "See Vinay's journey" prefills the first account.

## Run locally

```
npm install
npm run dev          # http://localhost:3000
npm test             # engine + unit
npm run test:db      # RLS proofs against the live project (needs .env.local)
npm run test:e2e     # Playwright, starts its own dev server with the AI key blank
```

Environment: copy `.env.example` to `.env.local` and fill it in. The app's "today" is pinned to the demo
persona's week 7 (`DEMO_TODAY=2026-10-20`, defaulted in `next.config.ts`); set `DEMO_TODAY=""` to run on
the real clock. If the Playwright suite is running it holds port 3000 — start your own server with
`npm run dev -- -p 3005`.

Database: run `supabase/migrations/0000_teardown.sql` then `0001_zenda.sql` in the Supabase SQL editor;
turn *Confirm email* off for the demo; then `npm run seed`.

## How it is built

- **Next.js 16** (App Router), one app, no framework beyond React. Screens are the design files ported as-is.
- **Supabase** — Postgres, Auth, and row-level security on every table. There is no org-admin policy on any
  personal table; the employer's only window is a cohort-gated `org_seat_stats()` function. No service
  role at runtime.
- **`lib/engine`** — pure, deterministic monthly-compounding maths: required contribution, months to reach,
  projection curves, a horizon-based glide path, a date-ordered waterfall across goals, and honest
  alternatives when a goal is out of reach (later date · smaller amount · extra per month). Tested
  against the persona's worked example.
- **Claude** (`claude-opus-5`) writes each milestone's *why* and the celebration line, after the response,
  through a banned-terms gate — never on a render path, never arithmetic. **Ask Zenda** (the button on every
  app screen) answers questions about your own roadmap with the engine's numbers as its only context.
- **Menu everywhere:** a persistent nav (top bar on web, bottom bar on phones) reaches every screen; *Edit my
  numbers* reopens Discover prefilled, and *Start over* clears goals and progress while keeping your numbers.

Specs: `ZENDA_BUILD_SPEC.md` (with `ZENDA_SPEC_ADDENDUM.md` and `ZENDA_SCREEN_BINDINGS.md`),
`ZENDA_TEST_SPEC.md`, and the product brief `new_app.md`. Design sources in `design/screens/`.

## Compliance

Zenda gives general information, not personal financial advice. Every projection carries that disclaimer;
no product, fund, broker or ticker is ever named.
