# ZENDA_MOTION_DEMO.md — the built prototype, documented as-is

> Companion to `ZENDA_DESIGN.md` §5 (the landing-scene **plan**, still awaiting decisions A–E).
> This document is different: it records what is **actually running** in
> [`demo/zenda-path.html`](demo/zenda-path.html) — a single-file, dependency-free prototype built
> to prove the technique before any production code exists. Every number below is read directly
> off that file, not estimated. When the plan and the prototype disagree, the prototype is what
> was tested; note the delta rather than silently trusting either one.

**Run it:** open `demo/zenda-path.html` directly in a browser (needs network access once, for the
three.js CDN script), or view the published copy at the artifact link shared in-session. Scroll
from top to bottom. A HUD in the top-left shows the current beat name, the scroll progress `t`,
and a live fps counter.

---

## 1 · What it is

A scroll-driven three.js scene: a single luminous ribbon runs from the viewer's feet toward a
point of light on the horizon, with particles flowing along it and five milestone nodes marking
the way. Scroll position drives one number, `t` (0→1), and every visual property — camera pose,
ribbon colour, particle behaviour, node ignition, an "organisation" of anonymous paths, and a
goal-glow — is a deterministic function of `t` plus elapsed time. There is no scripted timeline
and no per-beat special-case code; the seven "beats" are just named windows over the same `t`.

Plain three.js, no build step, no React Three Fiber — this is a proof of technique, not the
production component. §7 lists exactly what changes to get there.

---

## 2 · Scene graph and cost

| Element | Geometry | Draw calls |
|---|---|---|
| Horizon aurora (v5) | One `PlaneGeometry` (140×34) at `(0,9,-78)`, `renderOrder -1`, depth-test/write off — a soft breathing light band behind everything | 1 |
| Ground | One `PlaneGeometry`, shader-drawn dot grid, fog-faded — v5 adds slow concentric ripple rings expanding from the base of the stairs, inside this same fragment (no added draw call) | 1 |
| The stairs | One merged `BufferGeometry` (three `BoxGeometry`s + a per-vertex `aStep` attribute), custom noise-dissolve `ShaderMaterial` | 1 |
| The ribbon | One `BufferGeometry` triangle strip (401 cross-sections × 2 verts) along a `CatmullRomCurve3` | 1 |
| Organisation paths (beat 5) | One `LineSegments` buffer, 40 lines × 110 points each | 1 |
| Paycheck particles | One `Points` buffer, 7,000 desktop / 3,000 mobile | 1 |
| Milestone nodes | One `Points` buffer, 5 billboards | 1 |
| The goal rain (v4) | One `Points` buffer, 16 desktop / 8 mobile, palette-tinted silhouettes sampled from a 5-cell canvas atlas | 1 |
| Depth motes (v5) | One `Points` buffer, 14 desktop / 7 mobile, spawned across the whole ride (z: hero to goal region), fog-faded | 1 |
| Goal glow | One `Sprite` with a canvas-drawn radial gradient texture | 1 |

**Ten draw calls**, no lights, no shadows — every colour comes out of a shader. Counted directly
off the built scene by listing every `scene.add(...)` call, in scene-graph order: aurora, ground,
ribbon, org-paths, paycheck particles, milestone nodes, stairs, goal rain, depth motes, goal glow —
ten objects, ten calls. (The design plan's §5.4 table said five; the goal-glow sprite was added
during the original build and wasn't in that count, bringing it to six. The v2 recode — §9 —
added two emblem sprites, bringing it to eight. The v3 recode — §10 — removed both emblem sprites
and added the one-draw-call stairs mesh, netting back down to seven. The v4 recode — §11 — added
the one-draw-call goal rain, bringing it back to eight. The v5 recode — §12 — added the aurora
plane and the depth-motes buffer, two new draw calls, bringing the total from eight to ten; the
ground ripples are a shader-only extension of the existing ground fragment and add none.
Documenting the delta here rather than quietly reconciling it.)

Device-scaled cost: particle count and device-pixel-ratio both step down together —
`N_PART = 3000` and `DPR ≤ 1.5` when `innerWidth < 768` or `navigator.deviceMemory ≤ 4`; otherwise
`N_PART = 7000` and `DPR ≤ 1.75`.

---

## 3 · The path

One `CatmullRomCurve3` through seven hand-placed control points, running from `(0, 0, 4)` to
`(0, 2.4, −58)` — roughly 62 world units of depth, drifting gently in x and rising in y as it
recedes, so the camera ride has lateral and vertical variety rather than a straight tunnel.

The curve is **baked once** into a 512×1 `DataTexture` (`RGBAFormat`, `FloatType`,
`NearestFilter`) at load time. Anything that needs "where is the path at parameter `p`" — chiefly
every one of the 7,000 particles, every frame — samples that texture in the **vertex shader**
instead of walking the curve on the CPU. This is the load-bearing performance decision in the
whole prototype: particle motion costs zero CPU work per frame, regardless of particle count.

---

## 4 · Camera

Two more hand-placed `CatmullRomCurve3` rails, sampled by the same `t`: a **position rail** (8
points, `(0, 0.9, 7.0) → (0, 3.1, −53.5)`) and a **look-at rail** (8 points, tracking slightly
ahead of and below the position rail so the camera looks down the path rather than straight along
its own heading). Both are placeholder placements — the plan's §5.9 step 1 (a dedicated fly-mode
for rail placement) hasn't happened yet; these were placed by eye against the ribbon.

**Damping, not tweening:**
- Scroll → `tTarget`. Rendered `t` chases it every frame: `t += (tTarget − t) · min(1, 4·dt)`.
  It never jumps to the scroll position; it always eases toward it.
- Pointer position is damped the same way, rate `3·dt`, and only listened to on non-touch
  pointers (`matchMedia("(pointer: coarse)")` gates it off on touch).
- Parallax is applied as a small camera rotation **after** `lookAt`: `rotateY(-px·0.035)`,
  `rotateX(-py·0.02)` — roughly ±2° at full deflection, matching the plan's cap.
- An idle breathing motion (`sin(time·0.5)·0.06` on camera y) is active before scrolling starts
  and fades out over the first 10% of `t` (`idle = 1 − rise(t, 0, 0.1)`), so the scene isn't
  static while a visitor is reading the hero copy.

---

## 5 · What `t` actually drives — the exact envelopes

Nothing in this scene is a keyframed animation; every effect is one of two small helper functions
evaluated against `t` each frame:

- `rise(t, a, b)` — a smoothstep ramp from 0 to 1 between `a` and `b`.
- `env(t, a, b, c, d)` — rises `a→b`, holds at 1, falls `c→d`. A windowed bump.

| Effect | Function | Window | What it does |
|---|---|---|---|
| Ribbon desaturation | `env(t, 0.12, 0.18, 0.24, 0.30)` | beat 2 | Path ahead of the today-marker greys out — "money leaking" |
| Particle scatter | `env(t, 0.13, 0.20, 0.24, 0.30)` | beat 2 | A random subset of particles peel off the ribbon and fade, slightly offset from the desaturation so the two reinforce rather than snap together |
| Org-path opacity | `env(t, 0.60, 0.66, 0.90, 0.96)` | beats 5–6 | The 40 anonymous paths fade in, hold, then fade as the scene moves past them |
| Org-path convergence | `rise(t, 0.76, 0.92)` | beats 6 | Each anonymous path is pulled laterally toward the hero path, proportional to its own distance-along-path — a visual "coming together" |
| Particle orbit | `rise(t, 0.90, 0.975)` | beat 7 | Particles blend from ribbon-flow motion to a slow orbit around the goal position |
| Goal glow opacity | `0.12 + 0.88 · rise(t, 0.88, 0.97)` | beat 7 | The purple glow sprite intensifies into the arrival |
| Goal glow scale | `7 + 5 · rise(t, 0.88, 1.0)` | beat 7 | The glow physically grows as the scene arrives |

**v2 addition — the autonomous intro layer (real elapsed time, not `t`).** Before scroll takes
over, more envelopes run on `clock.elapsedTime` directly, implementing `ZENDA_DESIGN.md` §5.11:

| Effect | Function | Window | What it does |
|---|---|---|---|
| Intro floor | `introFloor = 0.08 · rise(time, 0, 6)` | 0–6s, then holds forever | `target = max(introFloor, tTarget)` feeds the *same* damped `t` used everywhere else (damping itself is unchanged) — scroll takes over the instant it exceeds the floor; scrolling back up settles at the floor, never below |
| Ribbon reveal front | `uReveal = max(uReveal, rise(time, 0.2, 3.5))` | 0.2–3.5s, then holds at 1 | A luminous front sweeps the ribbon, particles and (via the node-ignition gate below) the nodes into existence; monotonic, never re-clips |
| Hero copy fade | `1 − rise(t, 0.095, 0.14)` (a function of `t`, not `time`) | `t` 0.095–0.14 | The hero `<h1>`/CTA fade out via JS-set `opacity`; `pointer-events` is set to `none` once opacity drops below 0.05 so the invisible copy can't eat clicks/scroll |

**v3 addition — the stairs' dissolve (a function of `t`, not `time`, unlike the rest of this
table).** `shared.uDissolve.value = rise(t, 0.05, 0.13)`, window `t` 0.05–0.13, assigned directly
every frame with no `Math.max` accumulator — deliberately *not* monotonic like `uReveal`. Scrolling
back down past `t = 0.05` lowers `uDissolve` again and the stairs re-form, per §5.12's explicit
requirement that the hero stay a live place rather than a one-way intro. See §6 and §10.

**v4 addition — the goal rain's fall/respawn cycle (real elapsed time) and its opacity gates
(reuses `uDissolve` and `uReveal` exactly as written, no new envelope math).** Each particle's
fall position is `cyc = fract(aSeed.y + uTime·0.018·aSeed.z)` — a looping 0→1 cycle computed
entirely in the vertex shader from `clock.elapsedTime`, per-particle speed varying `aSeed.z` in
[0.6, 1.4] so one fall takes roughly 40–90s depending on the particle. Its opacity is
`tx.a · 0.62 · edgeFade(cyc) · (1 − uDissolve) · uReveal`: `edgeFade` is a soft
`smoothstep`-in/`smoothstep`-out window on `cyc` itself (fades each glyph in over the first 10%
of its fall and out over the last 10%, masking the respawn pop at the top), `(1 − uDissolve)`
ties the whole rain to the same stairs-dissolve envelope from §5.12/§10 so the goal rain leaves
with the stairs on scroll and re-forms on scroll-up, and `uReveal` fades the rain in during the
intro alongside the ribbon, particles and nodes. No `t`-driven window of its own — it borrows the
two uniforms that already carry the hero's intro/dissolve state. See §6 and §11.

**v5 addition — a per-frame progression uniform, `uProg` (§5.15 ambient elements only).**
`shared.uProg.value = t` is assigned every frame immediately after `uTime`, alongside the other
envelope updates — a direct, ungated mirror of the rendered `t`, used only by the horizon aurora's
colour mix (blue early, warming toward violet as `uProg` rises across the ride). It carries no
window of its own — unlike every entry in the table above, it is not a `rise`/`env` shape, just
`t` made available inside a shader. The other two v5 elements need no such uniform: the depth
motes are driven by `uTime`/`uReveal` alone, and the ground ripples by `uTime` alone — the same
minimal pattern already used by every prior element in the file. See §6 and §12.

`introFloor` and `uReveal` are both driven by `clock.elapsedTime`, which starts counting the
instant `startScene()` runs — the ribbon is drawing itself and the camera is already gliding
before the visitor has done anything, exactly as §5.11 mechanics 1 and 3 require.

Camera idle breathing was re-windowed for the same reason: v1 faded it out over the first 10% of
scroll-driven `t` (`idle = 1 − rise(t, 0, 0.1)`, see §4); v2 uses `idle = 1 − rise(t, 0.10, 0.18)`
instead, so the breathing motion survives at the hero floor (`t ≈ 0.08`) rather than being killed
off by a `t` window the scene now reaches on its own before any scroll happens. (§4's camera
section still shows the pre-recode formula; this file's edit scope for the recode was §2/§5/§6/§8/§9,
so it's flagged here rather than silently left inconsistent — see §9.)

**Milestone nodes** ignite on a hard threshold, same mechanism as before, but v2 adds a second
gate: a node can only light once the reveal front has swept past its position on the path
(`NODE_T[i] ≤ uReveal`), so nodes never appear ahead of the ribbon that's still drawing itself in.
`NODE_TH = [−1, 0.31, 0.37, 0.43, 0.90]` is unchanged; the ignition target is now
`nodeTarget[i] = (t > NODE_TH[i] && NODE_T[i] ≤ uReveal) ? 1 : 0`, then *damped* toward that target
every frame at rate `5·dt` (`nodeLit += (target − nodeLit) · min(1, 5·dt)`) exactly as before,
which reads as a soft ignite rather than a hard cut, without being a scripted tween. The first
node's initial JS state changed from pre-lit (`nodeLit = [1,0,0,0,0]` in v1) to unlit
(`[0,0,0,0,0]`) — under the new gate it now ignites for real, at real time ≈0.47s once `uReveal`
first crosses `NODE_T[0] = 0.02`, instead of starting in a lit state the v1 code never re-derived
from `t`. Each node also has a small idle pulse, `1 + 0.06·sin(time·2 + index·2.1)` — same
frequency for all five, phase-offset per node so they don't pulse in unison.

**The seven beat labels shown in the HUD** use the same `t` thresholds documented in
`ZENDA_DESIGN.md` §5.3 (0.00 / 0.12 / 0.28 / 0.45 / 0.62 / 0.78 / 0.92) — the demo's HUD and the
design doc's storyboard table are the same seven cuts, cross-checked.

---

## 6 · The shaders

All colour math happens in **pre-linearized space**: each palette colour is converted once at
load time via `pow(channel, 2.2)`, mixed/ramped in the shaders in that linear space, and converted
back with `pow(channel, 1/2.2)` immediately before `gl_FragColor` is written. This is the "ramp
interpolated in linear space, not sRGB" requirement from the brief — sRGB-space mixing of blue and
purple produces a muddy, desaturated midpoint; linear-space mixing does not.

- **Ribbon vertex:** a hand-written 3D simplex noise function (Ashima's public-domain
  implementation) displaces each cross-section in y and x, amplitude growing with distance along
  the path (`0.3 + t`) so it's calmest near the viewer and loosest toward the horizon. Width
  tapers from wide near the camera to narrow at the goal.
- **Ribbon fragment:** samples the **six-stop journey ramp** (`ZENDA_DESIGN.md` §1 `journey.light`
  — deep navy → rich blue → luminous blue → indigo → blue-violet → purple) by distance-along-path,
  blends toward grey during the beat-2 window, fades to the drifting **atmosphere fog colour**
  (`uFogCol`, see below) with a fog function of camera distance (`smoothstep(18, 62, depth)` — the
  same fog curve is reused by every element for atmospheric consistency), and fades out at the
  strip edges (a fresnel-style falloff on the side attribute) so the ribbon has no hard silhouette
  against the white ground. v2 adds the **draw-on reveal**: alpha is multiplied by `1 −
  smoothstep(uReveal−0.02, uReveal, vT)` so the ribbon exists only behind the intro's reveal front
  (§5), and a `front` term brightens a thin luminous band (`mix(c, uC2*1.6, front*0.8)`) right at
  the leading edge before the fog mix, so the draw-on itself reads as a moving point of light.
  v3 adds one more multiply, `a *= smoothstep(0.004, 0.03, vT)` — a soft head fade over the first
  3% of path-progress, so the ribbon itself doesn't render underfoot at the very start; it now
  reads as emerging from behind the top stair rather than starting in open air (§5.12, §10).
- **Particles (vertex shader only — no CPU per-frame work):** each particle samples its position
  from the baked path texture at a phase that loops via `fract(seed + time·speed)`, derives a local
  Frenet-ish frame (tangent from two nearby texture samples, then binormal/normal via cross
  products) so it can swirl around the ribbon rather than sit on a single line, blends toward a
  scattered offset during beat 2, and blends toward an orbit position around the goal during beat
  7. Point size scales inversely with camera distance and is clamped to a sane pixel range.
- **Particles (fragment):** a soft round sprite (`smoothstep` on distance from the point centre),
  coloured by the same ramp at the particle's own path-progress, faded by the atmosphere fog colour
  and by its own scatter amount. v2 adds the same reveal window as the ribbon, keyed to the
  particle's own path-progress (`1 − smoothstep(uReveal−0.05, uReveal, vProg)`) so particles ahead
  of the draw-on front stay hidden.
- **Nodes:** a small radial core plus a wider, dimmer halo, blended from a dim idle grey toward the
  node's own colour by its damped `lit` value, faded toward the atmosphere fog colour by depth; point
  size also grows with `lit` so a lit node reads as visibly larger, not just brighter. v2 re-bases
  `NODE_COL` onto the six-stop ramp — today's node is luminous blue (`C2`), the three mid nodes are
  indigo (`C3`), the goal node is purple (`C5`) — and gates ignition on the reveal front in JS
  rather than in the shader (§5), per the brief to choose the simpler mechanism.
- **Organisation paths:** a dashed line (`step` on a repeating pattern along path-progress, seeded
  per-line so the dashes don't align across lines), pulled toward the hero path by the convergence
  envelope, faded by the org-alpha envelope and by depth fog. Unlike the other elements this
  fragment never mixed toward a fixed fog-target colour (only alpha attenuates with depth), so
  there was no `uFogCol` line to replace here — left as-is; see §8.
- **Ground:** a simple shader-drawn dot grid on a plane, faded by the shared fog function — a
  parallax cue with no geometry cost beyond one quad. Also has no fog-target colour mix to replace
  (fades alpha only); left as-is, matching the allowance in the v2 spec. **v5 adds ground ripples**
  (§5.15 C) inside this same fragment: `rr`, the fragment's world-space XZ distance from the
  path's origin `(0, z=4)` (the base of the stairs), feeds `rc = fract(rr*0.5 - uTime*0.10)`, an
  expanding-rings coordinate; `ring = smoothstep(0,0.12,rc) * (1-smoothstep(0.18,0.30,rc))` turns
  that into a thin band per cycle, faded out past `rr≈16` and by the same fog function as the dot
  grid. The two alpha terms are combined with `a = max(dotAlpha, ringAlpha)`, not summed — a
  deliberate choice so the rings read as a distinct, separate wash rather than double-brightening
  wherever a ring happens to cross a dot intersection; same colour (`vec3(0.24,0.24,0.27)`) either
  way. This is the first time this material gains a uniform at all — it previously had none —
  `uTime` is wired in via the same `U(["uTime"])` helper every other material already uses.

- **Horizon aurora (v5, §12):** one `PlaneGeometry(140,34)` positioned at `(0,9,-78)` with no
  rotation — its default +z-facing normal points back toward the camera, which only ever sits at
  positive-to-near-zero z along the rails — `renderOrder -1` with `depthTest:false` and
  `depthWrite:false` so it renders behind every other element regardless of scene-add order or
  actual depth (no fog mix either: per the spec, the aurora IS the horizon light, not something
  fog should dim). Fragment: a soft elliptical mask (`1-smoothstep(0.55,1.0,length((vUv-0.5)*
  vec2(2.2,2.6)))`) removes all hard plane edges; a low-frequency sine-product `n` drifts two
  bands slowly along x; a vertical `band` term confines the glow to the plane's middle third so it
  never reads as a filled rectangle; colour mixes from `uC2` (luminous blue) toward the `uC4`/`uC5`
  midpoint (blue-violet/purple) as `uProg` rises, so the horizon visibly warms across the whole
  ride; a slow `sin(uTime*0.15)` breathing term modulates overall alpha; final alpha stays in the
  4–8% range the spec asked for, gated by `uReveal` so it arrives with the rest of the intro.

  *Placement check (reasoned from the camera-rail geometry — no renderer available in this
  environment to confirm visually).* At the hero framing (`t≈0`: camera `(0,0.9,7)` looking at
  `(0,0.6,-6)`) the plane's centre sits roughly 6.7° above the camera's view direction —
  comfortably inside the ±27.5° vertical half-FOV (55° lens), reading as a glow above mid-frame,
  not a wall filling the sky. At the arrival framing (`t≈1`: camera `(0,3.1,-53.5)` looking at
  `(0,2.4,-58)`, a few degrees downward toward the goal) the plane's centre sits roughly 22° above
  the view direction — near the top edge of frame, consistent with a distant light the camera is
  arriving toward rather than one already overhead. Both checks landed inside the spec's draft
  `(0,9,-78)` / `140×34` values, so they were kept exactly as given rather than adjusted.

- **Depth motes (v5, §12):** one `Points` buffer, 14 desktop / 7 mobile (`isSmall`, the same
  device-tier flag as the paycheck particles and the goal rain), spawned across the *entire* ride
  rather than clustered at the hero: `x` uniform in `[-11,11]`, re-rolled whenever `|x|<2.5` to
  stay clear of the path corridor; `y` in `[0.5,6.5]`; `z = 6 - (i/N)*66` plus `±3` jitter, so
  motes exist all the way from the hero to the goal region — the atmosphere travels with the
  visitor instead of sitting only around the stairs (§5.15 B). Vertex shader adds an independent
  slow sine bob/sway on top of the fixed spawn position (`aPos`): `sin(uTime*0.07+aSeed.x·2π)*0.6`
  on x, `sin(uTime*0.05+aSeed.y·2π)*0.4` on y. Point size is
  `clamp((3+aSeed.y*4)*(230/vD)*1.3, 80, 220)` — the same distance-based sizing shape already
  tuned for the goal rain (§11), reused rather than re-derived, landing motes in the spec's
  80–220px range. Fragment: an ultra-soft round disc (`soft*soft`, no hard edge) tinted
  `mix(uC2,uC3,vSeed.y)` (blue..indigo per mote), alpha a flat 2.5–5% attenuated by fog and gated
  by `uReveal` only — **not** by `uDissolve`, since motes are atmosphere rather than a hero prop:
  the spec is explicit that they persist through the stairs' dissolve instead of leaving with it
  (§5.15 behaviour rules), unlike the goal rain in §11 which does gate on `uDissolve`.
  `renderOrder 1`, the same tier as the stairs and org-paths, so motes sit behind the ribbon
  (`renderOrder 2`) as specified.
- **The stairs (v3, replaces the emblems — §10):** one merged `BufferGeometry` (three
  `BoxGeometry`s translated into place and concatenated by hand — position, normal and a per-vertex
  `aStep` attribute all copied into shared arrays with index offsets, so the three steps are one
  draw call), rendered with a custom `ShaderMaterial`. Fragment: a near-white base
  (`vec3(0.955)`) mixed toward the step's own ramp stop — `uC0` (deep navy) for the bottom step,
  `uC1` for the middle, `uC2` (luminous blue) for the top step that meets the ribbon's start — 10%
  on side faces, 16% on top faces (`normal.y > 0.5`); side faces additionally darken by
  `(1 − abs(normal.y)) · 0.06`. Then the shared `fogAt`/`uFogCol`/`toSRGB` treatment, same as every
  other element. The dissolve itself is 3D simplex noise sampled at world position
  (`snoise(vW*2.3)*0.5+0.5`) compared against `uDissolve`: below threshold, `discard`; just above
  it, a luminous edge (`smoothstep(uDissolve+0.10, uDissolve, n)`) tinted `uC2*1.7`. `uDissolve`
  is a direct function of `t` (§5), not a monotonic accumulator, so scrolling back up literally
  re-forms the stairs — required by §5.12. `transparent:false` (discard does the visibility work),
  `depthWrite:true`, `depthTest:true`, `renderOrder 1`.
- **The goal rain (v4, §11):** one `Points` buffer, 16 particles desktop / 8 mobile (`isSmall`,
  the same device-tier flag as the paycheck particles), sampling a 5-cell canvas texture atlas
  built once at scene setup by `buildGoalAtlas()` — each of the five life-goal emoji
  (✈️ 🏠 🚗 🎓 👪) is drawn at 100px on its own temp canvas, then recoloured to a white silhouette
  via `globalCompositeOperation = "source-in"` (alpha preserved, colour discarded) and blitted
  into its 128×128 cell of a 640×128 atlas — so every glyph renders as a flat silhouette, tintable
  per-particle, identically on every OS. Vertex shader: position is computed directly from
  `uTime` and per-particle seed attributes, no CPU per-frame work — `p.x` drifts sinusoidally
  around a random spawn column, `p.y` falls linearly over a looping cycle (`cyc`, see §5),
  `p.z` is a fixed per-particle depth in [1, 6]; point size is
  `clamp(aSize·(230/vD)·1.3, 10, 64)` (`vD` = camera distance, `aSize` per-particle in
  [0.35, 0.85]) — the constant `1.3` was tuned, not copied from another element, to land glyphs at
  roughly 28–54 screen px when the camera is 3–6 units out (hero framing); see the note below.
  Fragment shader: `gl_PointCoord` addresses one 1/5-wide column of the atlas selected by the
  particle's `aCell` (0–4, cycling `i % 5` across the 16/8 particles), discards where the atlas
  alpha is near zero, then tints the silhouette via `ramp(0.4 + vTint·0.6)` — deliberately
  restricted to the back half of the six-stop ramp (blue → indigo → purple) so no particle ever
  reads as the heavy deep-navy stop. Final alpha multiplies the atlas alpha by a fixed 0.62, the
  `edgeFade` respawn mask (§5), `(1 − uDissolve)` and `uReveal` (§5, §6). `transparent:true`,
  `depthWrite:false`, `renderOrder 2` (same as the ribbon), `frustumCulled:false`. The atlas
  texture (`uAtlas`) is a plain uniform on this material only — it is not added to the `shared`
  uniforms object, since nothing else samples it.

  *PointSize constant.* The spec's draft vertex shader used a placeholder multiplier of `14.0` on
  `aSize·(230/vD)`; at `vD` 3–6 and `aSize` 0.35–0.85 that placeholder produces sizes from roughly
  300px to over 1000px — far past the 10–64 clamp and nowhere near the 28–54px target, so it was
  retuned rather than kept. `1.3` was solved from the target range directly (size ≈
  `aSize·(230/vD)·K`; picking the geometry's midpoint `aSize ≈ 0.6` and the stated camera range
  `vD` 3 and 6 and solving `K` so both ends land near 28 and 54px gives `K ≈ 1.2–1.22`; `1.3` was
  chosen as the nearest clean value, erring slightly larger so the smallest/farthest glyphs don't
  disappear below the 10px floor). At `aSize = 0.6`: `vD = 3 → ≈55px`, `vD = 6 → ≈30px`. Size
  particles (`aSize` 0.35/0.85) land outside that 28–54px band at the extremes by design — that's
  the "sizes varied" requirement from §5.13 — but every value stays inside the hard `[10, 64]`
  clamp regardless of `vD` or `aSize`.

**Atmosphere drift (`uFogCol`, v2).** Every fog-target mix that used to write toward a hardcoded
`vec3(1.0)` (pure white) now writes toward a shared `uFogCol` uniform instead. Each frame, JS lerps
between the two `ZENDA_DESIGN.md` §1 `atmosphere.light` stops (`#F7F9FE` at `t=0` → `#FAF7FE` at
`t=1`) with a `THREE.Color`, sets that sRGB colour directly as the renderer's clear colour, and
also linearizes it (`pow(channel, 2.2)`, same as every other ramp colour) into `uFogCol` for the
shaders, since fog mixing happens in linear space pre-gamma. The result is a continuous cool-navy
→ violet-white drift across the whole frame — background and fog target moving together — rather
than a flat white that never changes; deliberately subtle, per the brief ("the scene stays white").

Every ramp/fog colour is one of the tokens in `ZENDA_DESIGN.md` §1 (`journey.light`'s six stops,
`atmosphere.light`'s two stops, plus a neutral grey) computed once at scene setup — nothing is
hand-picked per-shader, matching the "feed the shader from the token file" rule in the brief. In
the demo these are inlined as hex literals at the top of the script (there is no `packages/tokens`
to import from in a single HTML file); production wiring is listed as a to-do in §7.

---

## 7 · Fallback and capability detection

Three checks run in order before the scene starts, each producing a distinct, human-readable
reason shown on the poster rather than a generic failure state:

1. **Script failed to load** (`!window.THREE`) → poster, "check your internet connection."
2. **No WebGL context obtainable** (`webgl2` then `webgl` both fail) → poster, "WebGL isn't
   available in this browser."
3. **`prefers-reduced-motion: reduce`** → poster, with the reason named (Windows: *Settings →
   Accessibility → Visual effects → Animation effects*) **plus a "▶ Play the scene" button.**

That third behaviour is a deliberate deviation from the production plan for review purposes: the
brief's §5.8 says reduced-motion gets the poster, full stop, with no way to see the animation. In
this demo that would make the scene unreviewable on any machine with that OS setting on, so a
manual override was added. **The production build must not carry the Play button** — reduced
motion means reduced motion, unconditionally. This is flagged explicitly so it isn't carried over
by accident when this prototype is used as a reference during the real build.

None of the runtime downgrade ladder from the plan (§5.7 — drop bloom, drop to 3k particles,
drop to poster, triggered by measured frame drops) is implemented here. The device-tier branch in
§2 is a load-time decision only, not a runtime one.

---

## 8 · Deltas from the `ZENDA_DESIGN.md` plan — read before building the real thing

| Plan said | Demo actually does | Why |
|---|---|---|
| React Three Fiber + drei | Plain three.js, hand-rolled scene graph | No build step for a single-file prototype |
| Tokens imported from `packages/tokens` | Hex literals inlined at the top of the script | No package to import from outside the monorepo |
| Postprocessing bloom (dark mode) | None — no dark-mode variant exists yet | Out of scope for proving the core technique |
| Docked product-UI card in beat 4 | Camera swing only, no card | Deferred — needs real roadmap UI to dock |
| Camera rails placed via a fly-mode tool | Placed by eye, iterated visually | Fly-mode tool not built yet (plan §5.9 step 1) |
| Runtime perf downgrade ladder | Load-time device tier only | Not needed to prove the technique |
| Reduced motion → poster, no override | Reduced motion → poster **with a Play button** | Demo-only, so the animation can be reviewed — **must not ship** |
| 5 draw calls (§5.4) | 8 draw calls | Goal-glow sprite added during the original build (6); the v2 recode's two emblem sprites brought it to 8 (§2, §9) |
| §5.11's `mix(c, vec3(1.0), f)` fog-target replaced with `uFogCol` "in the ribbon, particle, node, org-line and ground fragments" | Replaced in ribbon, particle and node fragments only | The org-line and ground fragments never had that fog-target mix to begin with (they only attenuate alpha with depth) — nothing to replace, so left unchanged; §5.11's own text anticipated this for ground ("leave it, or tint... if trivial") |
| Node ignition target `NODE_T[i] < revealValue` (spec pseudocode, strict `<`) | Implemented as `NODE_T[i] <= uReveal` | With strict `<`, the goal node (`NODE_T = 1.0`) could never ignite, because `uReveal` also caps at exactly `1.0` (from `rise()`'s clamp) — `1.0 < 1.0` is always false. `<=` is a one-character fix with no added complexity, matching the recode's own instruction to keep the node mechanism simple |
| Node initial state (unspecified) | `nodeLit`/`nodeTarget` changed from `[1,0,0,0,0]` (v1: node 0 pre-lit) to `[0,0,0,0,0]` | Under the new reveal-gated ignition, leaving node 0 pre-lit would make it visibly damp *off* for the first ~0.5s (before `uReveal` reaches `NODE_T[0]=0.02`) and then back on — a small flicker the spec didn't intend. Starting unlit lets it ignite once, cleanly, when the reveal front first reaches it |

**What the demo does confirm, and can be treated as validated going into the real build:**

- The path-baked-to-texture technique keeps particle motion at zero CPU cost per frame, at 7,000
  particles, without GPGPU.
- Eight draw calls, no lights, hold well within the 60fps desktop budget on ordinary hardware.
- Linear-space colour ramping avoids the muddy-midpoint problem the brief warned about.
- The `env`/`rise` envelope approach scales cleanly to seven independent beats without a single
  scripted keyframe or timeline library.
- A white, unlit, shader-only scene reads as intentional rather than "reduced motion accidentally
  left half-built" — supporting Decision A (white scene) in `ZENDA_DESIGN.md` §5.2.

---

## 9 · v2 recode — the continuity update (planned by Fable, executed by Sonnet)

The first prototype's flaw, caught in review: the hero felt like one scene and scrolling like
another. `ZENDA_DESIGN.md` §5.11 is now the governing law — **one animation, initially
autonomous, then taken over by scroll**. The v2 recode applies it to this demo:

| # | Change | Where |
|---|---|---|
| 1 | Six-stop journey ramp (deep navy → rich blue → luminous blue → indigo → blue-violet → purple), branchless chained-mix in GLSL, linearized as before | ribbon + particle shaders |
| 2 | Autonomous intro: `introFloor` eases 0 → 0.08 over ~6s; `target = max(introFloor, scrollT)`; rendered `t` keeps the same damping — handoff is mathematically seamless | frame loop |
| 3 | Ribbon draw-on: `uReveal` 0 → 1 during the intro with a luminous front edge; never re-clips after | ribbon + particles + nodes |
| 4 | Suitcase and bullseye + arrow emblems: canvas-textured world-space sprites near the path start, popped in during the intro with an ease-out-back, gentle idle bob after | scene |
| 5 | Atmosphere drift: fog colour + clear colour lerp cool-navy-white → violet-white with `t`; replaces the constant pure-white fog target | shared uniforms |
| 6 | Hero copy fades over `t` 0.095–0.14 via JS opacity; idle camera breathing re-windowed to survive at the hero floor | frame loop |
| 7 | Node colours re-based on the new ramp; first beat label renamed "01 · Hero — the journey begins" | constants |

Unchanged on purpose: the fallback/poster logic (including the demo-only Play button), the HUD,
all beat windows from `t = 0.12` onward, the damping rates, the device-tier branch.

This recode has shipped; §2, §5, §6 and §8 above have been updated to match the built v2 demo, and
this section now records what shipped rather than what was planned.

**Deviations from the table above, and why** (none change the visual design — each is either a
bugfix to the given pseudocode or a scope-respecting omission):

- Node ignition uses `NODE_T[i] <= uReveal` (not the strict `<` implied by the spec pseudocode) —
  otherwise the goal node, whose `NODE_T` is exactly `1.0`, could never ignite once `uReveal` caps
  at `1.0`. See §8.
- The nodes' initial `nodeLit`/`nodeTarget` changed from v1's pre-lit `[1,0,0,0,0]` to
  `[0,0,0,0,0]`, to avoid a startup flicker under the new reveal gate. See §8.
- The org-line and ground fragments had no `mix(c, vec3(1.0), f)` fog-target line to begin with
  (only alpha attenuates with depth in those two), so `uFogCol` wasn't wired into them — there was
  nothing to replace. The spec's own text for ground explicitly allowed "leave it"; the same
  reasoning was extended to org-line since its fragment has the identical shape.
- Two of the reveal-window formulas, implemented exactly as specified, are **not** perfectly
  mathematical no-ops once `uReveal` reaches `1.0` (post-intro) — flagged honestly per the
  verification requirement rather than claimed otherwise:
  - Ribbon: `1 − smoothstep(uReveal−0.02, uReveal, vT)` and the `front` glow term are both nonzero
    across roughly the last 2% of the path length nearest the goal *at all times*, not only during
    the intro (a faint, permanent front-glow band right at the goal). That stretch sits deep inside
    the fog window (`smoothstep(18, 62, depth)` at `z ≈ −58`) and coincides with the goal-glow
    sprite, so visually it reads as part of the arrival rather than as an artifact — but it is not
    literally a no-op.
  - Particles: `1 − smoothstep(uReveal−0.05, uReveal, vProg)` fades each particle over the last 5%
    of its own path-progress loop before `vProg` wraps back to 0. v1 had no treatment there — each
    particle's loop simply popped from `vProg≈1` back to `vProg≈0` every cycle (~22–67s per
    particle, staggered by seed) with no fade. v2's window turns that hard pop into a smooth fade,
    which reads as an improvement, but — like the ribbon case — it is a permanent effect of the
    formula as given, not confined to the intro window.

  Both are flagged for review rather than silently reworked, since the exact windows were
  specified; neither breaks the continuity law (§5.11) and neither is visible as a defect in
  practice, but "the math is an exact no-op" is not quite true for these two terms and this file
  should not claim otherwise.

No other numbers in this file changed. Everything in the table above matches what's in
`demo/zenda-path.html` (regenerated from the artifact-format primary source) as of this recode.

---

## 10 · v3 — hero: stairs + dissolve + three circles

`ZENDA_DESIGN.md` §5.12 revised the hero only — everything from beat 2 (`t = 0.12`) onward is
untouched by this recode, byte-identical to the v2 build in §9. Two changes, kept deliberately
separate as the spec frames them: a new 3D opening form for the path (the stairs), and a rewritten
HTML hero block (the three circles, new copy, two working CTAs).

**1 · The stairs replace the suitcase and bullseye + arrow.** Both emblem sprites, their two
`CanvasTexture`s, their `easeOutBack`/pop/idle-bob per-frame code, and the `roundRectPath` canvas
helper are gone — no orphan variables or uniforms left behind. In their place: one merged
`BufferGeometry` (three `THREE.BoxGeometry`s translated into position, then their `position`,
`normal` and index arrays concatenated by hand into shared arrays, with a per-vertex `aStep`
attribute (0/1/2) recording which step each vertex belongs to) — one draw call for all three
steps. World placement: width 2.4 (x) × depth 0.8 (z) per step, slabs extending down to
`y = −1.2`; tops at `y = −0.50 / −0.25 / 0.00` with z centers `5.6 / 4.9 / 4.2`, x center `0.9`
(offset right of centre so the HTML hero copy on the left doesn't sit over them). The top step's
front edge meets the ribbon's start at `(0, 0, 4)`.

Fragment shader: a near-white base (`vec3(0.955)`) mixed toward the step's own ramp stop — `uC0`
(deep navy) for the bottom step, `uC1` for the middle, `uC2` (luminous blue) for the top step —
10% on side faces, 16% on top faces (`normal.y > 0.5`); side faces additionally darken by
`(1 − abs(normal.y)) · 0.06`. Then the shared `fogAt`/`uFogCol`/`toSRGB` treatment used by every
other element in the scene.

**The dissolve.** A new shared uniform, `uDissolve`, assigned every frame directly from
`rise(t, 0.05, 0.13)` — unlike `uReveal`, this is **not** a `Math.max` accumulator, so it is a
pure function of `t` in both directions: scrolling back up past `t = 0.05` re-forms the stairs.
The fragment samples 3D simplex noise at world position (`snoise(vW * 2.3) * 0.5 + 0.5`) and
discards below `uDissolve`; just above the threshold, a luminous edge band
(`smoothstep(uDissolve + 0.10, uDissolve, n)`) tints toward `uC2 * 1.7` at 85% strength, and a
guard (`uDissolve > 0.995 → discard`) keeps nothing lingering once fully dissolved. Material:
`transparent:false` (discard alone handles visibility), `depthWrite:true`, `depthTest:true`,
`renderOrder 1`, `frustumCulled:false`.

**The ribbon's one-line change.** So the ribbon reads as emerging from behind the top step rather
than starting in open air underfoot, its fragment shader gained a single multiply:
`a *= smoothstep(0.004, 0.03, vT)` — a soft fade over the first 3% of path-progress. Nothing else
in the ribbon shader changed; every beat-2-through-7 envelope, the camera rails, the org-path and
particle and node code are byte-identical to v2 (§9).

Net draw-call count: **seven** (was eight in v2 — two emblem sprites out, one stairs mesh in;
see §2).

**2 · The hero HTML block was rewritten wholesale.** New copy (verbatim from §5.12's approved
deck): eyebrow "Zenda", headline "Discover your path to financial freedom.", sub-copy about
personal direction, a `.steps` row of three circular badges (Discover / Roadmap / Progress, each
a hand-written inline SVG icon — magnifying glass, folded map with route + pin, gauge dashboard —
24×24, `#5856D6` stroke, under 6 elements apiece) joined by `.connector` lines, and two CTAs:
`#ctaStart` ("Start your journey 🚀", solid indigo pill) and `#ctaVinay` ("See Vinay's journey",
transparent/ghost). CSS added: `.sub` (44ch, 17px), `.steps`/`.step`/`.circle`/`.lbl`/`.connector`
per the token values already in the file (card shadow, `--label2`, `--accent`), `.cta` and its two
button styles (`#ctaStart` hover brightens, `.ghost` hover underlines; both share `#play`'s
focus-visible outline). `h1`'s `max-width` grew from `13ch` to `15ch` for the longer headline;
`.steps` gets `flex-wrap: wrap` and `.connector` hides under 480px so the row degrades on narrow
screens instead of overflowing.

The three `.step` elements get a small entrance (`opacity 0→1`, `translateY 8px→0`, 300ms
`cubic-bezier(0.16,1,0.3,1)`, staggered 900/1050/1200ms via `nth-child` delays) implemented as a
plain CSS `@keyframes` animation gated entirely inside
`@media (prefers-reduced-motion: no-preference)` — under reduced motion the rule doesn't apply at
all, so `.step` simply renders at its default `opacity: 1` with no JS-driven `.in` class needed.

**CTA behaviour.** Both buttons are wired unconditionally at the very top of the main IIFE, before
any of the three capability checks that can `return` early into the poster fallback — so the
buttons work even if the scene never starts (the poster hides `<main>` via CSS, it doesn't remove
it from the DOM). `#ctaStart` → `window.scrollTo({top: innerHeight*1.05, behavior:"smooth"})`
(also triggers the stairs' dissolve, since that scroll pushes `t` past `0.05`); `#ctaVinay` →
`window.scrollTo({top: innerHeight*3.15, behavior:"smooth"})`, riding deeper to the employee-view
beat.

**3 · Labels.** The HUD's beat-1 name (both the initial `#beatname` text and `BEATS[0]` in the JS
array) is now "01 · Hero — three steps up". The poster's copy was left exactly as-is, per spec.

**Unchanged, verified byte-for-byte:** the fallback/poster block (`showPoster`, the three
capability checks, the Play-button wiring), the HUD's DOM structure, the scroll listener, the
`introFloor`/`target = max(...)` handoff, `uReveal` and its gating of the ribbon/particles/nodes,
the six-stop journey ramp, the atmosphere-drift code, and every beat-2-through-7 envelope, the
camera rails, the org-paths mesh, the particles mesh, the milestone-nodes mesh, and the goal-glow
sprite — none of that code was touched by this recode.

**Verification performed:** `node --check` on the inline `<script>` extracted from both the
artifact-format primary source and the regenerated `demo/zenda-path.html` — both pass. A full-text
diff of the regenerated file against the primary source, after stripping only the
`<!doctype>`/`<html>`/`<head>`/`<body>` wrapper the regeneration step adds, is byte-identical.
`grep` for "suitcase", "bullseye", "emblem", "easeOutBack" and "roundRectPath" across the file
returns no matches. `uDissolve` is set with a plain assignment (`shared.uDissolve.value =
rise(t, 0.05, 0.13)`), not a `Math.max` accumulator, confirming it reforms on scroll-up rather
than one-way-latching like `uReveal`.

---

## 11 · v4 — goal rain + hero scale-up

Two purely additive changes from `ZENDA_DESIGN.md` §5.13 (the goal rain) and §5.14 (the hero
scale-up). Nothing from beat 2 (`t = 0.12`) onward is touched, and neither is any part of the
fallback/poster logic, the HUD, the scroll listener, the `introFloor`/`target = max(...)` handoff,
`uReveal`, `uDissolve`'s own assignment, the six-stop ramp, the atmosphere drift, the stairs, the
ribbon, the org paths, the milestone nodes, or the goal glow — all byte-identical to the v3 build
in §10.

**1 · The goal rain.** A new `buildGoalAtlas()` function (called once, before any material is
constructed) bakes the five life-goal emoji into a 640×128 canvas texture atlas of palette-tintable
white silhouettes, and a new `Points` buffer (16 particles desktop / 8 mobile) drifts them through
the hero's air around the stairs, tinted along the blue→indigo→purple span of the journey ramp and
gated by the same `uDissolve`/`uReveal` uniforms every other hero element already uses — so the
rain leaves with the stairs on scroll and re-forms on scroll-up, with no new envelope logic
introduced. See §2 (draw-call table), §5 (the v4 addition note on its fall/respawn cycle) and §6
(the full shader writeup, including the PointSize constant worked out from the target screen size)
for the details already recorded there rather than repeated here.

Net draw-call count: **eight** (was seven in v3 — the goal rain is the only new object; see §2).

**2 · Hero scale-up.** `ZENDA_DESIGN.md` §5.14's size table applied verbatim to the hero's CSS —
headline `clamp(34px,5.2vw,56px)` → `clamp(40px,6.4vw,78px)` (max-width `20ch` → `21ch`); sub-copy
17px → 20px (added `line-height:1.5`, max-width `44ch` → `52ch`); a new scoped `#hero .eyebrow`
rule at 13px (the shared `.eyebrow` rule used by the beat cards is untouched at 11px); circles
54px → 68px with a new `.circle svg{width:28px;height:28px}` rule (the inline SVGs still carry
`width="24" height="24"` attributes — CSS wins over presentation attributes, verified by reading
the cascade rather than rendering); labels 11px → 12px, margin-top 8px → 10px; `.steps` gap 14px →
18px, margin-top 26px → 34px; `.connector` 34px → 44px; `.cta` gap 12px → 14px, margin-top 30px →
36px; both CTA buttons 15px → 17px, padding `13px 26px` → `16px 34px`; the hero scrim ellipse
62%×58% → 70%×64%, its three stops `.94/.80/0` at 52%/78% → `.95/.82/0` at 52%/82%. Every value
matches the table in §5.14 exactly — no interpretation was needed.

A `@media (max-width:640px){ #hero{padding:6vh 6vw} }` rule was added, which the spec allowed only
if needed. Reasoning (no renderer available to confirm visually): at a 375×667 mobile viewport
with the original `10vh 8vw` padding, summing the now-larger stack — eyebrow, a 3–4-line headline
at the 40px clamp floor, a ~6-line sub-copy at 20px/1.5, the 34px-margin steps row with 68px
circles, and the 36px-margin CTA row — lands close to or past 667px of content height before
counting the 133px the padding alone consumes. Given the size increase applies to every element in
the stack at once, the estimate was judged more likely to overflow than not, so the fallback padding
reduction was added as a safety margin rather than risking an unreviewable overflow; it only applies
under 640px and does not touch the desktop/tablet layout.

**Verification performed:** `node --check` on the inline `<script>` extracted from both the
artifact-format primary source and the regenerated `demo/zenda-path.html` — both pass, and the two
extracted scripts are byte-identical (diffed directly). A full-text diff of the primary source
against a saved copy of its pre-v4 content shows exactly the intended changes: the nine CSS
declarations listed above, plus two purely additive blocks (the `buildGoalAtlas` function and its
one call site; the goal-rain `Points` IIFE) — no line outside those regions differs. `grep -c
"function buildGoalAtlas"` returns `1` in both files, confirming the atlas builder is defined
exactly once in each and the two files agree; the bare substring `"buildGoalAtlas"` returns `2` in
both (the definition plus its single call site, `var goalAtlas = buildGoalAtlas();`) — noted
explicitly since a literal reading of "should be 1" doesn't hold once the function is actually
invoked, but both files still agree with each other and neither duplicates the builder.
`var heroOp=1-rise(t,0.095,0.14);` is unchanged, confirmed by direct grep. The scene's draw-call
count was taken by listing every `scene.add(...)` call in the built file rather than trusting the
design doc's running tally: ground, ribbon, org-paths, paycheck particles, milestone nodes, stairs,
goal rain, goal glow — eight, matching the update to §2.

---

## 12 · v5 — ambient atmosphere

Three purely additive elements from `ZENDA_DESIGN.md` §5.15 ("Filling the air"): the horizon
aurora, the depth motes, and the ground ripples. Nothing from beat 2 (`t = 0.12`) onward is
touched, and neither is any part of the fallback/poster logic, the HUD, the scroll listener, the
`introFloor`/`target = max(...)` handoff, `uReveal`'s own gating, `uDissolve`'s own assignment,
the six-stop ramp, the stairs, the ribbon, the org paths, the paycheck particles, the milestone
nodes, the goal rain, or the goal glow — all byte-identical to the v4 build in §11. The changes
are exactly: two new additive scene objects, one edit inside the existing ground fragment shader,
and one new per-frame uniform (`uProg`) feeding the first of those two objects.

**1 · The horizon aurora.** A soft, slow-breathing wash of light behind the goal — blue early,
warming toward violet as `t` rises, so the horizon has been visibly arriving at the goal's colour
for the whole ride by the time the visitor gets there. One `PlaneGeometry(140,34)` at
`(0,9,-78)`, `renderOrder -1`, `depthTest:false`, `depthWrite:false`, `transparent:true` — drawn
behind everything regardless of scene-add order. No fog mix: the aurora doesn't recede with
distance like every other element, because it *is* the horizon light the fog is fading toward.
Full shader write-up, and the reasoned placement check against both the hero and arrival camera
framings, is in §6.

**2 · Depth motes.** A dozen (14 desktop / 7 mobile) very large, very faint bokeh discs — blue to
indigo, 2.5–5% alpha, 80–220px — spawned across the *entire* ride (`z = 6 - (i/N)*66` ± jitter,
not clustered at the hero) so the atmosphere travels with the visitor rather than sitting only
around the stairs. One `Points` buffer, slow independent sine bob/sway per particle, no CPU
per-frame work. Deliberately **not** gated by `uDissolve` — per §5.15's behaviour rules, aurora
and motes fade in with the intro (`× uReveal`) but then persist for the whole ride as atmosphere,
unlike the goal rain (§11) which is a hero prop that leaves with the stairs. Full shader write-up
in §6.

**3 · Ground ripples.** Thin concentric rings expanding slowly outward from the base of the
stairs — world `(0, z=4)`, the path's origin — layered into the *existing* ground fragment shader
rather than a new object, so this element costs zero additional draw calls. The ground material
gained its first-ever uniform (`uTime`, wired via the existing `U()` helper) to drive the
expansion. Combine rule: **`a = max(dotAlpha, ringAlpha)`**, not a sum — chosen so the rings read
as a distinct wash layered under the dot grid rather than double-brightening wherever a ring
happens to cross a dot intersection; both terms share the dot grid's existing ink-grey colour.
Full shader write-up in §6.

**The `uProg` uniform.** `shared.uProg.value = t` is now assigned every frame, immediately after
`uTime`, alongside the other envelope updates. It is a direct, ungated mirror of the rendered `t`
— not a `rise`/`env` shape like everything else in §5's table — added because the aurora's colour
mix needs the ride's progress inside a shader and no existing uniform already carried it in that
form. The other two v5 elements needed no new uniform: depth motes use `uTime`/`uReveal` only, and
ground ripples use `uTime` only. See §5.

**Draw-call count: ten** (was eight in v4 — the aurora plane and the depth-motes buffer are the
only two new objects; the ground ripple is a shader-only edit and adds none). See §2.

**Deviation, flagged rather than silently resolved.** The spec's draft mote count in the task
brief text said "N = 7 mobile / 14 desktop", and separately §5.15 B's prose says "a dozen"; both
were followed literally as given (7/14), which is what shipped — noted here only because "a
dozen" and "14" aren't the same word, not because anything was changed from the brief's explicit
numbers.

**Verification performed:** `node --check` on the inline `<script>` extracted from both the
artifact-format primary source and the regenerated `demo/zenda-path.html` — both pass, and the two
extracted scripts are byte-identical (diffed directly). A full-text diff of the primary source
against a saved copy of its pre-v5 content (reconstructed from the exact text read at the start of
this recode) shows exactly five changes and nothing else: `uProg:{value:0}` added to the `shared`
uniforms object; the horizon-aurora IIFE inserted whole, immediately before the ground block; the
ground material's `uniforms:{}` → `uniforms:U(["uTime"])` plus the ripple-ring block inside its
fragment shader; the depth-motes IIFE inserted whole, immediately before the goal-glow sprite; and
`shared.uProg.value=t;` added to the frame loop next to `shared.uTime.value=time;`. Every line the
do-not-touch list named — fallback/poster/Play-button/reduced-motion, the HUD, the scroll
listener, the `introFloor`/target handoff, `uReveal`/`uDissolve` semantics, the six-stop ramp, the
stairs, the ribbon, the org paths, the paycheck particles, the milestone nodes, the goal glow, the
hero HTML/CSS, `var heroOp=1-rise(t,0.095,0.14);`, and every beat from `t=0.12` onward — is
untouched, confirmed by the same diff. `grep` for `"aurora"` and `"depth motes"` returns matches in
both the primary source and the regenerated `demo/zenda-path.html`, at consistent line numbers
apart from the file-wrapper offset, confirming the two stayed in sync through regeneration. The
scene's draw-call count was taken by listing every `scene.add(...)` call in the built file, in
scene-graph order: aurora, ground, ribbon, org-paths, paycheck particles, milestone nodes, stairs,
goal rain, depth motes, goal glow — ten, matching the update to §2.
