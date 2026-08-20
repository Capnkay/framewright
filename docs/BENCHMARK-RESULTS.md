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
