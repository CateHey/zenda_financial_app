# Zenda — project guide for Claude Code

## What this is
A B2B financial wellbeing platform (web + iOS/Android). Employees get a personalised roadmap
from their paycheck to their life goal. Three modules, nothing else: **getting to know you**
(onboarding) → **your roadmap** (the product) → **progress** (a tracking layer over it).

Specs — read the relevant section before starting any task:
- new_app.md               the brief: scope, the three modules (§1), colour (§4b), landing (§5)
- ZENDA_CONCEPT.md         product behaviour, personas, screens, copy deck   (pending)
- ZENDA_DESIGN.md          tokens, components, motion, the landing scene
- ZENDA_MOTION_DEMO.md     the built landing-scene prototype (demo/zenda-path.html), documented
- ZENDA_ARCHITECTURE.md    data model, rules engine, AI layer, API, tenancy  (pending)
- ZENDA_PLAN.md            the phase you are working in                      (pending)

## Who does what (models)
- **Fable (`claude-fable-5`)** orchestrates: planning, architecture, decomposition, review.
- **Sonnet (`claude-sonnet-5`)** executes: implementation tasks, tests, refactors.
- Sonnet does not redesign. If a task is ambiguous or touches a contract (schema, API route,
  RLS policy, token file), it comes back to Fable instead of guessing.
- App runtime model: Claude Opus 5 (`claude-opus-5`) — see Stack.

## Non-negotiables
1. ONE canonical `Roadmap` object in packages/core. Web and mobile are renderers of it.
   Never add platform-specific business logic or platform-only fields.
2. Numbers come from the rules engine (packages/core/src/rules). The LLM never does
   arithmetic that reaches a user. The LLM owns language; the engine owns state.
3. Every milestone carries a plain-language `why`. Enforced by schema.
4. Education, not advice. Never name products, tickers, funds, brokers, or write
   "you should buy/sell". The banned-terms gate in packages/ai/src/validate.ts blocks release.
5. ANTHROPIC_API_KEY and SUPABASE_SERVICE_ROLE_KEY are server-only. Never import
   @anthropic-ai/sdk or use a service key in apps/web client components or apps/mobile.
6. Every API input and output is validated with the shared Zod schemas from packages/core.
7. An org admin can never reach an individual's financial rows — RLS-enforced, proven by a test.
8. Notification decisions come only from `decideNotifications` in packages/core:
   max 3 pushes/week, quiet hours 8pm–8am, one nudge per missed check-in. Enforced in code.
9. No raw hex in components. Colours come from packages/tokens as role tokens (see §4b of
   the brief); every accent token has a light and a dark value.

## Stack
pnpm workspaces + Turborepo · TypeScript strict · Zod · Vitest · Playwright
apps/web: Next.js App Router, Tailwind v4, Framer Motion, TanStack Query, Zustand,
          React Three Fiber (landing page only — never in the app bundle)
apps/mobile: Expo + Expo Router, NativeWind, Reanimated, Expo Notifications
Backend: Next.js route handlers · Supabase (Postgres + Auth + RLS) — shared project with
         Free Me; Zenda tables arrive in migration 0002, never touch `sessions`/`plans`
AI: Claude Opus 5 (`claude-opus-5`) via @anthropic-ai/sdk — streaming for the onboarding
    conversation; structured outputs with client.messages.parse + zodOutputFormat; effort via
    output_config.effort; cache_control on system prompts; check stop_reason === "refusal".
Internal packages are consumed as TypeScript source (no build step); Next transpiles them.

## Commands
pnpm install            install everything
pnpm dev                web app on http://localhost:3000
pnpm typecheck          tsc across all packages — must pass before you finish
pnpm test               vitest across all packages — must pass before you finish
pnpm lint               eslint (web)
pnpm eval               AI evals against golden JSON — no API calls
pnpm eval:golden        regenerate golden roadmaps — COSTS MONEY, ask before running

## Conventions
- Files kebab-case; React components PascalCase, one per file; hooks `use-*.ts`.
- Tests beside the code as `*.test.ts(x)`. packages/core needs a test for every branch —
  rules, streaks, notifications. UI gets a smoke test, not snapshot spam.
- No `any`. Derive types from Zod schemas (`z.infer`). No duplicated type definitions.
- The share line is rendering: a file with no JSX belongs in packages/*, never in an app.
- New dependency → say why in the commit body.
- Conventional commits: feat / fix / chore / docs / test / refactor. Small commits.
- DEMO_MODE=true while building UI — cached roadmaps, no API spend.
- Finish every task by running `pnpm typecheck && pnpm test` and reporting the real result.

## Where things live
packages/core/src/schema/   ZendaProfile, Roadmap, Milestone, CheckIn, NotificationDecision (Zod)
packages/core/src/rules/    computeSurplus, firstMilestone, generateRoadmap, applyCheckIn,
                            mergeRoadmaps, decideNotifications
packages/core/src/layout/   layoutRoadmap — deterministic positions for both clients
packages/ai/src/            prompts/, onboarding, milestone language, celebration, validate
packages/tokens/            colour roles (light+dark), type, spacing, radius, motion
packages/api-client/        typed fetch + TanStack Query hooks shared by web and mobile
apps/web/app/api/           route handlers
apps/web/app/(landing)/     the marketing page + WebGL scene (lazy-loaded)
apps/mobile/                Expo app — same three modules, same packages
evals/                      golden profiles + structural assertions

## Don'ts
- Don't call the Anthropic API from unit tests. Only evals/ may call it.
- Don't put notification logic in a client. Both platforms transport `decideNotifications` output.
- Don't import three.js anywhere except the landing page chunk.
- Don't build anything from the brief's cut list (e-learning, bank feeds, payments, extra tracks).
- Don't hand-edit evals/golden/*.json — regenerate with pnpm eval:golden.
- Don't read or print .env files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
