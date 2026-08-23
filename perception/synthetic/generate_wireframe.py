"""Synthetic wireframe generator, and its exact ground truth -- T-150.

WHY THIS EXISTS. B-001 and B-002 measured that Florence-2 and DETR each see one
object where a wireframe has seven -- a training-distribution gap, not a
prompting problem (docs/BENCHMARK-RESULTS.md). The only fix for a training-
distribution gap is training data from the right distribution, and none exists
anywhere without licence risk: nobody has published a labelled corpus of
hand-drawn UI wireframes with per-region boxes, because nobody outside this
project needs one. So it is rendered here, from this project's own element
vocabulary, with the ground truth produced as a side effect of drawing rather
than annotated afterward -- which is the one thing a real photograph can never
give a labeller for free.

THE THING B-009 ALREADY PROVED ABOUT DOING THIS BADLY. B-009's "Change 3"
generated one synthetic wireframe to test a confidence hypothesis and it
"flatters the pipeline badly -- no paper, no camera, no lighting gradient, no
bleed-through". Overall confidence rose 0.09 while two of seven targets
stopped being located at all, and the write-up's conclusion is the design
constraint this module exists to satisfy: a synthetic image that is CLEANER
than reality is not a harder training set, it is a different one, and a
detector trained only on it would learn to expect ink that a real page never
gives it. So noise is not polish here -- gap_probability, gradient_strength,
paper_noise_sigma and bleed_through_probability below are sampled per image
specifically so a training run sees incomplete edges (T-133/T-134's own
finding: a real drawn box is often missing part of a side) and never sees the
same clean geometry twice.

WHAT "GROUND TRUTH" MEANS HERE, precisely, because section 10 is exact about
what a fabricated number is. `detect_regions.py` measures confidence off ink
that already exists and cannot know it perfectly; this module places the ink
and therefore knows the box exactly, which is a different kind of number, not
a smuggled-in guess. Ground truth confidence is always 1.0 and is documented
as such in `evidence` rather than participating in section 10's bands, which
describe a MEASURED number's uncertainty, not a coordinate this file chose.

SHAPE COMPATIBILITY WITH `detect_regions.Region`, ON PURPOSE. Every ground
truth record below carries exactly `Region.to_dict()`'s keys --
`bbox`/`kind`/`confidence`/`evidence`/`depth`/`members` -- plus one addition,
`elementName`, because unlike a detector's raw output this file knows which
of the seven reference slots each box IS. That is what lets
`perception/benchmarks/contours_wireframe.py`'s scoring shape (`{elementName:
bbox}` targets, IoU >= 0.5) run against a generated image with no change to
that file: this dataset's per-image JSON already looks like an expanded
`TARGETS` dict.

THIS FILE NEVER IMPORTS THE OTHER DIRECTION. It reads two constants from
`perception.stages.detect_regions` (`STRUCTURE_RUN`, used to keep a scribbled
word's individual strokes shorter than the length that module treats as
structure rather than handwriting) and writes nothing back. AGENTS.md: this
task is additive-only and `detect_regions.py` is not this task's file to
touch.

PURITY. `generate(seed)` takes one `np.random.RandomState(seed)`, threads it
through every drawing decision in a fixed call order, and reads no clock, no
filesystem and no global random state. Same seed, same image, same ground
truth, forever -- verified in perception/tests/test_generate_wireframe.py.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from perception.stages.detect_regions import STRUCTURE_RUN

# The normalised canvas stage 2 produces (perception/stages/normalise.py's
# DEFAULT_TARGET). Rendering directly at this resolution means detect_regions
# can run on a generated image with no normalisation step in between, exactly
# as it runs on stage 2's real output.
CANVAS_SIZE = 1024

# A scribbled word's individual stroke must stay short enough that
# _structure_layer (detect_regions.py) does not fold it into "structure" and
# discard it from the handwriting cluster -- the same boundary T-098 draws
# between a glyph and a ruled line, at the same numeric value.
_MAX_STROKE_LEN = STRUCTURE_RUN - 8

Bbox = tuple[int, int, int, int]


# --- parameters, sampled once per image, from one seeded RNG ---------------


@dataclass(frozen=True)
class NoiseParams:
    """How dirty this particular drawing is. Sampled per seed so a training
    set spans a range rather than repeating one noise profile."""

    wobble_px: float
    gap_probability: float
    gap_fraction_range: tuple[float, float]
    gradient_strength: float
    paper_noise_sigma: float
    bleed_through_probability: float


@dataclass(frozen=True)
class LayoutParams:
    """One randomised split-hero composition, in the vocabulary
    fuse.py's SLOT_KEYWORDS already names: heroImage, brandBadge,
    headlineMain, headlineSub, description (N ruled lines), statBadges
    (M small boxes), ctaButton."""

    hero_side: str  # "left" | "right"
    hero_bbox: Bbox
    badge_bbox: Bbox
    headline_bbox: Bbox
    subheadline_bbox: Bbox
    body_line_bboxes: tuple[Bbox, ...]
    stat_bboxes: tuple[Bbox, ...]
    cta_bbox: Bbox


@dataclass(frozen=True)
class GeneratedWireframe:
    """One synthetic sample: the rendered canvas and its exact regions, in
    `Region.to_dict()`'s shape."""

    seed: int
    image: np.ndarray
    regions: list[dict[str, Any]]

    def to_artifact(self) -> dict[str, Any]:
        """Same shape as detect_regions.to_artifact -- {count, regions}."""
        return {"count": len(self.regions), "regions": self.regions}


def _clip_bbox(bbox: Bbox, canvas_size: int) -> Bbox:
    """Every bbox this module hands out must satisfy the well-formedness a
    consumer will check: positive width and height, fully inside the canvas.
    Sampling ranges are chosen to make this a no-op in the common case; this
    is the guarantee for the tail the ranges don't cover."""
    x, y, w, h = bbox
    x = max(0, min(int(round(x)), canvas_size - 1))
    y = max(0, min(int(round(y)), canvas_size - 1))
    w = max(1, min(int(round(w)), canvas_size - x))
    h = max(1, min(int(round(h)), canvas_size - y))
    return (x, y, w, h)


def sample_noise(rng: np.random.RandomState) -> NoiseParams:
    return NoiseParams(
        wobble_px=float(rng.uniform(1.0, 2.6)),
        gap_probability=float(rng.uniform(0.10, 0.32)),
        gap_fraction_range=(0.15, 0.40),
        gradient_strength=float(rng.uniform(0.05, 0.28)),
        paper_noise_sigma=float(rng.uniform(2.0, 8.0)),
        bleed_through_probability=float(rng.uniform(0.2, 0.55)),
    )


def sample_layout(rng: np.random.RandomState, canvas_size: int = CANVAS_SIZE) -> LayoutParams:
    """Vary composition -- side, counts, sizes, positions -- so a training set
    is not 1000 copies of one layout. Ranges are sized so the vertical stack
    fits the canvas for every count this function can draw (checked in
    test_generate_wireframe.py); _clip_bbox is the safety net underneath that.
    """
    hero_side = "left" if rng.uniform() < 0.5 else "right"
    hero_w = int(canvas_size * rng.uniform(0.38, 0.55))
    hero_h = int(canvas_size * rng.uniform(0.45, 0.72))
    hero_x = 0 if hero_side == "left" else canvas_size - hero_w
    hero_y = int(canvas_size * rng.uniform(0.06, 0.16))
    hero_bbox = _clip_bbox((hero_x, hero_y, hero_w, hero_h), canvas_size)

    content_margin = int(canvas_size * 0.06)
    content_x = hero_w + content_margin if hero_side == "left" else content_margin
    content_w = canvas_size - hero_w - 2 * content_margin

    y = int(canvas_size * rng.uniform(0.08, 0.14))

    badge_h = int(canvas_size * rng.uniform(0.025, 0.04))
    badge_w = int(content_w * rng.uniform(0.25, 0.45))
    badge_bbox = _clip_bbox((content_x, y, badge_w, badge_h), canvas_size)
    y += badge_h + int(canvas_size * rng.uniform(0.02, 0.035))

    headline_h = int(canvas_size * rng.uniform(0.06, 0.09))
    headline_w = int(content_w * rng.uniform(0.75, 1.0))
    headline_bbox = _clip_bbox((content_x, y, headline_w, headline_h), canvas_size)
    y += headline_h + int(canvas_size * rng.uniform(0.015, 0.03))

    subheadline_h = int(canvas_size * rng.uniform(0.045, 0.07))
    subheadline_w = int(content_w * rng.uniform(0.70, 1.0))
    subheadline_bbox = _clip_bbox((content_x, y, subheadline_w, subheadline_h), canvas_size)
    y += subheadline_h + int(canvas_size * rng.uniform(0.025, 0.045))

    n_lines = int(rng.randint(3, 6))  # 3, 4 or 5 -- a paragraph, not fixed at 4
    line_h = int(canvas_size * rng.uniform(0.008, 0.014))
    line_gap = int(canvas_size * rng.uniform(0.012, 0.02))
    body_line_bboxes = []
    for i in range(n_lines):
        # The last line of a paragraph runs short -- real handwritten body
        # copy does this, and description's group detector (T-056) tolerates
        # the size variance within SIBLING_SIZE_RATIO.
        w_frac = rng.uniform(0.55, 0.95) if i < n_lines - 1 else rng.uniform(0.35, 0.6)
        line_w = int(content_w * w_frac)
        body_line_bboxes.append(_clip_bbox((content_x, y, line_w, line_h), canvas_size))
        y += line_h + line_gap
    y += int(canvas_size * rng.uniform(0.02, 0.04))

    n_stats = int(rng.randint(2, 5))  # 2, 3 or 4 -- card count is not fixed at 3 (§4 rule 4)
    stat_gap = int(content_w * rng.uniform(0.03, 0.06))
    stat_w = max(1, int((content_w - stat_gap * (n_stats - 1)) / n_stats))
    stat_h = int(canvas_size * rng.uniform(0.06, 0.09))
    stat_bboxes = []
    sx = content_x
    for _ in range(n_stats):
        stat_bboxes.append(_clip_bbox((sx, y, stat_w, stat_h), canvas_size))
        sx += stat_w + stat_gap
    y += stat_h + int(canvas_size * rng.uniform(0.03, 0.05))

    cta_w = int(content_w * rng.uniform(0.30, 0.50))
    cta_h = int(canvas_size * rng.uniform(0.045, 0.065))
    cta_bbox = _clip_bbox((content_x, y, cta_w, cta_h), canvas_size)

    return LayoutParams(
        hero_side=hero_side,
        hero_bbox=hero_bbox,
        badge_bbox=badge_bbox,
        headline_bbox=headline_bbox,
        subheadline_bbox=subheadline_bbox,
        body_line_bboxes=tuple(body_line_bboxes),
        stat_bboxes=tuple(stat_bboxes),
        cta_bbox=cta_bbox,
    )


# --- drawing primitives, all hand-wobbled ------------------------------------


def _wobbly_segment(
    img: np.ndarray,
    p0: tuple[float, float],
    p1: tuple[float, float],
    rng: np.random.RandomState,
    thickness: int,
    color: tuple[int, int, int],
    wobble_px: float,
    t_range: tuple[float, float] = (0.0, 1.0),
    n_points: int = 8,
) -> None:
    """A straight line, hand-drawn: `n_points` control points along it, each
    perturbed independently, so the stroke wanders the way a real pen does
    rather than sitting on a mathematically straight path. `t_range` draws
    only part of the segment -- how an incomplete edge (T-134) is rendered."""
    t0, t1 = t_range
    if t1 <= t0 or thickness < 1:
        return
    ts = np.linspace(t0, t1, max(2, n_points))
    pts = []
    for t in ts:
        bx = p0[0] + t * (p1[0] - p0[0])
        by = p0[1] + t * (p1[1] - p0[1])
        jitter = rng.uniform(-wobble_px, wobble_px, size=2)
        pts.append((int(round(bx + jitter[0])), int(round(by + jitter[1]))))
    pts_arr = np.array(pts, dtype=np.int32).reshape(-1, 1, 2)
    cv2.polylines(img, [pts_arr], isClosed=False, color=color, thickness=thickness, lineType=cv2.LINE_AA)


def _wobbly_rect(
    img: np.ndarray,
    bbox: Bbox,
    rng: np.random.RandomState,
    noise: NoiseParams,
    color: tuple[int, int, int] = (25, 25, 25),
    thickness: int = 3,
) -> None:
    """A drawn rectangle, hand-wobbled, with AT MOST ONE side at risk of an
    incomplete edge -- T-133/T-134 measured this as real and common on the
    reference wireframe's hero panel, not an artefact to avoid.

    AT MOST ONE, NOT EACH SIDE INDEPENDENTLY, AND THAT WAS MEASURED. B-009's
    own hero-panel finding is that ONE side (the left one) was incomplete,
    the other three fine -- not that a drawn box typically has several weak
    sides at once. Evaluating gap_probability independently per side gave a
    small box (~125x90, a stat badge) roughly a 1-in-5 chance of two sides
    gapping at once; when that happened, OpenCV's contour split into two
    disconnected pieces of very different size, `_is_sibling`'s
    SIBLING_SIZE_RATIO rejected them as siblings, and the group of three
    badges never formed at all -- measured on seed 0, where `statBadges`'
    IoU came out at 0.313 with no `group` region returned. Spending the
    noise budget on at most one side keeps every box a single connected
    contour while still drawing the incomplete-edge case the task calls for."""
    x, y, w, h = bbox
    sides = (
        ((x, y), (x + w, y)),
        ((x, y + h), (x + w, y + h)),
        ((x, y), (x, y + h)),
        ((x + w, y), (x + w, y + h)),
    )
    gapped_side = int(rng.randint(0, len(sides))) if rng.uniform() < noise.gap_probability else -1

    for index, (p0, p1) in enumerate(sides):
        if index == gapped_side:
            frac = rng.uniform(*noise.gap_fraction_range)
            gap_start = rng.uniform(0.15, 1.0 - frac - 0.15)
            gap_end = gap_start + frac
            _wobbly_segment(img, p0, p1, rng, thickness, color, noise.wobble_px, t_range=(0.0, gap_start))
            _wobbly_segment(img, p0, p1, rng, thickness, color, noise.wobble_px, t_range=(gap_end, 1.0))
        else:
            _wobbly_segment(img, p0, p1, rng, thickness, color, noise.wobble_px)


def _wobbly_ruled_line(img: np.ndarray, bbox: Bbox, rng: np.random.RandomState, noise: NoiseParams) -> None:
    """One line of `description`'s paragraph: a single thick wobbled stroke,
    not four sides -- this is what the reference wireframe's ruled lines
    actually are, and what STROKE_RATIO's two-sides-only scoring expects."""
    x, y, w, h = bbox
    thickness = max(4, h)
    cy = y + h / 2
    if rng.uniform() < noise.gap_probability * 0.5:  # lines gap less often than boxes
        frac = rng.uniform(0.10, 0.25)
        gap_start = rng.uniform(0.2, 0.6)
        _wobbly_segment(img, (x, cy), (x + w, cy), rng, thickness, (25, 25, 25), noise.wobble_px, t_range=(0.0, gap_start))
        _wobbly_segment(img, (x, cy), (x + w, cy), rng, thickness, (25, 25, 25), noise.wobble_px, t_range=(gap_start + frac, 1.0))
    else:
        _wobbly_segment(img, (x, cy), (x + w, cy), rng, thickness, (25, 25, 25), noise.wobble_px)


def _scribble_text(
    img: np.ndarray, bbox: Bbox, rng: np.random.RandomState, color: tuple[int, int, int] = (20, 20, 20)
) -> None:
    """Handwriting-shaped ink, not a rendered font -- a clean font would defeat
    the point (the task's own framing). Short jittered strokes across a
    SINGLE row, each below `_MAX_STROKE_LEN` so the cluster reads as a word,
    never as a structural line.

    ALWAYS ONE ROW, AND THAT WAS MEASURED RATHER THAN ASSUMED. Every caller of
    this function draws a one-line element -- a badge, a headline, a
    subheadline, a button label. An earlier version sometimes drew two rows
    inside a tall box, and detect_regions's TEXT_CLUSTER_KERNEL (19x9) does
    not bridge a gap wider than 9px, so the two rows surfaced as two or three
    separate marks instead of one -- measured on seed 0, where headlineMain's
    single 329x91 ground-truth box fragmented into four detected marks and
    IoU against the best of them came out at 0.197. Single-row text collapses
    that back into one cluster the way one line of handwriting actually
    would.

    VERTICAL JITTER IS AN ABSOLUTE PIXEL BUDGET, NOT A FRACTION OF THE BOX.
    The layout box for a `headline` element is sized for a large font plus
    line-spacing -- 61-92px tall on this canvas -- but one line of hand
    lettering inside it is nowhere near that tall. Jittering by a FRACTION of
    that box height (the first version did, +/-30%) scatters strokes across
    up to 54px of vertical space, which is wider than TEXT_CLUSTER_KERNEL's
    ~8px vertical reach, and the cluster fragments into two or three unrelated
    marks again -- the same failure the row fix above was for, reintroduced
    through a different door. A small ABSOLUTE budget keeps every stroke of
    one handwritten line within reach of its neighbours regardless of how
    tall the nominal slot is, which also happens to match B-004's own
    measurement of the real reference wireframe: its `HEADLINE` mark is a
    single tight 233x45 cluster inside an annotated 800x110 row. A synthetic
    headline whose ink is tight inside a taller nominal box is not a defect
    to mask -- it is the same real pattern fuse.py's box-promotion step
    (T-153, B-009 change 2) already exists to correct, one stage later."""
    x, y, w, h = bbox
    if w <= 4 or h <= 4:
        return
    cursor = x + rng.uniform(0, max(1.0, w * 0.04))
    limit = x + w
    cy = y + h * 0.5
    jitter_budget = min(6.0, h * 0.15)
    while cursor < limit - 6:
        stroke_len = rng.uniform(6, max(8.0, min(_MAX_STROKE_LEN, w * 0.12)))
        jitter_y = rng.uniform(-jitter_budget, jitter_budget)
        thickness = int(rng.randint(2, 4))
        p0 = (cursor, cy + jitter_y)
        p1 = (min(limit, cursor + stroke_len), cy + jitter_y + rng.uniform(-2, 2))
        _wobbly_segment(img, p0, p1, rng, thickness, color, wobble_px=1.2, n_points=4)
        cursor += stroke_len + rng.uniform(3, 8)


def _inset(bbox: Bbox, frac: float) -> Bbox:
    x, y, w, h = bbox
    dx, dy = w * frac / 2, h * frac / 2
    return (int(x + dx), int(y + dy), max(1, int(w * (1 - frac))), max(1, int(h * (1 - frac))))


# --- realism: the noise B-009 found missing ---------------------------------


def _apply_illumination_gradient(img: np.ndarray, rng: np.random.RandomState, strength: float) -> np.ndarray:
    """A lighting gradient across the whole canvas, ink included -- what
    ink_mask's median-blur background subtraction (detect_regions.py) exists
    to remove. Rendering one is what makes that removal step meaningful
    rather than a no-op on a page that never needed it."""
    h, w = img.shape[:2]
    angle = rng.uniform(0, 2 * np.pi)
    xs, ys = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
    grad = xs * np.cos(angle) + ys * np.sin(angle)
    span = grad.max() - grad.min()
    grad = (grad - grad.min()) / span if span > 0 else np.zeros_like(grad)
    darkening = (1.0 - strength * grad)[..., None]
    out = img.astype(np.float32) * darkening
    return np.clip(out, 0, 255).astype(np.uint8)


def _apply_paper_noise(img: np.ndarray, rng: np.random.RandomState, sigma: float) -> np.ndarray:
    """Mild per-pixel texture, the grain a photographed or scanned sheet has
    and a rendered-in-code image otherwise never would."""
    noise = rng.normal(0, sigma, size=img.shape)
    out = img.astype(np.float32) + noise
    return np.clip(out, 0, 255).astype(np.uint8)


def _apply_bleed_through(img: np.ndarray, rng: np.random.RandomState) -> np.ndarray:
    """A faint, mirrored ghost of writing from the other side of the sheet --
    B-003's ink_mask docstring names this by name as part of the real input,
    and B-009's synthetic image was marked unrealistic for lacking it."""
    h, w = img.shape[:2]
    ghost_canvas = np.zeros((h, w, 3), dtype=np.uint8)
    gx = int(rng.uniform(0.1, 0.65) * w)
    gy = int(rng.uniform(0.1, 0.65) * h)
    gw = int(rng.uniform(0.15, 0.30) * w)
    gh = int(rng.uniform(0.05, 0.10) * h)
    _scribble_text(ghost_canvas, (gx, gy, gw, gh), rng, color=(255, 255, 255))
    ghost = cv2.flip(ghost_canvas, 1)  # mirrored, as if seen through the page
    intensity = rng.uniform(15, 35)
    out = img.astype(np.float32) - (ghost.astype(np.float32) / 255.0) * intensity
    return np.clip(out, 0, 255).astype(np.uint8)


# --- rendering and ground truth ----------------------------------------------


def render(layout: LayoutParams, noise: NoiseParams, rng: np.random.RandomState, canvas_size: int = CANVAS_SIZE) -> np.ndarray:
    canvas = np.full((canvas_size, canvas_size, 3), 255, dtype=np.uint8)

    _wobbly_rect(canvas, layout.hero_bbox, rng, noise, thickness=3)
    if rng.uniform() < 0.6:
        # Echoes the reference wireframe's own hero panel, which carries the
        # word "Image" written inside it rather than left blank.
        _scribble_text(canvas, _inset(layout.hero_bbox, 0.6), rng, color=(60, 60, 60))

    _scribble_text(canvas, layout.badge_bbox, rng)
    _scribble_text(canvas, layout.headline_bbox, rng)
    _scribble_text(canvas, layout.subheadline_bbox, rng)

    for line_bbox in layout.body_line_bboxes:
        _wobbly_ruled_line(canvas, line_bbox, rng, noise)

    for stat_bbox in layout.stat_bboxes:
        _wobbly_rect(canvas, stat_bbox, rng, noise, thickness=2)

    _wobbly_rect(canvas, layout.cta_bbox, rng, noise, thickness=3)
    _scribble_text(canvas, _inset(layout.cta_bbox, 0.3), rng, color=(30, 30, 30))

    canvas = _apply_illumination_gradient(canvas, rng, noise.gradient_strength)
    canvas = _apply_paper_noise(canvas, rng, noise.paper_noise_sigma)
    if rng.uniform() < noise.bleed_through_probability:
        canvas = _apply_bleed_through(canvas, rng)

    return canvas


def _rect_record(name: str, bbox: Bbox) -> dict[str, Any]:
    return {
        "elementName": name,
        "bbox": list(bbox),
        "kind": "rect",
        "confidence": 1.0,
        "evidence": {"source": "synthetic-ground-truth"},
        "depth": 0,
        "members": 1,
    }


def _mark_record(name: str, bbox: Bbox) -> dict[str, Any]:
    return {
        "elementName": name,
        "bbox": list(bbox),
        "kind": "mark",
        "confidence": 1.0,
        "evidence": {"source": "synthetic-ground-truth"},
        "depth": 0,
        "members": 1,
    }


def _group_record(name: str, bboxes: tuple[Bbox, ...]) -> dict[str, Any]:
    x0 = min(b[0] for b in bboxes)
    y0 = min(b[1] for b in bboxes)
    x1 = max(b[0] + b[2] for b in bboxes)
    y1 = max(b[1] + b[3] for b in bboxes)
    return {
        "elementName": name,
        "bbox": [x0, y0, x1 - x0, y1 - y0],
        "kind": "group",
        "confidence": 1.0,
        "evidence": {"source": "synthetic-ground-truth", "memberCount": len(bboxes)},
        "depth": 0,
        "members": len(bboxes),
    }


def ground_truth(layout: LayoutParams) -> list[dict[str, Any]]:
    """The exact regions this layout was rendered from, in `Region.to_dict()`'s
    shape (bbox/kind/confidence/evidence/depth/members) plus `elementName` --
    the one thing a real detector's raw output never carries, because naming a
    region is fusion's job (detect_regions.py's own docstring) rather than
    detection's. Ground truth is allowed to know it because this file placed
    the ink; a detector being scored against it is not told the name."""
    return [
        _rect_record("heroImage", layout.hero_bbox),
        _mark_record("brandBadge", layout.badge_bbox),
        _mark_record("headlineMain", layout.headline_bbox),
        _mark_record("headlineSub", layout.subheadline_bbox),
        _group_record("description", layout.body_line_bboxes),
        _group_record("statBadges", layout.stat_bboxes),
        _rect_record("ctaButton", layout.cta_bbox),
    ]


def generate(seed: int, canvas_size: int = CANVAS_SIZE) -> GeneratedWireframe:
    """The one entry point that matters: a pure function of `seed`. Same seed
    in, same image and same ground truth out, always -- see
    test_generate_wireframe.py's determinism test. One `RandomState` is
    threaded through layout, noise and every drawing call in a fixed order;
    nothing here reads `time.time()`, `random`'s module-level state, or any
    other seed's output."""
    rng = np.random.RandomState(seed)
    layout = sample_layout(rng, canvas_size)
    noise = sample_noise(rng)
    image = render(layout, noise, rng, canvas_size)
    regions = ground_truth(layout)
    return GeneratedWireframe(seed=seed, image=image, regions=regions)


# --- dataset writer + CLI ----------------------------------------------------


def write_dataset(
    count: int, out_dir: Path, seed_start: int = 0, canvas_size: int = CANVAS_SIZE
) -> list[Path]:
    """Writes `count` PNG + ground-truth-JSON pairs plus a manifest. This
    directory is gitignored (perception/synthetic/dataset/) -- it is the GPU
    teammate's training input, generated on demand, never a committed
    artifact."""
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_items = []
    written = []
    for i in range(count):
        seed = seed_start + i
        sample = generate(seed, canvas_size)
        img_path = out_dir / f"wireframe_{seed:05d}.png"
        gt_path = out_dir / f"wireframe_{seed:05d}.json"
        cv2.imwrite(str(img_path), sample.image)
        gt_path.write_text(json.dumps(sample.to_artifact(), indent=2))
        manifest_items.append(
            {"seed": seed, "image": img_path.name, "groundTruth": gt_path.name, "regionCount": len(sample.regions)}
        )
        written.append(img_path)

    manifest = {"count": count, "canvasSize": canvas_size, "seedStart": seed_start, "items": manifest_items}
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=20, help="number of images to generate")
    parser.add_argument("--seed-start", type=int, default=0, help="first seed; seeds are seed_start..seed_start+count-1")
    parser.add_argument(
        "--out-dir", type=Path, default=Path(__file__).parent / "dataset", help="output directory (gitignored)"
    )
    parser.add_argument("--canvas-size", type=int, default=CANVAS_SIZE)
    args = parser.parse_args()

    written = write_dataset(args.count, args.out_dir, args.seed_start, args.canvas_size)
    print(json.dumps({"written": len(written), "outDir": str(args.out_dir)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
