# Framewright Product Requirements

## Original problem statement
Build a frontend-only React + Vite + Tailwind CSS web app called Framewright — a dark-themed, premium AI developer-tool product that turns a wireframe image, pasted React code, or a text prompt into a CMS-ready React section, with full visibility into the generation pipeline. Mock all API responses, job data, and generation results with realistic fake async flows. Use React Router for pages and localStorage only for mock session state.

## Architecture decisions
- React single-page frontend with React Router routes for `/`, `/login`, `/generate`, and `/preview`.
- All generation, confidence, stage metadata, history, and authentication are intentionally client-side mocked.
- Framer Motion drives page entrances, nav/mode transitions, stage progress, accordions, output reveal, and preview variation transitions.
- CSS variables define the warm near-black/zinc surface ladder, neutral borders, blue accent, and semantic green status colors.
- No backend API calls are used by the product.

## User personas
- Product and marketing developers who need editable React sections from rough visual or written inputs.
- Design engineers who want to inspect pipeline telemetry and quality gates before shipping.
- Small product teams who need a fast, calm alternative to hand-building CMS sections.

## Core requirements
- Premium dark developer-tool shell with floating navigation and responsive mobile menu.
- Landing page with hero CTAs and four pipeline/quality bento cards.
- Mock login with localStorage session and Studio redirect.
- Studio modes: Wireframe, Code, Prompt, Combined.
- 13-stage mocked generation stepper with status, timing, metadata inspector, and confidence score.
- Responsive generated section preview, Desktop/Tablet/Mobile viewport controls, live content editor, source tab, copy feedback, and job history.
- Full-width Live Preview page with two animated design variations.
- Responsive layouts, reduced-motion CSS fallback, and descriptive data-testid coverage for interaction-critical UI.

## Implemented — 2026-03-04
- Replaced the starter screen with complete Framewright product experience and routing.
- Added mock auth, file input, all four composer modes, async pipeline, 13 stages, inspector, confidence count-up, generated output, source copy, and editor controls.
- Added landing bento pipeline cards, live preview variations, floating nav active-pill animation, mobile navigation drawer, and responsive styling.
- Verified with ESLint, production build, browser route checks, generation flow testing, source copy testing, mobile drawer testing, and mobile overflow checks.

## Feature update — 2026-08-23
- Resolved the reported Home ⇄ Preview navigation glitch by regression-testing repeated client-side route transitions and hardening the responsive navigation flow.
- Reworked the landing page into a more animated iOS-inspired liquid-glass surface with live generation console, signal rail, animated border trails, ambient grid, feature deck, and closing CTA.
- Added mobile-specific composition and verified 100% frontend regression coverage with no blank routes or horizontal overflow.

## Feature update — 2026-08-24
- ROOT-CAUSE FIX for the Studio→Home/Preview flicker: `Routes` was reading live router context during Framer Motion `AnimatePresence` exit, so the exiting page briefly re-matched the new URL before fading out. Fixed in `components/Shell.jsx` by capturing `useLocation()` and cloning the `Routes` child with a pinned `location` prop, so the exiting tree keeps rendering its own old route during exit. Verified via 50ms DOM polling across 20+ transitions with zero blank/stale frames.
- Removed the animated conic-gradient border and the two moving `.trail` light-streak divs from the landing hero console; kept the static glass-panel border/shadow.
- Refactored the former single dense `App.js` into `pages/` (Landing, Login, Studio, Preview), `components/Shell.jsx` (Nav, Shell, Logo, Badge, Label, Button, Field), `components/studio/` (AccentColor, LivePreviewPanel, PipelinePanel) and `data/mock.js`.
- Studio composer: dropzone copy fixed to "max 8MB"; added an optional collapsible Accent colour control (color input + 5 presets + reset) that overrides the generated section's accent everywhere it's used.
- Studio right column rebuilt into two stacked panels: a full-width Live Preview panel (Mobile/Tablet/Desktop breakpoint toggle + always-present sandboxed `<iframe>` mock page bound to Page/Section/content fields and accent) and a Generation Pipeline panel supporting 5 job states (idle/running/needs-input/done/failed) via a dev-only state switcher — 7-node stage timeline with click-to-inspect strip (input/output/model/confidence/warnings), needs-input question card with pill choices, done-state tab bar (Stages/Code/Content) with live content editing synced to the preview iframe, and a failed-state plain-language error banner.
- "Generate section" now runs a real ~3.4s animated 7-stage progression to Done; guarded against re-entry while running (button disabled + label change) and against orphaned timers (ref + unmount cleanup).
- Hardened `buildPreviewDoc` (HTML-escaped interpolation, accent hex validation, iframe `sandbox="allow-same-origin"`) and the code-copy button (clipboard promise properly caught, no more blocking CRA error overlay).
- Fixed CSS overflow bugs: composer field-grid clipping at desktop widths, and live-preview-frame/stage-timeline/code-box forcing page-level horizontal scroll at 390px (missing `min-width:0` on grid/flex ancestors).
- Tested via `testing_agent` across two rounds (iteration_4, iteration_5): 100% pass, zero console errors, all fixes confirmed with DOM measurements.

## Feature update — 2026-08-24 (Design/Code editor)
- Added a Figma-style "Design" tab (Stages/Code/Content/Design tab bar in the DONE pipeline state): free-form drag-to-reposition canvas (framer-motion drag) for Headline/Subtext/CTA/Image blocks, a Layers list with up/down reordering, and a style inspector (font size/weight, text colour, background colour, width, height, padding, alignment) — all synced live to the Live Preview iframe.
- Code tab is now a fully editable textarea; edits are parsed back (regex-based mock parser matching `data-el="id"` markers) into the same `elements` state that drives the Design tab and Live Preview, giving true two-way sync without a real backend/AST.
- Content tab simplified to edit the same shared `elements` array (single source of truth across Design/Code/Content/Live Preview).
- Studio's design ({elements, accent, page, section}) now persists to localStorage and is picked up by the `/preview` page as a new "03 / Custom" variation, rendered via a shared `buildPreviewDoc` iframe — satisfying "Studio + Preview" sync.
- Fixed 2 defects found in first test pass: (1) `.design-canvas-wrap` centering pushed the 760px canvas out of its ~320px column making right-side blocks undraggable — changed to flex-start with real horizontal scroll; (2) editing the Code tab was baking the current accent color into every element as a permanent override — parser now only stores an explicit override when the value differs from the computed inherited default, and Code tab regenerates on accent change.
- Tested via `testing_agent` across 2 rounds (iteration_6, iteration_7): 100% pass, zero console errors after fixes.

## Feature update — 2026-08-24 (Always-visible section editor + download)
- Relocated the drag-and-drop Design editor (layers, canvas, style inspector) plus a generated-code preview into a new always-visible "Edit layout & content" block in the left composer rail, directly below Accent colour — no longer requires reaching the pipeline's Done state or clicking through tabs.
- Added a "Download .jsx" button (both in the new composer block and in the existing pipeline Code tab) that saves the current generated code as a real `Hero.jsx` file via a shared `downloadCode` util in `data/mock.js`.
- `DesignTab` now takes a `scope` prop ("pipeline" default / "composer") so its internal data-testids are prefixed when both the composer editor and the pipeline's Done-state Design tab are mounted simultaneously, avoiding any duplicate-testid collisions — both instances share the same `elements` state so edits in either place instantly sync everywhere (Live Preview iframe, Code tab, Content tab, /preview's Custom variation).
- Tested via `testing_agent` (iteration_8): 100% pass, zero console errors, zero functional defects; addressed 2 minor code-review notes (shared download helper, safer blob URL revocation via setTimeout).

## Bug fix — 2026-08-24 (Studio crash)
- Fixed a runtime crash on `/generate` ("getStageStatuses is not a function" / "generateCode is not a function"): a prior edit to `data/mock.js` left `escapeHtml`'s body orphaned without its function declaration, causing a syntax error that broke the whole module during hot-reload. Restored the missing declaration and did a clean `supervisorctl restart frontend` to clear stale HMR state.
- Verified via `testing_agent` (iteration_9): 100% pass, zero console errors on fresh load, all 5 dev-states, the full Generate animation, both download buttons, accent changes, and navigation.

### P0
- None open.

### P1
- Let users replay any completed job's full stage timeline from Job History.
- Support adding/removing custom blocks in the Design canvas (currently fixed to Headline/Subtext/CTA/Image).
- Widen/resize the Design canvas viewport so right-side blocks don't require horizontal scrolling on narrower panels.

### P2
- Add configurable quality-gate thresholds and a filterable job history drawer.
- Add CMS schema presets for common content models.
- Add `data-el` attributes to `buildPreviewDoc`'s rendered blocks for easier automated testing (testability only).
- Cosmetic: allow composer layer-row labels to ellipsize instead of wrapping at 390px; dedupe the `status-badge` testid used 3x via the shared `Badge` component.

## Next tasks
1. Add pipeline replay from Job History.
2. Explore adding/removing custom blocks in the Design tab canvas.
3. Consider a resizable/zoomable canvas for the Design editor.