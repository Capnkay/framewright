"""Stage 3a -- contour and rectangle region detection. CONTRACT.md sections 12, 10 and 6.

Stage 3 is "multimodal-understanding" (section 11.0). This is its first half: find
WHERE the things are. The second half, T-098, reads what is written inside them.
Nothing here labels a region `ctaButton` -- naming is fusion's job (T-057), and a
detector that guesses names is a detector whose geometry cannot be checked
separately from its semantics.

WHY CLASSICAL CV AND NOT A DETECTOR. Measured, not assumed:

    B-001  Florence-2 base and large, both task families   0 of 7 targets
    B-002  DETR-ResNet-50, four confidence thresholds      0 of 7 targets

Both returned exactly one box covering most of the frame -- "whiteboard" and "cell
phone" respectively. Neither is failing to see the picture; a wireframe simply does
not decompose into UI components anywhere in a photographic training distribution.
The full write-up is in docs/BENCHMARK-RESULTS.md. This module's own score against
the same seven targets on the same image is recorded there as B-003.

WHAT A WIREFRAME ACTUALLY IS, which is what this module is built for: closed drawn
rectangles, short runs of handwriting, and stacked horizontal rules standing in for
body copy. Three shapes, and each one gets a detector below.

CONFIDENCE IS MEASURED, NOT PICKED. Section 10 is explicit -- an element that did
not come from an image carries `null`, "not a fabricated number". The inverse
obligation binds just as hard: a region that DID come from an image must carry a
number that came from the image too. So no constant appears anywhere in this file
as a confidence. Every value is a geometric measurement over the ink mask, and
`Region.evidence` carries the components that produced it so a reader can check the
arithmetic rather than trust it.

WHAT THE NUMBER MEANS, STATED PRECISELY so nobody over-reads it. It is *geometric
support*: how completely the ink in the image backs up the box we are claiming. For
a rectangle that is "all four sides are actually drawn"; for a mark, "the ink fills
its box rather than rattling around inside it"; for a group, "the members really are
a regular series". It is NOT the probability that the region is a button. Nothing at
this stage knows what a button is. Stage 3b replaces an element's confidence with
the OCR confidence where text is found (T-098), because that measures something
closer to what section 10's bands are read as meaning.

COORDINATE SPACE. Every bbox is `[x, y, w, h]` in the NORMALISED image, per section
6, which is the space stage 2 produced and recorded a transform for. Mapping back
onto the upload is `normalise.to_original`, and it needs that transform -- which is
exactly why section 6 requires it to be recorded.

PURITY. Section 11 rule 3: a stage is a pure function of its persisted input. Same
array in, same regions out. Nothing here reads the clock, the filesystem or the
network, and no ordering depends on dict iteration or on OpenCV's contour order.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

# --- tuning constants, each with the reason it has the value it has ---------

# Illumination correction. The kernel has to be wider than the thickest stroke,
# or the median blur follows the stroke and subtracts it from itself. 41px at a
# 1024 canvas is roughly 4% of the frame -- comfortably above pen width and well
# below the size of anything we want to detect.
BACKGROUND_KERNEL = 41

# Gap closing. Hand-drawn strokes break; a 3x3 close rejoins a one-pixel gap
# without fattening a glyph into a blob.
CLOSE_KERNEL = 3

# Tolerance for "the edge is where I said it is". A ruled line drawn by hand
# wanders several pixels over its length, so edge support is measured with the
# mask smeared 6px across the stroke. Without this, every hand-drawn rectangle
# scores near zero on its long sides and the confidence measures handwriting
# steadiness rather than whether a box was drawn.
EDGE_TOLERANCE = 13  # a (13,1)/(1,13) dilation: plus or minus 6px

# How far in from a bbox edge we still count as "the edge". A quarter of the
# dimension: generous enough for a wobbly corner, tight enough that ink in the
# middle of a box cannot masquerade as its border.
EDGE_BAND_FRACTION = 0.25

# Structure vs handwriting. A stroke longer than this is a rule or a box side;
# anything shorter is a glyph. 40px at 1024 is about the width of one capital
# letter in the reference wireframe, which is the boundary we want.
STRUCTURE_RUN = 40

# Cluster handwriting into words and lines: dilate 19px across, 9px down. Wide
# enough to bridge the space between letters and between two stacked lines of a
# heading, narrow enough not to weld the left column onto the right one.
TEXT_CLUSTER_KERNEL = (19, 9)

# Size gates. Below the first, a region is a speck of paper noise; above the
# second it is the canvas itself rather than anything on it. B-001 and B-002 both
# failed by returning precisely the second thing, which is why it is excluded
# rather than merely deprioritised.
MIN_AREA_FRACTION = 0.0004
MAX_AREA_FRACTION = 0.98
MIN_SIDE = 6

# Two boxes overlapping this much are the same region seen twice -- the usual
# cause being a drawn rectangle's inner and outer stroke boundary.
DUPLICATE_IOU = 0.80

# The same twin, seen the other way: one box wholly inside another and nearly as
# large is the inside of a stroke rather than a second thing. IoU alone misses
# this pair on small boxes -- a 42x36 inner boundary inside a 50x41 outer scores
# 0.74 and survives, which put five members in a three-badge group.
NESTED_DUPLICATE_RATIO = 0.55

# How closely two members of a series must match in size, on BOTH axes.
SIBLING_SIZE_RATIO = 0.6

# How even the spacing has to be before a run counts as a series at all.
GROUP_REGULARITY_FLOOR = 0.5

# A run of this many aligned, similar, evenly spaced siblings is a series: four
# ruled lines standing in for a paragraph, three badges standing in for a stat
# row. Two is a coincidence; three is a pattern.
MIN_GROUP_MEMBERS = 3


@dataclass(frozen=True)
class Region:
    """One candidate region. Frozen for the same reason stage 2's result is:
    section 11 rule 1 makes trace records append-only, and a mutable detection
    invites a later stage to quietly edit what stage 3 claimed to have seen."""

    bbox: tuple[int, int, int, int]  # [x, y, w, h], NORMALISED space (section 6)
    kind: str  # "rect" | "mark" | "group" -- shape, never semantics
    confidence: float  # measured; see the module docstring for what it means
    evidence: dict[str, float] = field(default_factory=dict)
    depth: int = 0  # contour nesting depth; 0 is outermost
    members: int = 1  # 1, or the member count for a group

    def to_dict(self) -> dict[str, Any]:
        """The shape that goes into the stage-3 trace artifact, inline per
        section 11.2. `bbox` is a list because JSON has no tuples and the IR's
        bbox is a JSON array."""
        return {
            "bbox": list(self.bbox),
            "kind": self.kind,
            "confidence": self.confidence,
            "evidence": dict(self.evidence),
            "depth": self.depth,
            "members": self.members,
        }


# --- the ink mask ----------------------------------------------------------


def ink_mask(image: np.ndarray) -> np.ndarray:
    """Separate pen from paper. Returns a uint8 mask, 255 where there is ink.

    ILLUMINATION CORRECTION FIRST, AND WHY IT IS NOT OPTIONAL. The input we
    measured against is a phone photograph of a page, so it carries a lighting
    gradient, a shadow down one side, and -- the interesting one -- text bleeding
    through from the reverse of the sheet. A global threshold picks a value that
    is right for one corner and wrong for the other. Subtracting a heavily
    blurred copy of the image from itself removes everything that varies slowly,
    which is precisely the shadow and the gradient, and leaves what varies fast,
    which is precisely the pen.

    OTSU AFTER, RATHER THAN A FIXED CUTOFF. The bleed-through is the reason. It
    sits at a genuinely lower contrast than the pen, so a threshold chosen from
    the image's own histogram separates them; a hardcoded delta tuned on this
    photograph would be a constant fitted to one sheet of paper.
    """
    if image is None or image.size == 0:
        raise ValueError("detect_regions was given an empty image.")

    grey = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    background = cv2.medianBlur(grey, BACKGROUND_KERNEL)
    contrast = cv2.subtract(background, grey)  # ink is bright here, paper is 0

    _, mask = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    kernel = np.ones((CLOSE_KERNEL, CLOSE_KERNEL), np.uint8)
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)


def _smeared(mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The mask dilated across each axis, for edge support only.

    Kept separate from the mask itself so that no size, area or density
    measurement is ever taken on fattened ink.
    """
    binary = (mask > 0).astype(np.uint8)
    vertical = cv2.dilate(binary, np.ones((EDGE_TOLERANCE, 1), np.uint8))
    horizontal = cv2.dilate(binary, np.ones((1, EDGE_TOLERANCE), np.uint8))
    return vertical, horizontal


# --- the measurements that become confidence -------------------------------


# Below this ratio of short side to long side, a region is a STROKE rather than a
# box, and only its two long sides are scored. MEASURED on the reference wireframe,
# where the two populations separate:
#
#     0.044  0.054  0.060  0.062   the four ruled lines
#     ------------------------------------------------  0.10
#     0.120  SUB HEADLINE box      0.182  HEADLINE box
#     0.235  LABEL box             0.278  SUBMIT box
#
# The nearest neighbours either side are named because they are close: 0.093 is a
# page-wide band the detector picks up and no slot claims, and 0.120 is the
# smallest real box on the page. A future image that draws a squatter box than
# that will want this number revisited, and it should be revisited by measuring
# rather than by nudging.
STROKE_RATIO = 0.10

# Below this, a side was not drawn at all; at or above it, a side is present and
# may simply be incomplete. The distinction is the whole of T-134: a rectangle
# MISSING a side and a rectangle with a GAP in a side are different claims about
# what someone drew, and the four-way conjunction could not tell them apart.
#
# 0.25 is set where the two look nothing alike on the reference wireframe: the
# hero panel's weakest side is 0.5486 (present, a 228px gap in a 627px edge) and a
# side nobody drew measures essentially 0. Nothing on that page sits between.
SIDE_PRESENT_ABOVE = 0.25


def _edge_support(
    bbox: tuple[int, int, int, int], vertical: np.ndarray, horizontal: np.ndarray
) -> dict[str, float]:
    """For each side that the shape actually HAS: how much of it is drawn.

    Read down the band nearest the edge and take the single best row (or column):
    a drawn side is one line, not a smear, so the best row is the honest measure
    and averaging the band would penalise a crisp rectangle for the whitespace
    beside its own border.

    A STROKE IS SCORED ON TWO SIDES, NOT FOUR, and that is a correctness fix
    rather than a leniency. A ruled line 7px tall and 145px wide has a top and a
    bottom; what it has at its left and right are ENDS, not borders. Scoring it on
    whether those ends look like drawn vertical edges measures something that was
    never going to be there, and the geometric mean then drags the whole region
    down for it. Measured on the reference wireframe's four ruled lines:

        top 1.0, bottom 1.0, left 0.71, right 0.56  ->  0.80

    The two 1.0s are the real answer and the two others are an artefact of
    applying a rectangle's model to a line.

    THIS DOES NOT SOFTEN THE THREE-SIDED BRACKET ARGUMENT that chose the geometric
    mean. A bracket is a rectangle CANDIDATE missing a side, and it still scores as
    one. A stroke is not a rectangle at all.
    """
    x, y, w, h = bbox
    band_y = max(1, int(round(EDGE_BAND_FRACTION * h)))
    band_x = max(1, int(round(EDGE_BAND_FRACTION * w)))

    sides = {
        "top": float(vertical[y : y + band_y, x : x + w].mean(axis=1).max()),
        "bottom": float(vertical[y + h - band_y : y + h, x : x + w].mean(axis=1).max()),
        "left": float(horizontal[y : y + h, x : x + band_x].mean(axis=0).max()),
        "right": float(horizontal[y : y + h, x + w - band_x : x + w].mean(axis=0).max()),
    }

    if w and h and min(w, h) / max(w, h) < STROKE_RATIO:
        # The long sides only. Which two those are depends on which way it runs.
        keep = ("top", "bottom") if w >= h else ("left", "right")
        return {k: sides[k] for k in keep}

    return sides


def _fill_support(bbox: tuple[int, int, int, int], mask: np.ndarray) -> dict[str, float]:
    """For a handwriting cluster: how much of its box the ink actually occupies.

    Rows and columns separately, because they fail differently. A tight word has
    ink in nearly every row and nearly every column of its box. Two specks in
    opposite corners have a box just as large and almost none of either, and that
    is the false positive this measurement exists to price.
    """
    x, y, w, h = bbox
    window = mask[y : y + h, x : x + w] > 0
    if window.size == 0:
        return {"rows": 0.0, "columns": 0.0, "density": 0.0}
    return {
        "rows": float(window.any(axis=1).mean()),
        "columns": float(window.any(axis=0).mean()),
        "density": float(window.mean()),
    }


def _geometric_mean(values: list[float]) -> float:
    """Combine evidence so that one absent component cannot be averaged away.

    An arithmetic mean gives a rectangle with three strong sides and no fourth
    side 0.75 -- which lands in section 10's "verify" band, when the right answer
    is that we are looking at a bracket and should escalate. The geometric mean
    is zero if any component is zero and is dragged hard by any component that is
    small, which is the behaviour a conjunction of independent checks should have.
    """
    if not values:
        return 0.0
    clamped = [max(0.0, min(1.0, v)) for v in values]
    if min(clamped) == 0.0:
        return 0.0
    return float(np.exp(np.mean(np.log(clamped))))


def _shape_confidence(support: dict[str, float]) -> float:
    """Aggregate the sides a shape has into one number. T-134.

    A DELIBERATE SOFTENING OF THE CONJUNCTION ABOVE, and the reasoning is logged in
    docs/corrections/REGISTER.md rather than only here.

    `_geometric_mean` was chosen so that a three-sided bracket scores near zero and
    escalates instead of landing in §10's verify band. That is still right and is
    untouched. What it also did was score a box whose four sides are ALL DRAWN, one
    of them with a gap in it, as though a side were missing. On the reference
    wireframe the hero panel measures top 0.68, bottom 0.79, right 0.79 and left
    0.5486 — that left edge is 344 of 627 px inked, in two segments — and came out
    at 0.694, while the same box is LOCATED at IoU 0.88.

    So: when every side is present, the weakest one is dropped and the rest are
    combined. A rectangle with four drawn sides and a gap in one is still plainly a
    rectangle. When ANY side is absent, nothing is dropped and the conjunction bites
    exactly as before — which is what keeps the bracket escalating.

    Trimming needs at least three present sides to mean anything. A stroke is scored
    on two, and dropping one of those would score a line on a single side.
    """
    values = list(support.values())
    if len(values) < 3 or any(v < SIDE_PRESENT_ABOVE for v in values):
        return _geometric_mean(values)

    trimmed = sorted(values)[1:]
    return _geometric_mean(trimmed)


# --- geometry helpers ------------------------------------------------------


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    left, top = max(ax, bx), max(ay, by)
    right, bottom = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if right <= left or bottom <= top:
        return 0.0
    overlap = (right - left) * (bottom - top)
    return overlap / float(aw * ah + bw * bh - overlap)


def _contains(outer: tuple[int, int, int, int], inner: tuple[int, int, int, int]) -> bool:
    ox, oy, ow, oh = outer
    ix, iy, iw, ih = inner
    return ox <= ix and oy <= iy and ox + ow >= ix + iw and oy + oh >= iy + ih


def _depth_of(index: int, hierarchy: np.ndarray) -> int:
    """Contour nesting depth from OpenCV's RETR_TREE hierarchy.

    Carried through rather than resolved here: a box inside a box is the layout
    hierarchy, and T-057 assembles that into regions. Recording it costs one
    integer and re-deriving it later costs the whole contour pass.
    """
    depth = 0
    parent = int(hierarchy[index][3])
    seen = {index}
    while parent != -1 and parent not in seen:
        seen.add(parent)
        depth += 1
        parent = int(hierarchy[parent][3])
    return depth


# --- detector one: closed drawn rectangles ---------------------------------


def _rect_regions(mask: np.ndarray, min_area: float, max_area: float) -> list[Region]:
    """Contours whose four sides are genuinely inked.

    THE PART THAT IS EASY TO GET WRONG. The obvious rectangularity test is
    `contourArea / boundingRect area`, and on this input it reports about 0.008
    for a perfectly good hand-drawn box. A drawn rectangle is a STROKE, not a
    filled shape, and a stroke with any break in it traces out as a thin open
    snake whose polygon area is almost nothing. Every hollow rectangle in the
    reference wireframe fails that test. Measured, on the real image, before this
    was written -- so the test here asks the question that actually distinguishes
    a box from a scribble: is there ink along all four sides of it?
    """
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]

    vertical, horizontal = _smeared(mask)
    regions: list[Region] = []

    for index, contour in enumerate(contours):
        x, y, w, h = (int(v) for v in cv2.boundingRect(contour))
        area = w * h
        if w < MIN_SIDE or h < MIN_SIDE or area < min_area or area > max_area:
            continue

        bbox = (x, y, w, h)
        support = _edge_support(bbox, vertical, horizontal)
        confidence = _shape_confidence(support)

        hull_area = cv2.contourArea(cv2.convexHull(contour))
        evidence = {
            **{k: round(v, 4) for k, v in support.items()},
            "solidity": round(float(cv2.contourArea(contour) / hull_area) if hull_area else 0.0, 4),
            "areaFraction": round(area / float(mask.size), 6),
        }

        regions.append(
            Region(
                bbox=bbox,
                kind="rect",
                confidence=round(confidence, 4),
                evidence=evidence,
                depth=_depth_of(index, hierarchy),
            )
        )

    return regions


# --- detector two: handwriting ---------------------------------------------


def _structure_layer(mask: np.ndarray) -> np.ndarray:
    """Everything drawn as structure: box sides and ruled lines, whole.

    Without this the cluster pass is useless on a wireframe. Every drawn box
    touches or nearly touches its neighbours through the frame around them, so a
    dilation over the raw mask welds the entire drawing into one component -- one
    box around everything, which is the exact failure B-001 and B-002 were marked
    down for. Splitting structure from handwriting first is what makes clustering
    a text detector instead of a whole-page detector.

    WHOLE CONNECTED COMPONENTS, NOT JUST THE LONG RUNS. A morphological opening
    finds the straight part of a box side and leaves its four corners behind,
    because a corner is short in both directions. Those orphaned corners then
    cluster with each other across the whole page and produce a large, confident,
    entirely fictional text block -- measured, on the reference wireframe, which
    is how this rule was found. So a run of ink long enough to be structure
    condemns the entire component it belongs to.
    """
    binary = (mask > 0).astype(np.uint8) * 255
    long_h = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((1, STRUCTURE_RUN), np.uint8))
    long_v = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((STRUCTURE_RUN, 1), np.uint8))
    runs = cv2.bitwise_or(long_h, long_v)

    count, labels = cv2.connectedComponents(binary, connectivity=8)
    if count <= 1:
        return runs

    structural = np.unique(labels[runs > 0])
    keep = np.zeros(count, dtype=np.uint8)
    keep[structural[structural > 0]] = 255
    return keep[labels]


def _mark_regions(mask: np.ndarray, min_area: float, max_area: float) -> list[Region]:
    """Clusters of short strokes -- words, and lines of words."""
    handwriting = cv2.bitwise_and(mask, cv2.bitwise_not(_structure_layer(mask)))

    kernel_w, kernel_h = TEXT_CLUSTER_KERNEL
    clustered = cv2.dilate(handwriting, np.ones((kernel_h, kernel_w), np.uint8))

    contours, _ = cv2.findContours(clustered, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    regions: list[Region] = []

    for contour in contours:
        x, y, w, h = (int(v) for v in cv2.boundingRect(contour))
        # Undo the dilation's padding so the bbox describes the ink, not the
        # kernel we used to find it. A box reported half a kernel too large in
        # every direction is wrong by a fixed amount, which is the kind of error
        # that survives review because it looks deliberate.
        x, y = x + kernel_w // 2, y + kernel_h // 2
        w, h = max(1, w - kernel_w), max(1, h - kernel_h)

        area = w * h
        if w < MIN_SIDE or h < MIN_SIDE or area < min_area or area > max_area:
            continue

        bbox = (x, y, w, h)
        fill = _fill_support(bbox, handwriting)
        confidence = _geometric_mean([fill["rows"], fill["columns"]])

        regions.append(
            Region(
                bbox=bbox,
                kind="mark",
                confidence=round(confidence, 4),
                evidence={
                    **{k: round(v, 4) for k, v in fill.items()},
                    "areaFraction": round(area / float(mask.size), 6),
                },
            )
        )

    return regions


# --- detector three: a regular series --------------------------------------


def _group_regions(regions: list[Region]) -> list[Region]:
    """Merge a run of aligned, similar, evenly spaced siblings into one region.

    Both of the reference wireframe's remaining elements are this shape and
    neither is findable any other way: `description` is four stacked ruled lines,
    and `statBadges` is three small squares in a row. Individually they are four
    lines and three squares; the thing a section actually contains is one
    paragraph and one stat row.

    This is detection, not semantics -- "these N boxes form a regular series" is
    measured off the geometry, and no name is attached to the result. Deciding
    that the series IS the description is T-057's fusion pass, which is also
    where the members get an `order` within it.

    The group's confidence is its weakest member scaled by how regular the series
    actually is, so a ragged near-series cannot inherit a strong number from one
    crisp member.
    """
    groups: list[Region] = []

    for axis in ("vertical", "horizontal"):
        # Sort along the run direction; ties broken on the other axis so the
        # result cannot depend on contour order.
        if axis == "vertical":
            ordered = sorted(regions, key=lambda r: (r.bbox[1], r.bbox[0]))
        else:
            ordered = sorted(regions, key=lambda r: (r.bbox[0], r.bbox[1]))

        # Chain every sibling PAIR and take the connected runs, rather than
        # walking the sorted list and breaking on the first non-sibling. The
        # four ruled lines of the description have unrelated boxes sorted in
        # between them, so an adjacency walk finds a run of one, four times over
        # -- measured, on the reference wireframe. Siblings are a relation
        # between two boxes, not between two neighbours in a list.
        parent = list(range(len(ordered)))

        def root(i: int, parent: list[int] = parent) -> int:
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for i, a in enumerate(ordered):
            for j in range(i + 1, len(ordered)):
                if _is_sibling(a, ordered[j], axis):
                    parent[root(j)] = root(i)

        runs: dict[int, list[Region]] = {}
        for index, region in enumerate(ordered):
            runs.setdefault(root(index), []).append(region)

        # Sorted by key so the output order is fixed rather than dict-insertion
        # dependent; the members inside each run keep their positional order.
        for key in sorted(runs):
            groups.extend(_close_run(runs[key], axis))

    return groups


def _is_sibling(a: Region, b: Region, axis: str) -> bool:
    """Two regions belong to the same series if they are the same size, aligned
    on the cross axis, and close together along the run axis."""
    ax, ay, aw, ah = a.bbox
    bx, by, bw, bh = b.bbox

    if axis == "vertical":
        size_a, size_b = aw, bw
        start_a, start_b = ax, bx
        gap = by - (ay + ah)
        pitch = ah
    else:
        size_a, size_b = ah, bh
        start_a, start_b = ay, by
        gap = bx - (ax + aw)
        pitch = aw

    # Both dimensions, not just the one across the run. Comparing only the cross
    # -axis size lets a 217x47 label chain onto a 145x9 ruled line -- they are
    # nearly the same width, and nothing else about them matches. Measured, on
    # the reference wireframe: that single missing check merged the badge, the
    # paragraph rules and the label into one eight-member fiction.
    if min(aw, bw) / max(aw, bw, 1) < SIBLING_SIZE_RATIO:
        return False
    if min(ah, bh) / max(ah, bh, 1) < SIBLING_SIZE_RATIO:
        return False

    larger = max(size_a, size_b)
    if larger == 0:
        return False
    if abs(start_a - start_b) > 0.35 * larger:
        return False  # not aligned on the cross axis
    return -pitch <= gap <= max(3.0 * pitch, 0.5 * larger)


def _close_run(run: list[Region], axis: str) -> list[Region]:
    """Turn a completed run into a group, if it is long enough to be one."""
    if len(run) < MIN_GROUP_MEMBERS:
        return []

    xs = [r.bbox[0] for r in run]
    ys = [r.bbox[1] for r in run]
    x = min(xs)
    y = min(ys)
    w = max(r.bbox[0] + r.bbox[2] for r in run) - x
    h = max(r.bbox[1] + r.bbox[3] for r in run) - y

    # Regularity: how evenly the members are spaced along the run axis. A perfect
    # series has zero spread in its step, so regularity is 1; a series whose steps
    # vary by as much as the step itself is not a series at all, so it is 0.
    starts = sorted(ys if axis == "vertical" else xs)
    steps = [b - a for a, b in zip(starts, starts[1:])]
    mean_step = float(np.mean(steps)) if steps else 0.0
    spread = float(np.std(steps)) / mean_step if mean_step > 0 else 1.0
    regularity = max(0.0, 1.0 - spread)

    # Below the floor it is not a series at all, and reporting it as one with a
    # low confidence is not the honest option it looks like: a group's bbox is
    # the union of its members, so an accidental chain of four stacked boxes
    # claims one region covering half the page. That is the shape of answer
    # B-001 and B-002 were marked down for, and it should not be emitted at any
    # confidence.
    if regularity < GROUP_REGULARITY_FLOOR:
        return []

    weakest = min(r.confidence for r in run)
    return [
        Region(
            bbox=(x, y, w, h),
            kind="group",
            confidence=round(weakest * regularity, 4),
            evidence={
                "regularity": round(regularity, 4),
                "weakestMember": round(weakest, 4),
                "axis": 1.0 if axis == "vertical" else 0.0,
            },
            depth=min(r.depth for r in run),
            members=len(run),
        )
    ]


# --- assembly --------------------------------------------------------------


def _deduplicate(regions: list[Region]) -> list[Region]:
    """Drop a region that is the same box as one we already kept.

    A hand-drawn rectangle has two contours -- the outside and the inside of its
    own stroke -- and both are real detections of one drawn box. Keeping the
    stronger of the pair is the whole of the policy; keeping both would double
    every rectangle in the response and let fusion emit the same element twice.

    Nesting is checked as well as overlap, because on a small box the two stroke
    boundaries do not overlap enough for IoU to catch them -- see
    NESTED_DUPLICATE_RATIO. A genuinely nested pair, a card inside a container,
    differs from a stroke's two edges by area: the card is a fraction of its
    container, the inner edge is nearly all of its outer one.
    """

    def is_twin(a: Region, b: Region) -> bool:
        if _iou(a.bbox, b.bbox) >= DUPLICATE_IOU:
            return True
        if not (_contains(a.bbox, b.bbox) or _contains(b.bbox, a.bbox)):
            return False
        area_a = a.bbox[2] * a.bbox[3]
        area_b = b.bbox[2] * b.bbox[3]
        return min(area_a, area_b) / float(max(area_a, area_b)) >= NESTED_DUPLICATE_RATIO

    # LARGEST FIRST, so that when a stroke's two boundaries meet, the survivor
    # is the outer one -- the box as drawn, stroke included. Keeping whichever
    # twin scored higher instead produced a set where two badges were
    # represented by their inner edge and the third by its outer edge, and the
    # series detector then measured them as three different sizes and refused to
    # group them. Consistency between twins matters more here than a few
    # hundredths of confidence.
    kept: list[Region] = []
    for region in sorted(regions, key=lambda r: (-(r.bbox[2] * r.bbox[3]), -r.confidence, r.bbox)):
        if any(is_twin(region, other) for other in kept):
            continue
        kept.append(region)
    return kept


def detect_regions(
    image: np.ndarray,
    *,
    min_area_fraction: float = MIN_AREA_FRACTION,
    max_area_fraction: float = MAX_AREA_FRACTION,
) -> list[Region]:
    """Stage 3a, end to end. `image` is stage 2's NORMALISED canvas.

    Returns candidate regions largest first, ties broken on position, so the
    order is total and deterministic and containers arrive before the things they
    contain. Callers that want reading order can sort on the bbox; callers that
    want the layout tree have `depth`.
    """
    mask = ink_mask(image)
    canvas_area = float(mask.size)
    min_area = min_area_fraction * canvas_area
    max_area = max_area_fraction * canvas_area

    rects = _rect_regions(mask, min_area, max_area)
    marks = _mark_regions(mask, min_area, max_area)

    # A rectangle that sits entirely inside a handwriting cluster is a letter,
    # not a box: the closed loop of a D, an A or an O passes every rectangle test
    # there is, because at this scale it genuinely is a small closed shape with
    # ink on all four sides. What distinguishes it is company -- it is embedded
    # in a word. Structure removal already guarantees a real drawn box cannot be
    # inside a mark, so this cannot swallow one.
    inside_a_word = [
        r
        for r in rects
        if any(_contains(m.bbox, r.bbox) for m in marks)
    ]
    singles = _deduplicate([r for r in rects if r not in inside_a_word] + marks)

    # Groups are formed over the surviving rectangles only, and AFTER
    # deduplication. A run of ruled lines and a row of badges are both drawn
    # structure; a run of handwriting clusters is one paragraph's own lines,
    # which T-098's OCR reassembles from the text rather than from the geometry.
    # Grouping before deduplication counts a badge and the inside of the same
    # badge as two members of the series, and a series with its own twins in it
    # is neither regular nor the right length.
    groups = _group_regions([r for r in singles if r.kind == "rect"])

    # A group is only worth reporting if it is not simply one of its members
    # again, and only if something inside it survived deduplication.
    kept_groups = [
        g
        for g in groups
        if not any(_iou(g.bbox, s.bbox) >= DUPLICATE_IOU for s in singles)
        and any(_contains(g.bbox, s.bbox) for s in singles)
    ]

    everything = singles + kept_groups
    everything.sort(key=lambda r: (-(r.bbox[2] * r.bbox[3]), r.bbox[1], r.bbox[0]))
    return everything


def to_artifact(regions: list[Region]) -> dict[str, Any]:
    """Stage 3a's trace artifact, carried INLINE in the /perceive response.

    Section 11.2: the Python service never writes a file -- it returns stage
    outputs in the response body and Node persists them. `count` is here because
    the number of regions found is the first thing anyone reads off the Glass Box
    timeline, and deriving it from the array's length is one more thing for a UI
    to get wrong.
    """
    return {
        "count": len(regions),
        "regions": [r.to_dict() for r in regions],
    }
