# UI system — the build spec for every Studio chrome surface

This is the single doc anyone (Claude, `agy`, a teammate) reads before touching Studio
chrome UI. It doesn't repeat what the other design docs already say — it points at them
and adds the two things they don't cover: **which surface to build next**, and **how to
hand a surface to `agy` without it drifting from what's already locked**.

Reading order for a new surface:
1. This file — inventory, priority, boundaries, the agy handoff process.
2. `docs/DESIGN-TOKENS.md` — the token table. Every color/type/spacing/radius/shadow/motion
   value a surface uses comes from here. Nothing hand-picked.
3. `docs/SURFACE-INSPO.md` — the UX critique of each existing surface, with exact
   file:line pointers into the current (pre-restyle) code.
4. `docs/VISUAL-INSPO.md` — why the token choices are what they are, if the "why" matters
   for a judgment call mid-build.
5. `docs/MOTION-INSPO.md` — only for surfaces that carry motion. Read before touching
   anything with `motion/react` in it.

---

## 1. The three-layer boundary — read this before writing one line of CSS

Framewright has three separate visual systems now. Confusing them is the single most
likely way this work goes wrong.

| Layer | Where | Governed by | Touch it? |
|---|---|---|---|
| **CMS preview theming** | `client/src/index.css` `:root`/`.dark`, `colors` block in `tailwind.config.js`, every file under `client/src/sections/generated/` | `docs/CONTRACT.md` §6-§8 — graded | **Never.** Not even to "improve" it. |
| **Studio chrome (new)** | `.studio-theme` scope in `index.css`, `studio` key in `tailwind.config.js`'s `theme.extend`, everything under `client/src/studio/*.jsx` and the route shells | `docs/DESIGN-TOKENS.md` | Yes — this is what you're building. |
| **Studio chrome (old, not yet migrated)** | `App.jsx`'s `Nav`/`StudioLayout`, `LandingPage.jsx` | Currently reuses the frozen `--color-*` vars (`bg-background`, `text-accent`, etc.) as incidental chrome styling, not because the contract requires it there | Migrate to `studio-*` as each surface gets rebuilt — see §3. Not urgent on its own; do it when you're already touching the file for a real surface change. |

A `studio-*` class and a bare `bg-background`/`text-accent`/etc. class must never appear on
the same element. If a diff does that, it's a boundary violation, not a style choice.

---

## 2. Surface inventory and priority

Build order, not a hard gate — the Cap'n can reorder any time. Landing page is
deliberately last regardless of everything else moving.

| # | Surface | File(s) | Status | Notes |
|---|---|---|---|---|
| 1 | **Login** | new `routes/LoginPage.jsx` | Next up | Mock-wired (§4). No backend, no Redux slice. |
| 2 | **Composer** | `studio/Composer.jsx` | Built, first pass reviewed | Not yet wired into `GeneratePage.jsx` — still living behind `/design-preview`. |
| 3 | **Stage Inspector** | `studio/StageInspector.jsx` | Not started | Highest-leverage fix per SURFACE-INSPO §5 — type the renderer by artifact shape instead of one raw `<pre>`. |
| 4 | **Job Timeline + Generation Progress** | `studio/JobTimeline.jsx`, `studio/GenerationProgress.jsx` | Not started | Collapse to a stepper (SURFACE-INSPO §3-4) **and** carries the one signature Animated-Beam moment (MOTION-INSPO). |
| 5 | **Generated Source View** | `studio/GeneratedSourceView.jsx` | Not started | Preview/Code toggle in place of the "View in Preview" navigation-away link (SURFACE-INSPO §9). |
| 6 | **Job History** | `studio/JobHistory.jsx` | Not started | Clickable rows, page/section name instead of bare job ID (SURFACE-INSPO §6). |
| 7 | **HITL Question/Answer** | `studio/QuestionPrompt.jsx` | Not started | Consolidate to one shared image with numbered bboxes (SURFACE-INSPO §7). Keep the bbox-overlay idea — it's already a real strength. |
| 8 | **Confidence badge consistency** | `studio/QuestionPrompt.jsx` line ~87 | Not started | One-line fix: reuse `<ConfidenceBadge>` instead of raw text (SURFACE-INSPO §8). |
| 9 | **App shell / Nav** | `App.jsx` | Not started | Migrate off frozen tokens once surfaces 1-8 give it a reason to be touched. |
| 10 | **Preview page shell chrome** | `routes/PreviewPage.jsx` (the wrapper only — never the rendered CMS content inside it) | Not started | |
| — | **Landing page** | `routes/LandingPage.jsx` | **Last, on purpose** | Lowest priority. Allowed to be more expressive than the tool chrome — this is where Aceternity's showcase-only components (Aurora, Meteors, etc.) are fair game if it still ends up not reading as generic "AI slop." |

---

## 3. Component-variant catalog (codified from Composer)

`docs/DESIGN-TOKENS.md` intentionally shipped with primitives only, no component specs —
the plan was to improvise the first surface and write down what actually got used.
`studio/Composer.jsx` is that first surface. These are now the standing patterns; reuse
them rather than inventing a second button style.

- **Primary button** — `rounded-studio-md bg-studio-accent px-4 py-2 text-studio-sm font-medium text-studio-accent-foreground transition-colors duration-studio-fast hover:bg-studio-accent-hover focus:outline-none focus:shadow-studio-glow`. One per surface, max — this is the only saturated-fill element allowed (the "one accent used with restraint" rule).
- **Segmented/pill control** (mode selectors, tab bars) — track: `flex items-center gap-0.5 rounded-studio-md bg-studio-bg-overlay p-1`; active item: `bg-studio-bg-base text-studio-text-primary shadow-studio-xs`; inactive: `text-studio-text-secondary hover:text-studio-text-primary`. (Motion Primitives' "Animated Background" `layoutId` technique — MOTION-INSPO §2 — is the natural upgrade for the sliding-pill motion once a surface needs it; not required for a static pill.)
- **Text input / textarea** — `rounded-studio-md border border-studio-border bg-studio-bg-base px-3 py-2.5 text-studio-sm text-studio-text-primary placeholder:text-studio-text-tertiary focus:border-studio-accent focus:outline-none focus:shadow-studio-glow`. Code/monospace content adds `font-studio-mono`.
- **Card / panel** — `rounded-studio-lg border border-studio-border bg-studio-bg-raised shadow-studio-sm` (raise to `shadow-studio-md`/`-lg` only for a modal or genuinely elevated overlay).
- **Chip (example prompts, tags)** — `rounded-studio-xl border border-studio-border px-2.5 py-1 text-studio-xs text-studio-text-secondary transition-colors duration-studio-fast hover:border-studio-border-strong hover:text-studio-text-primary`.
- **Disclosure (demoted fields)** — native `<details>`/`<summary>`, chevron `lucide-react` `ChevronDown` rotated via `group-open:rotate-180`, summary text `text-studio-xs text-studio-text-tertiary`.
- **Error/inline banner** — `rounded-studio-sm border border-studio-destructive/30 bg-studio-destructive/10 px-3 py-2 text-studio-sm text-studio-destructive`.
- **Icons** — Lucide only, `strokeWidth={1.75}`, sized `h-4 w-4` inline / `h-5 w-5` standalone. No filled/duotone variants.

When a new surface needs something this list doesn't cover, build it, then add it here in
the same commit — this list drifting from reality is exactly the failure mode it exists to
prevent.

---

## 4. The login page — scope, locked

Cap'n's call, 2026-08-23: **mock-wired, ready to swap later.** Concretely:

- New route `/login` (`routes/LoginPage.jsx`), linked from `App.jsx`'s route table.
- A single `studio/auth/mockAuth.js` module exporting one function, e.g.
  `login({ email, password })`, that returns a `Promise` (simulate latency with a short
  `setTimeout`) resolving `{ user: { email } }` — shaped exactly like a real
  `fetch('/api/auth/login', ...).then(r => r.json())` call, so replacing the body with a
  real fetch later is a one-line change inside that one module and nothing else has to
  change.
- On success: persist `{ email }` to `localStorage` under one key (e.g.
  `framewright.session`) and navigate to `/generate`. **Do not** add a Redux slice or touch
  `redux/reducers.js`/`redux/cmsSlice.js` — §5.2's `cms` namespace is the only thing that
  file is allowed to grow around, and a session flag doesn't need Redux at all.
  `App.jsx`'s `Nav` can read the localStorage key directly to show a signed-in state.
- No route guarding required — `/generate` and `/preview/:pageName` stay reachable
  regardless of session state. This is a demo surface, not an access gate.
- Visual bar: same as Composer — a real, polished card (email + password fields, primary
  button, restrained), not a placeholder form.

---

## 5. Motion — the discipline, not just the technique

`docs/MOTION-INSPO.md` documents four Motion Primitives components and one Aceternity
component in addition to Animated Beam. **That is a menu of options for when a specific
surface's brief calls for one, not a checklist to work through.** The Cap'n's instruction
was "restrained everywhere, plus one signature moment" — that ceiling is a hard rule:

- **Base motion** (hover, focus, panel-open, reveal) — use the tokens already locked in
  `DESIGN-TOKENS.md` §6 (`--studio-duration-*`, `--studio-ease-*`). No new durations or
  easings without a reason written into the surface's brief.
- **The one signature moment** — Animated Beam, adapted (not copied — MOTION-INSPO §1 has
  the full technique breakdown) into `studio/JobTimeline.jsx` / a shared
  `studio/motion/PipelineBeam.jsx`, visualizing data flowing between the 7 pipeline stage
  nodes. `--studio-ease-standard` already matches the technique's hardcoded easing, so no
  new token is needed for it.
- **Everything else in MOTION-INSPO** (Border Trail, Text Shimmer, Transition Panel,
  Glowing Effect) is optional secondary polish — only add one if the surface's own brief
  names it for a specific reason (e.g. Transition Panel for the Stage Inspector's
  panel-swap, since that's literally what it's for). Don't decorate a surface with motion
  because the option exists.
- Every animation must collapse to an immediate state change under
  `prefers-reduced-motion: reduce` — this was already a rule in `DESIGN-TOKENS.md` §6 and
  still applies to anything adapted from MOTION-INSPO.

---

## 6. Handing a surface to `agy`

Per the standing workflow: `agy` builds, Claude briefs and gates. One surface at a time.
Commit the moment it verifies — never batch two surfaces into one uncommitted working tree.

**Invocation:**
```
agy --dangerously-skip-permissions --model gemini-3.1-pro-high -p "<brief>"
```
Flags before `-p`, always — anything after `-p` is swallowed into the prompt string.

**Every brief must include:**
1. The exact surface (one row from §2's table) and its file(s).
2. A pointer to this file, plus the specific `DESIGN-TOKENS.md` sections and
   `SURFACE-INSPO.md` section number that apply.
3. The three-layer boundary from §1, stated explicitly — which files are off-limits
   (`index.css`'s `:root`/`.dark` blocks, the `colors` block in `tailwind.config.js`,
   anything under `sections/generated/`, `redux/reducers.js`, `redux/cmsSlice.js`).
4. Whether this surface carries motion, and if so, which MOTION-INSPO technique — quoting
   the relevant paragraph rather than making agy re-derive it.
5. What "done" looks like in concrete, checkable terms (not "make it nice").

**Before committing what agy produces, verify:**
- `npm run dev` (client only) still boots clean — no new console errors.
- Every color/spacing/radius/shadow class used is `studio-*` or a Lucide icon — grep the
  diff for raw hex codes or `bg-background`/`text-accent`/etc. bleeding into new files.
- The three-layer boundary held — diff the files agy touched against the off-limits list.
- Screenshot it (Playwright, `/design-preview`-style isolated route if the surface isn't
  wired into the real route yet) and actually look before calling it done.
- If the surface has a `.logic.js` counterpart pattern (see existing `studio/*.logic.js`
  files), confirm agy kept business logic there and out of the `.jsx`, matching the
  project's own testability convention (`AGENTS.md`).

This UI work sits outside the team's `tools/baton.mjs` task queue for now — it's a
Cap'n-directed initiative, not a claimed `T-xxx` task. If it needs to join the formal
board later (so other teammates' `continue build` sees it), that's a one-time registration
in `_build/tasks.json`, not a change to anything above.
