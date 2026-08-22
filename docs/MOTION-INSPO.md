# Motion inspiration — the one signature moment

Fast-pass research for Framewright's single signature animated moment: visualizing the
7-stage generation pipeline (`input-acquisition` → `preprocessing-normalization` →
`multimodal-understanding` → `semantic-planning-ir` → `code-generation-assembly` →
`validation-qa` → `output-delivery`, per `STAGE_NAMES` in
`client/src/studio/JobTimeline.jsx`) and/or the live job progress in
`client/src/studio/GenerationProgress.jsx`. Everything else in the Studio chrome stays on
the restrained hover/transition motion already locked in `docs/DESIGN-TOKENS.md` §6.

Every technique below was read directly from the cited source (docs page and/or component
source file fetched from the library's own GitHub repo) — marked VERIFIED. Nothing here is
invented; nothing should be copied verbatim into the codebase — adapt the technique to
Framewright's own token names, stage data shape, and dark palette.

---

## Animated Beam — the signature moment

**Source:** https://magicui.design/docs/components/animated-beam (docs — props table),
plus the full component source, VERIFIED by direct fetch of
`apps/www/registry/magicui/animated-beam.tsx` from `github.com/magicuidesign/magicui`
(the exact file the docs page's "Code" tab renders).

### What it actually is (not a spinner, not dasharray)

The illusion of "light traveling along a wire between two boxes" is built from **two static
SVG `<path>` elements sharing one `d` string**, not an animated `stroke-dasharray` and not
a moving `motion.div`. The moving part is a **`<linearGradient>` whose stop-coordinates are
animated**, painted through the second path via `stroke="url(#id)"`.

Concretely, per beam:

1. **Path geometry, computed from real DOM rects, not fixed coordinates.** A `useEffect` +
   `ResizeObserver` reads `containerRef`, `fromRef`, `toRef` via `getBoundingClientRect()`,
   converts each node's center point into container-relative coordinates, and builds a
   single **quadratic Bézier**: `M startX,startY Q midX,controlY endX,endY`, where
   `controlY = startY - curvature` (curvature `0` → dead-straight line; non-zero bows the
   curve). This re-runs on every container resize, so it's live-responsive to layout, not
   baked in. `startXOffset/startYOffset/endXOffset/endYOffset` let you nudge the anchor
   point off dead-center (e.g. to a specific port on an icon).
2. **Two `<path>`s, same `d`:**
   - Path A: the static, faint background track — `stroke={pathColor}` (default `gray`),
     `strokeOpacity={pathOpacity}` (default `0.2`), `strokeWidth={pathWidth}` (default `2`).
     This is what makes the "wire" always visible, even when the light pulse isn't over it.
   - Path B: same geometry, `stroke="url(#gradientId)"`, full opacity. This is the moving
     part.
3. **The gradient is the animation.** A `<defs><motion.linearGradient>` (Framer
   Motion's `motion` component wrapping a raw SVG `<linearGradient>`) with
   `gradientUnits="userSpaceOnUse"` animates its `x1/x2/y1/y2` attributes as **percentage
   keyframes** — e.g. non-reversed: `x1: ["10%","110%"]`, `x2: ["0%","100%"]` (y stays at
   `0%`). That slides a short, four-stop gradient window (`transparent → startColor →
   stopColor@32.5% → transparent`) from off one end of the path to off the other end,
   over and over. Because the window is short relative to the path and mostly transparent
   at its edges, it reads as a bright pulse of light traveling the wire — the path itself
   never moves or redraws. `reverse` just swaps which direction the `x1/x2` keyframes run.
4. **Timing:** `duration` default `5`s, `delay` default `0` (this is the stagger knob for
   multiple beams), `repeat` default `Infinity`, `repeatDelay` default `0`, easing is a
   **hardcoded** `[0.16, 1, 0.3, 1]` — i.e. easeOutExpo. Framewright's own
   `--studio-ease-standard` in `docs/DESIGN-TOKENS.md` §6 is the *identical* curve
   (`cubic-bezier(0.16, 1, 0.3, 1)`), so a reimplementation can reuse the existing motion
   token as-is rather than importing a new easing value.
5. **Rendering:** one `<svg>` per beam, `absolute top-0 left-0`, `pointer-events-none`,
   sized to the container's live width/height, `viewBox` matching. Multiple beams are just
   multiple `<AnimatedBeam>` instances layered over the same relatively-positioned
   container — there's no shared canvas.

### Animation library

`motion/react` — i.e. the unified **`motion`** npm package (Framer Motion's successor,
same team/API, published under the new name). Confirmed by the `import { motion } from
"motion/react"` line at the top of the fetched source.

### Composition pattern (why this maps directly onto the pipeline)

The docs page's own example set is structurally almost exactly the pipeline-timeline
use case: **"Animated Beam Uni-Directional," "Bi-Directional," "Multiple Inputs,"
"Multiple Outputs"** (VERIFIED headings on the docs page) — several source icons beaming
into one hub, or one hub fanning out to several targets. That's the same shape as "7
pipeline-stage nodes, data flowing stage→stage" — just a chain instead of a star. For
Framewright: one `<AnimatedBeam>`-style component reused between each adjacent pair of the
7 `JobTimeline` stage nodes (`fromRef`/`toRef` pointing at each stage's DOM element),
`delay` staggered per-beam so the pulse advances left-to-right in sequence as
`GenerationProgress` reports which stage is currently `running`, and the beam only
active/bright for the stage that's actually in-flight (idle/complete stages could render
the static track only, i.e. omit or fade the gradient path). `pathColor`/`gradientStart/
StopColor` would map onto `--studio-border` for the idle track and `--studio-accent` /
`--studio-accent-hover` for the moving pulse, keeping it inside the locked one-accent rule
in `DESIGN-TOKENS.md` §1.

---

## Motion Primitives — restrained candidates

**Source:** https://motion-primitives.com/docs (vision/library page, VERIFIED: "All
components are built with **Motion**" — same `motion` package as above, confirmed again
by every `import ... from 'motion/react'` line in the four sources fetched below from
`github.com/ibelick/motion-primitives`, path `components/core/*.tsx`).

Four components most relevant to tool chrome (not marketing pages):

**Border Trail** (`/docs/border-trail`) — a single small square (`motion.div`, default
`size=60`px, `bg-zinc-500`) is animated around a container's edge by animating CSS
`offsetDistance` from `0%` to `100%` along a CSS **motion path** (`offset-path:
rect(0 auto auto 0 round <size>px)`), masked so only the border ring itself is visible
(`mask-image`/`mask-composite: intersect` trick, not SVG). Default transition: `repeat:
Infinity, duration: 5, ease: 'linear'`. This is a *loading ring that traces a card's
border* rather than a spinner — reads as restrained, and is a plausible **secondary**
treatment for "this stage card is currently active" (distinct from, and much quieter than,
the beam). Fits a Raycast/Vercel-style dark tool fine at low opacity/small size.

**Animated Background** (`/docs/animated-background`) — implements the classic
Raycast/segmented-control "sliding pill" behind whichever sibling is active/hovered, via
Framer Motion's **shared `layoutId`** (`motion.div layoutId="background-{id}"` cloned
into whichever child is active, wrapped in `AnimatePresence`). No manual position math at
all — Motion's layout animation system handles the FLIP-style tween between the old and
new active element's rects. `transition` is caller-supplied (no forced default visible in
source). This is exactly the technique Raycast-style tab bars use and is already
restrained/expected in this genre — good fit for e.g. a stage-filter tab bar or the
mode selector, not the signature moment itself.

**Text Shimmer** (`/docs/text-shimmer`) — animates `backgroundPosition` on a CSS
`background-image` gradient text-clip (`bg-clip-text`, `text-transparent`) from `100%
center` to `0% center`, `repeat: Infinity`, default `duration: 2`, `ease: 'linear'`; the
gradient's `--spread` scales with string length (`children.length * spread`, default
`spread=2`). This is the "shimmering placeholder text" seen in many AI dev tools for
in-progress labels (e.g. "Generating…"). Subtle, monochrome-friendly (base color driven by
CSS vars, easy to point at `--studio-text-secondary`/`--studio-text-primary`), and fits the
restrained bar well — a good candidate for the *stage label text itself* while a stage is
`running`, layered underneath/alongside the beam rather than duplicating it.

**Transition Panel** (`/docs/transition-panel`) — a thin wrapper: `AnimatePresence
mode="popLayout"` swapping one `motion.div` (keyed by `activeIndex`) for the next, driven
entirely by caller-supplied `variants`/`transition` (enter/center/exit). No opinion of its
own about timing or easing — it's a mechanism, not a visual effect. Directly reusable for
swapping the stage-inspector detail panel's content when the selected stage changes, using
Framewright's own existing durations/easing rather than importing new ones.

All four are restrained enough for a Raycast/Vercel-style dark dev tool — none of them are
inherently showy; the showiness is entirely a function of the caller's chosen colors,
sizes, and durations, which is why Motion Primitives reads as the more "tool-chrome-safe"
library of the three overall.

---

## Aceternity UI — tool-chrome candidates vs. landing-page-only spectacle

**Source:** https://ui.aceternity.com/components (component index, browsed live) plus
component source fetched directly from Aceternity's own shadcn-compatible registry
endpoints (`https://ui.aceternity.com/registry/<name>.json`) — VERIFIED for
`glowing-effect`, `aurora-background`, and `meteors`.

Aceternity's own component index groups things under headings like "Backgrounds &
Effects" (Aurora Background, Meteors, Vortex, Background Beams, Shooting Stars, Lamp
Effect, Google Gemini Effect) and separately "Card Components" / "Buttons" — the split
between showcase spectacle and reusable UI chrome is visible in that grouping itself.

**Tool-chrome-safe, in restrained form:**

- **Glowing Effect** (`/components/glowing-effect`) — VERIFIED page description: *"A
  border glowing effect that adapts to any container or card, **as seen on Cursor's
  website**."* That's a direct precedent for using it in a dev tool. Technique (from the
  fetched `.tsx`): a `pointermove`/`scroll` listener tracks cursor position, computes the
  angle from the card's center to the pointer, and animates a CSS custom property
  (`--start`, the gradient's rotation angle) toward that angle using Motion's imperative
  `animate()` call (`ease: [0.16, 1, 0.3, 1]` — same easeOutExpo curve again,
  `movementDuration` default `2`s). The visible "glow" is a `repeating-conic-gradient`
  border masked to a thin ring via `-inset-px` + `rounded-[inherit]`, activated only within
  a configurable `proximity`/`inactiveZone` near the card. At low `blur`/`spread` and a
  single-hue (violet, matching `--studio-accent`) instead of the default 4-color rainbow
  gradient, this is genuinely restrained — a plausible treatment for "this stage card has
  focus" or "this is the currently-selected job," as a secondary accent, not the signature
  moment.
- **Bento Grids** (`/blocks/bento-grids`, a layout block, not a single component) — the
  *layout technique* (asymmetric CSS-grid cards of varying spans) is reusable for a
  dashboard/job-history overview screen regardless of Aceternity's own marketing styling;
  take the grid structure, drop their gradient/hover flourishes.
- **Moving Border** (`/components/moving-border`, browsed in the index) — an animated
  border technique on buttons; could work at very reduced intensity for a single "active"
  CTA, but sits right at the edge of "too showy" — lower priority than Glowing Effect for
  this project.

**Landing-page-only spectacle — reserve for `LandingPage.jsx`, not the Studio chrome:**

- **Aurora Background** (`/components/aurora-background`) — VERIFIED from source: it's a
  `<main>`-level wrapper forcing `h-[100vh]` full-viewport layout with layered blurred
  gradient blobs — a hero-section background, not a component you drop inside a card or
  panel. Full-screen-only by construction.
- **Meteors** (`/components/meteors`) — VERIFIED from source: spawns N (default 20)
  randomly-positioned diagonal streak `<span>`s across the *entire containing element*,
  animated via a Tailwind keyframe class (`animate-meteor-effect`, defined in Tailwind
  config, not inline). Randomized, decorative, reads as "marketing hero decoration," not
  something with any relationship to real state — wrong semantics for a tool that's
  supposed to represent an actual pipeline.
- Also browsed and clearly in the same bucket: Vortex, Background Beams (With/Without
  Collision), Shooting Stars, Lamp Effect, Google Gemini Effect, Wavy Background,
  Background Boxes — all full-bleed background spectacle intended for hero sections.

Since the landing page is lowest priority and built last, and is explicitly allowed to be
more expressive than the tool chrome, these are worth a second pass then — not now.

---

## Dependency

All three libraries verified above are built on the same animation engine: the **`motion`**
npm package (`motion/react` import path — Framer Motion's successor/rebrand, same team).
Every fetched source file (`animated-beam.tsx`, `border-trail.tsx`,
`animated-background.tsx`, `text-shimmer.tsx`, `transition-panel.tsx`, and Aceternity's
`glowing-effect.tsx`) imports from it.

**Recommendation:** add a single new dependency to `client/package.json`:

```
motion
```

(not `framer-motion` — that's the legacy package name; `motion` is the current, actively
maintained successor that all three libraries above are actually built on). One dependency
covers the signature Animated-Beam-style moment, any Motion Primitives component adopted
later (Border Trail, Animated Background, Text Shimmer, Transition Panel), and Aceternity's
Glowing Effect if that gets adopted too — no need for three separate animation
dependencies.
