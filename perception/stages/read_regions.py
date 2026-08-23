"""Stage 3b's second reader: a hosted VLM that reads one region at a time. T-122.

WHY THIS IS NOT A DROP-IN FOR PaddleOCR, and why it does not touch detect_regions.
B-006 measured `qwen3-vl-235b` on our own wireframe against B-003's annotations:

    as a localiser          0 of 7 at IoU 0.5, mean IoU 0.15, stable over 3 runs
    handed OpenCV's boxes   labelled the headline's box "button/SUBMIT" and the
                            description's "label/LABEL"
    reading crops           7 of 7, including the two regions that carry no text
                            and came back empty rather than invented

One deficit, two symptoms: it cannot ground text to coordinates in either
direction. So it is given no coordinates at all. `detect_regions` keeps every box
it finds, each box is cropped, and the model is asked one question about one
picture: what does this say. Geometry stays entirely OpenCV's.

THE SHAPE THAT FOLLOWS FROM THAT. The PaddleOCR path reads the WHOLE PAGE into
lines carrying their own boxes, and `bind_lines` assigns each line to a region by
containment. None of that applies here: there are no lines and no coordinates to
bind, and a region's text is known the moment its crop comes back. So this
returns text PER REGION and `extract_text` uses it directly.

RULE 5 IS THE BINDING CONSTRAINT. `load_region_reader` returns None when no key
is configured, exactly as `load_reader` returns None when PaddleOCR is absent.
With no key, no network and no GPU, stage 3b behaves precisely as it does today.
This is an enhancement above the deterministic path and never a requirement of
it.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Sequence

import numpy as np

# §16.2's budget, inherited from the Node orchestrator rather than invented here.
DEFAULT_TIMEOUT_S = 30.0
MAX_ATTEMPTS = 2

# Breathing room around a crop so a stroke on the boundary is not clipped. The
# detector's boxes hug the ink; a letter's descender often sits on the edge.
CROP_PAD = 12

PURPOSE = "region-text"

PROMPT = (
    "This is a crop from a hand-drawn UI wireframe. Transcribe the handwritten "
    "text in it, exactly as written. If the crop contains no text — an empty box, "
    "a ruled line, a plain shape — reply with an empty string rather than "
    "describing what you see. Reply with STRICT JSON only: {\"text\":\"...\"}"
)


@dataclass
class ModelCall:
    """§16.2's per-call record: { purpose, model, ms, attempts, ok }."""

    purpose: str
    model: str
    ms: int
    attempts: int
    ok: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "purpose": self.purpose,
            "model": self.model,
            "ms": self.ms,
            "attempts": self.attempts,
            "ok": self.ok,
        }


@dataclass
class RegionReading:
    """One region's answer. `text` is None when the call failed outright.

    An empty STRING and None are different facts and are kept apart for the same
    reason `Extraction.ocr_available` exists: "the model read this and there was
    nothing" and "the model never answered" lead to different warnings and
    different degradation.
    """

    text: str | None
    ok: bool
    call: ModelCall


@dataclass
class RegionReader:
    """Reads the text inside a cropped region, one call per region.

    `transport` is injectable so every test drives this without a network, and so
    swapping providers is a change to one function rather than to each call site.
    """

    model: str
    transport: Callable[[bytes], str]
    timeout_s: float = DEFAULT_TIMEOUT_S
    max_attempts: int = MAX_ATTEMPTS
    calls: list[ModelCall] = field(default_factory=list)

    def read(self, crop_png: bytes) -> RegionReading:
        started = time.perf_counter()
        attempts = 0
        text: str | None = None
        ok = False

        while attempts < self.max_attempts:
            attempts += 1
            try:
                text = _parse_text(self.transport(crop_png))
                ok = True
                break
            except Exception:  # noqa: BLE001 - a model failure is never an exception here
                # §12 and rule 5: a failed read degrades this region, it does not
                # stop the page. The reason reaches the caller through `ok`.
                text = None

        call = ModelCall(
            purpose=PURPOSE,
            model=self.model,
            ms=int((time.perf_counter() - started) * 1000),
            attempts=attempts,
            ok=ok,
        )
        self.calls.append(call)
        return RegionReading(text=text, ok=ok, call=call)


def _parse_text(content: str) -> str:
    """Pull the transcription out of a reply that may be fenced or chatty.

    A model that answers correctly and wraps it in ```json is a formatting
    problem, and treating that as a failed read would record a modelling failure
    that did not happen.
    """
    body = content.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)```", body, re.S)
    if fenced:
        body = fenced.group(1).strip()
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        braced = re.search(r"\{.*\}", body, re.S)
        if not braced:
            # Not JSON at all. The bare reply is the most useful reading of it.
            return body
        parsed = json.loads(braced.group(0))

    value = parsed.get("text", "") if isinstance(parsed, dict) else ""
    return value if isinstance(value, str) else ""


# A region small enough that no handwriting fits in it. MEASURED on the reference
# wireframe, where the areas separate cleanly:
#
#     49,590  the HEADLINE box          real
#     36,366  the SUB HEADLINE box      real
#     16,758  the Image box             real
#      7,290  the SUBMIT box            real
#      4,508  the LABEL mark            real
#     -----------------------------------------  3,000
#      2,520  "LINE"                    a piece of SUB HEADLINE
#      1,032  "1EA"                     a piece of SUB HEADLINE
#        884  "H"                       a piece of HEADLINE
#        558  "MIT"                     a piece of SUBMIT
#
# The floor does double duty: it skips fragments, AND it is the size at which a
# region counts as a CHILD for the container rule below. Both matter. At 1,200 the
# 2,520-area "LINE" fragment counted as a child, which made the real SUB HEADLINE
# box look like a wrapper and dropped it in favour of its own fragment.
MIN_READABLE_AREA = 3000


def readable_regions(regions: Sequence[Any]) -> list[int]:
    """Which regions are worth spending a call on. Returns indices.

    MEASURED, NOT GUESSED. Stage 3a returns 35 regions for a wireframe with seven
    real elements — B-003 says so and calls the ratio out — and reading all 35
    cost 65 seconds and produced three kinds of answer:

        the seven real elements   HEADLINE, SUB HEADLINE, LABEL, SUBMIT, Image
                                  on exactly the right boxes
        the whole-page container   every one of those words concatenated, which
                                  downstream is worse than nothing because it
                                  matches every keyword slot at once
        stroke fragments           "H", "e", "MIT", "LA", "eA", plus two outright
                                  hallucinations on crops with no text in them

    Both failure classes are geometric, so both are filtered geometrically rather
    than by post-processing the model's answers — a text heuristic would be
    guessing at which words are real, which is the model's job and not ours.

      * A CONTAINER is skipped. A region wholly containing another region is a
        wrapper, and its text is its children's text merged.
      * A FRAGMENT is skipped. Below MIN_READABLE_AREA nothing legible fits, and
        asking a model to read an empty sliver is how a hallucination gets in.

    This is a cost and quality filter, not a correctness one: a skipped region
    keeps its geometry and simply has no text, which is the same state as a
    region the reader failed on.
    """
    boxes = [tuple(int(v) for v in r.bbox) for r in regions]
    keep: list[int] = []

    for i, (x, y, w, h) in enumerate(boxes):
        if w * h < MIN_READABLE_AREA:
            continue

        contains_another = False
        for j, (ox, oy, ow, oh) in enumerate(boxes):
            if i == j or ow * oh < MIN_READABLE_AREA:
                continue
            # Strictly larger, and fully covering the other box.
            if ox >= x and oy >= y and ox + ow <= x + w and oy + oh <= y + h and (ow * oh) < (w * h):
                contains_another = True
                break
        if contains_another:
            continue

        keep.append(i)

    return keep


def crop_png(image: np.ndarray, bbox: tuple[int, int, int, int], pad: int = CROP_PAD) -> bytes:
    """One region of the NORMALISED canvas, as PNG bytes.

    Coordinates are stage 2's, which is the space `detect_regions` returns and the
    space `image` is in. No conversion happens here on purpose: a coordinate
    transform hidden inside a reader is how an off-by-one crop becomes a model
    quality problem in the write-up.
    """
    from PIL import Image  # local: only this path needs imaging

    height, width = image.shape[:2]
    x, y, w, h = (int(v) for v in bbox)
    left, top = max(x - pad, 0), max(y - pad, 0)
    right, bottom = min(x + w + pad, width), min(y + h + pad, height)
    if right <= left or bottom <= top:
        raise ValueError(f"empty crop for bbox {bbox} on a {width}x{height} image")

    array = image[top:bottom, left:right]
    # OpenCV hands us BGR; PIL expects RGB. Getting this backwards does not throw,
    # it just quietly sends the model a colour-swapped picture.
    if array.ndim == 3 and array.shape[2] == 3:
        array = array[:, :, ::-1]

    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG")
    return buffer.getvalue()


def _openai_transport(base_url: str, api_key: str, model: str, timeout_s: float) -> Callable[[bytes], str]:
    """The only function here that opens a socket.

    OpenAI-compatible, which is what the Node orchestrator already speaks and what
    Bedrock serves at /openai/v1 — so the same three environment variables
    configure both halves of this system.
    """

    endpoint = base_url.rstrip("/") + f"/model/{model}/invoke"

    def transport(png: bytes) -> str:
        body = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "data:image/png;base64," + base64.b64encode(png).decode()
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 100,
            "temperature": 0,
        }
        request = urllib.request.Request(
            endpoint,
            data=json.dumps(body).encode(),
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + api_key,
            },
        )
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            payload = json.loads(response.read())
        return payload["choices"][0]["message"]["content"]

    return transport


def load_region_reader(env: dict[str, str] | None = None) -> RegionReader | None:
    """Build a reader from the environment, or return None when none is configured.

    RETURNS None RATHER THAN RAISING, for the same reason `load_reader` does:
    absence is a SUPPORTED STATE. AGENTS.md rule 5 — generation may never require
    a key, a GPU or a network — so the whole of this module is unreachable on the
    path the demo runs on, and that is by design rather than by accident.
    """
    source = os.environ if env is None else env

    api_key = (source.get("LLM_API_KEY") or "").strip()
    base_url = (source.get("LLM_BASE_URL") or "").strip()
    model = (source.get("VLM_MODEL") or source.get("LLM_VISION_MODEL") or "").strip()

    if not (api_key and base_url and model):
        return None

    return RegionReader(
        model=model,
        transport=_openai_transport(base_url, api_key, model, DEFAULT_TIMEOUT_S),
    )
