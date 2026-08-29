# ZENDA_DESIGN.md — design system, motion, and the landing scene

> Plan 2 of 5 (see new_app.md, Rule zero). Sections 1–4 are the design system; section 5 is the
> **landing page animation plan, written for review before any WebGL code is written**.
> The Components section (§3) is deliberately thin until `ZENDA_CONCEPT.md` freezes the screen
> inventory — components follow screens, not the other way around.

---

## 1 · Design tokens — the actual source

This is `packages/tokens/src/index.ts`, not a description of it. Values come from the measured
§4b palette in the brief (Apple system colours, contrast-checked). Every colour is a **role**;
every accent role carries a light and a dark value because the AA pass/fail flips between themes.

```ts
/**
 * Zenda design tokens — shared by web (Tailwind theme + CSS vars) and mobile (NativeWind).
 * White ground, indigo hero accent, blue→purple reserved for the journey gradient.
 *
 * Contrast ratios are measured (see brief §4b) and asserted in colors.test.ts:
 * accentText on surface ≥ 4.5 in both themes; accent on surface ≥ 3.0 in both themes.
 * Sources: Apple HIG system colours (community-measured iOS values).
 */

export const light = {
  // Ground
  surface: "#FFFFFF",          // systemBackground
  surfaceRaised: "#FFFFFF",    // cards — separation comes from shadow, not fill
  surfaceSunken: "#F2F2F7",    // systemGray6 — recessed areas, input wells
  // Ink
  label: "#000000",
  labelSecondary: "rgba(60,60,67,0.60)",   // secondaryLabel
  labelTertiary: "#8E8E93",                // systemGray — placeholders, disabled
  separator: "rgba(60,60,67,0.29)",
  // Accents — indigo is the hero; blue/purple are large-text/fill/gradient only
  accent: "#5856D6",           // systemIndigo — buttons, active, focus, progress (5.65:1)
  accentText: "#5856D6",       // links, small text
  accentBlue: "#007AFF",       // systemBlue — icons, fills, large text ≥24px (4.02:1)
  accentPurple: "#AF52DE",     // systemPurple — icons, fills, celebrations (4.13:1)
  blueText: "#0057D9",         // blue as small text (6.24:1)
  purpleText: "#8B33C7",       // purple as small text (6.18:1)
  // State
  danger: "#FF3B30",           // systemRed — debt facts, sparingly, never a wall of red
  success: "#34C759",          // systemGreen — reserved; progress uses accent, not green
} as const;

export const dark = {
  surface: "#000000",
  surfaceRaised: "#1C1C1E",
  surfaceSunken: "#1C1C1E",
  label: "#FFFFFF",
  labelSecondary: "rgba(235,235,245,0.60)",
  labelTertiary: "#8E8E93",
  separator: "rgba(84,84,88,0.65)",
  accent: "#7D7BEF",           // indigo lifted for dark (4.82:1 on #1C1C1E)
  accentText: "#8E8CF0",       // (5.80:1)
  accentBlue: "#0A84FF",
  accentPurple: "#BF5AF2",
  blueText: "#409CFF",
  purpleText: "#D08BF5",
  danger: "#FF453A",
  success: "#30D158",
} as const;

/** The journey gradient — six stops, one meaning: today → freedom. Deep navy is where you
 *  stand, underfoot; luminous blue is momentum; purple is the goal. Transitions along the path
 *  are continuous — never a theme swap (§5.11). Appears ONLY on: the landing scene's path +
 *  atmosphere, the hero, and milestone celebrations. Nowhere else.
 *  Stops: deepNavy · richBlue · luminousBlue · indigo · blueViolet · purple. */
export const journey = {
  light: ["#10265F", "#0057D9", "#007AFF", "#5856D6", "#8450DA", "#AF52DE"],
  dark:  ["#16307F", "#2B6FE8", "#0A84FF", "#5E5CE6", "#8E5CF0", "#BF5AF2"],
} as const;

/** Atmosphere tint for the landing scene only — fog + ground drift with journey progress,
 *  from cool navy-white toward violet-white. Subtle; the ground stays near-white (§5.11). */
export const atmosphere = {
  light: ["#F7F9FE", "#FAF7FE"],
  dark:  ["#0B1026", "#150F26"],
} as const;

/** One family. The system stack IS the Apple look on Apple devices, and it is free. */
export const fonts = {
  ui: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
  mono: '"SF Mono", ui-monospace, "JetBrains Mono", Consolas, monospace',
} as const;

/** Type scale — Apple-ish. Numbers always render with font-variant-numeric: tabular-nums. */
export const type = {
  display: { size: 56, weight: 700, tracking: -0.02, lineHeight: 1.05 }, // landing hero only
  title1:  { size: 34, weight: 700, tracking: -0.01, lineHeight: 1.15 },
  title2:  { size: 26, weight: 600, tracking: -0.01, lineHeight: 1.2 },
  headline:{ size: 17, weight: 600, tracking: 0, lineHeight: 1.3 },
  body:    { size: 17, weight: 400, tracking: 0, lineHeight: 1.45 },
  callout: { size: 15, weight: 400, tracking: 0, lineHeight: 1.4 },
  footnote:{ size: 13, weight: 400, tracking: 0, lineHeight: 1.4 },
  bigNumber:{ size: 44, weight: 700, tracking: -0.02, lineHeight: 1.0 }, // milestone amounts
} as const;

/** 8pt grid. Use these; never invent an 18px gap. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, page: 96 } as const;

/** One radius language. sm inputs/chips, md cards/sheets, lg modals, pill buttons. */
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

/** Motion. easeOut for entrances; never linear; bounce licensed only inside Celebration. */
export const motion = {
  micro: 150,        // hover, press, toggle
  enter: 300,        // element entrances
  slow: 450,         // sheet/page transitions, path drawing
  stagger: 50,       // list choreography, reading order
  ease: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
} as const;

/** Soft depth — no borders. Two elevations only. */
export const shadow = {
  card: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
  sheet: "0 8px 40px rgba(0,0,0,0.14)",
} as const;
```

**Enforcement:** `colors.test.ts` computes WCAG contrast for every (role, surface) pair in both
themes and fails CI below the thresholds in the comment. The measured table in brief §4b is the
fixture. Web exposes these as CSS variables on `:root` (light) overridden under
`@media (prefers-color-scheme: dark)` guarded with `:root:not([data-theme="light"])` and again
under `[data-theme="dark"]` — never a colour whose only definition lives in a media query.

---

## 2 · Usage rules (the short version — brief §4/§4b governs)

- Indigo `accent` is the only interactive colour. Blue and purple never appear on a button.
- The journey gradient appears in exactly three places (see token comment). A gradient used
  everywhere means nothing.
- Debt is a fact, not an alarm: `danger` on the number or icon, never on a whole surface.
- Whitespace over dividers; `separator` only where spacing genuinely cannot do the job.
- Every number: tabular figures. Every count-up: only when the value actually changed.
- `prefers-reduced-motion`: all `motion.*` durations drop to 0 except opacity fades ≤150ms.

---

## 3 · Components (inventory only — expanded after ZENDA_CONCEPT.md freezes screens)

The three modules need roughly twelve components. Each will get a full state spec
(default / hover / focus / pressed / disabled / loading / error / empty) once screens are frozen:

`Button` (primary / quiet / destructive) · `NumberField` · `ChatBubble` + `TypingIndicator` ·
`GoalCard` · `RoadmapPath` (the renderer of `layoutRoadmap`) · `MilestoneNode` ·
`MilestoneSheet` · `WhatIfSlider` · `CheckInPrompt` (Yes / Partly / Not this time) ·
`Celebration` (full-screen, the one loud moment) · `ProgressLine` · `Toast/Nudge`.

Rule carried from the brief: `RoadmapPath` draws from `layoutRoadmap` output identically on both
platforms — same data, two densities.

---

## 4 · Motion map (app)

| Moment | Animation | Duration | Reduced motion |
|---|---|---|---|
| Onboarding question → next | Slide up + fade, `ease` | 300ms | Cross-fade 150ms |
| Roadmap first reveal | Path draws from "today" toward goal; nodes pop in stagger | 450ms + 50ms/node | Path appears drawn; no draw-on |
| What-if slider drag | Path length + dates interpolate live | continuous, ≤16ms/frame | Values snap, no interpolation |
| Check-in tap | Button fills; today-marker advances | 300ms | Marker moves instantly |
| Milestone celebration | Full-screen: gradient wash, number count-up, node ignition | 1200ms total | Static congratulation card |
| Nudge/toast in | Slide + fade from top | 300ms | Fade only |

---

## 5 · The landing scene — animation plan for review

**This section is still the storyboard to approve, change, or reject — decisions A–E (§5.10) are
still open.** A working single-file prototype now exists at
[`demo/zenda-path.html`](demo/zenda-path.html), built to prove the technique before committing to
it in the real stack. It embodies decisions A (white scene), C (five nodes) and D (poster at
`t ≈ 0.05`) as a testable draft, not as a decision already made on your behalf. See
[`ZENDA_MOTION_DEMO.md`](ZENDA_MOTION_DEMO.md) for exactly what was built, the exact `t`-driven
envelopes behind every effect, and the deltas between this plan and the prototype.

### 5.1 The concept — "the path, alive"

One continuous 3D scene behind the whole landing page: a luminous ribbon — **the paycheck-to-
freedom path** — flowing from the viewer's feet at the bottom of the screen toward a point of
purple light on the horizon. Milestones are five nodes of light along it. Fine particles stream
along the ribbon: the paychecks, moving. The visitor's scroll *is* the journey — the camera
travels the path from "today" to "freedom" while the seven page sections tell the story in HTML
beside it.

One idea, executed completely. Nothing else in the product moves like this.

### 5.2 The bold choice to approve first: a WHITE scene

Every award-site WebGL hero is dark. Ours is **on the white ground** — a near-white world with
fine ink-and-indigo linework, saturated blue→purple only on the path itself. It matches the brand
(§4b), it is distinctive precisely because dark is the cliché, and it makes the landing page feel
continuous with the product instead of like a trailer for a different app.

Costs of the choice: bloom does not work on white (fine — restraint was the plan; dark mode keeps
a subtle bloom), and the path must earn its glow through saturation and contrast, not post-fx.

**→ Decision A: white scene (recommended) or classic dark hero?**

### 5.3 The storyboard — scroll position → what happens

Scroll progress `t` runs 0→1 across the page. Everything — camera, colours, node states — is a
pure function of `t` (damped). Sections are HTML overlaying the canvas.

| # | `t` | Section (HTML) | Scene beat |
|---|---|---|---|
| 1 | 0.00–0.12 | **Hero** — "Discover your path to financial freedom." + sub-copy + the three-circle module row (🔍 DISCOVER ─ 🗺 ROADMAP ─ 📊 PROGRESS, HTML badges) + two CTAs: "Start your journey 🚀" · "See Vinuy's journey" (all of it fades out by t ≈ 0.12) | **Stairs, then the journey (autonomous intro, no scroll needed):** the path now *begins* as a flight of three broad stairs rising to its start, tinted with the ramp's first stops; the ribbon draws itself on from the top step toward the horizon; the first node ignites; the camera glides along the *same* rail. On scroll the stairs **dissolve** (noise dissolve with a luminous edge, `t` 0.05–0.13) into the particle stream already flowing through them — the journey continues *from* them, never *after* them (§5.11, §5.12). |
| 2 | 0.12–0.28 | **The problem** — money stress at work, in numbers | Camera lifts a little. The path ahead desaturates toward grey; some particles fall away from the ribbon and fade — money leaking. The quietest beat on the page. |
| 3 | 0.28–0.45 | **How it works** — three steps | Camera travels forward. Three nodes ignite in sequence, one per step as it scrolls into view: conversation (blue) → roadmap (indigo) → check-in (indigo). Stray particles rejoin the stream. |
| 4 | 0.45–0.62 | **The employee view** — product UI | Camera swings to a ¾ side view. A device frame with the real roadmap screen docks into the empty half of the viewport. The ribbon ahead brightens through indigo. |
| 5 | 0.62–0.78 | **The HR view** — dashboard + privacy promise | Camera pulls high overhead. Around the hero path, ~40 faint parallel paths fade in — the rest of the organisation — deliberately dim, dashed, unreadable as individuals, readable only as a flow. One aggregate glow. **The privacy promise, drawn:** the copy beside it says "You see the current, never the swimmer." |
| 6 | 0.78–0.92 | **Proof** — outcomes / pilot results | The parallel paths converge toward the horizon point; purple intensity rises. |
| 7 | 0.92–1.00 | **CTA** — book a demo | Camera arrives at the final node: the goal, full `accentPurple`, particles in slow orbit around it. The one loud moment of the page. CTA button sits directly beneath the glow. |

Beat 5 is the storyboard's biggest idea: the **privacy promise as a picture** — individual paths
visibly anonymous, only the aggregate legible. It sells the hardest slide in the deck without a
single chart.

**→ Decision B: approve the seven beats? In particular beat 2 (particles falling away) and
beat 5 (the anonymous-paths idea).**

### 5.4 What is actually on screen (element inventory)

| Element | Count | Implementation | Draw calls |
|---|---|---|---|
| The ribbon | 1 | Custom `BufferGeometry` strip along a `CatmullRomCurve3`; custom shader with intro reveal front | 1 |
| Milestone nodes | 5 | One `Points` buffer, radial-glow fragment shader, per-node damped `lit` | 1 |
| Emblems: suitcase · bullseye + arrow | 2 | Canvas-textured sprites in world coordinates, revealed during the intro, then receding naturally with the ride (§5.11) | 2 |
| Paycheck particles | 7k desktop / 3k mobile | One `Points` buffer; flow computed in the vertex shader from a baked path texture + per-particle offset (no CPU updates, no GPGPU needed) | 1 |
| Org paths (beat 5) | ~40 | One dashed-line buffer, opacity + convergence by `t` | 1 |
| Ground dot grid | 1 | One shader-drawn plane, fog-faded — the parallax cue | 1 |
| Goal glow | 1 | Sprite with canvas radial-gradient texture | 1 |

**Eight draw calls total.** No shadows, no lights — all colour comes from the shaders.

### 5.5 The shaders (the part we write, not preset)

- **Ribbon vertex:** position along curve + 2-octave simplex noise displacement, amplitude ~0.15
  world units, drifting with time — the path is alive but never wobbly. Width tapers with distance.
- **Ribbon fragment:** the `journey` gradient sampled by distance-along-path, **interpolated in
  linear space** (sRGB-mix goes muddy in the middle — brief §5). Soft fresnel edge fade so the
  ribbon has no hard silhouette against white.
- **Particles:** round soft sprite in the fragment shader; alpha by camera distance; velocity is
  the curve tangent, so flow direction is free. Beat 2's "falling away" is a per-particle scatter
  factor blended in by a `u_scatter` uniform driven by `t`.
- **Nodes:** radial gradient + subtle pulse (sin of time, ±6% scale). `lit` crossfades dim→full
  colour over 300ms when its threshold of `t` is crossed.
- All shader colour uniforms are fed **from `packages/tokens`** at mount — never hand-picked in
  GLSL (brief §5).

### 5.6 Camera and input

- Camera positions sampled from a hand-placed **camera rail** (`CatmullRomCurve3`), look-at from a
  second rail. Placing the rails is design work, done in a debug fly-mode first.
- Scroll → target `t`; rendered `t` chases it: `t += (target − t) · min(1, 4·dt)`. Never snaps.
- Pointer parallax: ±2° max, damped quaternion, disabled on touch devices.
- Section HTML is normal document flow; the canvas is `position: fixed` behind it. Copy remains
  selectable, indexable, accessible — the page reads perfectly with the canvas deleted.

### 5.7 Performance plan (budgets from brief §5 — non-negotiable)

| Budget | How it is met |
|---|---|
| 60fps desktop / 30fps+ mobile | 5 draw calls; zero per-frame CPU geometry work; DPR clamped at 1.75 |
| WebGL ≤ 300KB gz | three (~145KB tree-shaken) + R3F/drei used sparingly (~40KB) + scene code (~20KB); postprocessing only in dark mode, dynamically imported (~30KB) |
| Never blocks first paint | Scene is `dynamic(() => import(...))` after load + idle; until then the **poster** shows |
| LCP < 2.5s | The poster (a WebP `<img>`, preloaded) IS the LCP element; the canvas cross-fades over it when ready |
| Lighthouse ≥ 90 with scene running | Measured in CI with Lighthouse against the built page |

Runtime downgrade ladder: full → no dark-bloom → 3k particles → poster. Triggered by two dropped-
frame windows (rolling 2s < 45fps desktop / < 24fps mobile), one step at a time, never back up.

### 5.8 Fallbacks (built simultaneously, per the brief)

| Condition | Experience |
|---|---|
| `prefers-reduced-motion` | The poster frame, full stop. Page content fades normally. |
| No WebGL / WebGL1-only | Poster. Detected before import — the bundle never downloads. |
| Low-end device (deviceMemory ≤ 4 or GPU blocklist) | Poster, or 3k-particle mode on borderline devices. |
| JS disabled | Real HTML, real headings, the poster as a plain `<img>` — the page still sells. |

**The poster** is a real render of the scene at `t ≈ 0.05` (hero framing), exported once at
2560/1280/640 widths as WebP. Not a screenshot of a broken thing — the best single frame we have.

### 5.9 Build order (so review happens on the cheap parts first)

1. Grey-box: curve + flat ribbon + scroll-damped camera on the rail — **the feel of the ride** (review here)
2. Ribbon shader with the token ramp; nodes + ignition
3. Particles + beat 2 scatter + beat 5 org-paths
4. HTML sections, copy, poster export, fallback wiring
5. Perf pass: DPR clamp, downgrade ladder, Lighthouse in CI
6. Dark-mode variant + bloom

### 5.10 What I need from you (the review)

- **A.** White scene (recommended) or dark hero?
- **B.** The seven beats — especially beat 2 (leaking particles) and beat 5 (anonymous org paths)?
- **C.** Five milestone nodes — enough story, or too busy?
- **D.** Poster moment at `t ≈ 0.05` (path stretching to horizon under the headline) — agreed?
- **E.** Type: system font stack (recommended, free, most-Apple) or license a display face for
  the landing headline?

### 5.11 · The continuity law — one world, no seams

Review of the first prototype surfaced its real flaw: the hero read as one scene and scrolling
as another. The fix is architectural, not cosmetic, and it is now a hard rule for this scene:

> **Do not build the hero and the scroll experience as two animations that transition between
> each other. Build them as ONE animation whose progression is initially idle/autonomous and
> then continues through scroll.**

The visitor must never feel that the hero animation *ended*, that the screen switched to a
different animation, that the path disappeared and a new one began, that the camera reset, or
that the visual world changed abruptly. There is no boundary between "before scrolling" and
"after scrolling" — scrolling simply moves the visitor further through the same journey.

**The journey, restated end to end:**

```
page load → the path draws itself → suitcase (the goal, made concrete)
→ bullseye + arrow (the aim) → the user scrolls → the SAME path continues
→ milestones → convergence → arrival
```

**Forbidden at the handoff** (each of these is a seam):

- Fading the whole scene out, or replacing the background.
- Resetting or re-drawing the path; a second path system.
- Jumping or re-targeting the camera; restarting the animation.
- Removing elements just because a section boundary passed.
- A second canvas or an independent animation system for the hero.

The path may change direction, depth, scale, colour, intensity and particle behaviour — but it
always reads as the same journey. The hero establishes the world, the path, the colour system,
the movement direction and the depth; scroll only takes over the *progression*.

**Mechanics (v2 of the prototype, and the production build):**

1. **One progression value.** `target = max(introFloor(time), scrollT)`; the rendered `t`
   chases `target` with the existing damping. `introFloor` eases 0 → ~0.08 over ~6s and then
   holds forever. Scroll takes over the moment it exceeds the floor — mathematically incapable
   of a jump. Scrolling back up settles at the floor, never below: the hero is a live place the
   visitor can return to, not a splash screen.
2. **One camera system.** The intro rides the *same* position/look rails from `t = 0`. There is
   no hero-specific camera to hand off from.
3. **The ribbon draws on** during the intro behind a luminous reveal front, then stays. It is
   never re-clipped.
4. **Two emblem milestones** near the start of the path — the suitcase, then the bullseye with
   its arrow — pop in during the intro and live in world coordinates, so they recede naturally
   as the ride continues instead of being "hero props" that vanish.
5. **The atmosphere evolves, never swaps.** Fog and ground tint drift continuously with `t`
   using the `atmosphere` tokens (§1); the ribbon uses the six-stop `journey` ramp — deep navy
   underfoot → rich blue → luminous blue → indigo → blue-violet → purple at the goal.
6. **Copy hands off, the world persists.** The hero text fades out over `t` 0.095–0.14; nothing
   in the scene reacts to the section boundary at all.

**Success criterion:** when the visitor begins scrolling they never consciously register "the
first animation ended" — only "the journey is continuing."

*(Status notes: this section amends the beat-1 row of §5.3 and revises the §4b gradient to six
stops. Decision B's remaining beats stand as approved by this revision; Decision A remains open,
with the white scene still the working draft.)*

### 5.12 · Hero v3 — stairs that dissolve, and the three circles

Revision of the hero only; everything from beat 2 to arrival stands exactly as built. Supersedes
the suitcase and bullseye + arrow emblems from the v2 intro — those are retired.

**Two separate ideas, deliberately not conflated:**

**1 · The stairs — the path's opening form.** Instead of the ribbon starting underfoot, the
journey now *begins as a flight of three broad stairs* rising to the path's start; the ribbon
draws itself on from the top step toward the horizon. The stairs carry the ramp's first stops as
subtle tints (deep navy → rich blue → luminous blue) purely as the gradient's beginning — they
are the path's first form, not a diagram of anything.

**The dissolve.** On scroll the stairs dissolve — a 3D-noise dissolve with a luminous edge,
driven by `rise(t, 0.05, 0.13)` — and the visitor rides on into the same world. Sanctioned under
the continuity law (§5.11): a `t`-driven evolution the camera passes *through*, not a scene cut.
The particle stream is already flowing through the stairs, so they dissolve *into* the journey;
nothing resets, nothing is swapped. Scrolling back re-forms them — the hero remains a live place.

**2 · The three circles — the module visualization.** The three modules are shown as a row of
three **circular badges** in the hero block itself (HTML/SVG, crisp and legible — not floating
3D props), connected by a thin line, reading left to right as a process:

| Circle | Icon | Label | Module |
|---|---|---|---|
| ○ 1 | Magnifying glass ("lupa") | DISCOVER | Getting to know you |
| ○ 2 | Map with route + pin | ROADMAP | Your roadmap |
| ○ 3 | Dashboard with gauge | PROGRESS | Progress layer |

Circle styling: white fill, soft shadow, indigo icon strokes, uppercase 11px letterspaced labels
beneath. The row sits between the sub-copy and the CTAs, staggers in during the intro
(50ms-family stagger, §1 motion tokens), and fades out with the rest of the hero copy on scroll.

**Hero copy deck (verbatim — this is the approved text):**

> **Discover your path to financial freedom.**
>
> Financial advice is everywhere. Personal direction isn't. Tell us what freedom means to you
> and we'll turn it into a journey you can actually see, understand and follow.
>
> ( 🔍 DISCOVER ─ 🗺 ROADMAP ─ 📊 PROGRESS )
>
> [ Start your journey 🚀 ]   [ See Vinuy's journey ]

- "Start your journey 🚀" — primary CTA, indigo pill. On the real page it opens onboarding
  (module 1); in the demo it smooth-scrolls into the journey — which also triggers the stair
  dissolve, so the button literally starts the journey.
- "See Vinuy's journey" — quiet secondary. On the real page it opens the Vinuy demo persona's
  pre-built journey (try-before-you-tell-us); in the demo it scrolls deeper into the ride.
- The §0 core line ("Your paycheck is the engine…") is unchanged as the brand spine — it still
  leads the app welcome screen and the sales deck; the landing hero now leads with "Discover"
  because the landing page's job is the first step, not the whole thesis.

### 5.13 · The goal rain — drifting life-goal emojis (approved — palette-tinted)

**The problem it solves.** The first view's surroundings feel empty: a centered copy block, the
stairs to one side, white everywhere else.

**The idea.** The empty air around the hero fills with slowly drifting **life-goal emojis** —
the *whys* people will actually type into module 1:

> ✈️ travel · 🏠 house · 🚗 car · 🎓 graduation · 👪 family

They read as ambient possibilities floating in the world — the goals waiting to be chosen —
which quietly foreshadows the anchor question ("what do you want your life to look like?").

**Design rules (so it stays Awwwards, not confetti):**

1. **Drift, not rain.** Slow fall (~0.2 world-units/s) with a gentle sinusoidal sway, like
   leaves — never fast, never bouncing, never spinning.
2. **Sparse.** 14 concurrent on desktop, 7 on mobile. Sizes varied (28–54px on screen), opacity
   0.5–0.75 — present, never shouting.
3. **In the world, not on it.** Per the continuity law (§5.11 forbids a second animation
   system), they are **objects in the 3D scene** around the path's start — they get the same
   fog, recede as the camera rides away, and are veiled by the hero scrim exactly like the path.
   Never DOM sprinkles on top.
4. **They leave with the stairs.** Opacity is tied to `(1 − uDissolve)`: as the stairs dissolve
   into the journey, the floating goals dissolve with them — and re-form on scroll-up, same as
   everything else. Beat 2 onward is untouched.
5. **Palette-tinted silhouettes, not full-colour emoji.** Each glyph is baked as a white
   silhouette (emoji drawn, then recoloured via canvas source-in compositing) and tinted
   per-particle along the **blue → indigo → purple** span of the journey ramp — never navy
   (too heavy for floating objects), never full-colour (reads as confetti and fights the
   palette). This also makes the glyphs render identically on every OS.

**Implementation (one draw call, zero CPU per frame):**

- A 5-cell **canvas texture atlas** (640×128): each emoji drawn at ~100px on its own temp canvas, recoloured to a white silhouette with source-in compositing, blitted into its cell.
- One `THREE.Points` buffer; per-particle attributes: cell index, seed, size, sway phase.
- The vertex shader computes fall + sway from `uTime` (`fract` loop for respawn at the top);
  the fragment shader samples the atlas cell via `gl_PointCoord`. Same pattern as the paycheck
  particles — no per-frame JS.
- Spawn volume: x −4.5…+4.5, y 4→−1, z 1…6 (the hero's air, around and behind the stairs).
- Draw calls: 8 → 9. No other cost.

**Resolved:** family is 👪 (single codepoint — renders everywhere; and as a silhouette the richer ZWJ variant gains nothing).

### 5.14 · Hero scale-up — fill the first view

The centered hero block was reading small and the first view empty. Two fixes work together:
the goal rain (§5.13) fills the air, and the copy block itself grows to command the viewport.
The proportions between elements stay; everything steps up one size.

| Element | Was | Now |
|---|---|---|
| Headline | `clamp(34px, 5.2vw, 56px)`, max 20ch | `clamp(40px, 6.4vw, 78px)`, max 21ch (breaks as two balanced lines) |
| Sub-copy | 17px, 44ch | **20px**, line-height 1.5, 52ch |
| Eyebrow | 11px | 13px |
| Circles | 54px, 24px icons | **68px**, 28px icons |
| Circle labels | 11px | 12px |
| Steps row | gap 14, top 26, connector 34px | gap 18, top 34, connector 44px |
| CTAs | 15px, 13×26 padding, top 30 | **17px**, 16×34 padding, top 36 |
| Scrim | ellipse 62%×58%, fade at 78% | ellipse 70%×64%, stops .95 / .82 / 0 at 82% |

The scrim grows with the block so the goal rain and path still read *around* it, veiled behind
it — legibility rules from v3.1/v3.2 (near-ink text) unchanged.

### 5.15 · Filling the air — ambient atmosphere beyond the path

The start view still reads empty around the copy block: the path and stairs occupy the middle
distance, the goal rain drifts, but the white expanse dominates the corners and the sky. Three
ambient elements fill it — all inside the one scene (§5.11), all cheap, all quiet:

**A · The horizon aurora.** A very soft band of light on the horizon behind the goal — a slow-
breathing wash of luminous blue drifting into violet, alpha 4–8%, animated by low-frequency
noise. It gives the sky a *somewhere to go* and foreshadows the purple arrival: its tint slides
from blue toward purple as `t` rises, so by the final beat the horizon has been warming toward
the goal the whole ride. One plane, one draw call, drawn behind everything.

**B · Depth motes.** A dozen very large, very faint bokeh discs (blue/indigo at 2.5–5% alpha,
80–220px) floating at varied depths **along the entire path**, not just the hero — the
atmosphere travels with the visitor. Slow bob and drift, fog-faded. They give the white air
physical depth: the difference between "empty page" and "bright morning". One Points buffer,
one draw call.

**C · Ground ripples.** Thin concentric rings expanding slowly outward across the dot grid from
the base of the stairs — the journey radiating from where you stand. Alpha ≈ 5%, indigo-grey,
shader-only (an extension of the existing ground fragment — zero extra draw calls).

**Behaviour rules:**

- Aurora + motes fade in with the intro (`× uReveal`) so the page still loads clean and the
  world *arrives*; after that they persist for the whole ride — they are atmosphere, not hero
  props, so they do not dissolve with the stairs.
- Ripples stay centred at the path's origin; the camera simply rides away from them.
- Everything remains a function of `uTime`/`t` — no timelines, no CPU per-frame work.
- Draw calls: 8 → 10. Nothing else in the scene changes.
