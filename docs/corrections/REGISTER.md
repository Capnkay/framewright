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
