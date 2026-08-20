# Corrections Register

Every change to a frozen document, and every error found in source material, with what
changed and why. Append-only.

---

## 2026-08-19 · CONTRACT v1.0 → v1.1 — cold-boot verification

Found by a fresh-eyes re-derivation from the problem statement alone.

| # | Fixed | Why it mattered |
|---|---|---|
| 1 | Added full wire shape for `PATCH /api/elements/:fieldId` | It is the trigger of our own §9 assertion and of the demo's central moment, and it had no JSON body anywhere. Two people would each have built a compliant handler that did not interoperate — surfacing live, during the rehearsed beat |
| 2 | Added regeneration semantics (§13.3) | Nobody could tell whether it mints a new `sectionId` or mutates in place |
| 3 | Added `fetchElementsByIds` signature (§5.1) | §5 described a page-scoped fetch while R3 demanded an ID list. Unreconciled |
| 4 | Added the store adapter interface (§2.1) | Mongo vs JSON was an implementation note, not a contract |
| 5 | Added envelope convention and read-endpoint shapes (§13.4) | §9 named `{data:[...]}` vs `[...]` as a cause of total store death, then declined to specify the correct answer |
| 6 | **Fixed a contradiction:** `variations` was a string in §2 and a number in §6 | Not inherited ambiguity — we instantiated both readings ourselves |
| 7 | Declared source-appendix extra fields permitted and ignored | A strict Ajv schema would have rejected the organiser's own seed data, which is a required deliverable |
| 8 | Added accepted image formats and the uploads/storage relationship | — |

---

## 2026-08-19 · CONTRACT v1.1 → v1.2 — adversarial review

Found by a reviewer who did not write the document. Twenty-one must-fixes; the four
below would each have been fatal on their own.

| # | Fixed | Why it mattered |
|---|---|---|
| 1 | **Added the flattening rule (§5.0)** — nested card field IDs get their own top-level store keys | As written, `data[item.fieldId1]` was permanently `undefined`. Every card field would have rendered from its baked-in default forever while the rest of the section hydrated correctly. Nothing visibly fails. Per-card CSS overlay was silently impossible, under the criterion that explicitly names "css overlay hook" |
| 2 | **Added `idPolicy.contentPolicy`, forced to `keep` on regeneration** | `preserve` preserved IDs and said nothing about content — so regeneration would have overwritten the judge's typed headline with the default, *with the same field ID*. The contract claimed this made the demo work. It did not. An ID is not the thing being preserved; the content reachable through it is |
| 3 | **Rewrote R9's fallback condition** | The reference component guards with `length === 3`. Copied literally, a four-item CMS array fails the check and three stale defaults render — killing the four-stat regeneration beat, live |
| 4 | **Gave `idPolicy.preserve` a shape with a separate `cards` map** | Card fields have no `elementName`, so a name-keyed map could not address them at all, and growing 3 stats to 4 had no defined semantics |
| 5 | Hardened the §9 assertion — added `missing` check and a **nested-card-field patch** | The original assertion passed on a system where cards never hydrate: `DEFAULT_STAT_CARDS` puts those exact IDs in the DOM with a dead store behind them. The one gate the whole plan hangs on did not cover the failure mode the contract names as most common |
| 6 | Enumerated the seven stages with canonical numbering (§11.0) | Two tracks on two machines would have numbered them differently, and `fromStage: 4` would have meant two things |
| 7 | Enumerated job and stage status values (§11.1) | Three values appeared across the document, none of them enumerated, switched on by two different owners |
| 8 | Ruled artifacts are Node-owned, added retrieval endpoints (§11.2) | A relative artifact path written by the Python service on a different laptop resolves to nothing. And `componentFile` was returned as a path with no endpoint to read it |
| 9 | Gave human-in-the-loop a contract surface (§11.3) | It had a scheduled demo beat and zero API. Also made the headless path explicit so a run never blocks on a human who is not there |
| 10 | Replaced `irFragment` with named IR sub-objects (§12) | Exactly the field one track emits as a whole IR and the other consumes as a partial |
| 11 | Made `componentFile` unique per section and variation, and specified how the preview mounts it | A fixed literal path meant variation 2 destroyed variation 1. And nothing explained how a file the API writes becomes a rendered component — each track would assume the other owned the seam |
| 12 | Required the normaliser to record its transform | `bbox` was specified in an undefined coordinate space, so only its author could map boxes back onto the upload — and they are on a different machine |
| 13 | Pre-submit gate now checks **duplicate** IDs, not only out-of-range ones | A read-modify-write counter issues duplicates that are perfectly in range. The gate was blind to the failure the atomicity rule exists to prevent |
| 14 | Change rule now permits contradiction repair before the clock | The rule as written forbade the repairs this review required. A frozen document that contradicts itself is worse than an unfrozen one |
| 15 | Pinned language, runtime and package manager | Neither document named them; two tracks would scaffold differently |
| 16 | Gave `.env.example` its canonical contents | The gate demanded a "placeholder shape" that was never defined |

---

## 2026-08-19 · ROADMAP v1.0 → v1.1

| # | Fixed | Why it mattered |
|---|---|---|
| 1 | **Gave the Generator Studio an owner and a phase** | FR-G01 through FR-G09 and 10 rubric points had no owner in any of the three tracks. It was invisible |
| 2 | Rescaled phases to 44 planned hours inside a 48–56 hour window | The original schedule consumed H0–H56 continuously with no buffer, no sleep and no meals, finishing eight hours after the event ends at the low end of its own stated budget |
| 3 | Added a keyless prompt→IR path | Gate 2 claimed generation works with the key removed, while the only prompt→IR route was a hosted model. The claim had no mechanism |
| 4 | Bound Gate 3 to recovering the reference element set | "Differs from prompt-only" is not evidence of correctness — a path that mislabels everything differs maximally |
| 5 | Moved the closing demo beat from a stage-4 replay to stage 5 | Stage 4 re-enters perception, and the same roadmap requires rehearsing with the perception service stopped |
| 6 | Rewrote Phase 0.6's gate to a mocked store | Its gate required hydration, which requires most of Phase 1. Either Phase 0 was building the product early or the gate was unachievable |
| 7 | Rebudgeted the wireframe benchmark from 15 minutes to 2–3 hours | Naming something the largest unverified assumption and budgeting fifteen minutes for it in the same line is not honest. Most of it is torch, CUDA and weight download |
| 8 | Sourced the load-bearing quotation, labelled REPORTED | The entire Phase 0 strategy rested on one unattributed quote |
| 9 | Removed internal register from this repository | This is a judge-facing document handed to people outside the team |
| 10 | Showed the arithmetic behind the vision/no-vision split | "~85 of 100" was not derivable from the table above it |

---

## Errors found in the source material

Not ours to fix, but ours not to trip on.

| Where | Problem |
|---|---|
| Problem statement §4.3 vs §19 | The css overlay is filed under **stretch objectives**, but it is explicitly graded inside the 25-point CMS-compliance line. A team reading §4.3 deprioritises real points |
| Problem statement Appendix C | Imports `fetchElementsByIds` and `getSectionTextContrastClass` from paths that do not exist. Copied verbatim, the reference component does not build — and dead imports are penalised directly under code quality |
| Problem statement Appendix C | Guards the stat cards with `length === 3`, which breaks any card count other than three |
| Problem statement §8.1 | The header says PNG/JPG/WebP; the bullet beneath says "at least PNG and JPG" |
| Problem statement §11.2 vs Appendix A | The field table and the sample document do not carry the same fields |
| Canonical workflow diagram, stage 3 | Names LayoutLMv3, Donut and YOLOv8 to emit labelled regions with UI roles. **None of the three can produce this taxonomy zero-shot** — LayoutLMv3 is a forms and receipts model, YOLOv8 pretrained is COCO with no UI classes, Donut emits structured text rather than boxes. Verified against primary sources |
| Team planning chat, item 31/32 vs item 51 | Item 32 says build the contract spine *"before you write a single line of DETR/CNN code."* Item 51's role table then assigns two of four people to vision from hour zero. The same document argues against its own plan. The role table is superseded by this roadmap |
| Team planning chat, item 26 | Recommends 8 GB+ VRAM, RTX 3060 12 GB class, for the pipeline it proposes. The available card is a laptop RTX 3050 |

---

## 2026-08-19 · Harness — findings from the build's own test-fire

The build crew was ordered to test-fire every hook against both a true positive and a
legitimate 3am action. That gate paid for itself three times.

| # | Found | Resolution |
|---|---|---|
| 1 | **A contradiction in the build brief itself** — one instruction said inherit `block-dangerous-shell` unchanged, another said every hook must deny on malformed input. The inherited shared reader degraded malformed-but-non-empty stdin to `{}` and **allowed** the call | Flagged rather than silently resolved. Ruled: fail-closed wins. Fixed in the shared reader (`_lib.mjs`), so the hook itself stays byte-identical to its source. Re-tested: malformed stdin now denies, empty stdin still allows, no regression on either the true positive or the false positive |
| 2 | `.claude/settings.json` carried a `$schema` field pointing at a **real external hostname**, which the ship's own pre-push gate correctly flagged | Removed the field. The gate was not weakened to accommodate it — that is the correct direction, and it is worth stating because the opposite instinct is what erodes a floor |
| 3 | The pre-push absolute-path check **false-positived on `CONTRACT.md`'s own prose** describing the rule, and on a hook's comment | Regex tightened to require a real path segment after the marker. Residual gap documented in the script itself: a line ending exactly at `/home/username` with nothing after it would not match |
| 4 | The **lab's own unfixed hook blocked the build crew from writing `.env.example`** during the build | Not a ship defect — a live, independent reproduction of the bug this harness exists to fix. The ship's patched version allows it; verified by test-fire |

**Known gaps, stated rather than buried:** the hooks have not been exercised through a
live session inside the repo (only invoked directly with fixture payloads), and have not
been tested from a Linux or macOS clone, where line-ending handling differs.

---

## 2026-08-19 · The Baton — findings from its own test-fire

| # | Found | Resolution |
|---|---|---|
| 1 | **A bug in the build brief, caught by testing rather than reasoning.** The blueprint put the task-id check in `pre-commit`. Git runs `pre-commit` *before the commit message exists* — true even for `git commit -m`. The check would have passed every manual test and then blocked **every real commit** | Verified empirically in an isolated scratch repo, then enforcement moved to `.githooks/commit-msg`, the hook git guarantees receives the message. `pre-commit` keeps the claim check. `LAW-MANIFEST.sha256` extended to cover the new hook, since an unprotected law-bearing file is a gap in the integrity system that manifest exists to provide |
| 2 | `sync` exited non-zero when a remote existed but the repo had no commits | Ruled a **normal pre-publish state**, not an error — it is exactly the moment between `git remote add` and the first push. Now prints a clear line and exits 0, matching the no-origin case |
| 3 | `docs/BATON.md` still described `pre-commit` as enforcing both checks after enforcement moved | Corrected, with the reason recorded in the document so nobody re-consolidates them later |

**Flagged, unresolved:** the nine Studio requirements (FR-G01–G09) are never enumerated
in the source brief — only described in prose. The task list's nine-item mapping is the
build crew's own reading, stated as such rather than presented as fact. Worth ten minutes
against the original document before anyone builds to it; the Studio is 10 points.

---

## 2026-08-20 · CONTRACT v1.2 → v1.3 — found by building against it

The golden component was the first thing written against the frozen contract. Building
against a document is a verification method that reading it is not.

| # | Found | Resolution |
|---|---|---|
| 1 | **The contract's canonical environment block disagreed with the actual `.env.example` on four values** — port (4000 vs 5000), database name, and both placeholder tokens | Contract aligned to what is built and tested. Nothing depended on the old values; the source brief explicitly labels its own as "sample names only" |
| 2 | **The contract's placeholder rule and the pre-push gate disagreed in *both* directions.** The contract sanctioned `replace-me`, which the gate would have **rejected**. The gate accepted `YOUR_...`, which the contract did not sanction | Contract rewritten to describe the gate's actual, broader rule. Had this shipped, our own submission gate would have failed our own required deliverable — the exact failure this pairing exists to prevent |
| 3 | `VITE_STORAGE_URL` lost its trailing slash in `.env.example` and the code default | Restored, and the reason written into the contract: the reference component concatenates directly, so `${VITE_STORAGE_URL}default/images/...` becomes `storagedefault/...` without it. Our helper joins defensively either way, but the canonical value now matches the shape a judge sees in the brief's own reference component |
| 4 | `node --test tests/` does not resolve a bare directory on Node 24 / Windows | Changed to a glob. The build crew reproduced the quirk in an isolated folder before changing anything, rather than assuming their code was at fault |

**Note on method.** Items 1–3 were invisible to two rounds of document review — a
cold-boot re-derivation and an adversarial attack both missed them, because both read the
contract rather than executing against it. They surfaced within minutes of code existing.
Reviews catch reasoning errors; building catches agreement errors. Both are needed.

---

## 2026-08-20 · The first commit — three defects only a cold clone could find

The founding was committed under `T-000`. Cloning the result into a fresh directory and
acting as a new teammate found three defects. **None was visible from reading the code**,
and each would have hit the first person to use the repository.

| # | Found | Why it mattered |
|---|---|---|
| 1 | **Line endings destroyed the integrity manifest.** `LAW-MANIFEST.sha256` hashes the hook files; Git was converting LF to CRLF on checkout. On a fresh clone **all eight entries failed** — the manifest file itself had CRLF, so the filenames inside it carried a trailing `\r` and could not even be opened | The pre-commit hook verifies that manifest. Every teammate's **first commit would have been hard-blocked** by our own integrity check, with an error pointing at files that looked fine. Fixed with `.gitattributes` (`* text=auto eol=lf`), the working tree normalised, and the manifest regenerated |
| 2 | **The claim check was a skeleton key.** It tested whether *any* open claim existed, not whether *the committer* held one. Since `T-000`'s claim is committed, every clone would carry a permanently valid claim | `docs/BATON.md` says "**you** hold a claim." The implementation did not. Anyone could commit forever without claiming anything, which silently defeats both attribution and double-work prevention. Now filtered by identity, resolved the same way the baton tool resolves it |
| 3 | **The protocol contradicted itself, and would have blocked every task.** The ritual is build → `baton done` → commit. But `done` marks the claim complete, and the hook required an **active** claim — so **step 8 was blocked by step 7, on every task, for every person** | This is the worst of the three because it was designed in, not slipped in. Every teammate finishing their first task would have hit a wall with no obvious cause. The hook now accepts `active` **or** `done` by this identity; per-commit attribution comes from the task id the `commit-msg` hook requires, which is the check that actually does that job |

**Note on method.** Two document reviews and a build pass all missed these. They surfaced
within minutes of doing the one thing nobody had done: cloning the repository and
behaving like someone who had never seen it. Reviews catch reasoning errors. Building
catches agreement errors. **Only using the thing catches the errors that live between the
artifact and its user.**

Cold-clone verification now passes end to end: manifest intact, 13/13 tests with no
`npm install`, board resolves, commit blocked before claiming and allowed after, commit
message rejected without a task id and accepted with one.

---

## 2026-08-20 · The wireframe benchmark — the plan changed on evidence

The single unverified assumption in the whole plan was measured. It failed, and the plan
changed the same day.

| | |
|---|---|
| **Measured** | Florence-2 base and large, on a real low-fidelity wireframe, on the team's RTX 3050 |
| **Result** | Whole-image bounding boxes for essentially every element. **0 of 7** — the one scored as a hit was the degenerate whole-image box coincidentally overlapping the hero image, which occupies half the frame |
| **VRAM** | Peak 0.60 GB of 6 GB. **The hardware was never the constraint.** We had assumed it might be, and we were wrong about which risk mattered |
| **Changed** | Perception is now classical CV first — contour detection on what is, after all, a drawing of rectangles — with a detector trained on wireframes rendered from our own IR schema as the upgrade |
| **Updated** | ROADMAP v1.3, CONTRACT v1.4 (`/health` model list), stage card 01, `docs/BENCHMARK-RESULTS.md` |

**Our own error, recorded because it nearly cost us the right answer.** The test script —
written here — used Florence-2's `<CAPTION_TO_PHRASE_GROUNDING>` task with long
descriptive sentences. That task grounds *short noun phrases*, and whole-image boxes are
its documented degenerate output on a mismatched phrase. A retest with
`<OPEN_VOCABULARY_DETECTION>` and short labels is out (`docs/GPU-RETEST.md`) to separate
"the method was wrong" from "the model cannot read line drawings". The plan changed anyway,
because classical CV is the better fit for this input either way — but re-planning on a
flawed test would have been luck, not judgement.

**What made this findable:** the teammate reported the whole-image boxes plainly instead
of counting them as hits. A less careful report would have read as 1 of 7 — a bad but
survivable score — and we would have spent two days building on it.

**The gain.** The failure is worth more than a pass would have been. It converts the
architecture from an assertion into a measurement we can put in front of a judge:
*generic vision models do not read wireframes, here is the evidence, so we built something
that does.* That is the benchmark the original architecture diagram asked for, and almost
no team arrives with one.

---

## 2026-08-20 · The retest — hypothesis closed

The retest ran with the correct task tokens and a short label vocabulary.

| Task | Result |
|---|---|
| `<OPEN_VOCABULARY_DETECTION>`, short labels | **0 of 7 — no boxes at all** |
| `<OD>`, unprompted | one box, whole image, `"whiteboard"` |
| `<DENSE_REGION_CAPTION>` | one region, whole image, `"hand-drawn website layout"` |

**0 of 7 with the wrong task. 0 of 7 with the right one.** Our method error was real and
it was not the cause. The finding is definitive: a training-distribution gap, not a
prompting problem.

**The precise statement, which is better than "it failed":** the model is not failing to
see the image — it is seeing **one object where we need seven**. It identifies the artifact
correctly and describes it well, because *"hand-drawn website layout"* is the right answer
to the question it was trained to answer. It has no notion that a wireframe decomposes
into components, because nothing in its training data ever asked it to.

**Two lessons worth keeping:**

1. **We planned around the wrong risk.** Weeks of consideration went into whether a 6 GB
   card could hold the models. Peak usage was 1.76 GB. The real risk — that the input
   distribution was unlike anything these models were trained on — was named as unverified
   in the roadmap and was very nearly not tested at all.
2. **Re-planning before the retest would have been luck.** The decision to move to
   classical CV was made on the first, flawed result and happened to be right. The retest
   is what makes it judgement rather than a coincidence. Both runs are recorded, including
   ours being wrong first.

Updated: `docs/BENCHMARK-RESULTS.md` (definitive), ROADMAP v1.4, stage card 01, EC-008.

---

## 2026-08-20 · Harness audit — mechanical, cold-boot, and conventions

Three checks run by agents that did not build the harness. The mechanical pass returned
20/20 clean. The cold-boot pass — simulating someone who had never seen the repository —
found four real gaps, and the worst was a false completion claim.

| # | Found | Resolution |
|---|---|---|
| 1 | **Phase 0.4 was marked done and was not done.** The roadmap promises "agent definitions for the executor + the work-unit format Antigravity consumes." The format was satisfied — a baton task *is* a work unit — but **no artifact addressed to the executor existed**: no `AGENTS.md`, no `.claude/agents/`, no `.agents/`. Phase 0 read 1/1 done | Closed properly with three files, and the roadmap row now records that it was marked done in error. This register exists to catch exactly this, and it did not — because the same party both claimed and closed it |
| 2 | **`README.md` never bridged to the build system.** No mention of the baton, `continue build`, or `_build/STATE.md`. Any tool reading only the README — which by our own plan includes the primary executor — got project understanding and then dead-ended | README now opens with a "Start here" section pointing at `AGENTS.md`, the one command, and the generated board |
| 3 | **`README.md` said "no application code has been written yet."** The golden component, four helpers, seed data and 13 passing tests exist. The file most likely to be read alone was wrong about the repository's contents | Corrected to distinguish the wired application (does not exist) from the component it will mount (exists, tested) |
| 4 | **`SETUP.md` stopped before the one command that works.** Step 5 said nothing was runnable. `npm test` runs on a fresh clone with no install and passes 13/13 — the very evidence this register cites | Added as its own step, with the expected result and an instruction to stop if it fails |
| 5 | **The entire git-hook floor was opt-in and unverified.** `core.hooksPath` is per-clone local config that nothing sets automatically. A teammate who skipped that step got **no secret scan, no integrity check, no claim check, no task-id check** — silently, with everything appearing to work | `baton status` now warns loudly at the top of every run when hooks are not wired. Same class as the CRLF bug: perfect for the person who built it, silently absent for everyone else |

### On the `CONTEXT.md` request

A teammate asked for a `CONTEXT.md` so all agents on all devices share build context. The
cold-boot audit ruled it **partly met**: the content exists and is current
(`_build/STATE.md` is generated, not hand-maintained), but it was **not discoverable by
anything that does not read `CLAUDE.md`** — which is every tool except Claude Code,
including our primary executor.

Resolved with the documented convention rather than an invented filename. **VERIFIED**
2026-08-20 against primary sources:

- **`AGENTS.md` is a real open standard** — launched by OpenAI Codex, Cursor, Amp, Jules
  and Factory; stewarded by the **Linux Foundation's Agentic AI Foundation since Dec 2025**
  (agents.md, opened directly). Read by Cursor, Copilot, Gemini CLI, Devin Desktop and
  others.
- **Anthropic documents the pointer pattern itself** — Claude Code reads `CLAUDE.md`, not
  `AGENTS.md`, and the official recommendation is to make `AGENTS.md` canonical and reduce
  `CLAUDE.md` to an `@AGENTS.md` import plus tool-specific notes
  (code.claude.com/docs/en/memory). Not folklore.
- **Antigravity's own docs do NOT claim it auto-reads a root `AGENTS.md`.** They document
  `.agents/rules/` and `.agents/skills/`. Several third-party blogs assert otherwise and
  are contradicted by the primary source. A *different* Google product — the Gemini API
  "Antigravity agent" — does use `AGENTS.md`; the two are easy to conflate.

So we covered both paths rather than betting on either: `AGENTS.md` canonical,
`CLAUDE.md` importing it, `.agents/rules/framewright.md` for Antigravity. **Still
unverified:** which file Antigravity actually picks up. Whoever runs it first should
confirm empirically and record it in `docs/EDGE-CASES.md`.

**Deliberately not done:** no file restates build progress. `_build/STATE.md` is generated
from the task board, and a hand-written summary alongside it would drift within hours and
then quietly lie. The new files are routers, not second sources of truth.

---

## 2026-08-20 · The docs deploy — four failures, one cause

The documentation site returned 404 through four attempted fixes. **None of the fixes was
addressing the real fault**, and the real fault was in this session's own commits.

**Cause:** every automated commit was authored `Framewright <team@example.local>`. Vercel
will not deploy a commit whose author it cannot identify as a real address, so no
deployment ever ran. The site 404'd because nothing had ever been published to it.

**Why it was missed:** the failure presented as a build problem — a red check on the commit
and a 404 on the domain — so it was diagnosed as a build problem three times over. The tell
was there and was not read: there was no build log, because there was no build. A failing
build produces output. A rejected commit produces nothing.

**What the three earlier fixes actually did.** They were not wasted, but they were not the
fix either:

| Change | Was it needed? |
|---|---|
| Added `docs/html/index.html` | Yes — the directory genuinely had no landing page |
| No-op `build` / `vercel-build` scripts | Yes — the root `package.json` would have failed `npm run build` once a deploy ran |
| Build now produces `public/` | Defensive — Vercel's "Other" preset defaults to `public/` and the dashboard overrides `vercel.json` |
| Root `index.html` redirect | Defensive, kept |

**The lesson, recorded because it was avoidable.** The instruction was to read the build log
before changing configuration again. That was said and then not done; the next two fixes
were reasoned from probability instead of evidence. **When a deployment fails and there is
no build output to read, the fault is upstream of the build** — in the commit, the
integration, or the permissions. Filed as `EC-010`.

---

## 2026-08-20 · Task board FR-G labels corrected against PS7

Found by reading `Level3_ProblemStatements.pdf` (PS7 §13.1) against `_build/tasks.json`
for the first time since the board was written.

All nine Generator Studio requirements were covered by a task. **Five carried the wrong
FR number**, and two dropped half of the requirement they named. A judge cross-referencing
our board against the brief would have hit a mismatch on five rows.

| Brief (PS7 §13.1) | Board said | Now says |
|---|---|---|
| FR-G05 — progress **and** plain-language errors | T-047 "FR-G06", errors only | T-047 "FR-G05", both |
| FR-G06 — read-only JSX **and** a preview link | T-049 "FR-G08", JSX only | T-049 "FR-G06", both |
| FR-G07 — pageName, sectionName, accent colour | T-046 "FR-G09, FR-G05" | T-046 "FR-G07" |
| FR-G08 — keep the last 5 jobs | T-048 "FR-G07", no count named | T-048 "FR-G08", last 5 named |
| FR-G09 — zip download | T-042, unlabelled | T-042 "FR-G09" |

**The two that were more than a label.** FR-G05 is one requirement with two halves —
"show generation progress **and** surface API errors in plain language". Only the error
half was scheduled, so T-047 gains `GenerationProgress.jsx`, ten minutes of size, and a
`doneWhen` that names §11.0's seven stages as what progress is shown against. FR-G06 is
likewise two halves — the read-only JSX **and** a link to the preview; only the JSX half
was scheduled.

No contract section changed. `_build/STATE.md` and `_build/TASKS.md` regenerated from the
board.

---

## 2026-08-20 · CONTRACT v1.4 → v1.5 — the architecture diagram's four unbuilt layers

Found by reading `IMG_3214.PNG` — the seven-stage architecture diagram — against the
contract, the roadmap and the task board for the first time since the stage cards were
written.

The diagram's seven top-level stages match §11.0 exactly, and its thirteen subsystems map
one-to-one onto `docs/html/stages/01`–`13`. That half was already reconciled. **Its bottom
band was not.** Redis, MinIO/S3, the embedding model, the reranker, the model orchestrator,
Prometheus, OpenTelemetry, Winston/Pino, alerts, pixelmatch visual diff, axe-core,
Lighthouse and the 0–100 quality score appeared in **no contract section, no roadmap phase,
and none of the 79 tasks**. Grepped; zero hits across all three.

So the diagram promised a judge an architecture the build had no plan to produce. Team lead
ruled: build it.

**What was added — §15 caching and object storage, §16 model services, §17 observability,
§18 automated quality gates.** Additive only. Nothing in §1–§14 changed, so the freeze holds
and every existing task's contract references still resolve.

**The rule that shaped all four.** Standing Rule 3 — the deterministic path always works —
is not negotiable, and every one of these layers is a dependency that could break it. So
each is written as an optional accelerator behind an interface that already exists, with a
named fallback that needs no environment at all:

| Layer | Absent means |
|---|---|
| Redis (§15.1) | the in-process TTL cache, which is the reference implementation |
| S3/MinIO (§15.2) | local disk, which §11.2 and §13.1 already mandate |
| Embeddings (§16.1) | `embed()` returns `null`, callers fall back to §6's keyword scorer |
| Hosted model (§16.2) | `callModel` returns `{ ok: false }` with no network attempt |
| OTel (§17.3) | spans dropped silently; §11's stage trace is authoritative regardless |
| Prometheus (§17.2) | nothing — the endpoint is the contract, scraping it is optional |

T-078 now asserts exactly this: one rehearsal with the perception service stopped and
`LLM_API_KEY`, `REDIS_URL`, `S3_ENDPOINT`, `EMBEDDING_BASE_URL` and
`OTEL_EXPORTER_OTLP_ENDPOINT` all unset, exercising every fallback in a single run.

**Three decisions inside the additions that are load-bearing, and why.**

1. **Element and section documents are never cached (§15.1).** A cache in front of the live
   CMS store reintroduces the precise failure §9 exists to catch — a PATCH lands, the store
   is correct, and the preview does not move. That is the 40-point cap, reopened by an
   optimisation. `GET /api/elements` reads through, always. The four sanctioned key shapes
   are the whole permitted surface and T-081 asserts nothing else is written.

2. **`visualSimilarity` is `null` — and scores as `1.0` — when there was no wireframe
   (§18.1).** Scoring a missing image as zero would penalise prompt mode, which is the one
   input mode the brief marks *required*. It is the obvious way to get the formula wrong,
   so T-091 asserts it directly.

3. **No §18 gate fails a generation.** They record, warn, and inform the score. §9 remains
   the only assertion that decides, and it stays separate, mandatory, and never disabled.
   A quality score that could block a demo is a quality score that gets switched off at
   hour 40.

**§14's canonical `.env.example` block extended** with `REDIS_URL`, the four `S3_*`
variables, the two `EMBEDDING_*` variables and `OTEL_EXPORTER_OTLP_ENDPOINT`, and
`.env.example` itself updated to match. Every new value is placeholder-shaped under §14's
own rule; verified against the `pre-push` gate's placeholder check line by line, and
`sh .githooks/pre-push` exits `0`.

**Board:** 13 tasks added, T-079 through T-091, all Phase 4 and all tracked to
`api-glassbox`, `generation` or `perception`. Phase 4 is deliberate — every one of these is
additive and optional, so none may sit in front of the spine (Phases 1–2) or the Gate 3
split. T-076's dependencies extended so the pre-submit gate does not rehearse a system
about to change. Total 79 → 92.

---

## 2026-08-20 · The architecture diagram named three models we cannot use

`IMG_3214.PNG` stage 3 reads *"Model: LayoutLMv3 / Donut / YOLOv8"*. All three are already
rejected by name in `docs/html/stages/01-vision-understanding.html`, with reasons — YOLOv8
is AGPL with a network clause our hosted architecture triggers and carries COCO classes
only; LayoutLMv3's published weights are CC-BY-NC-SA even though its code repo is MIT; Donut
emits structured text where we need coordinates.

So the reasoning was done and recorded. **The diagram was never updated to match it**, and
the diagram is the artifact most likely to be put in front of a judge, because it is the one
that fits on a slide. A judge reading it would see us advertising an AGPL dependency in a
project deliverable that runs as a service under evaluation.

**Fixed by replacing the diagram rather than annotating it.** `docs/html/architecture.html`
is now the canonical architecture page: the same seven stages and thirteen subsystems, with
stage 3 showing what we actually build — **OpenCV contour and rectangle detection, then
PaddleOCR**, with Florence-2 demoted to optional captioning — and the three rejected models
kept visible, struck through, each with its one-line reason. Keeping them visible is
deliberate: the rejection is evidence that a licence audit happened, which is worth more to
a professional judge than a diagram that never mentioned them.

The page also marks the four supporting layers as contract sections §15–§18 rather than
unscheduled boxes, and states the fallback for each, so the "runs with the GPU off, the key
unset and the network down" claim is checkable from the diagram itself.

Linked from `docs/html/index.html`. The raster original is kept untracked as the source
sketch; it is superseded and should not be shown.

---

## 2026-08-20 · Three defects found preparing the client spine — F-002, F-003, F-004

Found by reading §5.0 and §5.2 against the code T-000 actually committed, before claiming
anything on the studio-preview track. All three are filed as findings and **none is fixed
here** — two require a board change and one a contract change, which F-001 established is
the team lead's call, not a reviewer's.

| # | Finding | Severity | What |
|---|---|---|---|
| 1 | [F-002](../../_build/findings/F-002.md) | MAJOR | Six `files` paths in `_build/tasks.json` for the Phase 1 client tasks do not match what T-000 committed — the board says `client/src/store/`, `client/src/utils/getSectionTextContrastClass.js`, `client/src/utils/getHtml.js` and `client/src/sections/HeroSection.jsx`; the tested files are at `client/src/redux/`, `sectionContrast.js`, `html.js` and `sections/generated/`. Building to the board literally would create a second copy of each module while the ones `tests/golden.test.mjs` imports go unused |
| 2 | [F-003](../../_build/findings/F-003.md) | MAJOR | **A nested card field's `css` has nowhere to be stored.** §4's loop item defines `fieldN`/`fieldTypeN`/`fieldIdN` and no css slot, and the reducer writes `css[el.fieldId]` only — yet §5.0, §7 R10, T-014 and T-053 all require per-card overlay. Measured: hydrating the seed produces 13 content keys and exactly **one** css key, an element-level id; every nested id is `undefined`. Proposes an additive `cssN` per loop item |
| 3 | [F-004](../../_build/findings/F-004.md) | MINOR | `state.cms.sectionNames` is declared by §5.2 and written by nothing — the sole occurrence in the repository is its own initialiser. An unowned seam between T-035 (api-glassbox) and T-050 (studio-preview), which is the class `docs/GIT-PROTOCOL.md` warns about by name |

**Why F-002 was time-critical rather than merely wrong.** T-001 was in flight while this was
written. Had it wired the store to `client/src/store/` per the board, the repository would
carry both directory trees with nothing stating which is real. Verified at the time of
filing and again after a `git pull --rebase`: `client/src/store/` still does not exist, so
the collision has not happened.

**A correction to my own first reading, recorded because it changes the fix.** I initially
read T-008, T-009, T-010 and T-012 as *already satisfied* by T-000. That is wrong, and the
distinction matters: their `doneWhen` conditions are met, but the outstanding work is a
**dependency swap the titles do not describe** — a real `createSlice` for the hand-built
wrapper, real thunk middleware, and above all replacing the hand-rolled regex sanitiser in
`html.js` with `isomorphic-dompurify`. That last one is not an inference: `html.js` says in
capitals that production code should use a vetted library, §8's allow-list is written in
DOMPurify's own config vocabulary (`ALLOWED_TAGS`, `ALLOWED_ATTR`, `ALLOW_DATA_ATTR`,
`ALLOW_ARIA_ATTR`), and `isomorphic-dompurify` is already on README's approved licence table.
Calling those tasks done because their assertions pass would have shipped a regex tag
scanner as the read-side XSS chokepoint.

**Also recorded, not filed:** R8 is the one open rule in the golden component — it renders a
plain `<button>`, not PrimeReact's `<Button>`, because the package is not installed. The file
documents this and T-014 already carries §7 R8, so no board change is needed; noted so
nobody reads the component as R8-complete. And §6's `layout.accents` has no consumer
anywhere — the deterministic emitter (T-025) will be the first thing that must render accent
bars, with no reference implementation to copy.

### Board change: T-095 added

There was no task on the board covering a review pass, and `.githooks/pre-commit` requires
the committer to hold a claim — so a finding could not be committed by anyone at all. Rather
than claim a task that would not be built, or bypass the hook, **T-095 was added** (phase 0,
track `any`, `verify: null`), claimed, and closed with a note. `AGENTS.md` sanctions exactly
this — "either the task is wrong (fix `tasks.json` and log it) or you are doing someone
else's task" — and this is the log. Phase 0 reads 2/2.

**It was originally numbered T-092, and that collided.** While this branch was open, the
§6.1/§18.2 work landed on `main` and took T-092, T-093 and T-094 for `designTokens`, the
emitter's token read, and validation recovery. Two people had picked the same next id from
two different views of the board — the exact race `docs/BATON.md` says surfaces as a git
conflict rather than hiding, and it did: `_build/tasks.json` conflicted on merge.

The dangerous half was not the number. **The claim file was `_build/claims/T-092.json` with
`status: "done"`**, so merging it would have marked *someone else's* `designTokens` task
complete, by a person who never touched it — and `baton status` would have reported it done
to everybody. Renumbered to T-095, claim file moved rather than deleted, and every reference
in the journal and in this register updated. Upstream's own register entry for T-092–T-094 is
left exactly as they wrote it.

Worth stating as a lesson rather than a footnote: **a claim file is a stronger assertion than
a task entry.** A duplicate id in `tasks.json` is caught by `validateTasks`, which fails
loudly on a duplicate. A claim file pointing at an id whose *meaning* changed under it is
caught by nothing — it is well-formed, it validates, and it silently reassigns credit and
completion. Anyone adding a task to the board from a long-running branch should re-derive the
next free id at merge time, not at branch time.

Delivered as a branch and a pull request rather than a commit to `main`, per
`docs/GIT-PROTOCOL.md`: `main` takes no direct commits but claim files, and producer and
verifier are never the same. The board and contract changes proposed in F-002 and F-003 are
therefore awaiting a second reader, not applied.

---

## 2026-08-20 · The board's `verify` filter was a no-op — every task's verification passed on someone else's tests

Found while claiming T-002 and reading its verify command before building.

Every task on the board declares `verify` as `npm test -- <filter>`. The root script was
`node --test tests/**/*.mjs`, and the filter did nothing:

```
$ npm test -- zzz-does-not-exist
ℹ tests 13   ℹ pass 13   ℹ fail 0   EXIT: 0
```

So `baton done T-002` would have passed **with no `server/` directory and no test written**,
because the golden component's 13 tests pass and the runner never looked at the filter. The
same was true of all 91 open tasks.

**Why this is the worst class of harness defect.** `docs/BATON.md` says the verification
"cannot be skipped" and that "one command decides done. Not an opinion, not a feeling."
`AGENTS.md` rule 6 says producer and verifier are never the same. Both were false in
practice, and neither would have announced it — every `baton done` printed a green suite and
marked the task complete. BATON.md's own words for this: *a verification nobody trusts is
worse than none, because people route around it.* This one was worse still, because nobody
had reason to distrust it.

**Fixed** by replacing the root script with `tools/test.mjs`, a zero-dependency runner:

| | |
|---|---|
| `npm test` | runs every `tests/**/*.test.mjs` |
| `npm test -- api-skeleton` | runs only the matching file, and says which it selected |
| `npm test -- nonsense` | **exits 1**, naming the file it expected and listing what exists |

The third row is the whole fix. A task whose verify names a test nobody has written must
fail, not inherit a green suite. Zero dependencies is not incidental either — `npm test`
works on a fresh clone with no `npm install`, and the runner must not be the thing that
breaks that.

`tools/baton.mjs` needed no change: `cmdDone` already propagates a non-zero exit correctly.
The fault was entirely in what it was running.

---

## 2026-08-20 · T-002's `files` list was missing the file its own verification needs

`AGENTS.md` tells an executor that needs an undeclared file to stop, and that one of two
things is true: the task is wrong, or you are doing someone else's task. The task was wrong.

T-002 declared three files — `server/package.json`, `server/src/app.js`,
`server/src/routes/index.js` — and a verify command of `npm test -- api-skeleton`. **It did
not declare `tests/api-skeleton.test.mjs`**, so the task as written could not be verified by
anyone who obeyed its own scope rule.

Amended to eight files, and the size raised 40m → 60m to match:

- `server/src/http/envelope.js` — §13.4's convention in one place. Four people are about to
  write handlers, and §9 names `{ data: [...] }` where the reducer expects `[...]` as a
  cause of total store death. That shape gets decided once, not per handler.
- `server/src/server.js` — the entrypoint, split from `app.js` so the app can be built and
  exercised without binding a port.
- `tests/api-skeleton.test.mjs` — the verification.
- `tools/test.mjs` and root `package.json` — the runner fix above, which T-002 cannot be
  honestly verified without.

**One design decision worth recording.** The route table and every handler import nothing;
`app.js` is a thin map from that table onto Express. So the verification runs on a fresh
clone with no `npm install`, preserving the property in SETUP.md step 5. The cost is a rule
that must be held: contract logic goes in the table, never in `app.js`. If it drifts up into
the Express layer it escapes the test silently, which is why `app.js` says so in its header.

Root `package.json` also gains `npm run server`, which README's run-command table has
promised since Phase 1 was written.

---

## 2026-08-20 · The pre-push gate blocked the first npm lockfile, and was right to

`git push` was refused after T-002. `sh .githooks/pre-push` reported forbidden hostnames in
git history: `registry.npmjs.org`, `github.com`, `opencollective.com`, `www.patreon.com`,
`feross.org` — all of them from `server/package-lock.json`, the first lockfile this
repository has ever contained.

This is `EC-005` firing exactly as designed: **the security floor denying correct work.**
The rule for that case is not negotiable — fix the hook, log it, never weaken it to get
past it. Nothing was pushed while this was open.

**What those hosts actually are.** 68 `registry.npmjs.org` entries are the `resolved` line of
every dependency. The other four are `funding` metadata: where a package author asks to be
paid. All of it is machine-generated by npm, none of it is ours, none of it is secret, and
none of it is what this check exists to catch — a **real production host of ours** leaking
into the repository.

**Fixed** by adding the five hosts to `ALLOWED_HOST_RE`, each with the one-line justification
the hook's own comment block demands. `registry.npmjs.org` is precisely as legitimate as
`download.pytorch.org`, which was already there for the same reason.

**Test-fired both ways before trusting it**, per the Phase 0.3 rule that a hook which fails
either test does not ship:

- **True positives still rejected:** `s3.amazonaws.com`, `my-client-cdn.net`,
  `acme-corp.com`, `mongodb.net`, `api.openai.com`.
- **Near-miss bypasses still rejected:** `registry.npmjs.org.evil.com`, `notgithub.com`,
  `evil.github.com.attacker.net`, `internal.corp.local.attacker.io`. The pattern is anchored
  at both ends, so an allowlisted host cannot be used as a prefix or a subdomain to smuggle
  another one.
- **All thirteen legitimate hosts pass.**

**The part worth reading if you hit this next.** Funding hosts are an **open set**. A new
dependency can introduce one nobody has listed, and this gate will stop the push. *That is
the gate working.* Add the host with a sentence saying what it is. Do **not** broaden the
pattern, and do **not** exempt lockfiles as a file class — a carve-out for a whole kind of
file is how a floor stops being a floor, which is the entire content of EC-005. That warning
is now written into the hook itself, where the next person will read it at the moment they
need it rather than here.

`LAW-MANIFEST.sha256` regenerated for `.githooks/pre-push` from LF content, per `EC-006`.
The manifest caught the edit before the commit did, which is what it is for.

---

## 2026-08-20 · T-003's `files` list had the same defect — recorded by the executor

| What | Detail | Found by |
|---|---|---|
| T-003 missing test | The store-adapter-interface test did not exist in tests/ and was missing from the task files array. Added the test and edited tasks.json to track it. | AI Executor |

**This is now three tasks out of three.** T-002, T-003 and T-054 each declared a
`verify` command naming a test file that their own `files` list omitted — found
independently, by two different builders, within the same hour. It is not three
mistakes; it is one systematic defect in how the board was generated, and every
remaining task with a `verify` should be assumed to have it until checked.

---

## 2026-08-20 · T-054's `files` list had the same defect T-002 did

Two files declared — `perception/server.py`, `perception/app.py` — and a verify command of
`python -m pytest perception/tests/test_health.py`, naming a third file the task did not
declare. Same shape as T-002, found the same way: reading the verify command before
building.

Amended to seven files: the package `__init__.py` (README documents starting the service as
`python -m perception.server`, which needs the package), `requirements.txt`, the test module
and its `__init__.py`, and `.gitignore` for the venv and bytecode. Size 45m → 60m, and the
contract list widened from `§12` alone to `§12, §10, §11.0, §11.2` — the three extra
sections are the ones the tests actually assert.

**Worth checking the rest of the board for this.** Two tasks out of two examined had it. The
pattern is a task whose `verify` names a test file that its `files` list does not.

---

## 2026-08-20 · GAP: §12 requires inline stage artifacts but never names the field

`§11.2` says the Python service "returns its stage outputs inline in the `/perceive`
response body, and Node persists them", and `§12`'s response sketch says
`"stages": [ ...stage trace records for stages 2-4, artifacts INLINE... ]`.

**Both describe the behaviour. Neither names the field that carries it.** `§11.1`'s stage
record has `inputRef` and `outputRef`, and those are paths — which is exactly what the
Python service must not produce, because a relative path written on the perception laptop
resolves to nothing on the Node machine. That is the whole reason artifacts are Node-owned.

So the one field that makes §11.2 implementable is the one field §11.1 does not have.

T-054 implements it as `artifact`, sitting alongside `outputRef` in each stage record, with
`outputRef` left `null` on this side of the seam — Node fills it in when it persists the
content. T-054's test asserts `outputRef is None` for every stage returned by `/perceive`,
so the rule cannot quietly regress into a path being invented here.

**This is a contract gap, not a contract change.** `AGENTS.md` says: do not invent fields; if
the contract does not define it, ask or log the gap. Logged. It wants closing as an additive
§11.1 field before T-058 wires Node's call to `/perceive`, because that is the moment both
sides must agree on the name. Whoever closes it: do not rename `artifact` without changing
both sides in the same commit.`n| T-004 missing test | The json-store test did not exist in tests/ and was missing from the task files array. Added the test and edited tasks.json to track it. | AI Executor |


---

## 2026-08-20 · T-005's `files` list had the same defect — fourth in a row

| What | Detail | Found by |
|---|---|---|
| T-005 missing test | The mongo-store test did not exist in tests/ and was missing from the task files array. Added the test and edited tasks.json to track it. | AI Executor |
| T-006 missing test | The allocate-id test did not exist in tests/ and was missing from the task files array. Added the test and edited tasks.json to track it. | AI Executor |

**Four tasks out of four now: T-002, T-003, T-005, T-054.** Every one declared a
`verify` command naming a test file its own `files` list omitted. Two different
builders hit it independently, four times, inside one afternoon.

It is worth stating plainly that this is no longer a per-task correction. It is a
defect in how `_build/tasks.json` was generated, it is present in an unknown number of
the ~87 remaining tasks, and everyone is currently paying for it one task at a time.
**Somebody should sweep the whole board once** — for every task with a non-null
`verify` naming `npm test -- <x>` or a pytest path, assert the corresponding test file
appears in that task's `files`. That is a ten-minute script and it retires the problem
instead of rediscovering it.

---

## 2026-08-20 · CONTRACT v1.5 → v1.6 — the last two places the diagram and this document disagreed

Found by reading `IMG_3214.PNG` against the contract a second time, after v1.5 had already
reconciled the infra band.

### 1. The Design System & Tokens store existed nowhere (§6.1)

The diagram carries a token store feeding **both** the layout planner and code generation —
colours, typography, spacing, shadows, border radius, breakpoints, components. Grepping this
document for "design system", "token", "typography", "shadow" and "border-radius" returned
**zero hits across all 1,141 lines.** The IR's `theme` was four fields.

That gap sat directly under the **15-point layout-fidelity criterion**, and it would have
been discovered by whoever built the emitter, at the point where retrofitting the IR is
expensive. T-025 has not been built, so it is closed now instead.

`designTokens` is **optional**, and the load-bearing part is what happens when it is absent:
the emitter uses `DEFAULT_TOKENS` and produces exactly what it produces today. T-093's
verification is that the emitter's output is **byte-identical** for an IR with no
`designTokens` and an IR carrying `DEFAULT_TOKENS` explicitly. That equivalence is the only
thing standing between an additive field and a silent change to the deterministic path.

Two rules inside it are not cosmetic:

- **Tailwind utility classes, never raw CSS values.** `text-4xl`, not `36px`. A token
  holding a raw value forces the emitter to invent a class name or inline a style, and the
  second collides with R10's `cssText` overlay and §8's CSS allow-list.
- **`theme` stays and is not deprecated.** It is what `sectionTextMode` and
  `getSectionTextContrastClass` read. `theme.accent` and `designTokens.colors.accent` must
  agree, set from one source. Renaming it after the clock started is forbidden regardless.

### 2. v1.5 contradicted the brief on validation failure (§18.2)

**This one was mine, introduced hours earlier.** §18 said no gate may fail a generation. The
diagram routes *"Validation Failed → auto-fix (rules) or re-generate"*, and the source
brief's own risk table says *"Validate with a parser; retry once; fall back to a template
filled from IR."* All three cannot hold.

The error was running two different things together. **Scoring** gates — visual similarity,
accessibility count, performance, the §18.1 score — should never block; that part of §18 was
right and stands. **Structural failure** is a different animal: a component that does not
parse is not a low-scoring component, it is not a component. Shipping it with a warning
attached would have satisfied §18 as written and handed a judge a broken preview — the exact
outcome this document exists to prevent.

§18.2: emit, parse, lint; on a parse error or an ESLint **error** retry exactly once from the
same IR; on a second structural failure fall back to the deterministic emitter, record stage
6 `degraded`, warn, and **the job succeeds**. §11.1 already says a degraded stage is a
success for the job and a warning for the stage; this is the case it was describing.

**Rule-based auto-repair declined deliberately.** The diagram offers it. Repairing generated
code with rules is unbounded work, and the deterministic emitter already gives a
guaranteed-valid answer for free. Falling back to something that always works beats fixing
something that sometimes does.

**"Retry once" means once.** §16.2's orchestrator has its own single retry for a
schema-invalid model response; §18.2's is a separate, later retry of the whole emit step. The
two must not compose into four attempts, and T-094 asserts the total is two — NFR-02 gives
the entire generation 60 seconds.

**Board:** T-092, T-093, T-094 added, all Phase 2 and `generation` track, because both
changes are spine work that must land before the Phase 3 split. T-076's dependencies extended.
Total 92 → 95.

---

## 2026-08-20 · `.githooks/pre-push` blocked a legitimate JSON Schema reference

T-019 (the IR v1.0 Ajv schema, `server/src/schemas/ir.schema.json`) uses the standard
`"$schema": "http://json-schema.org/draft-07/schema#"` keyword — the JSON Schema
specification's own meta-schema URI, not a real host. Pushing tripped pre-push's
forbidden-hostname check (§14): `json-schema.org` wasn't on `ALLOWED_HOST_RE`, so the full
pre-submit gate failed closed exactly as designed.

This is the case pre-push already documents as legitimate — a documentation/spec reference,
same category as `agents.md` — and the hook's own error message names the correct response:
add it to `ALLOWED_HOST_RE` with a comment, don't weaken the check. Done: `json-schema.org`
added, with a comment stating what it is and that nothing in this repository ever fetches it
over the network. `LAW-MANIFEST.sha256`'s `.githooks/pre-push` entry regenerated to match.

No contract change — `.githooks/pre-push` isn't a frozen document, but it is hook-floor law
(CLAUDE.md), so the same append-only, state-the-why discipline applies.
---

## 2026-08-20 · The verify/files defect swept off the whole board — 77 of 95 tasks

Fixed per `docs/BATON.md`: *"The verification is wrong, not the code. Fix the verification in
the same commit, and say so in `docs/corrections/REGISTER.md`."*

Four tasks had been corrected one at a time — T-002, T-003, T-005, T-054 — each declaring a
`verify` command naming a test file its own `files` list omitted. `AGENTS.md` tells an
executor that needs an undeclared file to **stop**, so the defect turns every affected task
into a scope violation before it can be verified at all.

`tools/check-verify-files.mjs` swept the board. **77 of 95 tasks were affected** — including
all sixteen I added myself today, so this was never an executor problem. It is how the board
was generated. `--fix` patched every one; the sweep is re-runnable and exits non-zero on any
future mismatch, so it can be wired into the pre-commit hook later if the same drift returns.

It also reports which implied test files do not exist on disk. 76 do not, which is correct
for an unclaimed task and would be a failure for a done one — a cheap second check that a
task marked done actually has its verification written.

---

## 2026-08-20 · T-005's verification could not run, and `skip: null` was hiding it

Found while verifying T-005 after it was already marked done on `main`. Three separate
faults, stacked, each masking the next.

**1. The import could never resolve.** `tests/mongo-store.test.mjs` imports
`mongodb-memory-server` as a bare specifier. Node resolves bare imports **upward** from the
importing file — `tests/node_modules`, then `<root>/node_modules` — and never sideways into
`server/node_modules`. Running `cd server && npm install` therefore cannot fix it, which is
the trap: the obvious remedy looks right and changes nothing. Root `package.json` already
declared the dependency; nobody had run `npm install` at the root.

**2. `skip: null` marks a test skipped — and still runs its body.** The guard was written as
`{ skip: unavailable }` with `unavailable` null when the package resolves. node:test treats
**any non-`false` value** as a skip, so the test reported `# SKIP`, the suite went green, and
the assertions inside were executing the whole time with their results discarded. Verified
directly:

```
test('with null',  { skip: null  }, ...)   ->  body RUNS, reported # SKIP
test('with false', { skip: false }, ...)   ->  body runs, reported as a pass
```

`{ skip: unavailable || false }` is therefore load-bearing, not defensive styling. A guarded
optional-dependency test written the obvious way is a test that never fails.

**3. My own repair corrupted the file** — a shell-quoted `python -c` edit wrote an unbalanced
string literal, and the resulting `SyntaxError` presented as a plain `'test failed'` with no
message. Repaired from a script file rather than an inline command; that quoting is not worth
fighting twice.

**With all three fixed, the test runs and passes.** 50 concurrent `allocateId` calls return
50 unique 10-digit IDs. **T-005's store code was correct throughout** — only its verification
was broken, which is precisely the case `BATON.md` names.

Suite now **44 passing, 0 failing, 0 skipped**, and the skip message says to install at the
root and explains why `cd server && npm install` will not help.
---

## 2026-08-20 · SUPERSEDED — the same `files`-list defect, counted independently at 73

**Superseded by the entry immediately above, which did the real work.** Kept because the
register is append-only and a pruned register lies — and because two people counting the same
defect within the same hour is itself worth knowing.

T-026 hit the defect for the sixth time. Not having seen the sweep land (it was committed
while T-026 was being built), I wrote the same four-line detector and got **73 of 95** —
against the 77 above, the difference being the sixteen tasks that entry's author had added
themselves plus my own three, all corrected in flight. Same defect, same conclusion, same
recommendation: script it, wire it into pre-commit.

Only T-007, T-019 and T-026 were patched here — my own three — on the reasoning that
rewriting seventy other people's task definitions under a T-026 claim is the "tidy-up outside
your task's scope" AGENTS.md warns creates a merge conflict for someone who is asleep. That
reasoning was sound and the outcome was still a duplicated effort, which is the honest lesson:
**the register is only a coordination tool if you re-read its tail before acting on it.** The
recommendation to sweep had been sitting in the T-005 entry for hours; two people picked it up
independently rather than one claiming it.

`tools/check-verify-files.mjs` is the surviving artifact. This entry adds nothing to it.
