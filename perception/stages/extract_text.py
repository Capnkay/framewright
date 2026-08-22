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
from .read_regions import RegionReader, crop_png, readable_regions

# A line must have at least this much of its own area inside a region before it is
# considered to belong to that region. Well below 1.0 because OCR boxes routinely
# overhang a drawn rectangle by a pixel or two -- the text is written ON the line of
# the box as often as inside it. Well above 0.0 so a line merely near a region does
# not get swallowed by it.
MIN_CONTAINMENT = 0.5

# Two lines are on the same visual row when their vertical centres differ by less
# than this multiple of the shorter line's height. Used only for reading order.
ROW_TOLERANCE = 0.6

# How many extra times a worker that DIED is re-run before the page is given up on.
# EC-015: on this repository's GPU machine the worker exits 0xC0000005 on roughly two
# runs in three, independently each time -- three back-to-back pipeline runs on the
# reference wireframe read 7 regions, 0 and 0. Two retries takes a 2-in-3 per-attempt
# crash rate to about 1 page in 27 unread, which is the difference between a demo that
# usually shows no text and one that usually does.
#
# ONLY A DEAD WORKER IS RETRIED. A worker that exits cleanly having found nothing has
# answered the question, and re-asking it would burn 5s per attempt to receive the same
# answer -- and would quietly turn a genuinely blank page into a slow one.
WORKER_RETRIES = 2

# Room the OCR worker needs on the scratch drive before it is worth spawning. The
# page itself is a few hundred KB; the rest is PaddleOCR's model cache and paddle's
# own allocations. Deliberately generous: the point is to refuse EARLY and in words,
# not to squeeze the last megabyte out of a drive that is already in trouble.
MIN_SCRATCH_BYTES = 256 * 1024 * 1024


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
    # WHICH READER PRODUCED THIS. T-122 added a second one, and a page read by a
    # hosted model and a page read by PaddleOCR are different facts about the
    # same image -- the same reason `ocr_available` is stated rather than
    # inferred. A run that silently used the cheap reader must not be mistakable
    # for one that used the good one.
    reader_name: str = "paddleocr"
    # Section 16.2's { purpose, model, ms, attempts, ok }, one per model call.
    # Empty on the deterministic path, which makes an empty list itself readable.
    model_calls: tuple[dict[str, Any], ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "regions": [r.to_dict() for r in self.regions],
            "unbound": [line.to_dict() for line in self.unbound],
            "warnings": list(self.warnings),
            "ocrAvailable": self.ocr_available,
            "reader": self.reader_name,
            "modelCalls": [dict(c) for c in self.model_calls],
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

    BUT IT SAYS WHY, which is the whole of EC-015. The first version of this class
    returned `[None]` for every failure and threw the exit code away inside a bare
    `except`, so a worker killed by an access violation and a page with nothing written
    on it arrived at `extract_text` as the same value -- and were reported with the same
    sentence, "OCR ran but found no text in the image." That sentence was false two
    times in three on this machine. `Extraction`'s own docstring makes those two facts
    load-bearing: "a page where OCR ran and found nothing and a page where OCR never ran
    are different facts, and the degradation path in section 12 depends on telling them
    apart." So every failure now records `last_failure`, and a page that was genuinely
    read clears it.

    `last_failure` IS STATE, and it is worth being explicit about why that is allowed.
    Section 11 rule 3 binds the STAGE: `extract_text` must be a pure function of its
    persisted input. The reader is an injected collaborator, and this attribute is
    overwritten at the top of every `ocr` call rather than accumulated, so the value
    read after a call describes that call and nothing earlier.
    """

    def __init__(
        self,
        *,
        python: str | None = None,
        timeout: float = 180.0,
        retries: int = WORKER_RETRIES,
    ) -> None:
        # sys.executable by default: the interpreter running the service is the one
        # with paddleocr installed. Overridable so a future dedicated OCR venv is a
        # constructor argument rather than a rewrite.
        self.python = python or sys.executable
        self.timeout = timeout
        self.retries = max(0, retries)
        # Why the last call came back empty, or None if it did not come back empty.
        # Read by `extract_text` through `getattr`, so a real PaddleOCR instance --
        # which has no such attribute -- keeps working unchanged.
        self.last_failure: str | None = None

    def ocr(self, image, cls=None):  # noqa: ARG002 - signature parity with PaddleOCR 2.x
        """Read one page, retrying a worker that died. Returns the 2.x shape.

        The retry is here rather than in `read_lines` because this is the only layer
        that can tell the two empty answers apart: by the time a result reaches
        `read_lines` a crash and a blank page are both `[None]`.
        """
        self.last_failure = None
        reason: str | None = None

        for attempt in range(1 + self.retries):
            payload, failure = self._run_once(image)
            if failure is None:
                # A page that was read on attempt three was read. The earlier deaths
                # are not this call's outcome, and leaving one in `last_failure` would
                # make a successful read describe itself as a failure.
                return _worker_payload_to_2x(payload)
            # Keep the LAST failure, not the first. If the reasons differ across
            # attempts the final one is what the caller's page actually ended on,
            # and a first-attempt reason would describe a run that was superseded.
            reason = (
                failure if attempt == 0 else f"{failure} (after {attempt + 1} attempts)"
            )

        self.last_failure = reason
        return [None]

    def _run_once(self, image) -> tuple[dict[str, Any] | None, str | None]:
        """One worker invocation. Returns `(payload, None)` or `(None, why_it_failed)`.

        THE EXIT CODE IS INSPECTED, which is the fix EC-015 turns on. The previous
        version parsed stdout inside a `try` and let a non-zero exit pass unexamined,
        so a worker killed mid-run -- which still prints its startup warning to stdout
        before dying -- was indistinguishable from one that finished with nothing to
        say. On Windows the code that matters is 3221225477, and a reader who has not
        seen 0xC0000005 written in decimal will not recognise it, so it is spelled out.
        """
        import cv2  # noqa: PLC0415 - only needed on this path

        tmp = tempfile.mkdtemp(prefix="framewright-ocr-")
        path = os.path.join(tmp, "page.png")
        try:
            # FREE SPACE IS CHECKED BEFORE THE WORKER IS SPAWNED, AND T-131 IS WHY.
            # EC-015 records this worker dying with 0xC0000005 in episodic bursts and
            # says the cause was not found; the standing suspicion was a torch/paddle
            # quarrel over CUDA globals. T-131 tried to reproduce it and could not:
            # 55 runs across three conditions -- sequential, sequential with a live
            # CUDA context held by the parent, and three workers at once -- all clean.
            #
            # What HAD changed between the crash window and those runs is that the
            # drive holding this temp directory went from completely full to having
            # room. That is a correlation and it is labelled as one: nothing here
            # proves a full disk causes an access violation. But the page below is
            # written to that drive, PaddleOCR reads its model cache from it, and a
            # native library that hits ENOSPC mid-write is entirely capable of
            # faulting rather than returning an error.
            #
            # So this does not try to fix a cause it cannot name. It makes the most
            # plausible one LEGIBLE: if the disk is the problem, the next occurrence
            # says so in words instead of arriving as a number nobody recognises.
            free = shutil.disk_usage(tmp).free
            if free < MIN_SCRATCH_BYTES:
                return None, (
                    f"only {free / 1024 / 1024:.0f} MB free on the drive holding "
                    f"{tmp}; the OCR worker needs room for the page and its model "
                    "cache (docs/EDGE-CASES.md EC-015)"
                )

            if not cv2.imwrite(path, image):
                return None, "the page could not be written to a temporary file"
            try:
                proc = subprocess.run(
                    [self.python, "-m", "perception.stages.ocr_worker", path],
                    capture_output=True,
                    text=True,
                    timeout=self.timeout,
                    # cwd is the repo root so `-m perception.stages...` resolves.
                    # Derived from this file's location rather than the caller's cwd,
                    # because a service started from another directory must still find
                    # the worker.
                    cwd=str(pathlib.Path(__file__).resolve().parents[2]),
                )
            except subprocess.TimeoutExpired:
                return None, f"the OCR worker did not answer within {self.timeout:g}s"
            except Exception as exc:  # could not be started at all
                return None, f"the OCR worker could not be started: {exc}"

            code = getattr(proc, "returncode", 0)
            if code:
                return None, f"the OCR worker exited {code}{_exit_note(code)}"

            try:
                payload = json.loads((proc.stdout or "").strip().splitlines()[-1])
            except Exception:
                return None, "the OCR worker printed nothing a reader could parse"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

        if not payload.get("ok"):
            reported = str(payload.get("error") or "no reason given")
            return None, f"the OCR worker reported a failure: {reported}"

        # A clean exit with an empty `lines` is NOT a failure. It is the answer to the
        # question, and calling it one would retry a blank page twice for nothing and
        # then describe it with the wrong warning -- the exact confusion this fixes.
        return payload, None


def _exit_note(code: int) -> str:
    """A human-readable gloss for the exit codes we have actually seen."""
    if code == 3221225477:  # 0xC0000005
        return " (0xC0000005, ACCESS_VIOLATION -- see docs/EDGE-CASES.md EC-015)"
    return ""


def _worker_payload_to_2x(payload: dict[str, Any] | None) -> list:
    """The worker's JSON, back into PaddleOCR's 2.x shape.

    Kept as a function so `_lines_from_result` stays the single parser: the worker
    speaks its own dialect and exactly one place translates it.
    """
    return [[
        [
            [
                [b[0], b[1]], [b[0] + b[2], b[1]],
                [b[0] + b[2], b[1] + b[3]], [b[0], b[1] + b[3]],
            ],
            (line["text"], line["confidence"]),
        ]
        for line in (payload or {}).get("lines", [])
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
    return _read_lines_with_reason(image, reader)[0]


def _read_lines_with_reason(
    image: np.ndarray, reader: Any
) -> tuple[list[TextLine], str | None]:
    """`read_lines`, plus WHY it came back empty. EC-015.

    Two separate channels, because there are two separate ways to fail and only one
    of them raises. An engine that throws is caught here. An engine that swallows its
    own failure and returns an empty result -- which is exactly what `SubprocessReader`
    must do, since a dead worker is not an exception in this process -- reports through
    `last_failure`. `getattr` rather than an isinstance check, so a real PaddleOCR
    instance, which has neither, still reads as "no failure to report".

    A reason is only meaningful alongside an empty result: a call that returned lines
    succeeded, whatever happened on an earlier attempt inside the reader.
    """
    if reader is None:
        return [], None

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
            lines = _lines_from_result(call())
        except TypeError:
            continue  # wrong signature for this version; try the next spelling
        except Exception as exc:
            # A genuine engine failure degrades, per section 12 -- but it is now
            # degrading with the reason attached rather than anonymously.
            return [], f"the OCR engine raised {type(exc).__name__}: {exc}"
        return lines, (getattr(reader, "last_failure", None) if not lines else None)

    return [], "the OCR reader exposes neither .ocr() nor .predict()"


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


def _extract_with_region_reader(
    image: np.ndarray,
    regions: Sequence[Region],
    region_reader: RegionReader,
) -> Extraction:
    """Stage 3b via a model that reads one crop at a time. T-122.

    NO LINES, NO BINDING, NO COORDINATES ASKED OF THE MODEL. The PaddleOCR path
    reads the whole page into lines that carry their own boxes and then assigns
    each line to a region by containment. Nothing here needs that: the crop IS
    the region, so its text is known the moment the call returns, and `unbound`
    is empty by construction rather than by luck.

    That is not a simplification, it is the finding. B-006 measured this model at
    0 of 7 placing boxes and 0 of 7 labelling boxes it was handed, against 7 of 7
    reading crops. Every coordinate stays with OpenCV.
    """
    readings: list[RegionText] = []
    failures = 0
    empty = 0

    # WHICH REGIONS ARE WORTH A CALL. Stage 3a returns 35 boxes for a wireframe
    # with seven real elements, and reading all 35 cost 65 seconds and produced
    # the whole-page container's text (every word merged, which matches every
    # keyword slot downstream) plus a dozen stroke fragments and two outright
    # hallucinations on crops with no text in them. `readable_regions` filters
    # geometrically, which is the right axis because both failures are geometric.
    # 35 becomes 11 on that wireframe, and all five handwritten strings survive.
    wanted = set(readable_regions(regions))

    for index, region in enumerate(regions):
        if index not in wanted:
            # Skipped, not failed. It keeps its geometry and has no text, which is
            # the same state as a region the reader could not read — so it is not
            # counted as a failure and does not drag `ocr_available` down.
            readings.append(RegionText(region=region, text=None, confidence=None))
            continue

        try:
            png = crop_png(image, tuple(region.bbox))
        except Exception as exc:  # noqa: BLE001 - a bad crop degrades one region
            failures += 1
            readings.append(RegionText(region=region, text=None, confidence=None))
            continue

        reading = region_reader.read(png)
        if not reading.ok:
            failures += 1
            readings.append(RegionText(region=region, text=None, confidence=None))
            continue

        text = (reading.text or "").strip()
        if not text:
            empty += 1
        readings.append(
            RegionText(
                region=region,
                text=text or None,
                # SECTION 10: null is the honest value for a stage that scored
                # nothing. This model returns a transcription and no score, and
                # inventing a number here -- 1.0 for "it answered" -- would put a
                # fabricated confidence on the Glass Box beside real ones.
                confidence=None,
            )
        )

    warnings: list[str] = []
    read_count = len(wanted) - failures
    if failures:
        warnings.append(
            f"The hosted reader could not read {failures} of {len(wanted)} region(s); "
            "those regions kept their geometry and have no text."
        )
    if len(wanted) < len(regions):
        # Said out loud. A run that read a third of the detected regions and a run
        # that read all of them are different facts, and the Glass Box should not
        # have to infer which one it is looking at.
        warnings.append(
            f"{len(regions) - len(wanted)} of {len(regions)} detected region(s) were "
            "containers or too small to hold text and were not sent to the reader."
        )
    if read_count and read_count == empty:
        warnings.append("The hosted reader ran and found no text in any region.")

    return Extraction(
        regions=tuple(readings),
        unbound=(),
        warnings=tuple(warnings),
        # False only when NOTHING was read. A page where every call failed is the
        # same fact as a page PaddleOCR never ran on, and section 12's degradation
        # depends on those being one state rather than two.
        ocr_available=read_count > 0,
        reader_name=f"vlm:{region_reader.model}",
        model_calls=tuple(c.to_dict() for c in region_reader.calls),
    )


def extract_text(
    image: np.ndarray,
    regions: Sequence[Region],
    *,
    reader: Any | None = None,
    region_reader: RegionReader | None = None,
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

    # THE HOSTED READER WINS WHERE ONE IS CONFIGURED, and is simply absent
    # otherwise. `load_region_reader` returns None with no key, exactly as
    # `load_reader` returns None with no PaddleOCR, so rule 5's "with no key, no
    # network and no GPU the pipeline does what it does today" is a property of
    # this branch not being taken rather than of a flag being read correctly.
    if region_reader is not None and regions:
        return _extract_with_region_reader(image, regions, region_reader)

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

    lines, failure = _read_lines_with_reason(image, reader)
    bound, unbound = bind_lines(lines, regions, min_containment=min_containment)

    warnings: list[str] = []
    if not lines:
        # THE TWO EMPTY ANSWERS, KEPT APART. EC-015. `Extraction.ocr_available` exists
        # precisely so "OCR ran and found nothing" and "OCR never ran" stay separable,
        # and until this branch existed both arrived here as the first sentence. On
        # this machine the second was true two times in three, so the warning the Glass
        # Box displayed was usually the wrong one -- and it pointed a reader at the
        # wireframe, which was fine, instead of at the worker, which was not.
        if failure is not None:
            warnings.append(
                f"OCR did not read this page: {failure}. The regions were detected "
                "but not read (docs/EDGE-CASES.md EC-015)."
            )
        else:
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
        # False when the page was never actually read. `ocr_available` is documented
        # as separating "ran and found nothing" from "never ran", and a worker killed
        # by an access violation is squarely the second -- reporting True there is what
        # made a dead stage 3b look like a green one on the Glass Box timeline.
        ocr_available=failure is None,
    )
