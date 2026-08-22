# Surface Inspo — UX patterns for the Generator Studio

Fast pass across three reference products that already solve "take an input, generate
something, show progress, let you inspect and iterate": **Stitch by Google**
(stitch.withgoogle.com — homepage + one project canvas), **Figma Make** (figma.com/make
marketing page — the actual app is login-gated, so this is the feature-level marketing
copy plus screenshots, not the live app), and **Claude.ai Artifacts** (claude.ai is
login-gated; used the public artifact viewer at `claude.ai/public/artifacts/...` and
Anthropic's `claude.com/blog/build-artifacts` post instead).

Every observation below is marked **VERIFIED** — seen directly in the browser during this
pass — and attributed to the exact site/page. Nothing here is inferred from memory of
these products; if a claim isn't backed by something actually rendered on screen during
this session, it isn't in this doc.

Current-state references point at real lines in `client/src/studio/*.jsx` as of this pass,
so a reader can jump straight to the code this doc is arguing about.

---

## 1. Upload / prompt / code input flow (`UploadForm.jsx`, `CodePromptInputs.jsx`)

**What I saw:** Stitch's homepage generation input is a single composer surface: one
textbox (`"What native mobile app shall we design?"`), with a "Choose File" attach
button, a mode toggle, a model picker, a "Start Live Mode" toggle, and a primary
**"Generate designs"** button that starts **disabled** and only enables once the input is
valid — all inline, in one bordered card. Below it sit three clickable example-prompt
chips ("Mobile friendly home for a marketplace of handmade ceramics and pottery, with a
minimalist taupe theme", etc.) that pre-fill the box. **VERIFIED**, stitch.withgoogle.com
homepage.

Figma Make's marketing page lists an "Attachments" feature: "Attach designs, images,
videos, audio, text files, and PDFs to your prompts to guide the AI toward better
results" — attachments live inside the same prompt composer, not a separate upload
section. **VERIFIED**, figma.com/make ("Figma Make features" list).

**Why it's better:** Framewright's input flow is three stacked bordered boxes — file
input, Page Name, Section Name, then an optional prompt textarea (`UploadForm.jsx` lines
53–96), and separately a near-duplicate form in `ModeSelector.jsx`'s `TextModeForm` (lines
58–110) for the other three modes. Nothing distinguishes the primary "what am I building"
input from the metadata fields; there's no example content, so a judge staring at four
empty labeled boxes has to guess what a good input looks like. "Combined" mode literally
renders two full-size textareas stacked (code, lines 82–95, and prompt, lines 97–110),
doubling the reading weight instead of unifying it.

**Recommendation:** Collapse the wireframe/code/prompt inputs into one composer card per
mode: a single primary textarea/dropzone with the mode's controls (file attach, or code
box) inline around it, Page Name/Section Name demoted to small inline fields (or a
collapsed "..." details row) instead of top-level required fields, and 2–3 clickable
example-prompt chips beneath it that populate the field on click — directly mirroring
Stitch's homepage chips. This is a layout/copy change only; it does not need to touch
`buildFormData`, `validateFile`, or any of the `.logic.js` modules.

---

## 2. Mode selector (`ModeSelector.jsx`)

**What I saw:** Stitch's App/Web mode control is a two-option `radiogroup` rendered as a
compact pill toggle sitting *inside* the composer bar, next to the model picker — same
visual weight as the other inline controls, not a separate section. **VERIFIED**,
stitch.withgoogle.com homepage snapshot: `radiogroup [ref=f1e39]: radio "App" [checked],
radio "Web"`.

**Why it's better:** Framewright's `ModeSelector.jsx` (lines 119–140) renders the mode
choice as a bordered `bg-card` row with a `<span>Mode:</span>` label and four raw radio
inputs — visually equal to, and separate from, the form beneath it. It reads like a
settings panel bolted above the real form, not the primary decision it actually is (mode
determines which fields exist at all, per `visibleInputsFor`).

**Recommendation:** Turn the four radios into a segmented/pill control positioned inside
the composer header (same row as the heading text, e.g. "Generate from Code"), keeping
the underlying `<input type="radio">` semantics and the `MODES` array untouched — pure
styling/placement change, zero risk to `visibleInputsFor` or the server-side mode
contract.

---

## 3. Generation progress + errors (`GenerationProgress.jsx`, `ErrorBanner.jsx`)

**What I saw:** In the Stitch project canvas, the running-job status collapses to a
single compact pill — a button labeled "Agent log" with a terse status line
("Prototype created") — rather than a flat list of every step by default; the full trace
is one click away, not shown up front. **VERIFIED**, stitch.withgoogle.com project canvas
(`button [ref=f3e524]: status "Agent log"`, `Collapse panel ... Prototype created`).

An AI-generated mockup embedded within that same Stitch project (a "Horizon" SaaS
landing-page template, itself a piece of generated content rather than Stitch's own
product chrome) shows a related pattern worth naming separately: an "AI Build Log" where
completed steps collapse to one checkmarked line each and only the currently-running step
gets a spinner and detail text ("Deploying API routes..."). **VERIFIED** as rendered
content inside that project, flagged here as a generated-content pattern rather than a
Stitch-chrome pattern — still a legitimate reference for "how do you show 7 steps without
listing all 7 at equal weight."

**Why it's better:** `GenerationProgress.jsx` (lines 61–88) prints all 7 stages flat,
every time, as plain text rows — no icons, no timing. `JobTimeline.jsx` (lines 62–111)
independently loops over the *same* `[1,2,3,4,5,6,7]` array with its own styling and adds
duration + a Replay button. Two components duplicate the same flat list with different
paint; neither ever collapses completed/pending rows, so a judge sees 7 equal-weight rows
whether stage 1 or stage 6 is running.

**Recommendation:** Make `GenerationProgress` the compact/collapsed variant — active
stage expanded with name, status, and a spinner; completed stages collapse to a single
checkmark line; pending stages collapse further or hide — and reserve `JobTimeline`'s
current full detail (durations, Replay) for the expanded/inspector view. Surface
`ErrorBanner` inline at the failed stage's row rather than as a banner floating elsewhere
on the page, so the plain-language error sits next to the thing that failed.

---

## 4. Job timeline — 7 stages (`JobTimeline.jsx`)

**What I saw:** Figma Make's "Version history" feature treats timeline entries as
actionable objects, not status labels: "Track every AI and manual edit. Allows you to
preview, favorite, or restore any iteration in your project," shown via a dropdown
listing three distinct file versions. **VERIFIED**, figma.com/make feature list + image
alt text "A Figma Make file dropdown showing three different file versions to choose
from."

**Why it's better / what's already good:** `JobTimeline.jsx` already has a real per-stage
**Replay** button (lines 103–108) — genuinely ahead of a bare status list, and closer to
Figma's "act on a specific version" idea than Framewright's own `GenerationProgress`
component is. The gap: every row renders at equal size regardless of status (only opacity
changes for pending/skipped, lines 14/19), and the Quality Score badge floats in the
timeline's header (lines 54–58) disconnected from the stage it actually measures.

**Recommendation:** Keep Replay as-is. Visually demote pending/skipped rows further
(collapse to a thin single-line entry rather than same-height-different-opacity), and
give `running` a genuinely larger/expanded treatment (matching the "AI Build Log"
active-step pattern from §3). Move or duplicate the Quality Score badge onto the stage 6
(`validation-qa`) row specifically, since that's the stage that produces it — mirrors
Figma's per-version metadata instead of one floating global number.

---

## 5. Stage inspector (`StageInspector.jsx`)

**What I saw:** Stitch's project canvas has a "Design System" inspector panel with typed
sections per artifact kind: color swatches labeled with role (Primary/Secondary/Tertiary/
Neutral), each showing a hex value with "Click to copy," a full T0–T100 tonal ramp per
color; and typography rows labeled by role (Headline/Body/Label) with an "Aa" preview
glyph and the font name. **VERIFIED**, stitch.withgoogle.com project canvas (`palette`
group, "Vivid Precision", hex values with "— Click to copy" accessible names, "Headline /
Plus Jakarta Sans / Aa" rows).

Figma Make's "Point and edit" feature: "Refine your prototypes by clicking elements to
style, swap, or prompt for changes directly in the preview" — selection happens on the
rendered artifact itself, not a separate raw-data viewer. **VERIFIED**, figma.com/make
feature list.

**Why it's better:** `StageInspector.jsx` renders every stage's artifact through one
identical dark monospace `<pre>` block (lines 77–87) — stage 3 (multimodal
understanding), stage 4 (semantic IR), and stage 5 (generated code) all get the exact
same undifferentiated text dump. Nothing about the presentation reflects what kind of
artifact is being inspected.

**Recommendation:** This is the single highest-leverage "substance" fix available. Type
the renderer by stage: stages 3–4 (understanding/IR) are JSON — render as a structured
key/value or collapsible tree, not raw text; stage 5 (code generation) — render with
syntax highlighting; keep the raw `<pre>` fallback only for stages with no known shape.
Right now every stage looks identical no matter what it actually produced, which is
exactly the "no substance" complaint made concrete.

---

## 6. Job history (`JobHistory.jsx`)

**What I saw:** Anthropic's Artifacts write-up describes the dedicated history/gallery
surface: "Browse curated artifacts for inspiration... Customize existing creations in
minutes... Organize everything in one place" — history entries are visual, resumable,
clickable cards. **VERIFIED**, claude.com/blog/build-artifacts. Stitch's project canvas
independently confirms the pattern at the UI level: every past generation/variant sits on
the canvas as its own thumbnail card, labeled and double-clickable to reopen
("Prototype: Horizon | Interactive Custom Cursor... Double click to open"). **VERIFIED**,
stitch.withgoogle.com project canvas.

**Why it's better:** `JobHistory.jsx` (lines 44–56) is a plain `<ul>` of `Job {jobId}` /
`{status}` text rows — no link, no thumbnail, no way to reopen or preview what a past job
actually produced, even though `pageName`/`sectionName` are already available on the job
object and used elsewhere in the app (`GeneratedSourceView.jsx`, `UploadForm.jsx`).

**Recommendation:** Make each row a link back into the studio/preview for that job, and
show the section/page name instead of a bare job ID — turns the list from "a log of IDs"
into "your past sections," using data the app already has, no new API surface required.

---

## 7. Human-in-the-loop question/answer (`QuestionPrompt.jsx`)

**What I saw:** Figma Make's "Annotations" feature: "Select elements, prompt, and send
all changes to the model at once" — selection happens directly on the rendered artifact,
batched. **VERIFIED**, figma.com/make feature list.

**Why it's better / what's already good:** `QuestionPrompt.jsx` already does something
genuinely ahead of both reference sites on one specific point: it overlays a red bounding
box directly on the source image per question (lines 89–101), grounding the question in
exactly where on the wireframe it applies — neither Stitch's nor Figma's marketing
material showed anything this precise for a Q&A/clarification flow specifically. Keep
this.

**The gap:** each question renders its own full-width copy of the same static image
(lines 90–94) stacked one after another, so N questions means N repeated image loads with
one bbox each, and the only way to answer is a plain radio list underneath — there's no
way to answer by interacting with the image itself, which is exactly what Figma's
"select element, then prompt" annotation model does.

**Recommendation:** Keep the bbox-overlay idea — it's a real, already-implemented
strength — but consolidate to one shared image with all pending question bboxes
overlaid simultaneously (numbered 1, 2, 3…), with the numbered question/option list
sitting beside it instead of interleaved with N image copies. This gets closer to
Figma's "select the element, then answer" flow without needing actual click-to-select
interactivity.

---

## 8. Confidence badges (`ConfidenceBadge.jsx`)

**What I saw:** Stitch's color palette panel consistently pairs every swatch with both a
color cue *and* an explicit label (hex value, tonal step T0–T100) — never color alone.
**VERIFIED**, stitch.withgoogle.com project canvas tonal palette rows.

**Why it's already close, and the one gap:** `ConfidenceBadge.jsx` already follows this
principle — three color bands plus an explicit percentage, never color-only — so it's
in good shape relative to what these reference sites do. The inconsistency is usage, not
the component itself: `StageInspector.jsx` uses `<ConfidenceBadge>` (line 56), but
`QuestionPrompt.jsx` shows the identical concept as raw interpolated text instead —
`"{q.prompt} (Confidence: {q.confidence})"` (line 87) — so the same data renders two
different ways in two adjacent surfaces.

**Recommendation:** Replace the raw-text confidence in `QuestionPrompt.jsx` line 87 with
`<ConfidenceBadge confidence={q.confidence} />`, so confidence always renders identically
everywhere it appears. Small, low-risk, immediately visible fix.

---

## 9. Generated JSX source view + preview link (`GeneratedSourceView.jsx`)

**What I saw:** Claude.ai's public artifact viewer has a **Preview / Code** radiogroup
toggle at the top of the panel — same content, two views, switched with one control, no
navigation away from the page. **VERIFIED**, `claude.ai/public/artifacts/...` snapshot:
`radiogroup "Artifact view": radio "Preview" [checked], radio "Code"`.

**Why it's better:** `GeneratedSourceView.jsx` only ever shows code (a `<pre>` block,
lines 44–50) plus a **"View in Preview"** link (lines 34–39) that navigates the user
entirely away to a different route (`/preview/${pageName}`), leaving the code view. There
is no way to compare source and rendered output without a full page navigation, and
navigating back loses scroll position/context.

**Recommendation:** Adopt the Preview/Code toggle directly: give `GeneratedSourceView` a
local view-state toggle that swaps between the existing `<pre>` source block and an
embedded `<iframe>` (or inline render) pointing at the same `/preview/${pageName}`
content, instead of a link that leaves the page. This merges what are currently two
disconnected routes (`GeneratePage` and `PreviewPage`) into one inspectable surface,
directly matching Claude's artifact viewer pattern.

---

## Top 3 changes to make first

1. **Type the Stage Inspector's renderer by artifact shape** (§5) — JSON tree for stages
   3–4, syntax-highlighted code for stage 5, raw `<pre>` only as fallback. Currently every
   stage renders identically; this is the most visible instance of "no substance" and
   touches only `StageInspector.jsx`.
2. **Collapse the flat 7-row progress list into a stepper** (§3) — active stage expanded,
   completed stages collapse to a checkmark line. Removes the `GenerationProgress` /
   `JobTimeline` duplication and matches Stitch's collapsed "Agent log" pattern.
3. **Merge the Code view and the Preview route into one Preview/Code toggle** (§9) — stop
   navigating away from `GeneratedSourceView` to see rendered output; embed the preview
   inline, matching Claude.ai's artifact viewer toggle.

Runners-up, cheap and low-risk: reuse `ConfidenceBadge` inside `QuestionPrompt.jsx` (§8,
one line), and make `JobHistory` rows clickable with page/section names instead of bare
job IDs (§6).
