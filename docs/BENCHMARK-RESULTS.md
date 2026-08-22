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

**The geometry is NOT yet usable and this is the open question.** The model reported
`width: 1000, height: 800` for an image that is 1600 × 1168, and the boxes read as
corners rather than `[x, y, w, h]`. So the coordinates are in an invented space. A second
probe pinning the true dimensions in the prompt was not completed. **Nothing should be
built on these boxes until that is measured against the B-003 annotations at IoU ≥ 0.5,
the same bar the existing detector was held to.**

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

Nothing yet, by design. The measured position is:

1. The transport works and needs no code.
2. The vision model is a large quality win on text and roles, blocked on coordinates.
3. The text model needs prompt work before it beats the deterministic path, which today
   produces valid IR in about a millisecond.
4. Every one of these is an enhancement above a path that must keep working without them.
