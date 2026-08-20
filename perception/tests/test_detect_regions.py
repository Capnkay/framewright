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

from perception.stages.detect_regions import (
    Region,
    detect_regions,
    ink_mask,
    to_artifact,
    MAX_AREA_FRACTION,
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
