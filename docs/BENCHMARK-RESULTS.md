# Benchmark Results

Measured, not assumed. Every number here came off a real machine.

---

## B-001 · Florence-2 on a low-fidelity wireframe

**Date:** 2026-08-20 · **Status:** DEFINITIVE — measured twice, both task families · **VERIFIED** (run on our hardware)

### Machine

| | |
|---|---|
| GPU | NVIDIA GeForce RTX 3050 Laptop, **6.00 GB** |
| Driver / CUDA | 592.82 / 13.1 |
| Python / torch CUDA | 3.10 / available |

### What we measured

| | Florence-2 base | Florence-2 large |
|---|---|---|
| Model load time | 98.6 s | — |
| VRAM after load | 0.44 GB | — |
| **Peak VRAM** | **0.60 GB** | **1.76 GB** |
| Seconds per phrase | ~0.3 s | — |
| **Targets located correctly** | **1 of 7** | **1 of 7** |

### The finding

**The model returned bounding boxes covering the entire image for almost every label.**
Example: `[50, 40, 1560, 1010]` on a 1600×1168 image — 84% of the frame. Identical failure
mode on both model sizes.

**We read the score as 0 of 7, not 1 of 7.** On a split hero the hero image occupies
roughly half the frame, so a whole-image box scoring as a hit on the image element is the
degenerate output landing near a real answer by coincidence. Same failure, counted as a
success. Counting it as 1 would flatter the result.

### The retest — hypothesis resolved

The first run used the wrong Florence-2 task (`<CAPTION_TO_PHRASE_GROUNDING>` with long
descriptive sentences). It was rerun with the correct tasks and short label vocabulary.

| Task | Result |
|---|---|
| `<OPEN_VOCABULARY_DETECTION>`, short labels (`button`, `heading`, `image`, …) | **0 of 7 — no boxes returned at all** |
| `<OD>` — plain, unprompted object detection | one box, whole image, labelled **`"whiteboard"`** |
| `<DENSE_REGION_CAPTION>` | one region, whole image, **`"hand-drawn website layout"`** |

**0 of 7 with the wrong task. 0 of 7 with the right one.** The method error was real, and
it was not the cause.

### The actual finding, stated precisely

**The model is not failing to see the image. It is seeing exactly one object where we need
seven.**

It identifies the artifact correctly and describes it well — *"hand-drawn website layout"*
is, after all, the right answer to the question it was trained to answer. It simply has no
notion that a wireframe decomposes into UI components, because nothing in its training
distribution ever asked it to.

This is a **training-distribution gap, not a prompting problem**, and no choice of task
token or label vocabulary closes it.

### What this establishes

- **VRAM was never the constraint.** Peak 0.60 GB (base) and 1.76 GB (large) on a 6 GB
  card. We spent planning effort on a risk that did not exist and nearly missed the one
  that did.
- **Inference is fast** — ~0.3 s per query. Speed was never the issue either.
- **General-purpose vision models do not decompose wireframes.** Measured, on our
  hardware, across both model sizes and both task families.

### What we did with it

Perception moves to **classical computer vision first**, with a synthetic-data-trained
detector as the upgrade. Rationale in `docs/ROADMAP.md`; the short version is that a
wireframe is rectangles and text — the worst case for a detector trained on photographs
and close to the best case for contour detection.

### Why this result is worth having

It is the benchmark the original architecture asked for, in a form we can defend.

**The line for a judge:**

> *"We tested a state-of-the-art vision model on our actual input. It correctly called our
> wireframe a hand-drawn website layout — and then returned one box around the whole
> thing. It sees one object where we need seven. That is a training-distribution gap, not
> a prompting problem, so we built a pipeline for the distribution we actually have — and
> we generate its training data from our own schema."*

A measurement outweighs a claim, and almost no team arrives with one. This one also
explains, in a sentence, why the architecture is shaped the way it is.

### What it unlocks

The failure makes the synthetic-data generator the centrepiece rather than a stretch goal.
We render wireframes **from our own IR schema**, so we own both halves of every training
pair: the image and its exact ground-truth boxes. Unlimited, perfectly labelled,
domain-specific, zero licence risk — which is precisely the data that does not exist
anywhere for anyone to have trained Florence-2 on.

**Credit where due:** the teammate who ran it reported the whole-image boxes plainly
rather than counting them as hits. That honesty is the only reason the method error was
findable at all.

---

## B-002 · DETR on the same low-fidelity wireframe

**Date:** 2026-08-20 · **Status:** DEFINITIVE — four confidence thresholds, identical result · **VERIFIED** (run on our hardware)

Run because F-006 pointed out that both committed architecture diagrams route detection
through DETR, and DETR had never been measured here. It was an assumption sitting on the
critical path of the input-coverage criterion.

### Machine

Same as B-001. RTX 3050 Laptop, 6.00 GB. `perception/.venv`, torch 2.6.0+cu124,
transformers 5.15.1, `facebook/detr-resnet-50` (Apache-2.0, approved in the README table).

Same image as B-001: `gpu-test/wireframe.png`, 1600×1168, hand-drawn.

**Fed through stage 2 first**, deliberately — normalised to a 1024×1024 letterboxed canvas
with the T-055 transform. That measures the pipeline as it would actually run, and it means
a poor result cannot be blamed on unnormalised input.

### What we measured

| | |
|---|---|
| Model load | 41.8 s |
| Inference | 1.47 s |
| **Peak VRAM** | **0.34 GB** |
| Detections at threshold 0.5 | **1** |
| Detections at 0.3 / 0.1 / **0.05** | **1 / 1 / 1** |
| **Targets located correctly** | **0 of 7** |

### The finding

**DETR returned exactly one object, labelled `"cell phone"`, covering 64% of the frame.**

```json
{ "label": "cell phone", "score": 0.5259,
  "box_original": [6.1, 4.5, 1570.3, 1050.9], "area_fraction": 0.6446 }
```

Mapped back through the stage-2 transform, that box is very nearly the entire 1600×1168
upload.

**Lowering the threshold to 0.05 changed nothing.** Not one additional box. The model does
not have seven weak hypotheses waiting under a cutoff — it has one, and nothing else clears
5%.

### The structural half, which matters more than the score

```
"ui_labels_available": []
```

**DETR's COCO vocabulary contains no UI classes at all.** It cannot emit `button`,
`heading`, `card`, or `badge`, because those labels do not exist in its output space. This
is not a tuning problem or a threshold problem. Asked to find a button, the best it can
physically do is name the nearest of 91 photographic objects — and it chose `cell phone`,
which for a tall rectangle full of smaller rectangles is a *reasonable* answer to the
question it was actually trained to answer.

### Read alongside B-001

| | Florence-2 | DETR |
|---|---|---|
| Boxes returned | 1 | 1 |
| Label | `"whiteboard"` | `"cell phone"` |
| Frame coverage | 84% | 64% |
| **Targets located** | **0 of 7** | **0 of 7** |
| Peak VRAM | 0.60 GB | 0.34 GB |

**Two independent architectures, two different training sets, the same failure, twice.** One
called our wireframe a whiteboard; the other called it a cell phone. Both are describing the
picture correctly and answering a different question from the one we asked.

That is now a measured pattern rather than a single result, and it is the strongest evidence
we have for the architecture: **general vision models do not read wireframes.** Not because
they are weak — DETR is a fine detector — but because a line drawing that decomposes into UI
components is not in any of their training distributions. EC-008 predicted this for DETR
specifically, on the grounds that COCO is photographs, and the prediction held.

VRAM was never the constraint in either run: 0.34 GB and 0.60 GB on a 6 GB card.

### What it changes

**Nothing about the plan, which is the point.** The contract, the stage cards and
`docs/html/architecture.html` already commit to OpenCV contour detection plus PaddleOCR, and
already record DETR and Florence-2 as measured-and-rejected. This run converts the DETR half
of that from a reasoned expectation into a number.

**It changes the two committed diagrams**, which still show DETR as the primary detector.
See F-006.

---

## B-003 · OpenCV contour detection on the same wireframe

**Date:** 2026-08-20 · **Status:** DEFINITIVE — T-056's measured result · **VERIFIED** (run on our hardware)

Run because T-056's `doneWhen` requires it: "scored against the same 7 reference targets
B-001 and B-002 used, on the same wireframe, and the number recorded … as B-003 — a
classical-CV result that cannot be compared against the two model results is not evidence
of anything."

### Machine

Same as B-001 and B-002. RTX 3050 Laptop, 6.00 GB — **but this run used the CPU only.**
No GPU, no model weights, no network access.

`perception/.venv`, Python 3.10, OpenCV 5.0.0. Reproduced with:

```
perception/.venv/Scripts/python -m perception.benchmarks.contours_wireframe ../gpu-test/wireframe.png
```

Same image as B-001 and B-002: `gpu-test/wireframe.png`, 1600×1168, hand-drawn. Fed through
stage 2 first — normalised to a 1024×1024 letterboxed canvas with scale=0.64, offsetY=138.

### What we measured

| | |
|---|---|
| Device | **CPU** |
| Model weights | **None** |
| Network | **None** |
| Detection time | **0.04 s** |
| Regions returned | **35** |
| **Targets located correctly** | **7 of 7** |
| IoU range | **0.69 – 0.88** |

### Per-target results

| Target | IoU | Located |
|---|---|---|
| `heroImage` | 0.88 | ✓ |
| `brandBadge` | 0.78 | ✓ |
| `headlineMain` | 0.83 | ✓ |
| `headlineSub` | 0.80 | ✓ |
| `description` | 0.69 | ✓ |
| `statBadges` | 0.72 | ✓ |
| `ctaButton` | 0.76 | ✓ |

### How it works

Three detectors over one illumination-corrected ink mask:

1. **Drawn rectangles** — contours scored by measured per-side edge support
2. **Handwriting clusters** — after whole-connected-component structure removal
3. **Regular series** — aligned, similar, evenly-spaced siblings

The series detector is the only reason `description` (four ruled lines) and `statBadges`
(three squares) are findable at all — individually they are four lines and three squares;
the series detector recognises them as one paragraph and one stat row.

Every confidence is a geometric measurement. Components are carried in `Region.evidence`
so a reader can check the arithmetic. §10 forbids fabricated numbers and that cuts both
ways: a region from an image must carry a number that came from the image.

### The honesty problem, stated again

**The person who annotated the ground-truth boxes also wrote the detector.** Three
constraints against that, from the benchmark harness's own docstring:

1. The boxes are in the **original** image's coordinates and were read off a 100px grid,
   not off the detector's output.
2. Every target's **actual IoU** is printed, not just pass/fail. A hit at 0.69 and a hit
   at 0.88 are different claims, and hiding the difference behind a boolean is how a
   fitted threshold stays invisible.
3. `regions_returned` is printed beside the score. Locating 7 of 7 by returning 400 boxes
   is not detection, it is enumeration — 35 regions on a 7-target image is the ratio
   that tells the two apart.

### Read alongside B-001 and B-002

| | Florence-2 (B-001) | DETR (B-002) | OpenCV contours (B-003) |
|---|---|---|---|
| **Targets located** | **0 of 7** | **0 of 7** | **7 of 7** |
| Boxes returned | 1 | 1 | 35 |
| IoU range | — | — | 0.69 – 0.88 |
| Label | `"whiteboard"` | `"cell phone"` | geometry only |
| Device | GPU | GPU | **CPU** |
| Weights | 1.1 GB | 167 MB | **None** |
| Network | None | None | None |
| Time | 98.6 s (load) + 0.3 s | 41.8 s (load) + 1.5 s | **0.04 s** |
| Peak VRAM | 0.60 GB | 0.34 GB | **0 GB** |

**Three architectures, two training distributions, the same input.** The two learned
detectors each saw one object covering most of the frame. The contour detector found all
seven, at sub-second speed, on the CPU, with nothing downloaded.

This is the pivot. A wireframe is rectangles and text — the worst case for a detector
trained on photographs and close to the best case for contour detection.

---

## B-004 · Does the right region reach the right slot? — fusion, before and after T-100

**Date:** 2026-08-22 · **Status:** DEFINITIVE — T-100's measured result · **VERIFIED** (run on our hardware)

B-003 asked whether stage 3a can **locate** the seven reference elements. It can: 7 of 7.
This asks the question one stage later — whether stage 4 hands each located region to the
element it actually **is**. The two are independent, and B-003 could not see the second:
every region below was located correctly and then given to the wrong slot.

Same machine, same image, same seven annotated targets as B-001 through B-003, imported
from `perception/benchmarks/contours_wireframe.py` rather than re-annotated.

```
perception/.venv/Scripts/python -m perception.benchmarks.slots_wireframe ../gpu-test/wireframe.png
```

### Scored on two axes

A slot can be wrong in two different ways, so both are reported and neither is collapsed
into the other:

- **geometry** — the slot's bbox overlaps that element's annotated target at IoU ≥ 0.5.
- **text** — where the wireframe writes something in that element, the slot's copy
  contains it. `description` and `statBadges` are excluded: four ruled lines and three
  empty squares carry no text, and asserting that they do would assert a fiction.

### The result

| | Before (positional) | After (T-100) |
|---|---|---|
| **Slots with the right geometry** | **0 of 7** | **6 of 7** |
| **Slots with the right text** | **0 of 4** | **4 of 4** |
| Escalation questions raised | 2 | **0** |
| Regions detected / with text | 35 / 7 | 35 / 7 |
| Fusion time | < 0.01 s | < 0.01 s |

Identical input to both — same detections, same OCR pass, 7 regions read either way. The
only variable is the assignment rule.

### Per slot

| Slot | Before — text | After — text | After IoU |
|---|---|---|---|
| `heroImage` | `'eeneb'` (bleed-through) | *(image, no text)* | **0.88** |
| `brandBadge` | template default | **`LABEL`** | 0.55 |
| `headlineMain` | template default | **`HEADLINE`** | **0.29** ✗ |
| `headlineSub` | **`'Image'`** | **`SUB HEADLINE`** | 0.86 |
| `description` | template default | *(4 ruled lines)* | 0.74 |
| `statBadges` | *(the paragraph's rules)* | *(the badge row)* | 0.83 |
| `ctaButton` | template default | **`SUBMIT`** | 0.81 |

### The one that still fails, stated rather than buried

`headlineMain` scores **IoU 0.29** and is counted as a miss. The text is right and the
box is real — it is the tight handwriting cluster around the word HEADLINE, 233×45 in
normalised space. The annotated target is the full headline row, 800×110 in the original.
So this is not a mis-assignment; it is a **tighter box than the ground truth describes**,
and stage 3a produced it that way. Widening a claimed box to its row is a stage-3a
question (T-056), not a fusion one, and inflating the score by loosening `HIT_IOU` here
would break comparability with B-001 through B-003. Left as a miss.

### Why the before column is 0 of 7 and not merely poor

Three separate failures compounded, all of them measured:

1. The detected outer **frame** survives T-056's area ceiling at 58% of the canvas, so
   "largest viable region" chose the frame as the hero image. Its centre sits mid-page,
   so `_side_of` called it *right*, and every genuine element on the left — including the
   hero panel's own `Image` caption — was classified as content on the opposite side.
2. That caption then took an ordinal content slot, which is how **`headlineSub` came to
   contain the word "Image"**.
3. The group rule took the **first** group in reading order for `statBadges`, which on
   this wireframe is the description's four ruled lines rather than the three-badge row —
   and would therefore have reported a card count of 4 for a row of 3 (§4 rule 4).

Meanwhile PaddleOCR had already read `HEADLINE` at 0.99, `LABEL` at 0.97, `SUBMIT` at
0.92 and `Image` at 0.86. Every one of those strings was in hand and discarded.

### What changed

Slot assignment now applies three rules in order: **what the region says** (keyword match
against the reference set, floored at §10's escalate band so a weak reading cannot
silently override position), then **which way a series runs** (T-056 already records
`evidence["axis"]`, so a series running down the page is the paragraph and one running
across it is the badge row), then **position**, for whatever is left. On this wireframe
rule one resolves four slots, rule two resolves two, and `description` — which carries no
text by design — is the only thing rule three has to place.

**No model, no weights, no GPU, no network**, exactly as B-003. The words were already
being paid for by stage 3b and were being thrown away.

### The caveat that belongs next to the number

This is **one image**, and it is the image the keyword table was written against. The
table generalises only as far as wireframes that label their elements in English with the
words it lists; a wireframe that writes "Buy tickets" on its button falls straight through
to the positional fallback, which is the old behaviour and is what the fallback is for.
The honest claim is that fusion no longer discards evidence it already has — not that
slot assignment is solved.

---

## B-005 · AWS Bedrock as the hosted model — qwen3-coder-next and qwen3-vl-235b

**Date:** 2026-08-22 · **Status:** SPIKE — measured, not yet wired · **VERIFIED** (live calls against the real endpoint)

A Bedrock API key was made available, serving `qwen.qwen3-coder-next` (text) and
`qwen.qwen3-vl-235b-a22b` (vision). This records what those two models actually did on
our own inputs, because §16's whole design assumes a hosted model exists and until now
nothing had ever answered one of its calls.

**The key used for these measurements has been rotated and is not recorded here.**

### The endpoint needs no adapter

Bedrock exposes an OpenAI-compatible route beside its native one:

```
https://bedrock-runtime.<region>.amazonaws.com/openai/v1/chat/completions
```

`server/src/models/orchestrator.js` already posts to `${LLM_BASE_URL}/chat/completions`
with a Bearer token and reads `choices[0].message.content`. Both matched on the first
call. **Three environment variables, zero lines of code.** The native
`/model/<id>/invoke` route also works and returns the same OpenAI-shaped body, so either
would do; the `/openai/v1` one is the one the existing transport already speaks.

`response_format: { type: 'json_schema', strict: true }` is **accepted** — the request
does not error and the reply is parseable JSON.

### What the vision model did with our wireframe

Input: `artifacts/job-0000000078/s1-upload.png`, the same hand-drawn wireframe the demo
runs on. Compared against that job's own `s3-regions.json`, produced by the OpenCV +
PaddleOCR pipeline from the same bytes.

| | stage 3 today (OpenCV + PaddleOCR) | qwen3-vl-235b, one call |
|---|---|---|
| regions returned | **35** | **9** |
| roles | none — `fuse.py` infers them later from keywords | assigned in the response |
| text read | `eeneb`, `bceanse.ad.ioipqincsm`, `SUB HEADLINE evoleldno` | `Image`, `LABEL`, `SUBMIT`, `HEADLINE`, `SUB HEADLINE` |
| cost | free, local GPU | 2,305 tokens, ~4 s |

Every handwritten word came back correct, the four ruled lines were labelled `input`, and
the large empty box was labelled `image`. That is the combined output of `detect_regions`,
`extract_text` and `fuse` in a single call.

**The geometry was the open question. T-121 answered it, and the answer is below.**

### What the text model did with prompt-to-IR

`promptToIrHostedWithMeta('a bold hero section with three stats and a dark accent')`, run
with only the three environment variables set and no code change:

```
usedPath : keyless
reason   : model call timed out after 30000ms
meta     : {"purpose":"prompt-to-ir","model":"qwen.qwen3-coder-next","ms":60014,"attempts":2,"ok":false}
```

**Rule 5 held exactly as designed.** Two attempts failed, the orchestrator gave up, the
keyless path produced a valid seven-element IR, and the reason was recorded in the IR's
own `warnings` rather than being swallowed. Nothing crashed and nothing silently degraded.

A raw call with the same §6 schema (5,191 bytes) returned **200 in 22.5 s**, so the 30 s
§16.2 timeout is marginal for this model rather than wrong — the fallback above was
variance, not a hard failure.

**But the output does not satisfy §6, and `strict: true` did not prevent that.** From the
raw reply:

- `"source": { "mode": "code" }` — the call was a prompt, and `mode` was not the model's
  to choose.
- `"pageName": "landing"` — `Home` was passed in and ignored.
- `"shadow Small"` and `"shadow XL"` — design token keys with spaces in them.

`validateIr` rejects this and `promptToIrHosted` falls back, which is the correct
behaviour and also means the hosted path currently costs 22 s to produce nothing. Making
it useful is prompt engineering — pinning the caller-supplied fields and constraining
`designTokens` — not configuration.

### Licensing

These are **hosted inference calls, not weights we run or redistribute.** The licence trap
AGENTS.md records — YOLOv8's AGPL network clause, LayoutLMv3's CC-BY-NC-SA weights,
Qwen2.5-Coder-3B's non-commercial terms — applies to weights shipped or served by us. A
managed endpoint is a different relationship. The Bedrock model EULA for these two model
ids should still be read before the submission claims anything about commercial use; it
has **not** been read yet, and no claim rests on it.

### What this changes

At measurement time: nothing yet, by design. The measured position was:

1. The transport works and needs no code.
2. The vision model is a large quality win on text and roles, blocked on coordinates.
3. The text model needs prompt work before it beats the deterministic path, which today
   produces valid IR in about a millisecond.
4. Every one of these is an enhancement above a path that must keep working without them.

**T-123 closes point 3's "needs prompt work" for the specific three defects measured
above.** `promptToIrHosted` now pins `pageName`, `sectionName`, `platform` and
`variations` to the caller's own values after the call returns, and pins `source.mode` to
`"prompt"` — this module only ever runs for a prompt call, so the model was never in a
position to know better. None of these are things a model can be trusted to report about
its own invocation; they are overwritten unconditionally rather than validated and
rejected on mismatch, and every overwrite that actually changed something is named in the
IR's `warnings`, the same way `promptToIrKeyless`'s own fallback notes work. A `designTokens`
key that cannot be a bare identifier (`"shadow Small"`, `"shadow XL"`) is stripped and
named the same way, rather than left to `resolveTokens`'s own rule-4 drop to explain
itself three layers downstream.

This does not change points 1, 2 or 4. It does not make the hosted path faster — 22.5s is
still 22.5s — and a reply broken in a way pinning cannot reach (an invented field ID, a
genuinely malformed `elements` array) still falls back to the keyless path exactly as
before, with the reason in `warnings`. What changes is that the three specific defects
measured above no longer cost 22 seconds to throw away: the same reply that failed §6
validation outright now survives as a valid, `usedPath: 'hosted'` IR. Verified in
`tests/prompt-to-ir-hosted-output.test.mjs` against the reconstructed B-005 reply, without
a live Bedrock key.

---

## B-006 · Can the VLM place a box, or only read one? — T-121

**Date:** 2026-08-22 · **Status:** DEFINITIVE — T-121's measured result · **VERIFIED** (three live runs)

B-005 found `qwen3-vl-235b` reading every handwritten word on our wireframe correctly
while declaring the image 1000 × 1168 wide and emitting boxes that looked like corners.
That left one question, and the whole VLM plan rested on it: **are the coordinates
usable?**

Same image as B-001 through B-004 — `gpu-test/wireframe.png`, 1600 × 1168, byte-identical
to `artifacts/job-0000000078/s1-upload.png`. Same seven annotated targets, **imported from
`contours_wireframe.py` rather than re-annotated**, because ground truth retyped for a new
detector drifts toward whatever that detector returned.

```
perception/.venv/Scripts/python -m perception.benchmarks.vlm_wireframe <image>
perception/.venv/Scripts/python -m perception.benchmarks.vlm_wireframe <image> --crops
```

### As a localiser: 0 of 7

With the true dimensions pinned in the prompt and `[x, y, w, h]` demanded explicitly, the
model now returns the correct `width` and `height` — and the boxes are still nowhere near
the targets.

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| regions returned | 10 | 9 | 10 |
| targets located (IoU ≥ 0.5) | **0 of 7** | **0 of 7** | **0 of 7** |
| mean IoU | 0.150 | 0.152 | 0.151 |
| text read | 5 of 5 | 5 of 5 | 5 of 5 |

Per target, best run: `heroImage` 0.487 — just under the bar — and then 0.133, 0.108,
0.104, 0.088, 0.085, 0.047. Not a threshold problem. The boxes are wrong.

**Four readings were scored, not one.** The model emits four numbers per box and does not
say whether they are a corner-and-size or two corners, and it declares its own dimensions
which it may or may not mean. That is four plausible interpretations —
`xywh_declared_rescaled`, `xyxy_declared_rescaled`, `xywh_raw`, `xyxy_raw` — and picking
the flattering one after the fact is the same fitted-threshold failure B-003's docstring
warns about, one level up. All four are scored and printed. All four score 0 of 7.

### It cannot consume coordinates either

A third probe handed the model **OpenCV's own boxes** — the 7-of-7 geometry from B-003 —
as a numbered list, and asked only for a role and the text inside each. No localisation
requested at all.

| target | OpenCV IoU | role the VLM gave that box | text it gave |
|---|---|---|---|
| `heroImage` | 0.880 | `image` | `Image` ✓ |
| `headlineMain` | 0.727 | `button` | **`SUBMIT`** ✗ |
| `headlineSub` | 0.862 | `label` | `` ✗ |
| `description` | 0.743 | `label` | **`LABEL`** ✗ |
| `brandBadge` | 0.687 | `none` | `` ✗ |
| `statBadges` | 0.829 | `none` | `` ✗ |
| `ctaButton` | 0.809 | `none` | `` ✗ |

It labelled 7 of 34 boxes and attached the right words to the wrong ones — `SUBMIT` on the
headline, `LABEL` on the description. **One deficit, two symptoms: it cannot ground text
to coordinates in either direction.**

### As a reader: 7 of 7

So the last variant takes coordinates out of the exchange entirely. One crop in, one
string out, no numbers anywhere.

| target | expected | read | |
|---|---|---|---|
| `heroImage` | `Image` | `Image` | ✓ |
| `brandBadge` | `LABEL` | `LABEL` | ✓ |
| `headlineMain` | `HEADLINE` | `HEADLINE` | ✓ |
| `headlineSub` | `SUB HEADLINE` | `SUB HEADLINE` | ✓ |
| `description` | *(none)* | `` | ✓ |
| `statBadges` | *(none)* | `` | ✓ |
| `ctaButton` | `SUBMIT` | `SUBMIT` | ✓ |

**7 of 7 · 15.6 s · 1,320 tokens · 7 calls.**

The two empty regions matter more than the five that read correctly. `description` is four
ruled lines and `statBadges` is three empty squares; both came back as empty strings rather
than invented text. Hallucinating copy into an empty box is the failure a reader is most
likely to have and the one that would be hardest to catch downstream, and it did not
happen. They are scored in rather than excluded for exactly that reason.

### What this decides

| approach | geometry | text |
|---|---|---|
| OpenCV + PaddleOCR — **today** | **7 of 7** | `eeneb`, `bceanse.ad.ioipqincsm` |
| VLM alone | 0 of 7 | 5 words, ungrounded |
| VLM labelling OpenCV's numbered boxes | n/a | wrong box ↔ wrong label |
| **OpenCV locates + VLM reads crops** | **7 of 7** | **7 of 7** |

**T-122 as originally written is dead.** "The VLM replaces stage 3" cannot work; it has no
usable spatial grounding on this input. T-122 is rewritten as what the numbers actually
support: `detect_regions` keeps every box it finds, and the VLM replaces **PaddleOCR** as
the thing that reads them, one crop at a time.

Two caveats on that number before anyone leans on it. The crops here come from the B-003
**annotations**, not from `detect_regions`' real output, so this measures the reader in
isolation; the wired version will score slightly differently because the detector's boxes
are not the annotations. And it is seven network calls per wireframe — AGENTS.md rule 5
means PaddleOCR stays the path that runs with no key, no network and no GPU.

---

## B-007 · The VLM reader wired into stage 3b — T-122

**Date:** 2026-08-22 · **Status:** DEFINITIVE — T-122's measured result · **VERIFIED** (live, on the reference wireframe)

B-006 closed with a caveat: its 7-of-7 reading score used crops of the **annotations**,
not of what `detect_regions` actually returns, so "the wired version will score
differently". This is the wired version. It does score differently, and the difference is
worth more than the headline.

```
LLM_BASE_URL=…/openai/v1  VLM_MODEL=qwen.qwen3-vl-235b-a22b
perception/.venv/Scripts/python -m perception.stages… (stage 2 → 3a → 3b, gpu-test/wireframe.png)
```

### First attempt: every detected region, read

`detect_regions` returns **35 regions** for a wireframe with seven real elements — B-003
already reports that ratio and calls it out. Reading all 35:

| | |
|---|---|
| model calls | 35, all successful |
| wall clock | **65.0 s** |
| regions with text | 27 |

All five handwritten strings came back correct **and on exactly the right boxes**:

```
(427, 561, 233, 45)  'HEADLINE'
(246, 622, 551, 66)  'SUB HEADLINE'
(745, 292, 161, 28)  'LABEL'
(796, 521, 162, 45)  'SUBMIT'
(143, 399, 294, 57)  'Image'
```

That is the result. Here is the rest of it:

```
(34, 166, 971, 627)  'Image\nLABEL\nHEADLINE\nSUB HEADLINE\nSUBMIT'   the page container
(912, 538, 31, 18)   'MIT'        a piece of SUBMIT
(427, 573, 26, 34)   'H'          a piece of HEADLINE
(531, 637, 84, 30)   'LINE'       a piece of SUB HEADLINE
(62, 166, 930, 58)   'conelise ad to prinsem adt generic'   hallucinated
(896, 146, 36, 15)   '特约'        hallucinated
```

**The container is the dangerous one.** Every word merged into a single region matches
every keyword slot in `fuse.py` at once, which is worse downstream than no text at all.

### The filter, and why it is geometric

Both failure classes are geometric — a wrapper, and a sliver — so both are filtered
geometrically. Filtering by inspecting the model's *answers* would be guessing at which
words are real, which is the model's job and not ours.

- **A container is skipped**: a region wholly containing another *readable* region is a
  wrapper, and its text is its children's merged.
- **A fragment is skipped**: below 3,000 px² nothing legible fits.

The floor was set from the measured areas, which separate cleanly:

```
49,590  HEADLINE box        real
36,366  SUB HEADLINE box    real
16,758  Image box           real
 7,290  SUBMIT box          real
 4,508  LABEL mark          real
------------------------------------  3,000
 2,520  'LINE'              a piece of SUB HEADLINE
   884  'H'                 a piece of HEADLINE
   558  'MIT'               a piece of SUBMIT
```

**The floor does double duty, and the first version got that wrong.** It is also the size
at which a region counts as a *child* for the container rule. At 1,200 the 2,520-area
`LINE` fragment counted as a child, so the real SUB HEADLINE box looked like a wrapper and
was dropped **in favour of a fragment of itself**. The filter kept `'LINE'` and threw away
`'SUB HEADLINE'`. Caught by measuring which boxes survived, not by reasoning about the
rule.

### Second attempt: filtered

| | all regions | filtered |
|---|---|---|
| model calls | 35 | **11** |
| wall clock | 65.0 s | **21.9 s** |
| regions with text | 27 | 9 |
| reference words found | 5 of 5 | **5 of 5** |
| noise entries | ~22 | 4 |

Against what stage 3b does today on the same image:

| | PaddleOCR | VLM reader, filtered |
|---|---|---|
| `headlineMain` | `HEADLINE` | `HEADLINE` |
| `headlineSub` | `SUB HEADLINE evoleldno` | `SUB HEADLINE` |
| other lines | `eeneb`, `bceanse.ad.ioipqincsm` | — |
| cost | ~2 s, local | 21.9 s, 11 network calls |

### What this does and does not license

It is **not** the default and cannot become one. AGENTS.md rule 5: with `LLM_API_KEY`
unset there is no reader, `extract_text` takes the PaddleOCR path unchanged, and 190 of
190 perception tests pass in exactly that state. The 21.9 s is also a real cost — ten times
PaddleOCR — and it buys copy accuracy, not geometry.

Four noise entries remain (`'ago'`, `'TV'`, `'√'`, and one hallucinated line). They sit on
regions the detector found and no human would call elements. Reducing them further is a
stage-3a question, not a reader question, and it is not attempted here.

---

## B-008 · Can the VLM give a ROLE per crop, not just text? — measured, and the answer is no

**Date:** 2026-08-22 · **Status:** DEFINITIVE — a negative result, recorded so nobody spends the afternoon twice · **VERIFIED** (two runs)

B-007 wired the VLM as stage 3b's reader and it reads well. The obvious next step is to
ask it for a **role** as well — `fuse.py` currently resolves slots from keywords, so a
role would help precisely where keywords cannot: the regions carrying no text at all.

This was measured before it was built. It should not be built.

```
role per crop, same prompt shape as the reader, ROLES = headline|subheadline|body|
button|input|label|image|card|nav|none
```

### Where it works, it adds nothing

The five regions that carry handwriting were classified correctly on both runs:

| region | role, run 1 | role, run 2 |
|---|---|---|
| `HEADLINE` | headline | headline |
| `SUB HEADLINE` | subheadline | subheadline |
| `SUBMIT` | button | button |
| `LABEL` | label | label |
| `Image` | image | image |

**5 of 5, perfectly stable — and `SLOT_KEYWORDS` already resolves all five.** The role
duplicates a deterministic, free, already-measured answer (B-004).

### Where it would add something, it is wrong

The textless regions are the only place a role could contribute, and they are where it
falls apart:

| region | what it is | run 1 | run 2 |
|---|---|---|---|
| four ruled lines | `input` | **input** | **body** |
| three small squares | `card` | none | none |
| the hero panel | `image` | card | card |
| four detector-noise boxes | nothing | input ×4 | input ×4 |

**One correct answer, and it is the unstable one.** Six wrong. `input` is the model's
default guess for "a box with nothing in it", so wiring this would flood `description`
with detector noise — a slot that is currently empty and honest would fill with confident
nonsense.

### Why, and it follows directly from B-006

B-006 established that this model has no spatial grounding, which is why the reader gives
it no coordinates and crops instead. **That same crop is what breaks the role.** Removing
context is what makes transcription work — the model needs nothing but the ink in front of
it — and role is inherently contextual. A 79 × 54 empty rectangle, shown alone, is
genuinely ambiguous: a person cannot say whether it is an input, a card or a spacer
either. The information is not in the crop.

So the two questions want opposite framings, and one reader cannot serve both:

| question | needs | crop |
|---|---|---|
| what does this say | the ink, nothing else | helps |
| what is this | position, size relative to siblings, what is next to it | destroys it |

### What was NOT changed

`fuse.py` keeps resolving slots from keywords, and `_group_assignments` keeps inferring
the textless ones from the axis of their members. That heuristic is deterministic, costs
nothing, needs no key, and is scored at B-004 — and nothing measured here beats it.

If role classification is worth revisiting, the signal to try is **geometric context** —
size relative to siblings, position within the parent, member count and axis — which is
information the pipeline already has and currently uses only in `_group_assignments`. That
is a stage-4 question and it needs no model at all.

---

## B-009 · Raising confidence: what moved it, and what turned out to be a correct measurement — T-133

**Date:** 2026-08-23 · **Status:** in progress — change 1 measured · **VERIFIED**

Overall confidence is the **mean of the seven element confidences**. It sat at 0.8497 on
the PaddleOCR path and 0.8295 on the VLM one, both just under §10's own accept band
(`VERIFY_BELOW = 0.85`). Three elements carried it:

```
heroImage    0.683    edge support: top 0.68  bottom 0.79  right 0.79  LEFT 0.5486
description  0.689    a group of four ruled lines, weakestMember 0.7993
headlineSub  0.716    top 0.88  bottom 0.76  left 0.59  right 0.67
```

Every change below is measured **separately**, against the same harness, so it is knowable
which one moved what.

### First, the two that turned out not to be fixable by tuning

Before changing anything, the two low numbers were inspected rather than tuned.

**`heroImage`'s left edge is not faint. A third of it is not drawn.** Reading down the best
column of the left band:

```
344 of 627 px inked (55%)  in 2 segments  with a single 228 px gap
```

0.5486 is a **correct measurement of a genuinely incomplete edge**. No threshold, kernel or
tolerance can honestly raise it, because the ink is not there. Notably the box is still
*located* correctly — B-003 puts it at IoU 0.88 — so the geometry is right and the
confidence is right, and they are saying different things about the same region, which is
what having both is for.

**`headlineSub` is the same story**, left 0.59 and right 0.67 on a hand-drawn box that
wobbles.

### Change 1: a stroke is scored on the sides it has

The four ruled lines behind `description` showed this:

```
(746, 368, 159, 7)   top 1.0  bottom 1.0  left 0.7143  right 0.7143   ->  0.845
(733, 390, 129, 7)   top 1.0  bottom 1.0  left 0.7143  right 0.5714   ->  0.799
(745, 448, 116, 7)   top 1.0  bottom 1.0  left 0.5714  right 0.7143   ->  0.799
```

A line 7 px tall and 145 px wide has a top and a bottom. What it has at its left and right
are **ends, not borders**. `_edge_support` was applying a rectangle's model to a stroke,
scoring it on two sides that were never going to exist, and the geometric mean — which is
deliberately dragged by the weakest component — then dragged the region down for the
artefact. The two 1.0s were the real answer all along.

**This is a correctness fix, not a leniency**, and it leaves the three-sided bracket
argument that chose the geometric mean exactly where it was: a bracket is a rectangle
*candidate* missing a side and still scores as one. A stroke is not a rectangle at all.

`STROKE_RATIO` was measured rather than chosen. The two populations separate:

```
0.044  0.054  0.060  0.062     the four ruled lines
--------------------------------------------------  0.10
0.120  SUB HEADLINE box        0.182  HEADLINE box
0.235  LABEL box               0.278  SUBMIT box
```

The nearest neighbours are named in the constant's comment because they are close, and a
test pins that the threshold falls between them so a later nudge fails loudly.

### Measured

| | baseline | after change 1 |
|---|---|---|
| regions detected | 35 | 35 |
| **B-003 located, IoU ≥ 0.5** | **7 of 7** | **7 of 7** |
| `description` | 0.6889 | **0.8619** |
| every other element | — | unchanged |
| **overall confidence** | 0.8497 | **0.8744** |

Above §10's accept band, and **no localisation was traded for it** — the number that would
have made this a bad deal.

### Change 2: the word claims the slot, the box drawn around it supplies the geometry

A separate measurement — B-004's slot score, not confidence — was stuck at **6 of 7**, and
the failure was `headlineMain` at IoU **0.291** while B-003 had located that box at 0.727.
The text was right and the geometry was the size of the writing.

A keyword winner is chosen on confidence, and a tight handwriting cluster scores higher
than the wobbly rectangle drawn around it: the `HEADLINE` mark is 0.9908, its box 0.7588.
So the word won, and the slot took the word's bbox.

**This is the same problem `_pick_media` already solves one slot over** for the hero
panel's `Image` label, and it is solved the same way — smallest containing box, for
exactly the reason that function gives: the page frame contains the word too, and it
contains everything else as well. Bounded at 8× the word's area, measured from the
reference wireframe where the real box is 4.7× and the next container up is the frame at
more than 50×.

The winner's **text and confidence are kept**. Only the region moves, so a promotion
cannot alter which slot was claimed or how sure we were — only where the element is.

| slot | before | after |
|---|---|---|
| `headlineMain` | 0.291 | **0.727** |
| `brandBadge` | 0.548 | **0.687** |
| every other slot | — | unchanged |
| **B-004 geometry** | **6 of 7** | **7 of 7** |
| **B-004 text** | 4 of 4 | 4 of 4 |
| overall confidence | 0.8744 | 0.8744 |

Full marks on the slot benchmark for the first time, and confidence deliberately did not
move, because nothing about how sure we are changed.

### Change 3, attempted: a cleaner drawing. It disproved the premise instead.

`heroImage` at 0.683 and `headlineSub` at 0.716 are correct measurements of a genuinely
incomplete drawing, so the remaining lever looked like a cleaner input — raising them
without touching a line of code. To find out whether a clean drawing clears 0.90 at all, a
**synthetic** wireframe was generated with the same layout, complete strokes, and a small
deliberate hand wobble. It flatters the pipeline badly — no paper, no camera, no lighting
gradient, no bleed-through — so it can only ever be a **ceiling**, not a prediction.

It answered a different question than the one asked.

| | real photograph | synthetic clean |
|---|---|---|
| regions detected | 35 | 15 |
| regions with text | 7 | 5 |
| **overall confidence** | 0.8744 | **0.9634** |
| **B-004 geometry** | **7 of 7** | **4 of 7** |
| **B-004 text** | **4 of 4** | 3 of 4 |
| `headlineSub` slot IoU | 0.862 | **0.0** |
| `description` slot IoU | 0.743 | **0.0** |

**Confidence rose by 0.09 while accuracy fell by three slots.** Two elements were not
located at all, and the pipeline was *more* sure of itself for it.

The mechanism is not subtle once seen: overall confidence is the **mean of what was
found**. Find fewer things, each of them cleaner, and the mean rises while coverage
collapses. Nothing in the number reports the collapse — a slot that was never located
contributes the reference template's confidence, not a zero.

**So ">0.90 confidence" is not a safe target to optimise.** Pursued on its own it selects
for a detector that finds less and is surer about it. The pair to watch is confidence
*beside* B-004's geometry and text scores, which is why this table reports all three and
why the two changes above were each measured against localisation before being kept.

This does not say a real pen-and-paper redraw would score badly — the synthetic image is
not evidence about that either way, because it changed the detection characteristics and
not merely the cleanliness. It says the experiment could not answer the question, and that
the number the question was about turns out not to mean what it was being asked to mean.

The aggregation change — reversing the documented geometric-mean decision — was not made.
After the above, the case for it is weaker than when it was proposed: `heroImage`'s 0.683
is a correct reading of an edge that is a third undrawn, and raising it would be
suppressing a true measurement to move a number that has just been shown not to track
accuracy.

### Where this leaves the numbers

| | before T-133 | after |
|---|---|---|
| overall confidence | 0.8497 | **0.8744** — above §10's accept band |
| B-004 geometry | 6 of 7 | **7 of 7** |
| B-004 text | 4 of 4 | **4 of 4** |
| B-003 localisation | 7 of 7 | **7 of 7** |

### Change 4: the aggregation, softened after all — T-134

Requested after the evidence above was presented. Reversing the geometric-mean decision is
logged in `docs/corrections/REGISTER.md` with the objection kept, because a reversal with
the argument deleted is worse than no record.

When every side of a box is **present**, the weakest is dropped and the rest combined; when
any side is **absent**, nothing is dropped and the conjunction bites as before, so a
three-sided bracket still escalates. The result is still a geometric mean of real
measurements — three instead of four — and the distinction between *absent* and
*incomplete* is one the old measure could not express at all.

| | before | after |
|---|---|---|
| `heroImage` | 0.6831 | **0.7840** |
| `statBadges` | 0.9014 | **0.9148** |
| **overall confidence** | 0.8744 | **0.8907** |
| B-003 localisation | 7 of 7 | 7 of 7 |
| B-004 geometry / text | 7 of 7 / 4 of 4 | 7 of 7 / 4 of 4 |

**It did not reach 0.90.** 0.8907, and the remaining gap is `headlineSub` at 0.8003 — an
OCR score on `SUB HEADLINE evoleldno`, text the hosted reader returns clean — and
`heroImage` at 0.784, whose edge is still a third undrawn.

---

---

## B-010 · Accessibility QA — §18 quality metric (T-115)

**Date:** 2026-08-23 · **Status:** DEFINITIVE · **VERIFIED** (measured locally)

This measures the `axeSeriousViolations` score in the validation-qa stage (stage 6). Prior to this, the metric was left in `notMeasured` because it required a browser environment to render the React tree and run axe-core. However, the score silently defaulted to 0 violations, thereby incorrectly inflating the Quality Score by 15 points for unmeasured generations.

### What changed
We use `esbuild` to compile the generated component in an isolated environment (replacing `react-redux` with a dummy module that surfaces `DEFAULTS`), mount it to an HTML string using `renderToString`, and run `axe-core` on it via `jsdom`. No network or browser binary is required.

### The score before and after

| Scenario | Score Before | Score After |
|---|---|---|
| Perfect component (0 violations) | 100 | **100** |
| Poor component (5+ serious violations) | 100 (Unmeasured) | **85** |
| Invalid component (cannot render) | 100 (Unmeasured) | **85** (Null = 0 points) |

### The finding
1. **The metric is now honest.** If we detect 5 serious violations, the score drops by 15 points. If it fails to render entirely, it is reported as `null` ("not measured") and the penalty defaults to 1.0, losing 15 points. 
2. **Zero violations and never-checked no longer produce the same score.** An unmeasured metric correctly penalises the job rather than flattering it.

Note: Unmeasured `visualSimilarity` scores a full 15 points because a prompt mode generation genuinely lacks a wireframe. Unmeasured `axeSeriousViolations`, however, scores 0 points (maximum penalty). This asymmetry is intentional: if axe fails to run on an emitted component, it is an environment or structural failure, which must not flatter the score.

---

## B-011 · What the pipeline does with an input it was never designed for — T-147

**Date:** 2026-08-23 · **Status:** DEFINITIVE — a robustness result, not an accuracy one · **VERIFIED** (live, through the HTTP API)

A second image was supplied so that B-003 and B-004 could be re-measured on something
other than the one photograph every number in this document comes from. **It is not a
hand-drawn wireframe.** It is a stock vector illustration of six browser mockups — flat
grey rectangles on a blue field, 700 × 406, no handwriting and no text anywhere.

**So it was not scored against those benchmarks, and the reason matters.** Their seven
targets are annotated boxes named `HEADLINE`, `SUB HEADLINE`, `LABEL`, `SUBMIT` and so on,
on one specific page. None of them exists in this image. A score against those annotations
would measure the annotations, not the pipeline, and would be a number with nothing behind
it.

**The limitation therefore stands: every accuracy figure in this document comes from a
single image.** Whether 7 of 7 is the pipeline or the picture is still unmeasured, and a
second genuine hand-drawn wireframe is the only thing that settles it.

### What it was used for instead

A question this image can answer, and one a judge may ask by accident: **what happens when
somebody uploads something unexpected?**

```
POST /api/generate  mode=wireframe  wireframe=@wf2.webp
```

| | |
|---|---|
| HTTP | **200** in 6.0 s |
| stages | **all seven `ok`**, not degraded |
| quality score | **95** |
| job status | `succeeded` |

### What it got right

**It did not hallucinate text.** The warning is exact:

> `OCR ran but found no text in the image.`

Not "OCR did not read this page" — the other sentence, the one for a worker that died. The
image genuinely contains no text and the pipeline said so in the correct words. That
distinction is EC-015's whole subject and this is it working on an input nobody anticipated.

**It refused to invent a hero.**

> `No region was large enough to be the hero image; heroImage kept its default and every
> region was treated as content.`

**It lowered its confidence honestly.** `brandBadge` 0.75 and `headlineMain` 0.63, against
0.97 and 0.99 on the real wireframe, and the score fell from 100 to 95 with it. Nothing was
claimed that was not measured.

### What a demo operator needs to know

**The output is the reference template** — `PULSE FIT`, `CHALLENGE YOUR LIMITS`,
`FIND A WORKOUT` — because there was no copy to extract.

That is correct behaviour and it is **indistinguishable on screen from the pipeline having
ignored the upload**. The only thing separating them is four warnings that nobody reads
during a demo.

So: an image with no handwriting is not a useful thing to upload in front of an audience.
The tell documented in `DEMO-RUN-SHEET.md` — if the copy says `PULSE FIT`, the drawing did
not reach the IR — holds here too, and here it is the honest answer rather than a fault.
