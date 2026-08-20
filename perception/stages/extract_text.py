"""Stage 3b -- text extraction with PaddleOCR, bound to detected regions.

CONTRACT.md sections 12, 10 and 3.

Stage 3 is "multimodal-understanding" (section 11.0). T-056 is its first half --
find WHERE the things are. This is the second half: read what is written inside
them, and attach each piece of text TO THE REGION IT CAME FROM.

THE BINDING IS THE WHOLE TASK, and it is worth being blunt about why. An OCR call
over a wireframe returns a bag of strings with coordinates. A bag of strings is
almost useless to the thing downstream: section 3 gives every element its own
`default` copy, and T-057 has to decide which words are the headline and which are
the button label. If stage 3b hands fusion a page-level list, fusion has to redo the
geometry that stage 3a already did, using worse information. So the output shape
here is one text per region, never a page transcript.

WHICH REGION A LINE BELONGS TO, when regions nest. A card sits inside a container;
both contain the same words geometrically. The line belongs to the SMALLEST region
that holds it -- the most specific box wins, because that is the one that becomes an
element. Ties break on region order, which stage 3a already made total, so the
binding is deterministic for a given detection set.

CONFIDENCE. Section 10's bands are read as "how sure are we about this element", and
T-056's geometric support measures something different -- how completely the ink
backs up the box. Where text is found, the OCR score is the better answer to the
question section 10 is actually asking, so it replaces the geometric one. T-056's
module docstring says exactly this, and it is recorded here so the two halves cannot
drift apart. The geometric value is NOT discarded: it stays on the region, and both
travel to the trace, because a reader diagnosing a bad element needs to know whether
the box was wrong or the reading was.

A region with no text keeps its geometric confidence and carries `text = None`. It
does not carry `""`. Section 10 forbids a fabricated number and the same reasoning
forbids a fabricated string: an empty string is a claim that the box was read and
found blank, which is not what happened.

The aggregate is a LENGTH-WEIGHTED mean of the line scores, not a plain mean. A
region holding "SUBSCRIBE" at 0.99 and a stray "l" at 0.20 is not 60% legible.
Weighting by character count lets the substantive reading dominate, which is what a
human means by "how well did we read this box".

DEGRADATION IS A CONTRACT REQUIREMENT, NOT A COURTESY. Section 12: "Prompt mode and
the CMS contract must remain fully demonstrable with the Python service stopped, the
GPU absent, and no network." PaddleOCR is a heavy optional dependency and the demo
machine may not have it. So its absence degrades to regions-without-text and a
warning -- never an exception, never an empty region list. `extract_text` has no
raising path at all: an OCR engine that throws mid-page is caught and reported the
same way, because a stage that dies takes the whole generation with it and a stage
that degrades does not.

INSTALLING IT (docs/EDGE-CASES.md EC-013, and this is not optional advice):

    perception/.venv/Scripts/python -m pip install -c perception/constraints.txt \\
        paddleocr paddlepaddle-gpu

The `-c` flag is load-bearing. Installing ANY package that depends on torch lets pip
resolve torch from PyPI, where the only wheel is the CPU build -- `pip install
transformers` has already destroyed a working CUDA install in this repository once.

PURITY. Section 11 rule 3, same as stage 3a: a pure function of its persisted input.
Nothing here reads the clock, the filesystem or the network. The OCR reader is an
injected argument precisely so that this module can be tested -- and reasoned about
-- without one.

COORDINATE SPACE. Every bbox is `[x, y, w, h]` in the NORMALISED image, per section
6 -- the same space stage 3a's regions are in, which is what makes the binding a
plain geometric comparison rather than a transform.
"""

from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

import numpy as np

from .detect_regions import Region

# A line must have at least this much of its own area inside a region before it is
# considered to belong to that region. Well below 1.0 because OCR boxes routinely
# overhang a drawn rectangle by a pixel or two -- the text is written ON the line of
# the box as often as inside it. Well above 0.0 so a line merely near a region does
# not get swallowed by it.
MIN_CONTAINMENT = 0.5

# Two lines are on the same visual row when their vertical centres differ by less
# than this multiple of the shorter line's height. Used only for reading order.
ROW_TOLERANCE = 0.6


@dataclass(frozen=True)
class TextLine:
    """One line as the OCR engine reported it, in normalised space.

    Frozen for stage 3a's reason: section 11 rule 1 makes trace records
    append-only, and a mutable reading invites a later stage to quietly edit what
    stage 3 claimed to have read.
    """

    text: str
    bbox: tuple[int, int, int, int]  # [x, y, w, h], NORMALISED space (section 6)
    confidence: float  # the engine's own score; never synthesised

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "bbox": list(self.bbox),
            "confidence": self.confidence,
        }


@dataclass(frozen=True)
class RegionText:
    """A stage-3a region with whatever stage 3b managed to read inside it."""

    region: Region
    text: str | None  # None means "not read", never "" -- see the module docstring
    confidence: float | None  # OCR score where text was found, else None
    lines: tuple[TextLine, ...] = ()

    @property
    def effective_confidence(self) -> float:
        """What section 10's bands should be applied to for this region.

        The OCR score where there is text, the geometric score where there is not.
        Both are real measurements; neither is a constant.
        """
        return self.region.confidence if self.confidence is None else self.confidence

    def to_dict(self) -> dict[str, Any]:
        """The shape that goes into the stage-3 trace artifact, inline per 11.2.

        BOTH confidences are carried. `confidence` is the one section 10 acts on;
        `geometricConfidence` is stage 3a's, kept so a reader diagnosing a bad
        element can tell a mis-drawn box from a mis-read word.
        """
        return {
            **self.region.to_dict(),
            "text": self.text,
            "confidence": self.effective_confidence,
            "geometricConfidence": self.region.confidence,
            "textConfidence": self.confidence,
            "lines": [line.to_dict() for line in self.lines],
        }


@dataclass(frozen=True)
class Extraction:
    """Stage 3b's whole result.

    `ocr_available` is stated rather than inferred from an empty `regions` list: a
    page where OCR ran and found nothing and a page where OCR never ran are
    different facts, and the degradation path in section 12 depends on telling
    them apart.
    """

    regions: tuple[RegionText, ...]
    unbound: tuple[TextLine, ...] = ()
    warnings: tuple[str, ...] = ()
    ocr_available: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "regions": [r.to_dict() for r in self.regions],
            "unbound": [line.to_dict() for line in self.unbound],
            "warnings": list(self.warnings),
            "ocrAvailable": self.ocr_available,
        }


# --- the reader ------------------------------------------------------------


def load_reader(
    *, lang: str = "en", use_gpu: bool | None = None, out_of_process: bool = True
) -> Any | None:
    """Build a PaddleOCR reader, or return None if PaddleOCR is not installed.

    Returns None rather than raising because absence is a SUPPORTED STATE here,
    not an error -- section 12 requires the pipeline to run with the GPU absent.
    The caller distinguishes the two cases from `Extraction.ocr_available`.

    Not cached. A module-level cache would make this function impure and would
    hold a large model alive for the life of the process even when a single
    request wanted it; the service layer owns that decision, not this stage.
    """
    if out_of_process:
        # THE DEFAULT, per EC-014. In-process PaddleOCR cannot work anywhere torch
        # is loaded, and it is loaded in the service. Availability is probed by
        # asking the worker to read a 1x1 image: importable-here says nothing about
        # runnable-there, and a reader that constructs but cannot read is worse than
        # no reader, because it reports success and returns nothing.
        return SubprocessReader() if _worker_is_usable() else None

    try:
        from paddleocr import PaddleOCR  # noqa: PLC0415 - optional by design
    except Exception:
        # DELIBERATELY NOT `except ImportError`, and this is not defensive
        # padding -- it was caught by installing the thing for real. On this
        # repository's GPU machine, `from paddleocr import PaddleOCR` raises
        #
        #     OSError: [WinError 127] ... Error loading ... torch\lib\shm.dll
        #
        # because paddleocr 2.10 pulls in albumentations, which imports torch,
        # and torch will not load into a process that has already initialised
        # paddle. An OSError is not an ImportError, so a narrower except here
        # let a DLL-loading failure escape as a stage crash -- precisely the
        # outcome section 12 forbids. See docs/EDGE-CASES.md EC-014.
        return None

    kwargs: dict[str, Any] = {"lang": lang}
    if use_gpu is not None:
        kwargs["use_gpu"] = use_gpu

    try:
        return PaddleOCR(**kwargs)
    except TypeError:
        # PaddleOCR's constructor signature has changed across 2.x and 3.x --
        # `use_gpu` and `use_angle_cls` have both come and gone. Falling back to
        # the bare constructor beats pinning a signature we do not control.
        try:
            return PaddleOCR(lang=lang)
        except Exception:
            return None
    except Exception:
        # A present-but-broken install (a missing paddle backend, a bad model
        # download) degrades exactly like an absent one. Section 12 again.
        return None


class SubprocessReader:
    """A reader that runs PaddleOCR in a separate interpreter. EC-014.

    Duck-types the part of PaddleOCR that `read_lines` uses -- a single `.ocr(image)`
    returning the 2.x shape -- so nothing downstream knows or cares that the work
    happened in another process.

    WHY THIS EXISTS. torch and paddle cannot share an interpreter, and the perception
    service loads torch to report its device on /health. A process boundary is the
    only place both can exist in one pipeline. `perception/stages/ocr_worker.py`
    carries the full account, including why being a separate process is necessary but
    not sufficient.

    THE IMAGE GOES VIA A TEMPORARY FILE, which is worth defending because this module
    is otherwise careful to touch no filesystem. Section 11 rule 3 binds the STAGE --
    `extract_text` is a pure function of its persisted input -- and the reader is an
    injected collaborator, exactly like a real PaddleOCR instance that reads model
    weights off disk. The temp file is created, used and removed inside one call, so
    it is not state: two identical calls still produce identical output.

    Never raises. A worker that dies, hangs, or prints something unparseable yields no
    lines, and `extract_text` degrades to regions-without-text per section 12.
    """

    def __init__(self, *, python: str | None = None, timeout: float = 180.0) -> None:
        # sys.executable by default: the interpreter running the service is the one
        # with paddleocr installed. Overridable so a future dedicated OCR venv is a
        # constructor argument rather than a rewrite.
        self.python = python or sys.executable
        self.timeout = timeout

    def ocr(self, image, cls=None):  # noqa: ARG002 - signature parity with PaddleOCR 2.x
        import cv2  # noqa: PLC0415 - only needed on this path

        tmp = tempfile.mkdtemp(prefix="framewright-ocr-")
        path = os.path.join(tmp, "page.png")
        try:
            if not cv2.imwrite(path, image):
                return [None]
            proc = subprocess.run(
                [self.python, "-m", "perception.stages.ocr_worker", path],
                capture_output=True,
                text=True,
                timeout=self.timeout,
                # cwd is the repo root so `-m perception.stages...` resolves. Derived
                # from this file's location rather than the caller's cwd, because a
                # service started from another directory must still find the worker.
                cwd=str(pathlib.Path(__file__).resolve().parents[2]),
            )
            payload = json.loads((proc.stdout or "").strip().splitlines()[-1])
        except Exception:
            # Timeout, crash, empty stdout, unparseable JSON -- all the same fact to
            # the caller: this page was not read.
            return [None]
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        if not payload.get("ok"):
            return [None]

        # Back into PaddleOCR's 2.x shape so _lines_from_result stays the one parser.
        return [[
            [
                [
                    [b[0], b[1]], [b[0] + b[2], b[1]],
                    [b[0] + b[2], b[1] + b[3]], [b[0], b[1] + b[3]],
                ],
                (line["text"], line["confidence"]),
            ]
            for line in payload.get("lines", [])
            for b in [line["bbox"]]
        ]]


def _worker_is_usable(python: str | None = None) -> bool:
    """Can the worker actually read? Asked once, by giving it a tiny real image.

    Not `importlib.util.find_spec("paddleocr")`. On this machine paddleocr imports
    cleanly in the parent and then fails to run, which is precisely the case a
    presence check calls available. The probe costs one subprocess and buys a true
    answer.
    """
    import numpy as _np  # noqa: PLC0415

    reader = SubprocessReader(python=python, timeout=240.0)
    probe_image = _np.full((32, 96, 3), 255, dtype=_np.uint8)
    try:
        return reader.ocr(probe_image) != [None]
    except Exception:
        return False


def _poly_to_bbox(points: Iterable[Sequence[float]]) -> tuple[int, int, int, int]:
    """A 4-point OCR polygon to `[x, y, w, h]`, integer, section 6's shape.

    Uses the axis-aligned bounding box of the polygon: PaddleOCR returns a
    quadrilateral that is very slightly rotated even on straight text, and the IR
    has no representation for a rotated box.
    """
    pts = np.asarray(list(points), dtype=float).reshape(-1, 2)
    x0, y0 = pts.min(axis=0)
    x1, y1 = pts.max(axis=0)
    return (
        int(round(x0)),
        int(round(y0)),
        max(1, int(round(x1 - x0))),
        max(1, int(round(y1 - y0))),
    )


def _lines_from_result(result: Any) -> list[TextLine]:
    """Normalise PaddleOCR's output into TextLines, across its shape changes.

    THIS FUNCTION EXISTS BECAUSE THE RETURN SHAPE IS NOT STABLE. PaddleOCR 2.x's
    `.ocr()` returns one entry per image, each a list of
    `[polygon, (text, score)]`; on a page with no text it returns `[None]`, which
    is not an empty list and will happily raise on iteration. 3.x's `.predict()`
    returns dicts keyed `rec_texts` / `rec_scores` / `rec_polys` (or `dt_polys`).
    Pinning one shape means the stage breaks on a machine that installed the other
    version, and the error surfaces three frames inside a vendor package.

    Anything unrecognisable yields no lines rather than an exception -- consistent
    with the rest of this module, where a bad reading degrades and never throws.
    """
    lines: list[TextLine] = []
    if result is None:
        return lines

    # --- 3.x: a list of per-image dicts ---
    if isinstance(result, dict):
        result = [result]
    if isinstance(result, list) and result and isinstance(result[0], dict):
        for page in result:
            if not isinstance(page, dict):
                continue
            texts = page.get("rec_texts") or []
            scores = page.get("rec_scores") or []
            polys = page.get("rec_polys")
            if polys is None:
                polys = page.get("dt_polys") or []
            for text, score, poly in zip(texts, scores, polys):
                if not str(text).strip():
                    continue
                lines.append(
                    TextLine(str(text).strip(), _poly_to_bbox(poly), float(score))
                )
        return lines

    # --- 2.x: [[ [poly, (text, score)], ... ]], or [None] for an empty page ---
    pages = result if isinstance(result, list) else [result]
    for page in pages:
        if not page:
            continue
        for entry in page:
            try:
                poly, payload = entry[0], entry[1]
                text, score = payload[0], payload[1]
            except (TypeError, IndexError, KeyError):
                continue
            if not str(text).strip():
                continue
            lines.append(
                TextLine(str(text).strip(), _poly_to_bbox(poly), float(score))
            )
    return lines


def read_lines(image: np.ndarray, reader: Any) -> list[TextLine]:
    """Run the reader over the whole page and return normalised lines.

    ONE CALL FOR THE PAGE, not one per region, and the reason is accuracy rather
    than speed. OCR detection models use surrounding context to find text
    baselines; a 40x18 crop of a button label, blown up in isolation, reads worse
    than the same label read as part of the page. Binding afterwards costs a
    geometric comparison and loses nothing.
    """
    if reader is None:
        return []

    # 2.x exposes .ocr(); 3.x renamed it to .predict() and deprecated the `cls`
    # keyword. Try the modern spelling first, then the older ones.
    attempts: list[Callable[[], Any]] = []
    if hasattr(reader, "predict"):
        attempts.append(lambda: reader.predict(image))
    if hasattr(reader, "ocr"):
        attempts.append(lambda: reader.ocr(image))
        attempts.append(lambda: reader.ocr(image, cls=True))

    for call in attempts:
        try:
            return _lines_from_result(call())
        except TypeError:
            continue  # wrong signature for this version; try the next spelling
        except Exception:
            return []  # a genuine engine failure degrades, per section 12
    return []


# --- binding ---------------------------------------------------------------


def _containment(line: tuple[int, int, int, int], region: tuple[int, int, int, int]) -> float:
    """Fraction of the LINE's area that lies inside the region.

    Deliberately not IoU. A headline occupies a tiny fraction of the hero box that
    contains it, so IoU is near zero for exactly the pairing we most want to make.
    The question is "is this text inside that box", which is one-directional.
    """
    lx, ly, lw, lh = line
    rx, ry, rw, rh = region
    ox = max(0, min(lx + lw, rx + rw) - max(lx, rx))
    oy = max(0, min(ly + lh, ry + rh) - max(ly, ry))
    area = float(lw * lh)
    if area <= 0:
        return 0.0
    return (ox * oy) / area


def _reading_order(lines: Sequence[TextLine]) -> list[TextLine]:
    """Top-to-bottom, then left-to-right within a row.

    Sorting on `y` alone scrambles any two words side by side whose boxes differ
    by a pixel; sorting on `(y, x)` does the same. So lines are banded into rows
    first, using a tolerance proportional to line height, and ordered within the
    band. Ties fall back to the text itself, so the order is total -- two lines at
    identical coordinates must not depend on input order.
    """
    if not lines:
        return []

    remaining = sorted(lines, key=lambda ln: (ln.bbox[1], ln.bbox[0], ln.text))
    ordered: list[TextLine] = []
    while remaining:
        first = remaining[0]
        fy = first.bbox[1] + first.bbox[3] / 2.0
        row = [
            ln
            for ln in remaining
            if abs((ln.bbox[1] + ln.bbox[3] / 2.0) - fy)
            <= ROW_TOLERANCE * min(first.bbox[3], ln.bbox[3])
        ]
        row.sort(key=lambda ln: (ln.bbox[0], ln.text))
        ordered.extend(row)
        remaining = [ln for ln in remaining if ln not in row]
    return ordered


def _aggregate_confidence(lines: Sequence[TextLine]) -> float | None:
    """Length-weighted mean of the line scores. See the module docstring."""
    if not lines:
        return None
    weights = [max(1, len(ln.text)) for ln in lines]
    total = float(sum(weights))
    return float(sum(ln.confidence * w for ln, w in zip(lines, weights)) / total)


def bind_lines(
    lines: Sequence[TextLine],
    regions: Sequence[Region],
    *,
    min_containment: float = MIN_CONTAINMENT,
) -> tuple[list[RegionText], list[TextLine]]:
    """Attach each line to the smallest region that contains it.

    Returns `(region_texts, unbound)` with one RegionText per input region, in the
    input order, so a caller can zip the result back against its detections.

    UNBOUND LINES ARE RETURNED, NOT DROPPED. Text that landed in no region is a
    real signal -- usually a caption outside every drawn box, sometimes a region
    stage 3a missed. Discarding it would hide a detector gap; putting it into a
    page-level `text` field would recreate the bag of strings this module exists
    to avoid. So it is reported separately, and T-057 decides.
    """
    buckets: dict[int, list[TextLine]] = {i: [] for i in range(len(regions))}
    unbound: list[TextLine] = []

    for line in lines:
        best: int | None = None
        best_area = 0
        for i, region in enumerate(regions):
            if _containment(line.bbox, region.bbox) < min_containment:
                continue
            area = region.bbox[2] * region.bbox[3]
            # Smallest wins -- the most specific box is the one that becomes an
            # element. On an exact tie the earlier region wins, and stage 3a's
            # order is already total, so this is deterministic.
            if best is None or area < best_area:
                best, best_area = i, area
        if best is None:
            unbound.append(line)
        else:
            buckets[best].append(line)

    out: list[RegionText] = []
    for i, region in enumerate(regions):
        ordered = _reading_order(buckets[i])
        text = " ".join(ln.text for ln in ordered) if ordered else None
        out.append(
            RegionText(
                region=region,
                text=text,
                confidence=_aggregate_confidence(ordered),
                lines=tuple(ordered),
            )
        )
    return out, _reading_order(unbound)


# --- the stage ------------------------------------------------------------


def extract_text(
    image: np.ndarray,
    regions: Sequence[Region],
    *,
    reader: Any | None = None,
    min_containment: float = MIN_CONTAINMENT,
) -> Extraction:
    """Stage 3b, end to end. `image` is stage 2's NORMALISED canvas.

    `reader` is injected rather than constructed here so the stage stays pure and
    testable: pass `load_reader()` in production, a stub in a test, and None to
    exercise the degradation path that section 12 mandates.

    NEVER RAISES. Every failure -- PaddleOCR absent, a broken install, an engine
    exception mid-page -- produces regions without text and a warning. A stage that
    dies takes the generation with it; a stage that degrades does not, and section
    12 makes that the required behaviour rather than a nicety.
    """
    regions = list(regions)

    if reader is None:
        # Regions WITHOUT text, not an empty result. Every region keeps its
        # geometric confidence and its bbox, so T-057 can still build a layout --
        # it just has no copy to put in it, which is the degraded-but-usable state
        # section 12 describes.
        return Extraction(
            regions=tuple(
                RegionText(region=r, text=None, confidence=None) for r in regions
            ),
            unbound=(),
            warnings=(
                "PaddleOCR is unavailable; regions were detected but not read. "
                "Install it with: pip install -c perception/constraints.txt "
                "paddleocr paddlepaddle-gpu (docs/EDGE-CASES.md EC-013).",
            ),
            ocr_available=False,
        )

    lines = read_lines(image, reader)
    bound, unbound = bind_lines(lines, regions, min_containment=min_containment)

    warnings: list[str] = []
    if not lines:
        warnings.append("OCR ran but found no text in the image.")
    if unbound:
        # Named as a detector signal, not an OCR one, because that is what it
        # usually is: text with no box around it means stage 3a missed a region.
        warnings.append(
            f"{len(unbound)} text line(s) fell outside every detected region; "
            "stage 3a may have missed a region."
        )

    return Extraction(
        regions=tuple(bound),
        unbound=tuple(unbound),
        warnings=tuple(warnings),
        ocr_available=True,
    )
