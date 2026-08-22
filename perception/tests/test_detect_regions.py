"""T-056's verification. CONTRACT.md sections 12, 10, 6 and 11.

doneWhen: "Contour/rectangle detection returns candidate regions with bboxes in
NORMALISED space (§6), each carrying a real confidence rather than a fabricated
one (§10)."

Synthetic drawn images only — same pattern as test_normalise.py. No fixture
files, no external images, runs identically on every machine.

The assertions, and why each one is here:

    NORMALISED SPACE (§6)    Every bbox fits inside the canvas it was drawn on.
    MEASURED, NOT CONSTANT (§10)    Different shapes produce different confidences.
    PURITY / DETERMINISM (§11 rule 3)    Same input, same output, every time.
    NO WHOLE-CANVAS BOX    B-001 and B-002's failure mode — returning the frame
                           itself rather than the things inside it.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

# §10 escalate boundary, mirrored from fuse.ESCALATE_BELOW so this file does not
# import a sibling stage just for one constant.
ESCALATE_EQUIVALENT = 0.60

from perception.stages.detect_regions import (
    MAX_AREA_FRACTION,
    Region,
    SIDE_PRESENT_ABOVE,
    STROKE_RATIO,
    _edge_support,
    _geometric_mean,
    _shape_confidence,
    _smeared,
    detect_regions,
    ink_mask,
    to_artifact,
)


# --- synthetic image builders ------------------------------------------------


def _white_canvas(size: int = 1024) -> np.ndarray:
    """A blank white canvas at the normalised resolution."""
    return np.full((size, size, 3), 255, dtype=np.uint8)


def _draw_rectangles(
    canvas: np.ndarray,
    rects: list[tuple[int, int, int, int]],
    thickness: int = 3,
    colour: tuple[int, int, int] = (30, 30, 30),
) -> np.ndarray:
    """Draw closed rectangles. Each rect is (x, y, w, h)."""
    img = canvas.copy()
    for x, y, w, h in rects:
        cv2.rectangle(img, (x, y), (x + w, y + h), colour, thickness)
    return img


def _draw_short_strokes(
    canvas: np.ndarray,
    position: tuple[int, int],
) -> np.ndarray:
    """Simulate handwriting: short, irregular strokes clustered together.

    The strokes must be SHORT (below STRUCTURE_RUN = 40px) so the structure
    layer does not claim them, DENSE so the cluster dilation merges them,
    and IRREGULAR so they do not look like a rectangle's sides. Multiple
    rows of varied-length marks, with slight positional jitter, at a scale
    that resembles handwritten glyphs.
    """
    img = canvas.copy()
    x0, y0 = position
    # Use a fixed seed derived from position for determinism (§11 rule 3)
    rng = np.random.RandomState(seed=x0 * 1000 + y0)
    for row in range(5):
        y = y0 + row * 8
        x = x0 + int(rng.randint(-3, 4))
        for col in range(6):
            length = int(rng.randint(8, 25))  # well below STRUCTURE_RUN
            jitter_y = int(rng.randint(-2, 3))
            cv2.line(
                img,
                (x, y + jitter_y),
                (x + length, y + jitter_y + int(rng.randint(-1, 2))),
                (15, 15, 15),
                2,
            )
            x += length + int(rng.randint(2, 6))
    return img


def _draw_regular_series(
    canvas: np.ndarray,
    start: tuple[int, int],
    box_size: tuple[int, int],
    count: int = 3,
    gap: int = 20,
    axis: str = "horizontal",
) -> np.ndarray:
    """Draw a run of aligned, similarly-sized, evenly-spaced rectangles."""
    img = canvas.copy()
    x0, y0 = start
    bw, bh = box_size
    for i in range(count):
        if axis == "horizontal":
            x = x0 + i * (bw + gap)
            y = y0
        else:
            x = x0
            y = y0 + i * (bh + gap)
        cv2.rectangle(img, (x, y), (x + bw, y + bh), (30, 30, 30), 3)
    return img


# --- §6: bboxes in NORMALISED space -----------------------------------------


def test_bboxes_in_normalised_space() -> None:
    """Every returned bbox must sit inside the normalised canvas. Section 6."""
    canvas = _white_canvas(1024)
    img = _draw_rectangles(canvas, [
        (100, 100, 200, 150),
        (400, 300, 250, 200),
        (700, 600, 180, 120),
    ])

    regions = detect_regions(img)
    assert len(regions) > 0, "expected at least one region from drawn rectangles"

    h, w = img.shape[:2]
    for r in regions:
        x, y, rw, rh = r.bbox
        assert x >= 0, f"bbox x={x} is negative"
        assert y >= 0, f"bbox y={y} is negative"
        assert x + rw <= w, f"bbox right edge {x + rw} exceeds canvas width {w}"
        assert y + rh <= h, f"bbox bottom edge {y + rh} exceeds canvas height {h}"


# --- §10: confidence is measured, not constant -------------------------------


def test_confidence_is_measured_not_constant() -> None:
    """Different drawn shapes must produce different confidence values.

    Section 10 forbids fabricated numbers. A constant confidence across
    different geometries is a fabricated number — the measurement would have
    to vary because the geometry varies. So we draw a crisp closed rectangle
    (high edge support) and a partial three-sided shape (one side missing),
    and assert the two scores differ.
    """
    canvas = _white_canvas(1024)

    # Image 1: a crisp, fully closed rectangle
    img_full = _draw_rectangles(canvas, [(200, 200, 300, 200)])
    regions_full = detect_regions(img_full)
    rects_full = [r for r in regions_full if r.kind == "rect"]

    # Image 2: three sides only — draw top, left, bottom but not right
    img_partial = canvas.copy()
    cv2.line(img_partial, (200, 200), (500, 200), (30, 30, 30), 3)  # top
    cv2.line(img_partial, (200, 200), (200, 400), (30, 30, 30), 3)  # left
    cv2.line(img_partial, (200, 400), (500, 400), (30, 30, 30), 3)  # bottom
    regions_partial = detect_regions(img_partial)

    assert len(rects_full) > 0, "full rectangle must produce at least one rect region"

    # Collect all unique confidence values across both images
    all_confs = set()
    for r in rects_full:
        all_confs.add(r.confidence)
    for r in regions_partial:
        all_confs.add(r.confidence)

    assert len(all_confs) > 1, (
        "all regions across two geometrically different images produced the same "
        f"confidence {all_confs!r} — confidence is constant, not measured"
    )


def test_confidence_in_zero_one_range() -> None:
    """Every confidence must be in [0.0, 1.0]."""
    img = _draw_rectangles(_white_canvas(), [
        (100, 100, 200, 150),
        (500, 400, 180, 200),
    ])
    for r in detect_regions(img):
        assert 0.0 <= r.confidence <= 1.0, (
            f"confidence {r.confidence} outside [0, 1]"
        )


# --- §11 rule 3: purity / determinism ---------------------------------------


def test_deterministic_same_input_same_output() -> None:
    """Section 11 rule 3: a stage is a pure function. Same input, same output.

    Two calls with the identical array must return identical regions — same
    bboxes, same order, same confidence values.
    """
    img = _draw_rectangles(_white_canvas(), [
        (100, 100, 200, 150),
        (400, 300, 300, 200),
    ])
    # Copy so we're feeding byte-identical but distinct arrays
    first = detect_regions(img.copy())
    second = detect_regions(img.copy())

    assert len(first) == len(second), "different region count on identical input"
    for a, b in zip(first, second):
        assert a.bbox == b.bbox, f"bbox mismatch: {a.bbox} vs {b.bbox}"
        assert a.confidence == b.confidence, (
            f"confidence mismatch: {a.confidence} vs {b.confidence}"
        )
        assert a.kind == b.kind, f"kind mismatch: {a.kind} vs {b.kind}"
        assert a.members == b.members


# --- no whole-canvas box -----------------------------------------------------


def test_no_whole_canvas_box() -> None:
    """No returned region may cover the entire canvas.

    B-001 and B-002 both failed by returning precisely this — one box around
    the whole image. The detector explicitly excludes regions above
    MAX_AREA_FRACTION, and this test ensures that holds.
    """
    canvas = _white_canvas(1024)
    # Draw content in a few corners so the canvas has ink
    img = _draw_rectangles(canvas, [
        (50, 50, 300, 200),
        (600, 600, 250, 250),
    ])
    regions = detect_regions(img)
    canvas_area = float(img.shape[0] * img.shape[1])

    for r in regions:
        area = r.bbox[2] * r.bbox[3]
        assert area / canvas_area < MAX_AREA_FRACTION, (
            f"region {r.bbox} covers {area / canvas_area:.2%} of canvas "
            f"(>= {MAX_AREA_FRACTION})"
        )


# --- rect detection ----------------------------------------------------------


def test_rect_detection_on_drawn_rectangles() -> None:
    """A synthetic image with clear drawn rectangles must return kind='rect'
    regions at approximately their drawn locations."""
    drawn = [
        (150, 150, 250, 180),
        (500, 500, 200, 200),
    ]
    img = _draw_rectangles(_white_canvas(), drawn)
    regions = detect_regions(img)
    rects = [r for r in regions if r.kind == "rect"]

    assert len(rects) >= 2, (
        f"expected at least 2 rect regions from 2 drawn rectangles, got {len(rects)}"
    )

    # Each drawn rectangle should have a detected rect overlapping it
    for dx, dy, dw, dh in drawn:
        found = False
        for r in rects:
            rx, ry, rw, rh = r.bbox
            # Check overlap: the detected box should substantially intersect
            left = max(dx, rx)
            top = max(dy, ry)
            right = min(dx + dw, rx + rw)
            bottom = min(dy + dh, ry + rh)
            if right > left and bottom > top:
                overlap = (right - left) * (bottom - top)
                drawn_area = dw * dh
                if overlap / drawn_area > 0.3:
                    found = True
                    break
        assert found, f"no detected rect overlaps drawn rectangle at ({dx},{dy},{dw},{dh})"


# --- mark detection ----------------------------------------------------------


def test_mark_detection_on_handwriting() -> None:
    """A cluster of short strokes must produce at least one kind='mark' region."""
    img = _draw_short_strokes(_white_canvas(), position=(300, 300))
    regions = detect_regions(img)
    marks = [r for r in regions if r.kind == "mark"]

    assert len(marks) >= 1, (
        f"expected at least 1 mark region from handwriting strokes, "
        f"got kinds: {[r.kind for r in regions]}"
    )


# --- group detection ---------------------------------------------------------


def test_group_detection_on_regular_series() -> None:
    """3+ aligned, evenly-spaced rectangles must produce a kind='group' region."""
    img = _draw_regular_series(
        _white_canvas(),
        start=(100, 400),
        box_size=(80, 80),
        count=4,
        gap=30,
        axis="horizontal",
    )
    regions = detect_regions(img)
    groups = [r for r in regions if r.kind == "group"]

    assert len(groups) >= 1, (
        f"expected at least 1 group region from 4 evenly-spaced rectangles, "
        f"got kinds: {[r.kind for r in regions]}"
    )

    # The group should report its member count
    for g in groups:
        assert g.members >= 3, f"group has {g.members} members, expected >= 3"


# --- evidence ----------------------------------------------------------------


def test_evidence_dict_is_populated() -> None:
    """Every region must carry a non-empty evidence dict with float values.

    Section 10: confidence is a measurement, and evidence carries the
    components so a reader can check the arithmetic rather than trust it.
    """
    img = _draw_rectangles(_white_canvas(), [(200, 200, 300, 200)])
    regions = detect_regions(img)
    assert len(regions) > 0

    for r in regions:
        assert isinstance(r.evidence, dict), "evidence is not a dict"
        assert len(r.evidence) > 0, f"evidence is empty for {r.kind} at {r.bbox}"
        for key, val in r.evidence.items():
            assert isinstance(key, str), f"evidence key {key!r} is not a string"
            assert isinstance(val, (int, float)), (
                f"evidence[{key!r}] = {val!r} is not numeric"
            )


# --- error path --------------------------------------------------------------


def test_empty_image_raises() -> None:
    """An empty or zero-size image must raise, not return garbage."""
    with pytest.raises(ValueError):
        detect_regions(np.array([], dtype=np.uint8))


def test_none_image_raises() -> None:
    """None is not an image."""
    with pytest.raises((ValueError, TypeError)):
        detect_regions(None)  # type: ignore[arg-type]


# --- blank canvas ------------------------------------------------------------


def test_blank_white_image_returns_no_regions() -> None:
    """A pure white canvas has no ink. Nothing to detect."""
    regions = detect_regions(_white_canvas())
    assert regions == [], f"expected no regions on a blank canvas, got {len(regions)}"


# --- to_artifact shape -------------------------------------------------------


def test_to_artifact_shape() -> None:
    """Section 11.2: the trace artifact has {count, regions} with the right
    structure, carried inline in the /perceive response."""
    img = _draw_rectangles(_white_canvas(), [(200, 200, 300, 200)])
    regions = detect_regions(img)
    artifact = to_artifact(regions)

    assert isinstance(artifact, dict)
    assert "count" in artifact
    assert "regions" in artifact
    assert artifact["count"] == len(regions)
    assert isinstance(artifact["regions"], list)

    if artifact["count"] > 0:
        entry = artifact["regions"][0]
        assert "bbox" in entry
        assert "kind" in entry
        assert "confidence" in entry
        assert "evidence" in entry
        assert isinstance(entry["bbox"], list), "bbox must be a list in JSON form"
        assert len(entry["bbox"]) == 4


# --- Region dataclass --------------------------------------------------------


def test_region_is_frozen() -> None:
    """Region is frozen — section 11 rule 1 makes trace records append-only,
    and a mutable detection invites a later stage to edit what stage 3 claimed."""
    r = Region(bbox=(0, 0, 10, 10), kind="rect", confidence=0.5)
    with pytest.raises(AttributeError):
        r.confidence = 0.9  # type: ignore[misc]


# --- ink_mask smoke test -----------------------------------------------------


def test_ink_mask_returns_binary_uint8() -> None:
    """The ink mask is a uint8 array with only 0 and 255 values."""
    img = _draw_rectangles(_white_canvas(512), [(50, 50, 100, 100)])
    mask = ink_mask(img)
    assert mask.dtype == np.uint8
    unique = set(np.unique(mask))
    assert unique <= {0, 255}, f"mask contains values other than 0/255: {unique}"


# ---------------------------------------------------------------------------
# T-133 — a stroke is scored on the sides it has. §10.
# ---------------------------------------------------------------------------


def test_a_ruled_line_is_scored_on_its_length_not_on_its_ends():
    """THE DEFECT: a rectangle's model applied to a line.

    A ruled line 7px tall and 145px wide has a top and a bottom. What it has at
    its left and right are ENDS, not borders. Scoring it on whether those ends
    look like drawn vertical edges measures something that was never going to be
    there, and the geometric mean then drags the region down for it. Measured on
    the reference wireframe's four ruled lines before this change:

        top 1.0, bottom 1.0, left 0.71, right 0.56  ->  0.80

    The two 1.0s are the real answer. Downstream that fed `description`, whose
    confidence rose from 0.6889 to 0.8619 once the artefact stopped counting.
    """
    canvas = np.zeros((200, 400), dtype=np.uint8)
    # A clean horizontal rule: fully drawn along its length, nothing at its ends.
    canvas[100:107, 120:280] = 255

    vertical, horizontal = _smeared(canvas)
    support = _edge_support((120, 100, 160, 7), vertical, horizontal)

    assert set(support) == {"top", "bottom"}, f"a stroke was scored on {sorted(support)}"
    assert support["top"] > 0.9
    assert support["bottom"] > 0.9


def test_a_vertical_stroke_is_scored_on_its_own_long_sides():
    # Which two sides are the long ones depends on which way the stroke runs, and
    # getting that backwards would score every vertical rule on its ends instead.
    canvas = np.zeros((400, 200), dtype=np.uint8)
    canvas[120:280, 100:107] = 255

    vertical, horizontal = _smeared(canvas)
    support = _edge_support((100, 120, 7, 160), vertical, horizontal)

    assert set(support) == {"left", "right"}


def test_a_box_is_still_scored_on_all_four_sides():
    """The three-sided bracket argument is untouched.

    A bracket is a rectangle CANDIDATE missing a side and must still be dragged
    down for it — that is why the geometric mean was chosen. A stroke is not a
    rectangle at all, which is the whole distinction. Getting this wrong in the
    permissive direction would score an open bracket as a closed box.
    """
    canvas = np.zeros((400, 400), dtype=np.uint8)
    # Three sides of a square: top, bottom, left. No right side at all.
    canvas[100:107, 100:300] = 255
    canvas[293:300, 100:300] = 255
    canvas[100:300, 100:107] = 255

    vertical, horizontal = _smeared(canvas)
    support = _edge_support((100, 100, 200, 200), vertical, horizontal)

    assert set(support) == {"top", "bottom", "left", "right"}
    assert support["right"] < 0.2, "the missing side is not being noticed"
    # And the aggregate must land below §10's escalate boundary, which is the
    # behaviour the geometric mean exists to produce.
    assert _geometric_mean(list(support.values())) < 0.60


def test_the_stroke_threshold_separates_the_measured_populations():
    """STROKE_RATIO is measured, not chosen.

    On the reference wireframe the four ruled lines sit at 0.044-0.062 and the
    smallest real box - SUB HEADLINE - at 0.120. The threshold has to fall between
    them, and this pins that it does, so a later nudge to the constant fails here
    rather than silently reclassifying a box as a stroke.
    """
    assert max(0.044, 0.054, 0.060, 0.062) < STROKE_RATIO
    assert STROKE_RATIO < 0.120


# ---------------------------------------------------------------------------
# T-134 — a gap in a side is not a missing side. §10.
# ---------------------------------------------------------------------------


def test_a_three_sided_bracket_still_escalates():
    """THE PROPERTY T-134 MUST NOT BREAK, asserted first for that reason.

    `_geometric_mean` was chosen over an arithmetic mean precisely so a bracket —
    a rectangle candidate with a side genuinely missing — scores near zero and
    escalates, rather than landing at 0.75 in §10's verify band. Softening the
    conjunction for gappy boxes must leave that exactly where it was.
    """
    bracket = {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": 0.02}

    assert _shape_confidence(bracket) < ESCALATE_EQUIVALENT
    # And specifically: no trimming happened, so it is the plain conjunction.
    assert _shape_confidence(bracket) == _geometric_mean(list(bracket.values()))


def test_a_box_with_a_gap_in_one_side_is_not_scored_as_a_missing_side():
    """The reference wireframe's hero panel, by its measured numbers.

    Its left edge is 344 of 627 px inked, in two segments, with a single 228px
    gap — present, and incomplete. The four-way conjunction scored the whole box
    0.694 for it, while the detector located that same box at IoU 0.88.
    """
    hero = {"top": 0.6818, "bottom": 0.7899, "left": 0.5486, "right": 0.7863}

    plain = _geometric_mean(list(hero.values()))
    softened = _shape_confidence(hero)

    assert round(plain, 3) == 0.694, "the baseline this task was measured against moved"
    assert softened > plain
    # The weakest side is dropped and the other three combined — not rescaled, not
    # floored, so the number is still a geometric mean of real measurements.
    assert softened == _geometric_mean([0.6818, 0.7899, 0.7863])


def test_trimming_needs_at_least_three_present_sides():
    """A stroke is scored on two sides. Dropping one scores a line on one side,
    which measures nothing at all."""
    stroke = {"top": 1.0, "bottom": 0.9}
    assert _shape_confidence(stroke) == _geometric_mean([1.0, 0.9])


def test_the_presence_floor_separates_absent_from_incomplete():
    # Set where the two look nothing alike: the hero panel's weakest PRESENT side
    # is 0.5486, and a side nobody drew measures essentially zero.
    assert 0.0 < SIDE_PRESENT_ABOVE < 0.5486

    absent = {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": SIDE_PRESENT_ABOVE - 0.01}
    present = {"top": 1.0, "bottom": 1.0, "left": 1.0, "right": SIDE_PRESENT_ABOVE + 0.01}

    # Just below the floor: nothing is trimmed, so the weak side still dominates.
    assert _shape_confidence(absent) == _geometric_mean(list(absent.values()))
    # Just above it: the weak side is the one dropped.
    assert _shape_confidence(present) == 1.0
