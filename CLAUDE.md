# Zenda — project guide for Claude Code

## What this is
A B2B financial wellbeing platform (web first; installable on a phone as a PWA). Employees get a
personalised roadmap from their paycheck to their life goal. Three modules, nothing else:
**discover** (where you are, where you want to go) → **roadmap** (the product) → **progress**
(a tracking layer over it). Hackathon build: real auth, real database, real persistence.

Specs — read before any task, in this order:
- ZENDA_BUILD_SPEC.md       D0–D12: stack, schema + RLS, auth, screen map, API, engine, AI, seed, deploy, build order
- ZENDA_SPEC_ADDENDUM.md    precision items; OVERRIDES the build spec where they differ
- ZENDA_SCREEN_BINDINGS.md  element-level data bindings for every screen
- ZENDA_TEST_SPEC.md        five test layers (unit, RLS/db, API, e2e, prod smoke); test:all must be green
- design/screens/*.dc.html  the eight screens — visual truth, port as-is, never redesign
- VINAY_JOURNEY.md          the demo persona: every seed number and the engine test vector
- ZENDA_DESIGN.md §1        token values (app/tokens.css); new_app.md — the product brief

## Who does what (models)
- **Fable (`claude-fable-5`)** orchestrates: planning, architecture, decomposition, review, all .md files.
- **Sonnet (`claude-sonnet-5`)** executes D10 tasks in order, one session per batch, one commit per task.
- Sonnet does not redesign and does not edit .md files. A genuine contradiction in the spec stops
  that task and is reported; a trivial silent detail is decided (simplest option) and listed.
- App runtime model: Claude Opus 5 (`claude-opus-5`), effort low — see Stack.

## Non-negotiables
1. ONE engine: `lib/engine` — pure, deterministic, framework-free, imported by server and browser alike.
   Numbers come from it, never from the LLM. The LLM owns language; the engine owns state.
2. Money is integer cents everywhere in code; dates are UTC calendar strings (addendum A2).
3. Every goal carries a plain-language `why` (template first, AI upgrade later). Every projection
   surface renders `DISCLAIMER` once.
4. Education, not advice. Never name products, tickers, funds, brokers, coins, or write "you should
   buy/sell"; never the word "impossible". `lib/ai/banned-terms.ts` gates every AI string; templates
   obey the same rule by construction.
5. `ANTHROPIC_API_KEY` is read only in `lib/ai/*` and route handlers. `SUPABASE_SERVICE_ROLE_KEY` is
   read only by `scripts/seed.ts`. Neither is set on Vercel except the Anthropic key. No client
   component imports `lib/ai` or `@anthropic-ai/sdk`.
6. Every route handler validates its body with Zod and operates through the cookie-bound user client
   so RLS applies. There is no service role at runtime.
7. Employer-blindness is a database fact: no org-admin policy exists on profiles, goals,
   contributions, projections or events. The employer's only window is `org_seat_stats()`.
8. AI is never on a render path: it runs in `after()` and upgrades templates already shown.

## Stack
Next.js 16 App Router, one app at the project root (no monorepo) · React 19 · TypeScript strict · Zod 4
Styling: `app/tokens.css` + the screens' inline styles ported as-is (no Tailwind)
Data: Supabase — Postgres + Auth (email/password, confirmation off for the demo) + RLS; `@supabase/ssr`
Reads: Server Components via `lib/data/queries.ts`. Writes: route handlers under `app/api/**`
AI: `@anthropic-ai/sdk` — `messages.parse` + `zodOutputFormat`, `output_config.effort: "low"`,
    `cache_control` on the system block, `stop_reason === "refusal"` treated as failure
Tests: Vitest on `lib/engine` only. Hosting: Vercel, root `.`

## Commands
npm install             install
npm run dev             http://localhost:3000 (`/` serves public/landing.html via rewrite)
npm run build           must pass before a task is called done
npm test                vitest — the D6 worked example; must stay green
npm run seed            `tsx scripts/seed.ts` — needs .env.local and applied migrations
npm run reset:e2e       resets e2e@ (Vinay clone) and judge@ (fresh) test accounts
DEMO_TODAY              defaults to 2026-10-20 in next.config.ts; set "" for the real clock

## Where things live
proxy.ts                  session refresh + protected routes (export named `proxy`)
app/tokens.css            design tokens as CSS variables (addendum A9)
app/{login,signup}/       the two undesigned auth screens (built from tokens)
app/{discover,achievable,prioritise,roadmap,progress,celebrate,admin}/   the screens
app/api/**                route handlers (D5) + /api/ask (Ask Zenda) + /api/reset (start over)
app/components/           nav-bar (persistent menu), ask-zenda, logout-link, route-states
app/web.css               responsive shell: phone column <900px, two-col / grid web layouts above
lib/engine/               types, rates, solver, waterfall, progress + engine.test.ts
lib/data/                 types.ts (row types), queries.ts (all reads), recompute.ts (only writer of projections)
lib/supabase/             browser.ts, server.ts (user client only)
lib/ai/                   client.ts, banned-terms.ts, prompts.ts, run.ts
supabase/migrations/      0000_teardown.sql, 0001_zenda.sql, 0002_money_moves.sql (applied by the owner in the SQL editor)
scripts/seed.ts           demo org, three accounts, Vinay's data, lessons
public/landing.html       the landing page (from demo/zenda-path.html; CTAs are links)
design/, demo/, *.md      design truth and specs — Fable-owned

## Conventions
- Files kebab-case; React components PascalCase, one per file.
- Port screen markup verbatim (class→className, style strings→objects, wrappers dropped), then bind.
- Conventional commits, one per task: feat / fix / chore / test. `.env.local` is never staged.
- Finish every task by running `npm run build` (and `npm test`) and reporting the real result.

## Don'ts
- Don't read, print or echo `.env.local`; the seed script parses it programmatically only.
- Don't call the Anthropic API from tests or from the seed.
- Don't build anything from the brief's cut list (e-learning, bank feeds, payments, push notifications).
- Don't add a dependency outside the D1 manifest without saying why in the commit body.
- Don't touch the Supabase dashboard or Vercel from a session — those are owner actions (addendum A11).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
