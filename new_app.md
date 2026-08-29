# Zenda — build brief

> **Read this whole file before writing a single line of code.**
> The first deliverable is a plan, not an app. See [Rule zero](#rule-zero).

---

## Platform identity

**Category:** B2B2C enterprise financial wellbeing SaaS.
**Positioning:** An automated, goal-first financial progression engine that connects an employee's
daily workplace earnings directly to their personal life milestones.
**Core differentiator:** We abandon the clinical, arithmetic approach of traditional finance. We
compete on **emotion, connection and fun**. Instead of dry dashboards, the platform feels like a
deeply personal financial hype-squad, built on radical simplicity and bite-sized interactions.

Organisations buy it for their people. Each person defines their own goal and follows a
personalised pathway toward it.

**Platforms: web *and* app.** Both are first-class from day one — not a website with a mobile
version bolted on later. See §6b for how that is built without doubling the work.

### The whole product is three modules

That is the entire scope. If something does not belong to one of these three, it is not in the
MVP — no matter how good it is.

| # | Module | In one line |
|---|---|---|
| **1** | **Getting to know you** | A short conversation that learns the goal and the numbers |
| **2** | **Your roadmap** | The path from today to that goal, as milestones |
| **3** | **Progress** | A tracking *layer* over the roadmap — check-ins, celebrations, notifications |

They are deliberately sequential: module 1 produces the input for module 2, and module 3 is drawn
on top of module 2. **Module 2 is the product.** Module 1 exists to fill it, module 3 exists to
bring people back to it. There is no home screen, no dashboard, no tab bar full of sections — the
roadmap *is* the app.

### Explicitly out of scope

Cut deliberately. Do not build these, and do not leave hooks for them beyond what is noted:

| Cut | Note |
|---|---|
| Bite-sized e-learning / knowledge drops | Good idea, later phase. Keep `packages/content` empty for now. |
| Investing, crypto and founder tracks as separate journeys | Collapses into one roadmap generator (§1.2). Removes the biggest compliance surface. |
| Bank / payroll integration | Manual check-in instead (§1.3). Design so it can slot in later. |
| Standalone streaks feature | Not its own thing — it is one signal inside module 3. |
| Payments and billing | Count seats; do not charge in-app. |

### Who it is for

| Segment | Status |
|---|---|
| **Companies** | ✅ the MVP — build only this |
| Universities | later |
| NGOs | later |
| High schools | later |

Two audiences inside every company, and they want different things:

- **The employee** — "Am I going to be OK? What do I do next?"
- **The HR / wellbeing buyer** — "Does this move engagement and retention, and can I prove it?"

The employee experience *is* the product. The buyer dashboard is what renews the contract.
Both have to win.

---

## Rule zero

**No code until the plan is approved.**

1. Read this brief.
2. Read what already exists in `../hackathon_uqies` (see [Reuse](#reuse-what-already-exists)).
3. Write the plans listed below.
4. **Stop. Show them to me. Wait for approval.**
5. Only then build.

**Every plan must use simple language.** Short sentences. No jargon, no consultant-speak, no
acronyms without explaining them once. If a sentence needs a second read, rewrite it. The plans
should read the way the product reads.

Plans to produce, in this order:

| # | Plan | Answers |
|---|---|---|
| 1 | `ZENDA_CONCEPT.md` | What it does, who it is for, the screens, the tone, the sales story |
| 2 | `ZENDA_DESIGN.md` | Design system, motion system, the landing page scene — **drafted, awaiting review** |
| 3 | `ZENDA_ARCHITECTURE.md` | Data model, rules engine, AI layer, API, multi-tenancy |
| 4 | `ZENDA_PLAN.md` | Phase-by-phase build, each phase shippable on its own |
| 5 | `CLAUDE.md` | The rules you will follow while building — **drafted** |

### What each plan must contain

The plans are not essays — they are **specs**, written so that coding becomes transcription.
Two rules apply to all five:

- **Contract-first.** Anything that will become code appears in the doc *as code*: Zod schemas,
  SQL, function signatures, route tables. When building starts, these are lifted verbatim into
  the packages. **The doc is the first draft of the code.**
- **Dependency order.** Write them in the order listed; each doc may only build on decisions
  already made upstream. If writing a later doc exposes a problem in an earlier one, fix the
  earlier one — do not fork the truth.

Use the `artifact-diagramming` skill for every diagram; a flow described only in prose is not
specced.

#### Plan 1 · `ZENDA_CONCEPT.md`

| Section | Must contain |
|---|---|
| The story | §0 expanded — the employee's journey and the buyer's journey, each end to end |
| Personas | Four or five fixture people with **real numbers** (reuse the five from the old project). These become the test fixtures and the demo data — one source |
| Screen inventory | Every screen across the three modules: one paragraph, one rough sketch, entry and exit points |
| Copy deck | The actual words for the high-stakes moments: welcome, anchor question, out-of-reach goal, broken streak, celebration, the privacy promise. Written here, reviewed here, frozen here |
| Tone rules | How Zenda speaks, with ten example sentences right and wrong; the banned-terms list carried over |

#### Plan 2 · `ZENDA_DESIGN.md`

| Section | Must contain |
|---|---|
| Tokens | The full §4b palette, type scale, spacing, radii and motion values — written as the actual `packages/tokens` source file, not a table about it |
| Components | The 10–12 components the three modules need, each with every state: default, hover, focus, disabled, loading, error, empty |
| Roadmap rendering | How the path draws from `layoutRoadmap` output on a phone and on a desktop — same data, two layouts, specified |
| Motion map | Screen by screen: which animation, what duration, what it does under `prefers-reduced-motion` |
| Landing storyboard | Scroll position → scene state for §5, section by section, plus the poster-frame fallback |

#### Plan 3 · `ZENDA_ARCHITECTURE.md` — the deepest one

Required sections, in this order:

| # | Section | Must contain |
|---|---|---|
| 1 | **System overview** | One diagram: two clients → one API → rules engine + model → Supabase. Every arrow labelled with what flows across it |
| 2 | **Canonical objects** | The full Zod schemas: `ZendaProfile`, `Roadmap`, `Milestone`, `CheckIn`, `StreakState`, `NotificationDecision`, `OrgAggregate`. Written as TypeScript that typechecks |
| 3 | **Database + RLS** | Every `CREATE TABLE` and every row-level-security policy as real SQL — copy-pasteable as migration `0002`. Per table: who reads, who writes, and the query that proves an org admin sees nothing individual |
| 4 | **Rules engine** | Function by function: signature, inputs, outputs, edge cases, and a worked example using a persona's real numbers. At minimum: `computeSurplus`, `firstMilestone`, `generateRoadmap`, `applyCheckIn`, `mergeRoadmaps`, `decideNotifications`, `layoutRoadmap` |
| 5 | **AI layer** | Call by call: purpose, inputs, output schema, prompt sketch, cache strategy, fallback when the model fails or stalls, expected token cost per call. Plus the validation gate every output passes through |
| 6 | **API** | The route table: method, path, who may call it, request schema, response schema, error cases, rate limit. Both clients consume exactly this and nothing else |
| 7 | **Notification pipeline** | Sequence diagram: scheduler tick → `decideNotifications` → transport (Web Push / Expo) → device. Token registration, the 3-per-week cap enforcement point, delivery-failure handling |
| 8 | **Auth + tenancy** | The magic-link flow, roles, sessions; the lifetime account (person as root, org membership as a leavable edge); exactly what happens on leave-company and on delete-my-account |
| 9 | **Client architecture** | What state is server-owned (TanStack Query) vs local (Zustand); what-if computed locally; a check-in made offline queues and syncs; the §6b share table made concrete as import rules between packages |
| 10 | **Coexistence** | The shared Supabase project: what `0002` adds, and proof it cannot disturb the Free Me `sessions` / `plans` tables |
| 11 | **Threat model** | Attacker by attacker: the curious org admin, the departing employee, a stolen laptop, prompt injection through the onboarding chat. Each one: the control, and the named test that proves the control |
| 12 | **Decision records** | One short ADR per big call already made — hybrid onboarding, manual check-in, indigo as hero, PWA-first — with the why, so future-us stops relitigating |

#### Plan 4 · `ZENDA_PLAN.md`

| Section | Must contain |
|---|---|
| Phases | Each phase: goal, tasks, done-when, and the demoable thing at the end. **Every phase ends with something you can click** |
| Task granularity | Tasks sized for one Sonnet session each, naming the files they touch |
| Risk register | The five scariest things — extraction accuracy, iOS push, RLS correctness, WebGL performance, model latency — and which phase de-risks each, early |
| Reuse map | File by file from `hackathon_uqies`: taken as-is / adapted / not used. Decided here, not rediscovered mid-build |

#### Plan 5 · `CLAUDE.md`

Model the structure on `../hackathon_uqies/CLAUDE.md` — it worked. Non-negotiables, stack,
commands, conventions, where things live, don'ts. Add the Fable/Sonnet split (§3) and the
three-module map. Keep it under two pages: it is loaded into every session, and every line costs
attention.

#### The docs phase is done when

- [ ] Every schema in the architecture doc typechecks, verbatim
- [ ] Every RLS policy is real SQL, runnable as migration `0002`
- [ ] Every API route has request and response schemas — zero "TBD"
- [ ] Each of the three modules has a sequence diagram of its main flow
- [ ] Every rules-engine function has a worked example using persona numbers
- [ ] The high-stakes copy is written and reviewed, not stubbed
- [ ] Every open question is resolved or explicitly carried, with an owner
- [ ] I have approved all five docs — Rule zero

---

## 0 · The message — one idea, three audiences

**The core line:**

> **Your paycheck is the engine for your financial freedom.**

This is the spine of the product. It is the app's welcome screen, the sales deck's strongest
slide, and the honest description of the architecture — the same idea, said three ways. Every
screen, every piece of copy and every feature should be traceable back to it. If something cannot
be, it probably should not ship.

### 0.1 In the app — for the employee

**Headline:** Your paycheck is the engine for your financial freedom.

**Sub-text:** Turn your daily shifts into a clear, step-by-step path to your biggest life goals.
No confusing charts — just real progress.

Punchy, simple, action-oriented. Note what the sub-text promises: *no confusing charts*. That is a
design constraint, not a slogan — see §4. Do not put a line chart on the welcome screen and then
apologise for it.

### 0.2 In the pitch — for the HR buyer

**The slide:** "We turn your payroll into your strongest retention tool."

**The script:** *"When employees view their paycheck as the engine for their personal freedom,
they stop looking for the exit. We help your workforce connect their daily work directly to their
future goals, making you the enabler of their success."*

This is what proves we are solving a business problem, not building a feel-good app — the
distinction that matters in a competitive entrepreneurial ecosystem or an enterprise procurement
conversation. The buyer already owns payroll; we make it do a second job.

The supporting argument: money stress follows people to work. It is the quiet reason behind
distraction, sick days, second jobs, and people leaving for a small pay bump. Zenda gives every
employee a clear, personal path to their own goal — so the work they do gets a visible purpose.

### 0.3 In the architecture — the tech layer

"Engine" is also the literal description of what we are building: raw fuel in — salary, and
eventually banking data — forward momentum out, as nudges, streaks and a simplified pathway.

**One clarification that must survive into the code.** The engine is two parts, and they never
swap jobs:

| Part | Does | Never does |
|---|---|---|
| **Rules engine** (`packages/core`) | Every number: surplus, split, time-to-goal, streak state, milestone thresholds | Talks to the user |
| **LLM** (`packages/ai`) | Conversation, framing, the *why*, the celebration and progress lines | Arithmetic that reaches a person |

Both are "the engine" to the user. Only one of them is allowed to do maths. This is what makes the
product defensible when a CFO or a regulator asks how a number was produced.

---

## 0b · Features — and the reason each one exists

Every feature below has to survive the question *"why would a company pay for this?"*

Four employee outcomes, and what delivers each:

| Outcome | Delivered by |
|---|---|
| **Less anxiety about money** | Module 1 → a clear picture of *right now* — income, super, debt, what is actually left over. No judgement, no shame. |
| **Purpose in the work** | Module 2 → a named goal with a visible path. "This week's shift funded your next two server bills." Work stops feeling meaningless. |
| **Understanding, not dependence** | The `why` on every milestone — each step teaches the reasoning behind it, in plain language. |
| **Motivation that lasts** | Module 3 → check-ins, celebrations, the path visibly shortening. |

And the one outcome the buyer pays for:

| Outcome | Delivered by |
|---|---|
| **Proof it worked** | Anonymous, aggregated dashboard: adoption, confidence movement, stress-index movement, top goals across the org. Never individual data. A minimum cohort size before any number appears. |

### The UX philosophy — the anti-dashboard

- **Ultra-minimalist interface.** The platform looks effortless. Strip away complex charts and
  financial jargon in favour of bold, clean design and white space.
- **Micro-text.** Zero walls of text. Every notification, insight and learning moment is a sharp,
  scannable sentence. Seconds to read, not minutes to study.
- **The emotional anchor.** Every feature ties back to the person's specific *why* — the house
  deposit, the travel fund, the startup runway — so the product always feels personal.

### The core math (this is the actual product)

Employees know their income and their super each month. What they do not know is what it *means*.

```
inputs   → income · super · fixed costs · debts (amount, rate, minimum) · savings · goal
engine   → surplus · true position · debt-vs-invest split · time-to-goal · what-if
output   → "Pay $X here, put $Y there. You reach your goal in N years. Here is why."
```

Non-negotiable: **numbers come from a deterministic rules engine, never from the model.** The
model converses, explains, personalises and encourages. It never does arithmetic that reaches a
person.

---

## 1 · The three modules — detailed spec

Each module below defines: what the person experiences, the screens, the data contract, what is
deterministic vs what the model does, how it behaves on web and app, the failure modes, and how we
know it is done. `ZENDA_CONCEPT.md` expands the copy; `ZENDA_ARCHITECTURE.md` expands the schemas.

**A rule that applies to all three:** the rules engine owns every number and every state
transition. The model owns language. Neither borrows the other's job.

---

### 1.1 · Module 1 — Getting to know you

**Purpose.** Learn enough in under two minutes to draw a real roadmap. It must feel like someone
paying attention, not a form.

#### The shape: hybrid, not pure chat

Chat for the **why**. Structured input for the **numbers**.

This is the most important decision in the module. Typing *"about $4,200 after tax, fortnightly"*
into a chat box is slower, more error-prone and more annoying than a number pad — and every
extraction mistake poisons the roadmap. So:

| Part | Interface | Why |
|---|---|---|
| Goal, motivation, timeline | Conversational, free text (voice on mobile) | This is where people need room to say something human |
| Income, pay cycle, essentials, debts, savings | Structured fields, native number input | Fast, unambiguous, no extraction risk |

The conversation wraps the numbers, so it still *reads* as one continuous conversation.

#### The flow

1. **Welcome** — the core line from §0, one button. Nothing else.
2. **The anchor question** — *"What do you want your life to look like in 3 years?"* Free text.
   No character limit, no placeholder examples that narrow the answer.
3. **Two or three adaptive follow-ups** — the model picks each next question from a **fixed bank**
   (never invents one), based on what is still unknown. It reflects back what it heard first:
   *"A house, and time with your kids. Got it."*
4. **The numbers** — one screen, structured: take-home pay, pay cycle, essential costs, debts
   (amount / rate / minimum), current savings.
5. **Confirm** — a plain-language summary of what we understood, in their words, editable.
6. **Reveal** — straight into the roadmap (§1.2). No "success!" interstitial.

#### Data contract

Produces a `ZendaProfile` — extend the old `FreedomProfile` (reuse the schema, do not rewrite it):

```
goal:      { text, why (their verbatim words), targetDate?, amount? }
money:     { takeHome, payCycle, essentials, savings, debts[] }
context:   { orgId, riskComfort, confidence (self-rated 1-5) }
meta:      { completedAt, source: "chat" | "fallback-form", confidence: "high" | "low" }
```

`goal.why` in their **verbatim words** matters — module 3 quotes it back later, and a paraphrase
loses the emotional charge. Store the raw string.

The self-rated confidence score is the baseline for the HR aggregate in §2. Capture it here or we
can never show movement.

#### Deterministic vs model

| Rules engine | Model |
|---|---|
| Validates ranges, flags impossible inputs | Picks the next question from the bank |
| Computes surplus | Extracts structured fields from free text |
| Decides when the profile is complete enough | Writes the reflection and confirmation lines |

Extraction uses `client.messages.parse` with the Zod schema. Never free-form JSON parsing.

#### Failure modes — each needs a designed answer

| Case | Behaviour |
|---|---|
| **Zero or negative surplus** | Very common, and must never be a dead end. The roadmap becomes a *stabilise* path — the first milestone is finding $20 a fortnight, not saving $500. |
| **Vague goal** ("be rich", "not worry") | One follow-up asking for the concrete version. If still vague, default to the buffer goal and let them rename it later. |
| **Refuses to share numbers** | Allow ranges and skips. Produce a low-confidence roadmap with a visible "add your numbers to sharpen this" prompt. Never block. |
| **Model unavailable or slow** | Fall through to the deterministic 6-question form. **Onboarding never hard-fails.** |
| **Abandons midway** | Persist after every step. Resume exactly where they left off, on either platform. |

#### Web and app

- Mobile: native numeric keypads, voice input on the anchor question, one question per screen.
- Web: same steps, more room — but resist showing all fields at once. Same pacing.
- Progress persists server-side against the account, so someone can start on web and finish on the
  phone.

#### The very first milestone — the most important number in the product

The first thing we suggest sets whether the person comes back. **Default: the first $500 buffer**
(the *Breathing Room* fund).

- **Reachable in one or two pay cycles.** The first milestone must be *hit*, not admired. A house
  deposit is the goal; it is a terrible first milestone, because nothing happens for years.
- **It works for everyone**, so the generator does not have to be clever on day one.
- **It is the honest answer** — a small cash buffer is the highest-impact first move in personal
  finance, and it attacks the exact thing we sell against: anxiety.
- **It closes the loop fast** — one milestone, one pay cycle, one celebration.

Always framed against their stated *why*:

> *"Before Japan, let us get you $500 of breathing room. At $60 a fortnight, that is
> **five paychecks**. Your first one lands Friday."*

Scale the amount to their surplus rather than fixing it at $500 — the rule is *reachable in roughly
two pay cycles*, so a small surplus gets a smaller first milestone, never a longer wait. The rules
engine computes amount and date; the model writes the sentence. (Confirm or override — open
question 6.)

#### Done when

- [ ] Median completion under 2 minutes, measured
- [ ] Extraction accuracy verified against the fixture profiles, in `evals/`
- [ ] The fallback form produces a valid profile with the model switched off
- [ ] Abandon-and-resume works across web to app
- [ ] Zero-surplus and refused-numbers paths both produce a usable roadmap

---

### 1.2 · Module 2 — Your roadmap

**Purpose.** One screen that shows the path from today to the goal. This is the product; everything
else serves it.

#### The object

One `Roadmap`: an ordered list of milestones from today to the goal.

```
Roadmap {
  goal:       { title (their words), targetDate, amount }
  milestones: Milestone[]        // ordered, first is always ~2 pay cycles away
  todayIndex: number             // where they are now
  generatedAt, confidence
}
Milestone {
  id, title, amount, targetDate,
  why:    string                 // plain language, always present
  state:  "done" | "current" | "upcoming"
  action: string                 // the one thing to do
}
```

**One canonical object, two renderers.** Web and app render the same `Roadmap` — never a
platform-specific variant, never a field only one client uses.

#### The screen

A **path, not a chart**. Their goal sits at the far end with their own words on it. Milestones sit
along the way. A "today" marker moves as they progress.

- **Mobile:** vertical scroll, the path running upward. Thumb-reachable.
- **Web:** the same sequence with more room to breathe; the WebGL treatment (§5) belongs on the
  *marketing* page, not here. **The in-app roadmap stays quiet** — it is looked at hundreds of
  times, and spectacle does not survive repetition.

Reuse the deterministic layout algorithm from the old project (`packages/core/src/layout`) so both
clients compute identical positions from the same data.

#### Interactions — there are only three

1. **Tap a milestone** → a detail sheet: the number, the *why*, the one action.
2. **"What if?"** → a single slider (how much per pay cycle). The path visibly shortens or
   lengthens as it moves, and the goal date updates live. Recompute locally — no round trip.
3. **Edit my numbers** → back into the module 1 fields, then regenerate.

No tabs. No dashboard. No secondary navigation.

#### Deterministic vs model

| Rules engine | Model |
|---|---|
| Every amount, every date, the ordering, the layout positions, what-if recomputation | Each milestone's title and `why`, in the person's own language |

Same profile in means same milestones out. The roadmap must be reproducible and explainable — that
is what makes it defensible when someone asks how a number was produced.

#### The hardest moment: an out-of-reach goal

Someone wants a $150k deposit in three years on a $60/fortnight surplus. This is common, and it is
the moment the product either earns trust or loses it.

- **Never say "impossible".** Never silently substitute a different goal.
- **Show the honest nearest version, and the lever:**
  > *"At $60 a fortnight, Japan is 6 years away. At $95, it is 3. Want to see what changes that?"*
- Keep their goal on the path, at its true distance. The distance itself is the honest information.

Write this copy carefully and get it reviewed. It is the single highest-stakes sentence in the app.

#### Regeneration without losing progress

When the profile changes, the roadmap recomputes. Completed milestones must survive.

- Recompute produces a new roadmap; **merge** completed state onto it by milestone id.
- If a completed milestone no longer exists, keep it as history — never delete evidence of progress.
- The old project's pattern applies: show the roadmap instantly from the rules engine, swap in the
  model's language when it arrives, and if the person has already interacted, ask before swapping.

#### Done when

- [ ] The full roadmap renders from the rules engine with the model switched off
- [ ] Web and app produce identical layout data for the same profile
- [ ] Every milestone has a non-empty `why` — enforced by schema, tested
- [ ] What-if recomputes locally, under 16ms
- [ ] Regeneration never loses a completed milestone — tested
- [ ] The out-of-reach-goal copy is reviewed and signed off

---

### 1.3 · Module 3 — Progress: the tracking layer

**Purpose.** Bring people back, and make progress *felt*. This is **a layer over the roadmap, not
a separate section** — there is no "progress screen" to navigate to.

Four parts: the check-in, the state advance, the notification layer, and the progress line.

#### a) The check-in — the only recurring input

Once per pay cycle, one question:

> **"Did you put $60 aside?"** → **Yes** · **Partly** · **Not this time**

That is the entire recurring interaction. It takes one tap, it needs no bank connection, and it is
what makes the whole system work without integration. *(Bank/payroll detection is the eventual end
state — see the cut list. Design the interface so it can slot in without a redesign.)*

**"Partly" matters.** Without it, people who saved $40 of $60 answer "no" and feel like failures.
Partial credit keeps them honest and keeps them here.

#### b) The state advance — deterministic

On check-in, the rules engine recomputes: amount saved, milestone state, today-marker position,
streak count, and whether a milestone has been reached. Pure function, fully tested. The model is
not involved.

#### c) The notification layer — where products like this die

Both the in-app pop-ups and the push notifications come from **one decision function** in
`packages/core`:

```
decideNotifications(state, history, prefs, now) -> NotificationDecision[]
```

Deterministic, testable, platform-agnostic. Web and app are just different transports for the same
decision. **Never scatter notification logic into either client.**

**The events worth interrupting someone for:**

| Event | Channel | Copy carries |
|---|---|---|
| Pay cycle landed — time to check in | Push | The amount, and the milestone it feeds |
| Milestone reached | In-app celebration + push | The milestone, and how much closer to the goal |
| Streak at risk (check-in missed by 2 days) | Push, **once** | An invitation, never a scold |
| Weekly progress line | Push, opt-in | One number about them |

**Hard rules — put these in the code, not just the design doc:**

- **Maximum 3 push notifications per week.** Enforced in `decideNotifications`, not by convention.
- **Every notification contains a number about them.** No "Don't forget to check in!" — that is
  the noise that gets an app muted, then deleted.
- Quiet hours, respected by default. Never before 8am or after 8pm local.
- Every category individually switchable, reachable in two taps.
- A missed check-in triggers **one** nudge. Never a second.
- Nothing fires until the person has completed a first check-in.

**On the celebration.** A milestone hit is the one place the product is allowed to be loud — the
blue-to-purple gradient (§4b), motion, the model's line in their own words:
*"Boom. $500 of breathing room. Japan just moved 8% closer."* It should feel disproportionate. It
is the payoff for everything else being quiet.

**On the broken streak.** The most dangerous screen in the app. It must read as an invitation back,
never as shame — *"Life happens. Your $340 is still there. Pick it up Friday?"* Cap the guilt at
zero. Shame is the fastest way to lose someone in this category, and the fastest way to lose the
enterprise contract behind them.

#### d) The progress line

Not a dashboard. One generated sentence, on the roadmap:

> *"Four check-ins in a row. You are 23% of the way to Japan."*

The rules engine computes the numbers; the model writes the sentence.

#### Web and app

| | Web | App |
|---|---|---|
| In-app pop-ups | Overlay / toast | Native sheet / overlay |
| Push | Web Push API + service worker | Expo Notifications to APNs / FCM |
| Scheduling | Server-side, one scheduler for both | same |

**The caveat that shapes the platform decision:** on iOS, Web Push only works for a web app the
person has added to their home screen. Since notifications are one third of this product, a
web-only MVP materially weakens it on the platform most employees carry. See §6b and open
question 7.

#### Done when

- [ ] `decideNotifications` is a pure function with full branch coverage
- [ ] The 3-per-week cap and quiet hours are enforced by tests, not by convention
- [ ] Check-in, state advance and notification work end to end on both platforms
- [ ] Every notification body contains a personal number — asserted in tests
- [ ] Missed check-in produces exactly one nudge
- [ ] The broken-streak and celebration copy are reviewed and signed off

---

## 2 · Data and privacy perimeter

This is a feature, not a compliance chore. It is also the single biggest adoption blocker, so it
must be visible in the product, on the landing page, and in onboarding.

- **Employee radical privacy.** Employers get zero access to individual banking data, debt levels
  or specific life goals. Enforced by row-level security, not by policy.
- **Employer ROI dashboard.** HR receives aggregated, anonymised macro-trends showing how usage
  has reduced collective financial anxiety and increased focus. A **minimum cohort size**
  (suggest 5) before any figure is rendered — below it, the dashboard says "not enough data yet",
  never a number.
- **The lifetime worker account.** The person owns their account. Changing jobs carries their
  streaks, goals and data with them — turning former employees into advocates at their next
  workplace. Design the data model for this from day one; it is very hard to retrofit.

---

## 3 · Claude Code setup

Define all of this in the project `CLAUDE.md`.

### Models

| Role | Model | ID |
|---|---|---|
| Orchestration, planning, architecture, review | **Fable** | `claude-fable-5` |
| Implementation tasks, tests, refactors | **Sonnet** | `claude-sonnet-5` |

Fable decomposes and reviews. Sonnet executes. Sonnet does not redesign — if a task is ambiguous
it comes back to Fable.

### Skills

Wanted explicitly:

- **superpowers** — install it, use it for the heavy multi-step work.

Also worth wiring up (already available in this environment):

| Skill | Use it for |
|---|---|
| `artifact-design` | Every visual deliverable — load it before writing any page |
| `design` | Multi-artboard canvas for screen flows and landing page mockups |
| `dataviz` | The HR dashboard and every chart. Load it **before** writing chart code |
| `artifact-diagramming` | Architecture and data-flow diagrams inside the plans |
| `claude-api` | Anything touching the Anthropic SDK — model IDs, structured outputs, caching |
| `code-review` | Before merging any phase |
| `security-review` | Mandatory before the first deploy — this app holds financial data |
| `run` | Launching the app to actually look at it |
| `graphify` | Mapping the codebase once it is big enough to get lost in |
| `init` | Generating the project `CLAUDE.md` |

Look for more useful skills as you go and propose them — do not install things speculatively.

### Working rules

- Small commits, conventional prefixes (`feat` / `fix` / `chore` / `docs` / `test` / `refactor`).
- `pnpm typecheck && pnpm test` must pass before any task is called done. Report the **real** result.
- No `any`. Types derived from Zod schemas.
- Shared logic lives in `packages/*`, never copied between apps.
- Never read or print `.env` files.

---

## 4 · Design — the bar is Awwwards Site of the Day

This is not decoration. The landing page is how we sell to companies, and a financial app that
looks generic loses the room in three seconds. **Design to the Awwwards judging criteria:**

| Criterion | Weight | What that means here |
|---|---|---|
| **Design** | 40% | Restraint. Type, spacing and hierarchy do the work. |
| **Usability** | 30% | Fast, obvious, keyboard-accessible, WCAG AA. Beauty that slows people down fails. |
| **Creativity** | 30% | One memorable idea, executed completely — the pathway coming alive. |
| **Content** | — | Every word earns its place. |

### Design research: use Mobbin

Before designing any screen, pull real references from **Mobbin** into `docs/references/`, each
with a note on *what specifically* we are taking from it. Flows to study:

| Screen we are building | Mobbin flows to study |
|---|---|
| Conversational onboarding | Chat-based onboarding and fintech first-run (Cleo, Copilot, Monzo, Revolut) |
| The pathway view | Goal and progress screens (Nudge, Origin, Monarch, Strava goal UI) |
| Streaks and celebrations | Duolingo streaks, Apple Fitness rings, Robinhood milestone moments |
| Check-in + notifications | Duolingo streaks and nudge copy, Gentler Streak’s shame-free tone |
| "What if?" interaction | Interactive calculators, live-recalculation patterns |
| HR dashboard | B2B analytics dashboards (Linear, Vanta, Lattice, Culture Amp) |
| Empty and first-run states | The most-skipped, most-noticed screens |
| Company admin / seats | B2B settings and invite flows |

Rule: **steal structure, not style.** The flow logic comes from Mobbin; the surface is ours.

### Visual language — clean like Apple

- **Colour.** White, purple and blue, drawn from Apple's system palette. Full spec in §4b — read
  it before writing a single colour value.
- **Type.** One family, used at real weight and size contrast. Big, confident headlines; 60–75
  characters per line in body copy; tabular figures for every number.
- **Space.** An 8pt grid, and more whitespace than feels comfortable. Whitespace is what reads as
  "expensive".
- **Depth.** Almost no borders. Separation comes from spacing and very soft shadows.
- **Radius.** One radius scale, applied consistently. No mixed corner languages.
- **Words.** Short. Direct. Plain. Say "You will be debt-free in 4 years", never "Based on your
  current repayment trajectory…".

All of it lives in `packages/tokens` as real tokens. Nothing hard-coded in components.

### Motion system

- Entrances 200–400ms. Micro-interactions 120–180ms.
- Easing: a custom cubic-bézier for entrances (`cubic-bezier(0.16, 1, 0.3, 1)`), never `linear`,
  and never bounce on anything financial. Celebrations are the one licensed exception.
- Stagger lists by 40–60ms. Choreograph — things arrive in reading order.
- Numbers count up when they change, and only when they change.
- **`prefers-reduced-motion` is honoured everywhere.** With motion off, the app still tells the
  whole story.

---

## 4b · Colour — white, purple and blue, in Apple's language

**White ground. Purple and blue as the accent pair. Indigo as the hero.**

### How Apple actually does colour (and what we copy)

Apple does **not** publish guaranteed hex values. It publishes *named, adaptive, semantic* tokens
— `systemBlue`, `label`, `separator` — that shift automatically for light mode, dark mode,
increased contrast and vibrancy. The hex values below are community-measured from iOS and can
differ between OS versions.

So we copy the **method**, not just the numbers: every colour in `packages/tokens` is named by its
**role** (`--accent`, `--surface`, `--label-secondary`), never by its appearance (`--purple-500`).
Components reference roles only. This is what lets the whole app re-theme correctly.

### The palette

**Ground — white and Apple's gray ramp.** Apple's light ground is pure `#FFFFFF` with `#F2F2F7`
(`systemGray6`) as the recessed surface. Use that pairing, not an off-white. (This replaces the
earlier warm `#FAFAF8` suggestion — a warm ground fights the cool purple/blue accents.)

| Role | Light | Dark | Apple name |
|---|---|---|---|
| `--surface` | `#FFFFFF` | `#000000` | systemBackground |
| `--surface-raised` | `#FFFFFF` | `#1C1C1E` | secondary / elevated |
| `--surface-sunken` | `#F2F2F7` | `#1C1C1E` | systemGray6 |
| `--label` | `#000000` | `#FFFFFF` | label |
| `--label-secondary` | `#3C3C43` @ 60% | `#EBEBF5` @ 60% | secondaryLabel |
| `--separator` | `#3C3C43` @ 29% | `#545458` @ 65% | separator |
| `--label-tertiary` | `#8E8E93` | `#8E8E93` | systemGray |

**Accents — blue, indigo, purple.** These three are adjacent on Apple's wheel, which is why the
pairing reads as *one* considered family rather than two colours fighting:

| Apple name | Light | Dark |
|---|---|---|
| systemBlue | `#007AFF` | `#0A84FF` |
| **systemIndigo** | `#5856D6` | `#5E5CE6` |
| systemPurple | `#AF52DE` | `#BF5AF2` |

### The accessibility finding — this drives the whole token design

The brief requires WCAG AA. I measured every candidate against our grounds:

| Colour | on `#FFFFFF` | on `#F2F2F7` | on `#1C1C1E` |
|---|---|---|---|
| systemBlue `#007AFF` | **4.02** ✗ | **3.60** ✗ | 4.24 |
| systemPurple `#AF52DE` | **4.13** ✗ | **3.70** ✗ | 4.12 |
| systemIndigo `#5856D6` | **5.65** ✓ | **5.06** ✓ | 3.36 ✗ |
| systemBlue dark `#0A84FF` | 3.65 ✗ | 3.27 ✗ | **4.66** ✓ |
| systemPurple dark `#BF5AF2` | 3.52 ✗ | 3.16 ✗ | **4.83** ✓ |
| systemIndigo dark `#5E5CE6` | 5.06 | 4.54 | **3.36** ✗ |

*(AA needs 4.5:1 for normal text; 3:1 for large text ≥24px, bold ≥18.5px, and UI components.)*

Two conclusions, both non-obvious:

1. **Apple's systemBlue and systemPurple fail AA for body text on white.** They are tuned for
   buttons, icons, fills and large text — where 3:1 is the bar — not for small type. Using
   `#007AFF` for a 14px link is the single most common way to fail an audit while looking Apple-ish.
2. **The pass/fail flips between themes.** Indigo passes on white and fails on dark; blue and
   purple do the reverse. **A single hex per accent is therefore impossible.** Every accent token
   must be defined twice, per theme. This is exactly why Apple ships adaptive colours rather than
   hex codes.

### The tokens to actually ship

**Indigo `#5856D6` is the hero accent.** It sits precisely between blue and purple — so it *is*
"purple and blue" — and it is the only one of the three that carries body text on white.

| Token | Light | Dark | Use for |
|---|---|---|---|
| `--accent` | `#5856D6` | `#7D7BEF` | Primary buttons, active states, focus rings, progress |
| `--accent-text` | `#5856D6` (5.65) | `#8E8CF0` (5.80) | Links and any text under 24px |
| `--accent-blue` | `#007AFF` | `#0A84FF` | Large text, icons, fills, chart series |
| `--accent-purple` | `#AF52DE` | `#BF5AF2` | Large text, icons, fills, celebrations |
| `--accent-grad` | `#007AFF` → `#AF52DE` | `#0A84FF` → `#BF5AF2` | Hero, milestone moments, the WebGL path ramp |

Text-safe darkened variants, if a design needs blue or purple *as small text* on white — measured,
not guessed:

| Token | Hex | on white |
|---|---|---|
| `--blue-text` | `#0057D9` | 6.24 ✓ |
| `--purple-text` | `#8B33C7` | 6.18 ✓ |

### Semantic colour

Colour carries meaning only where meaning exists. Everything else is ink on white.

| Meaning | Colour |
|---|---|
| **Freedom / the goal** | `--accent-purple` — the destination, always the warmest point |
| **Progress / momentum** | `--accent` indigo — streaks, bars, the path already walked |
| **Money in / saving** | `--accent-blue` |
| **Debt** | Apple `systemRed` `#FF3B30` / `#FF453A` — used sparingly. Debt is a fact, not an alarm; never make someone's screen bleed red. |

### The gradient — one journey, six stops

The journey ramp is **deep navy → rich blue → luminous blue → indigo → blue-violet → purple**
(`#10265F → #0057D9 → #007AFF → #5856D6 → #8450DA → #AF52DE`). Deep navy is today, underfoot;
luminous blue is momentum; purple is freedom. Transitions along it are always continuous — never
a theme swap (see `ZENDA_DESIGN.md` §5.11, the continuity law). It appears on the WebGL path ramp
and atmosphere (§5), the hero, and milestone celebrations. Nowhere else. A gradient used
everywhere is a gradient that means nothing. *(Revised from the original three-stop blue→purple
after the first prototype review — a continuous journey needs room to evolve.)*

### Rules

- Never a colour whose only definition lives inside a media query — define the full light palette
  on `:root`, then override tokens under dark.
- Never a raw hex in a component. Roles only.
- Both accent hexes come from the token file, so a theme swap can never strand a colour.
- Ship an automated contrast check over the token pairs in CI. The table above is the fixture.
- Support `prefers-contrast: more` by swapping to the darkened text variants.

---

## 5 · The landing page — Three.js + WebGL

**The idea: the pathway itself, alive.** The same pathway metaphor the product is built on,
rendered as a 3D scene — a flowing line running from "where you are today" out toward "financial
freedom", with milestones as light nodes along it. The visitor scrolls, the camera travels the
path, and the story tells itself.

This is the one memorable idea. Execute it completely, and keep it as the *only* piece of
spectacle in the whole product — the app itself stays quiet.

**Technical spec:**

- **Three.js** + **React Three Fiber** + **drei**, with `@react-three/postprocessing` for a
  restrained bloom. Subtle — bloom is where these pages go tacky.
- **Custom GLSL shaders.** A vertex-displaced ribbon or point field driven by smooth noise, with
  colour ramped along the path from "now" to "free". Write the shader; do not lean on a preset.
  **The ramp is `--accent-grad` from §4b** — systemBlue at the near end (today) through indigo to
  systemPurple at the far end (freedom). Feed the shader the same token values the UI uses; do not
  hand-pick prettier ones in GLSL. Interpolate in linear space, not sRGB, or the midpoint goes muddy.
- **GPU instancing / `BufferGeometry`** for particles. One draw call where possible.
- **Scroll-driven camera.** Scroll position drives a single normalised `progress` uniform, and
  everything — camera, colour ramp, node reveal — is a function of it. Lerp it; never snap.
- **Pointer parallax**, damped, a few degrees at most. Restraint.
- Optional, and only if it stays fast: **GPGPU flow-field particles** for the "money moving" beat.

**Performance budget — non-negotiable:**

| Metric | Budget |
|---|---|
| Desktop frame rate | 60fps |
| Mobile | 30fps or better, otherwise the static fallback |
| WebGL bundle | Under 300KB gzipped, lazy-loaded, never blocking first paint |
| LCP | Under 2.5s |
| Lighthouse Performance | 90+ **with the scene running** |

**Fallbacks — build these at the same time, not afterwards:**

- `prefers-reduced-motion` → a static, beautiful poster frame of the same scene.
- No WebGL or a low-end device → the poster frame. Detect it; do not crash.
- Mobile → fewer particles, postprocessing off, or the poster.
- With JavaScript disabled the page still makes sense: real HTML, real text, real headings. The
  WebGL layer is an enhancement on top of a page that already sells.

**Landing page structure:**

1. **Hero** — the scene, plus the core line from §0:
   > **Your paycheck is the engine for your financial freedom.**
   *(Revised — see ZENDA_DESIGN.md §5.12: the landing hero now leads with the first step, not
   the whole thesis.)* Headline **"Discover your path to financial freedom."**, the sub-copy
   ("Financial advice is everywhere. Personal direction isn't. …"), the three-circle module row
   (🔍 DISCOVER ─ 🗺 ROADMAP ─ 📊 PROGRESS), and two CTAs: **"Start your journey 🚀"** +
   **"See Vinay's journey"** (demo persona). The core line above stays the brand spine for the
   app welcome screen and the sales deck.
2. The problem — money stress at work, in numbers, with sources.
3. How it works — three steps, scroll-choreographed.
4. The employee view — real product UI, in motion.
5. **The buyer slide, as a section** — "We turn your payroll into your strongest retention tool."
   The HR dashboard, and the privacy promise stated plainly next to it.
6. Proof — outcomes, pilot results, or a named case once we have one.
7. CTA — book a demo.

**The scene and the words are the same idea.** The pathway running from "today" to "freedom" *is*
the paycheck-as-engine line, drawn. If the visual ever stops meaning that, cut the visual — the
line is what sells.

---

## 6 · Architecture and modules

Follows the rules in §4. Details go in `ZENDA_ARCHITECTURE.md`.

### Stack

pnpm workspaces + Turborepo · TypeScript strict · Zod · Vitest · Playwright
**Web:** Next.js App Router · Tailwind v4 · Framer Motion · TanStack Query · Zustand · React Three Fiber
**App:** Expo + Expo Router · NativeWind · Reanimated · Expo Notifications
**Backend:** Next.js route handlers · **Supabase** (Postgres + Auth + RLS)
**AI:** Claude via `@anthropic-ai/sdk` — streaming for onboarding, structured outputs,
`cache_control` on system prompts, server-only

### Packages

| Package | Holds |
|---|---|
| `packages/core` | Zod schemas, the **rules engine** (all arithmetic), roadmap generator, streak + check-in state, `decideNotifications`, layout |
| `packages/ai` | Onboarding conversation, milestone language, celebration + progress lines, output validation |
| `packages/tokens` | Colour, type, spacing and motion tokens |
| `packages/api-client` | Typed fetch + TanStack Query hooks, shared by web and app |
| `apps/web` | The web app, the API routes, and the landing page |
| `apps/mobile` | The Expo app — same three modules, same packages |

### 6b · One product, two platforms — without doubling the work

The old project already has the answer baked into its structure: **everything that can be shared
lives in `packages/*` as pure TypeScript, and the two apps are thin renderers.**

| Layer | Where it lives | Web | App |
|---|---|---|---|
| Schemas, rules, roadmap, notification decisions | `packages/core` | shared | shared |
| AI calls | server only, behind the API | shared | shared |
| Data fetching + caching | `packages/api-client` | shared | shared |
| Design tokens | `packages/tokens` | shared | shared |
| Screens and navigation | each app | Next.js | Expo Router |
| Push transport | each app | Web Push + service worker | Expo Notifications → APNs / FCM |

Rules:

- **The share line is drawn at rendering.** If a file contains no JSX, it belongs in a package.
  If two screens differ only in styling, the logic above them is shared.
- One API, consumed identically by both clients through `packages/api-client`. The server does not
  know which platform is calling.
- The three module "done when" lists apply to **both** platforms — a module is not done when it
  works on web.
- **Build order per module: core → API → web → app.** Web first because iteration is faster; the
  app follows within the same phase, never as a "later port".
- The landing page (§5) is web-only. The WebGL scene never ships in the app bundle.

**The sequencing decision (open question 7):** ship both simultaneously, or web + installable PWA
first with the Expo app one phase behind? The PWA route is faster to demo but weakens
notifications on iOS (§1.3). Recommend: **web + PWA for the pilot, Expo app in the next phase** —
but this is a call for you, not the build agent.

### Multi-tenancy — the part that is genuinely new

This is what makes Zenda a different product rather than a reskin of the previous project. Get it
right first, before any UI.

- `organisations` → `members` (role: `admin` | `employee`) → `profiles` → `plans` → `streaks`
- **Row-level security on every table.** An employee reads only their own rows. An org admin reads
  **zero** individual financial rows — only the aggregate view.
- Aggregates come from a separate view enforcing the minimum cohort size.
- Invite flow: admin invites by email → magic link → the account belongs to the person.
- **Lifetime worker account:** the person is the root entity; org membership is a joinable,
  leavable edge. Never key financial data to the organisation.
- Count seats for billing, but do not build payments in the MVP.

### One canonical object

Keep the discipline from the previous project: **one** plan object, produced by the rules engine,
rendered by different views. No view-specific business logic. No view-only fields.

---

## 7 · MVP scope — build this, nothing more

The three modules, on both platforms, plus the thin shell around them:

1. Company sign-up → invite employees by email (the shell)
2. **Module 1** — getting to know you (§1.1)
3. **Module 2** — the roadmap, with its three interactions (§1.2)
4. **Module 3** — check-in, celebrations, notifications, the progress line (§1.3)
5. HR aggregate dashboard (§2) — the buyer's window, deliberately thin
6. The landing page (§5) — the sales weapon, web only

Everything else — including everything in the cut list — is a later phase and belongs in
`ZENDA_PLAN.md`, not the MVP.

---

## Reuse what already exists

`../hackathon_uqies` is the **Free Me** project — the same domain, built B2C. Read it before
planning. Reuse aggressively; it is a head start of several days.

**Read these first:**

- `../hackathon_uqies/CLAUDE.md` — the working rules; most transfer as-is
- `../hackathon_uqies/FREE_ME_CONCEPT.md` — product behaviour, screens, tone
- `../hackathon_uqies/FREE_ME_ARCHITECTURE.md` — data model, AI engine, API design
- `../hackathon_uqies/supabase/README.md` — schema and auth setup

**Reuse directly:** the rules engine, the Zod schemas, the banned-terms validator, the AI prompt
structure, the demo personas, the eval harness, the monorepo config.

**Build new:** everything multi-tenant (orgs, roles, RLS, aggregates), the conversational
onboarding, streaks, the HR dashboard, the whole design system, the landing page.

### Credentials — reuse the Supabase project and Claude token from the hackathon

The keys from `hackathon_uqies` are still valid. Reuse them instead of provisioning anything new:

```
cp ../hackathon_uqies/apps/web/.env.local  apps/web/.env.local
```

That brings across `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, all already working. Then:

- Reuse the **same Supabase project**. Add Zenda's tables in a new migration
  (`supabase/migrations/0002_zenda_orgs.sql`). Do not touch or drop the existing `sessions` and
  `plans` tables.
- `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **server-only**. Never import
  `@anthropic-ai/sdk` and never use a service-role key in a client component.
- `.env.local` stays gitignored. **Never read it, never print it, never paste a key into a plan, a
  commit, or a chat message.**
- `DEMO_MODE=true` runs the app from cached plans with no API calls — use it while building UI so
  we do not burn tokens on layout work.

---

## Definition of done

A phase is done when all of these are true:

- [ ] `pnpm typecheck && pnpm test` pass, and the real result is reported
- [ ] It works on a 375px-wide screen
- [ ] It works with `prefers-reduced-motion: reduce`
- [ ] It works in dark mode
- [ ] Keyboard-navigable, visible focus states, WCAG AA contrast — **verified by the automated
      token contrast check (§4b), not by eye**
- [ ] No raw hex values in components — roles only
- [ ] No individual financial data is reachable by an org admin — proven with a test
- [ ] Every number on screen traces back to the rules engine, not the model
- [ ] No banned term reaches a user — proven with a test
- [ ] It looks like something worth showing a room of HR buyers

---

## Open questions — answer before planning ends

1. Australia only for the MVP (super, HECS, Medicare)? The previous project assumed AU.
2. Paycheck detection: manual confirmation for the MVP, with Basiq / Open Banking later — or is
   the integration required to sell? *Manual is faster, cheaper and far easier to sell on privacy
   — recommend starting there.*
3. ~~Crypto as a named path~~ — resolved: the separate tracks are cut (see the out-of-scope
   list). One roadmap generator for everyone.
4. Pricing: per seat per month, or a flat platform fee?
5. Is there a pilot company lined up? A real design partner changes what we build first.
6. **The first milestone the AI suggests** (§1.1): confirm the *$500 breathing-room buffer, scaled
   to roughly two pay cycles* as the default, or name a different one. *Recommend confirming — it
   is the fastest first win, it works for every path, and it starts the streak on day one.*
7. **Platform sequencing** (§6b): web + installable PWA for the pilot with the Expo app one phase
   behind, or both simultaneously? *Recommend web + PWA first — faster to a sellable demo —
   accepting weaker iOS notifications until the app lands.*
