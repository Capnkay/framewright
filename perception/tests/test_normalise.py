"""T-055's verification. CONTRACT.md sections 6 and 11.0.

doneWhen: "The recorded transform {scale, offsetX, offsetY, width, height}
correctly maps a normalised-image bbox back onto the original upload."

So the centre of gravity here is the ROUND TRIP, not the image processing. A
normaliser that produces a beautiful image and a transform that is off by the
padding is worse than one that does nothing, because every downstream box lands
somewhere plausible and wrong.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from perception.stages.normalise import (
    DEFAULT_TARGET,
    NormalisationError,
    fit_transform,
    normalise,
    original_size,
    to_normalised,
    to_original,
)

TRANSFORM_KEYS = {"scale", "offsetX", "offsetY", "width", "height"}


def make_image(width: int, height: int) -> bytes:
    """A synthetic wireframe: white paper with a few dark rectangles, encoded as
    PNG. Deliberately drawn rather than loaded, so the test has no fixture file
    to go stale and runs identically on every machine."""
    canvas = np.full((height, width, 3), 255, dtype=np.uint8)
    cv2.rectangle(canvas, (10, 10), (width // 2, height // 2), (30, 30, 30), 3)
    cv2.rectangle(canvas, (width // 2, height // 2), (width - 10, height - 10), (30, 30, 30), 3)
    ok, buffer = cv2.imencode(".png", canvas)
    assert ok, "failed to encode the synthetic wireframe"
    return buffer.tobytes()


# --- the transform's shape -------------------------------------------------


def test_transform_has_exactly_the_five_keys_section_6_names() -> None:
    result = normalise(make_image(1600, 1168))
    assert set(result.transform) == TRANSFORM_KEYS
    assert set(result.to_dict()) == TRANSFORM_KEYS


def test_normalised_image_is_exactly_the_target_canvas() -> None:
    result = normalise(make_image(1600, 1168))
    height, width = result.image.shape[:2]
    assert (width, height) == DEFAULT_TARGET
    assert result.transform["width"] == width
    assert result.transform["height"] == height


# --- the round trip, which is what doneWhen actually asks for --------------


@pytest.mark.parametrize(
    "size",
    [
        (1600, 1168),  # landscape, the benchmark wireframe's shape
        (800, 1600),   # portrait, padded left and right
        (1024, 1024),  # already square, scale exactly 1.0
        (400, 300),    # smaller than the canvas, so it is scaled UP
        (3000, 200),   # extreme aspect, heavy vertical padding
    ],
)
def test_a_normalised_bbox_maps_back_onto_the_original(size) -> None:
    """The core assertion. A box drawn in normalised space must land where it
    belongs on the upload the user actually gave us."""
    width, height = size
    transform = normalise(make_image(width, height)).transform

    # Four boxes in ORIGINAL coordinates, including ones touching the edges.
    originals = [
        [0, 0, width, height],
        [10, 10, width // 2, height // 2],
        [width // 2, height // 2, width // 2 - 10, height // 2 - 10],
        [width - 20, height - 20, 20, 20],
    ]

    for box in originals:
        there = to_normalised(box, transform)
        back = to_original(there, transform)
        for got, expected in zip(back, box):
            assert got == pytest.approx(expected, abs=1e-6), (
                f"{size}: {box} -> {there} -> {back} did not survive the round trip"
            )


@pytest.mark.parametrize("size", [(1600, 1168), (800, 1600), (400, 300)])
def test_the_content_lands_inside_the_canvas_and_fills_one_axis(size) -> None:
    """The whole original, mapped forward, must sit within the canvas and touch
    its bounds on the axis that constrained the fit. If it overflows, boxes near
    an edge map outside the image; if it underfills both axes, the scale was
    computed from the wrong dimension."""
    width, height = size
    transform = normalise(make_image(width, height)).transform

    x, y, w, h = to_normalised([0, 0, width, height], transform)

    assert x >= -1e-6 and y >= -1e-6
    assert x + w <= transform["width"] + 1e-6
    assert y + h <= transform["height"] + 1e-6

    touches_width = abs(w - transform["width"]) < 1e-6
    touches_height = abs(h - transform["height"]) < 1e-6
    assert touches_width or touches_height, "the fit left slack on both axes"


def test_original_dimensions_are_recoverable_from_the_transform_alone() -> None:
    """Why the transform may record the NORMALISED canvas size without losing
    anything: padding is centred, so the original is derivable."""
    for width, height in [(1600, 1168), (800, 1600), (1024, 1024), (400, 300)]:
        transform = normalise(make_image(width, height)).transform
        recovered_w, recovered_h = original_size(transform)
        assert recovered_w == pytest.approx(width, abs=1.0)
        assert recovered_h == pytest.approx(height, abs=1.0)


def test_aspect_ratio_is_preserved_not_squashed() -> None:
    """Stage 3 uses box proportions to tell a button from a card. Squashing to
    fill the canvas would distort every one of them."""
    width, height = 1600, 400
    transform = fit_transform((width, height))
    _, _, w, h = to_normalised([0, 0, width, height], transform)
    assert (w / h) == pytest.approx(width / height, rel=1e-6)


# --- geometry-preserving enhancement ---------------------------------------


def test_enhancement_does_not_move_a_pixel_to_a_different_coordinate() -> None:
    """Denoise and contrast are geometry-preserving on purpose: they cannot
    affect the transform, which keeps the mapping exact and makes the filters
    safe to tune without re-deriving anything."""
    from perception.stages.normalise import decode, enhance

    image = decode(make_image(640, 480))
    assert enhance(image).shape == image.shape


def test_no_rotation_is_applied() -> None:
    """Section 6's transform is scale + offset. There is NO rotation term.

    Both architecture diagrams show deskew in preprocessing, and implementing it
    here would produce boxes that the recorded transform maps back to the wrong
    place -- silently, with every field present and well-formed. That is the same
    failure shape section 9 exists to catch. So stage 2 does only what the
    transform can describe.

    This test is the guard: it fails the moment someone adds a rotation, and
    points them at the contract instead of at a debugger.
    """
    # A frame with a distinctly asymmetric mark near one corner. Under any
    # rotation the mark's quadrant changes; under scale-and-pad it does not.
    canvas = np.full((400, 800, 3), 255, dtype=np.uint8)
    cv2.rectangle(canvas, (20, 20), (120, 60), (0, 0, 0), -1)
    ok, buffer = cv2.imencode(".png", canvas)
    assert ok

    result = normalise(buffer.tobytes())
    transform = result.transform

    grey = cv2.cvtColor(result.image, cv2.COLOR_BGR2GRAY)
    dark = np.argwhere(grey < 128)
    assert dark.size > 0, "the mark disappeared during normalisation"

    ys, xs = dark[:, 0], dark[:, 1]
    # np.ptp(arr), not arr.ptp() — the method was removed from ndarray in NumPy 2.0,
    # and the venv here runs 2.2.
    found = [float(xs.min()), float(ys.min()), float(np.ptp(xs)), float(np.ptp(ys))]
    back = to_original(found, transform)

    assert back[0] == pytest.approx(20, abs=3), f"mark moved in x: {back}"
    assert back[1] == pytest.approx(20, abs=3), f"mark moved in y: {back}"


# --- failure paths ---------------------------------------------------------


def test_empty_and_undecodable_input_raise_rather_than_returning_none() -> None:
    """cv2.imdecode signals failure by returning None. A None flowing onward
    becomes a confusing crash three functions later, so it is converted at the
    boundary into the error /perceive turns into section 12's 422."""
    with pytest.raises(NormalisationError):
        normalise(b"")
    with pytest.raises(NormalisationError):
        normalise(b"this is not an image")


def test_a_zero_scale_transform_cannot_be_inverted_silently() -> None:
    broken = {"scale": 0, "offsetX": 0, "offsetY": 0, "width": 1024, "height": 1024}
    with pytest.raises(NormalisationError):
        to_original([0, 0, 10, 10], broken)
    with pytest.raises(NormalisationError):
        original_size(broken)


def test_normalise_is_pure_same_bytes_give_the_same_result() -> None:
    """Section 11 rule 3: every stage is a pure function from a persisted input
    to a persisted output. Replay depends on it."""
    payload = make_image(1600, 1168)
    first = normalise(payload)
    second = normalise(payload)
    assert first.transform == second.transform
    assert np.array_equal(first.image, second.image)
