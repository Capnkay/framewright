# Benchmark Results

Measured, not assumed. Every number here came off a real machine.

---

## B-001 · Florence-2 on a low-fidelity wireframe

**Date:** 2026-08-20 · **Status:** measured, retest pending · **VERIFIED** (run on our hardware)

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

### What this does and does not establish

**Established:**
- VRAM is a non-issue. Peak 0.60 GB on a 6 GB card, 1.76 GB for the large model. The
  hardware was never the constraint — we assumed it might be, and we were wrong.
- Inference is fast. ~0.3 s per query.
- Florence-2, as we invoked it, does not locate elements in a low-fidelity wireframe.

**Not established — and this is our own error:**
The test used Florence-2's `<CAPTION_TO_PHRASE_GROUNDING>` task with long descriptive
sentences ("the small label or badge above the headline"). That task grounds **short noun
phrases from a caption**, and whole-image boxes are its documented degenerate output on a
mismatched phrase. The correct task for this job is `<OPEN_VOCABULARY_DETECTION>` with
short category names.

So two hypotheses remain open and look identical from outside: **the method was wrong**,
or **the model cannot read line drawings**. A retest with the correct task token separates
them — see `docs/GPU-RETEST.md`.

### What we did with it

Perception moves to **classical computer vision first**, with a synthetic-data-trained
detector as the upgrade. Rationale in `docs/ROADMAP.md`; the short version is that a
wireframe is rectangles and text — the worst case for a detector trained on photographs
and close to the best case for contour detection.

### Why this result is worth having

It is the benchmark the original architecture asked for, in a form we can defend:
*generic vision models do not read wireframes — here is the measurement — so we built
something that does.* A judge weighs a measurement more heavily than a claim, and almost
no team arrives with one.

**Credit where due:** the teammate who ran it reported the whole-image boxes plainly
rather than counting them as hits. That honesty is the only reason the method error was
findable at all.
