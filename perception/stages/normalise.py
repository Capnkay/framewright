"""Stage 2 — preprocessing-normalization. CONTRACT.md sections 11.0 and 6.

Takes the raw upload and produces a normalised image plus the transform that maps
between the two coordinate spaces.

WHY THE TRANSFORM IS THE DELIVERABLE, NOT THE IMAGE. Section 6:

    `bbox` coordinate space is the normalised image. The normaliser is therefore
    required to record its transform in the stage-2 trace ... so any consumer can
    map a box back onto the original upload. A bbox without a recorded transform
    is unusable by anyone who did not write the normaliser -- and the person who
    did is on a different machine.

Every box stage 3 produces is in normalised space. Without an exact transform,
none of them can be drawn on the wireframe a judge is looking at.

WHAT THIS STAGE DELIBERATELY DOES NOT DO: DESKEW.
-------------------------------------------------
Both architecture diagrams show deskew as part of preprocessing, and it is a
reasonable thing to want. It is not implemented here, and the reason is the
contract rather than the effort.

Section 6 fixes the transform's shape as `{scale, offsetX, offsetY, width,
height}`. That is a similarity transform WITHOUT ROTATION. A deskew rotates the
image, and a rotation cannot be expressed in those five numbers -- so a deskewing
normaliser would produce boxes that the recorded transform maps back to the WRONG
PLACE on the original, silently, with every field present and well-formed.

That failure has the same shape as the one section 9 exists to catch: everything
validates, nothing is missing, and the answer is quietly wrong. So stage 2 does
only what the transform can describe. Rotation needs an additive contract field
before it can be implemented; logged as a gap in docs/corrections/REGISTER.md.

Wireframes arriving as PNG exports or screenshots -- the case the brief describes
-- are not skewed. A photograph of a whiteboard is, and that is when this matters.

THE TRANSFORM'S DIRECTION, stated once so nobody has to infer it:

    normalised = original * scale + offset
    original   = (normalised - offset) / scale

`width` and `height` describe the NORMALISED canvas, because that is the space
bboxes live in and the space a consumer needs to know the extent of. The original
dimensions are recoverable from the same five numbers -- padding is centred, so
`original_w = (width - 2 * offsetX) / scale` -- so recording the normalised size
loses nothing and describes the more useful space.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

# The normalised canvas. Wide enough that a 1920-wide hero loses little detail,
# small enough that stage 3 runs quickly on a 6 GB card.
DEFAULT_TARGET = (1024, 1024)


class NormalisationError(ValueError):
    """The upload could not be decoded. Surfaces as section 12's 422 PARSE_FAILURE."""


@dataclass(frozen=True)
class Normalised:
    """Stage 2's output. Frozen because section 11 rule 1 makes trace records
    append-only, and a mutable result invites a later stage to edit history."""

    image: np.ndarray
    transform: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """The transform as it appears in the stage-2 trace and in /perceive's
        `normalisation` field. The image is NOT included -- section 11.2 makes
        artifacts Node-owned, and the caller decides how to hand the pixels over."""
        return dict(self.transform)


def decode(image_bytes: bytes) -> np.ndarray:
    """Decode an upload into a BGR array.

    Raises NormalisationError rather than returning None, because cv2.imdecode
    signals failure by returning None and a None that flows onward becomes a
    confusing crash three functions later.
    """
    if not image_bytes:
        raise NormalisationError("The uploaded image is empty.")

    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise NormalisationError(
            "Could not decode the uploaded image. Accepted types are PNG, JPEG and WebP "
            "(section 13.1)."
        )
    return image


def enhance(image: np.ndarray) -> np.ndarray:
    """Denoise and correct contrast. Geometry-preserving, on purpose.

    Nothing here moves a pixel to a different coordinate, so nothing here affects
    the transform. That separation is deliberate: it keeps the mapping exact and
    makes this function safe to tune without re-deriving anything.

    CLAHE on the L channel rather than a global equalisation, because a wireframe
    is mostly white with thin dark strokes -- a global histogram stretch on that
    distribution amplifies paper texture into false edges, which is exactly the
    input contour detection is worst on.
    """
    denoised = cv2.bilateralFilter(image, d=5, sigmaColor=50, sigmaSpace=50)

    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    lightness, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    merged = cv2.merge((clahe.apply(lightness), a_channel, b_channel))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def fit_transform(
    original_size: tuple[int, int], target: tuple[int, int] = DEFAULT_TARGET
) -> dict[str, Any]:
    """The transform for letterboxing `original_size` into `target`.

    Split out from the resize so it is testable on its own and so the arithmetic
    lives in exactly one place. `original_size` and `target` are (width, height).

    Aspect ratio is preserved and the content is centred, so a square-ish
    wireframe in a tall canvas gets equal padding top and bottom. Squashing to
    fill the canvas would be simpler and would distort every bbox's aspect, which
    matters because stage 3 uses box proportions to tell a button from a card.
    """
    original_w, original_h = original_size
    target_w, target_h = target

    if original_w <= 0 or original_h <= 0:
        raise NormalisationError(f"Image has a zero dimension: {original_w}x{original_h}.")

    scale = min(target_w / original_w, target_h / original_h)

    scaled_w = int(round(original_w * scale))
    scaled_h = int(round(original_h * scale))

    return {
        "scale": scale,
        "offsetX": (target_w - scaled_w) / 2,
        "offsetY": (target_h - scaled_h) / 2,
        "width": target_w,
        "height": target_h,
    }


def normalise(image_bytes: bytes, target: tuple[int, int] = DEFAULT_TARGET) -> Normalised:
    """Stage 2, end to end. Pure: same bytes in, same array and transform out.

    Section 11 rule 3 -- every stage is a pure function from a persisted input to
    a persisted output. Nothing here reads the clock, the filesystem, or the
    network, which is also what makes replay (section 11) mean anything.
    """
    image = decode(image_bytes)
    enhanced = enhance(image)

    original_h, original_w = enhanced.shape[:2]
    transform = fit_transform((original_w, original_h), target)

    scaled_w = int(round(original_w * transform["scale"]))
    scaled_h = int(round(original_h * transform["scale"]))

    # INTER_AREA when shrinking, INTER_CUBIC when growing. Shrinking a line
    # drawing with an interpolating filter drops thin strokes entirely -- a 1px
    # wireframe border can vanish, and contour detection then finds no box where
    # a judge can plainly see one.
    interpolation = cv2.INTER_AREA if transform["scale"] < 1.0 else cv2.INTER_CUBIC
    resized = cv2.resize(enhanced, (scaled_w, scaled_h), interpolation=interpolation)

    target_w, target_h = target
    canvas = np.full((target_h, target_w, 3), 255, dtype=np.uint8)  # white, like paper

    top = int(round(transform["offsetY"]))
    left = int(round(transform["offsetX"]))
    canvas[top : top + scaled_h, left : left + scaled_w] = resized

    return Normalised(image=canvas, transform=transform)


# --- mapping between the two coordinate spaces -----------------------------
#
# These two functions are the reason stage 2 exists. Everything downstream that
# wants to show a judge where a detection landed goes through them.


def to_original(bbox: list[float], transform: dict[str, Any]) -> list[float]:
    """Map `[x, y, w, h]` from normalised space back onto the original upload.

    This is the direction that matters: stage 3 produces boxes in normalised
    space, and the human-in-the-loop overlay (section 11.3) draws them on the
    wireframe the user actually uploaded.
    """
    x, y, w, h = bbox
    scale = transform["scale"]
    if scale == 0:
        raise NormalisationError("Transform has a zero scale; it cannot be inverted.")

    return [
        (x - transform["offsetX"]) / scale,
        (y - transform["offsetY"]) / scale,
        w / scale,
        h / scale,
    ]


def to_normalised(bbox: list[float], transform: dict[str, Any]) -> list[float]:
    """The inverse of `to_original`. Present so the round trip is testable in
    both directions rather than only the one we happen to use."""
    x, y, w, h = bbox
    scale = transform["scale"]
    return [
        x * scale + transform["offsetX"],
        y * scale + transform["offsetY"],
        w * scale,
        h * scale,
    ]


def original_size(transform: dict[str, Any]) -> tuple[float, float]:
    """Recover the original upload's dimensions from the transform alone.

    Padding is centred, so the content occupies `width - 2 * offsetX` of the
    canvas. This is why recording the NORMALISED canvas size in the transform
    costs nothing -- the original is derivable, and the normalised extent is the
    one a bbox consumer actually needs.
    """
    scale = transform["scale"]
    if scale == 0:
        raise NormalisationError("Transform has a zero scale; it cannot be inverted.")
    return (
        (transform["width"] - 2 * transform["offsetX"]) / scale,
        (transform["height"] - 2 * transform["offsetY"]) / scale,
    )
