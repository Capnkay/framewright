# Framewright — Roadmap

**Version 1.3, 2026-08-20.** Budget: 2–2.5 days on the clock. Planned to **44 working hours**, inside a 48–56 hour
window, leaving 4–12 hours of slack for sleep, meals, and the gate that slips.
Crew: 3+. Executor: Google Antigravity, primary on implementation.

Everything in Phase 0 happens **before the clock starts**. That is the whole strategy.
The winning setup at the Anthropic x Forum Ventures hackathon was prepared in advance,
not improvised during the event — *"the competitive edge was not speed of typing or even
prompting talent. It was preparation."* This roadmap is built on that finding.

> Source: claudehub.fr, "Anatomy of an Anthropic Hackathon Win", published 2026-03-31.
> **REPORTED** — third-party retrospective, single-sourced. The underlying facts (the win,
> the 8-hour build, the subsequently open-sourced configuration) are **VERIFIED** against
> the winner's own site and repository; the causal claim about *why* it won is not.

---

## The one number that shapes everything

| Criterion | Pts | Needs vision? |
|---|---|---|
| CMS contract compliance | 25 | no |
| Input coverage | 20 | partly — prompt mode is the required one |
| Layout fidelity | 15 | no |
| Backend quality | 15 | no |
| Code quality | 10 | no |
| UX of the studio | 10 | no |
| Innovation / stretch | 5 | this is where perception cashes out |

**Vision is required for at most ~15 of 100.** Innovation is 5, and vision is one of five listed routes to it. Input coverage is 20, of which prompt mode is the only *required* mode and code mode needs no GPU — so vision contests perhaps 10 of that 20. **The other 85 points do not depend on a single model weight loading.** Two hard caps decide whether we compete
at all: a preview with no live store caps at **40**, and the wrong stack caps at **20**.

### Perception, after measurement

The wireframe benchmark ran on 2026-08-20 and **a general-purpose vision model failed
completely** on low-fidelity wireframe input — whole-image boxes for essentially every
element, on both model sizes. Full numbers: `docs/BENCHMARK-RESULTS.md`.

VRAM was never the constraint: peak 0.60 GB on a 6 GB card. The constraint is the input
distribution. Models trained on photographs do not see structure in a line drawing.

So perception is **classical computer vision first**: a wireframe is rectangles and text,
which is the worst case for a photo-trained detector and close to the best case for
contour detection. The upgrade path is a detector trained on **synthetic wireframes
rendered from our own IR schema** — unlimited data, perfect ground-truth boxes, zero
licence risk, because we generate both sides of the pair.

This is also the strongest demo asset we have. It converts the architecture from an
assertion into a measurement: *generic models do not read wireframes, here is the
evidence, so we built something that does.*

The perception pipeline is built — in full, locally, on the GPU — because it is the
architecture we committed to and because it is what makes the project defensible to a
professional judge. It is *not* built first, and it is never allowed to block the spine.

---

## Phase 0 — Before the clock (now)

Nothing here consumes event hours. This is the entire advantage.

| # | Deliverable | Gate |
|---|---|---|
| 0.1 | `docs/CONTRACT.md` frozen — IR v1.0, CMS shapes, ID ranges, sanitiser policy, job/trace shape, HTTP contracts | Attacked by a reviewer who did not write it, and re-derived from the brief by a second |
| 0.2 | Framewright repo: own git, `.gitignore`, `.env.example`, `robots.txt`, README skeleton | `.env.example` is tracked and contains only placeholders |
| 0.3 | Five hooks installed and **test-fired against both a true positive and a legitimate-workflow false positive** | Every hook passes both tests. A hook that fails either does not ship |
| 0.4 | Agent definitions for the executor + the work-unit format Antigravity consumes | A work unit names the contract section it must satisfy |
| 0.5 | 13 Stage Cards + the Map + Judge Cards | Each teammate can explain their subsystem cold |
| 0.6 | Golden reference component + seed JSON + the two hand-written helpers, **as standalone files with a unit test** | The component renders against a mocked store and the §9 assertion runs green against that mock. No server, no database — those are Phase 1 |
| 0.7 | Environments verified on every machine, including the GPU laptop | `GET /health` returns `cuda:0`; one wireframe survives the perception path |
| 0.8 | ~~**The wireframe benchmark**~~ **DONE 2026-08-20 — see `docs/BENCHMARK-RESULTS.md`.** Florence-2 returned whole-image boxes for ~7 of 7. Retest with the correct task token pending. Original text: — install torch and transformers, download weights, run one real wireframe through Florence-2 on the actual 3050, record what labels come back | The single largest unverified assumption in the plan. Budget **2–3 hours**, most of it environment setup, and do it first. If it fails, the perception plan changes shape and we want to know now |

**Phase 0 exit gate:** the contract is frozen, the hooks are proven, and one person who
did not write the docs can operate the repo from them alone.

---

## Phase 1 — H0–H7 · The spine. Everyone.

No splitting. No perception. No exceptions.

- React + Vite + Tailwind + Redux Toolkit + react-router; routes `/generate`, `/preview/:pageName`
- Node + Express; Mongo or the JSON store behind one interface
- `cms` slice: `allSections`, `allSectionsCss`, `sectionNames`
- `fetchElementsByIds` and `getSectionTextContrastClass` — written by hand
- The golden `HeroSection` mounted at `/preview/Home`, hydrating from seed data
- `GET /api/elements`, `PATCH /api/elements/:fieldId`
- **The store-liveness assertion, automated, wired to run on every commit**

**Gate 1 — the only gate that matters this early.** Change a headline via `PATCH`,
refresh the preview, watch the text change. Until that is green and automated, nothing
else starts. This is the 40-point cap, closed.

---

## Phase 2 — H7–H17 · Prompt mode end to end. Still everyone.

- `POST /api/generate` for `mode=prompt`
- Prompt → IR (hosted model, structured output against the IR schema)
- **The deterministic IR → component emitter.** Not an afterthought: this is the path
  that runs with no key, no GPU and no network, and it is what makes everything after
  it safe to attempt
- Central ID allocator, persisted, range-checked
- Job records + stage traces begin here — the Glass Box store
- Ajv validation of section and element documents; ESLint on generated output, run
  hermetically against a fixed inline config

- **A keyless prompt→IR path.** Keyword and template extraction over the prompt —
  section type, card count, accent colour, CTA label — producing a valid IR with no
  model call at all. Without this, "works with no key" is a claim, not a behaviour

**Gate 2:** a typed prompt produces a persisted section, persisted elements, a compiling
component, and a live preview — **and the whole path runs again with `LLM_API_KEY`
unset**, via keyword extraction into the same IR and the same deterministic emitter.

---

## Phase 3 — H17–H28 · Split four ways.

Now, and only now, the crew divides. Each track owns a subsystem it can explain to a judge.

| Track | Owner | Scope |
|---|---|---|
| **Studio & preview** | 1 | **The Generator Studio** — upload form, code and prompt textareas, mode selector, accent colour, plain-language error surfacing, job history, read-only generated JSX view. Plus the preview shell, CMS editor, responsive toggle, css overlay |
| **Generation** | **2** | Prompt-to-IR and the keyless fallback, code-to-IR via AST, cross-modal alignment, the three planners, IR finalisation, and the deterministic emitter. **Eight of the thirteen subsystems.** This is the largest track and it is staffed with two people for that reason |
| **API & Glass Box** | 1 | Endpoints, the ID allocator, job records and stage traces, the Timeline UI, replay, regeneration, the model orchestrator, validation wiring, zip export |
| **Perception** | 1 (GPU laptop) | Python service: OpenCV normalise → **contour/rectangle detection** → OCR → fusion → spatial hierarchy → IR sub-objects. Then the synthetic-data detector as the upgrade. **Changed 2026-08-20 on measured evidence — see `docs/BENCHMARK-RESULTS.md`** |

Code-input mode needs no GPU and is half of the input-coverage criterion; it belongs to
Generation but can float if that track is ahead.

**Two tracks had no owner before review.** The Studio (10 points, nine numbered
requirements) was invisible in v1.0. Generation — eight of the thirteen subsystems — was
invisible in v1.1 and fell to API by default.
Every one of FR-G01 through FR-G09 lives in that first row. It is not "the form" — it is
a scored deliverable with nine numbered requirements.

Code-input mode (AST → elements → IR, with ID preservation) goes to whichever track
clears first. It needs no GPU and is half of the input-coverage criterion.

**Gate 3:** fed the organiser's own sample wireframe, perception recovers the reference
element set — `heroImage`, `brandBadge`, `headlineMain`, `headlineSub`, `description`,
`statBadges`, `ctaButton` — mapped per Appendix D. *Differing* from prompt-only output is
not evidence of anything: a perception path that mislabels everything differs maximally.
The gate is correctness against a known answer, not novelty.

---

## Phase 4 — H28–H37 · Depth and the demo moment.

- Combined mode with the documented conflict-resolution order, warnings recorded
- **Regeneration preserving IDs** — the demo moment depends on this and it is ranked
  only *Should* in the brief, which makes it the thing most likely to be sacrificed.
  It is not sacrificed. It is scheduled here, explicitly, for that reason
- Replay-from-stage in the timeline UI. **Stages 5–7 replay without the GPU machine; stages 2–4 require it.** The demo uses a stage-5 replay for exactly this reason
- Human-in-the-loop: low-confidence regions prompt the operator, the correction enters
  the IR, stages 5–7 re-run without re-entering perception
- Confidence surfaced per element in the API and the timeline
- Variation 2

**Gate 4 — rehearse the demo moment end to end.** A judge types a headline. The design
changes. Their headline survives. If it does not, fix it now, not at H40.

---

## Phase 5 — H37–H44 · Harden, document, rehearse.

- Pre-submit gate over **full git history**
- `docs/THREAT-MODEL.md` — the judge-facing security artifact
- README with exact run commands, licence table, known limitations
- Seed JSON, checked-in reference generated section, zip export
- **Rehearse the live demo five times, hunting break points**
- **Record a backup run.** Judges reward live interaction, but a recording is the only
  thing between us and a dead laptop
- Rehearse on a machine that is *not* the GPU laptop, with the Python service stopped

**Gate 5:** the pre-submit gate passes clean, and the demo has been run five times.

---

## Phase 6 — The presentation

Built from grounded context after the above. Not started until the build gates above are cleared.

---

## The demo — 8 minutes

| Time | Beat |
|---|---|
| 0:00–0:30 | The one sentence: *we do not ask a model for a webpage. We convert inputs into a validated structured representation, then generate React and CMS metadata from it, and validate both independently.* |
| 0:30–2:00 | Upload a wireframe. **Open the Job Timeline** — seven stages, real timings, click into stage 3 and show actual detected regions with confidence |
| 2:00–3:30 | Generated component beside the live preview, beside the original wireframe |
| 3:30–4:30 | DOM inspector: `id="2000000003"`. Redux: the same key. This is CMS compliance, proven |
| 4:30–6:00 | **The moment.** Judge types their own headline. Then change the design — four stats, green accent. Regenerate. Their headline is still there |
| 6:00–7:00 | Paste React code. AST → elements → IDs preserved |
| 7:00–8:00 | Break something deliberately: force a low-confidence region, show the human-in-the-loop prompt, correct it, replay **from stage 5** |

The last beat is deliberate. A pipeline that recovers visibly from a failure is more
convincing than one that never fails in front of you.

---

## Risk register

| Risk | Mitigation | Owner |
|---|---|---|
| **Store renders from defaults, looks perfect, is dead** | The §9 assertion, automated from H8 | Contract track |
| Perception unproven on wireframes — every published result is on rendered screenshots | Phase 0.8 benchmark, before the clock | Perception |
| GPU laptop is also the demo machine and someone's build machine | Rehearse without it; Python service optional by contract | All |
| Secret in git history → 0 and possible disqualification | Five hooks + pre-submit history scan | Harness |
| Executor "improves" the contract into a rubric failure — strips `dangerouslySetInnerHTML`, prunes `dynamicStyle`, inlines the `ids` map | Contract cited by section in every work unit; automated contract assertions | Harness |
| Contract drift across the five artifacts that encode it | One machine-checkable source; the golden component is generated, then diffed | API track |
| Team builds the superseded diagram because it is more concrete | Superseded material is marked as such; this roadmap replaces the old role table | Team lead |
| Model licence trap at hour 40 | YOLOv8 (AGPL), LayoutLMv3 (CC-BY-NC-SA) and Qwen2.5-Coder-3B (non-commercial) are named and forbidden in the README | Harness |

---

## Standing rules

1. **The contract is frozen.** Additive only, and only before the clock.
2. **Producer and verifier are never the same.** Nothing is done until someone who did
   not build it has attacked it.
3. **The deterministic path always works.** Any change that makes generation depend on
   a key, a GPU or a network is rejected.
4. **No secret ever reaches a commit.** Hooks are law. A hook that errors denies.
5. **Every claim in a document carries a source.** Registers record why, not just what.
