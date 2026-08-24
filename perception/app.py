"""FastAPI application for the perception service. CONTRACT.md section 12.

T-054 scaffolded the two endpoints and pinned their wire shapes. T-101 connected
/perceive to the pipeline that had been built behind it:

    T-055  stage 2, preprocessing-normalization (OpenCV), recording the transform
    T-056  stage 3a, contour and rectangle region detection
    T-098  stage 3b, text extraction with PaddleOCR, bound to those regions
    T-057  stage 4, fusion -- the IR's named sub-objects
    T-100  slot assignment from what the wireframe says, before where it sits

WHY THAT WAS ITS OWN TASK, recorded because a reader will otherwise assume it was
an oversight. It was: no task covered the seam. T-054 owned the scaffold and T-058
owns the Node side, so the wiring between the endpoint and the stages belonged to
nobody, and the board read 100 of 100 while /perceive still answered with the
template. The stages were done, tested and unreachable. A board cannot see a gap
that no task describes -- which is the argument for measuring the running system
rather than reading the board.

WHAT THE SCAFFOLD USED TO RETURN, AND WHY IT WAS RIGHT AT THE TIME. Every element
came back `confidence: null`, `bbox: null`, `sourceOf: "default"`, with stages 2-4
`skipped`. Section 10: "Elements that did not come from an image carry null, not a
fabricated number." Nothing had looked at the image, so 0.88 would have been a lie
that reads as a measurement. That reasoning still governs every value below -- the
difference is that something has now actually looked.

THE TEMPLATE DID NOT GO AWAY. `template_*` remains the reference shape and stage 4
starts from it, because section 3's element set must be covered whatever the image
turns out to contain (AGENTS.md rule 5). What changed is that a detection can now
claim a slot and overwrite the default, and say so through `sourceOf`.

NEVER 500. Section 12 gives this endpoint two outcomes: a 200 with the sub-objects,
and a 422 for an unparseable upload. A stage that fails is therefore reported as a
failed stage inside a 200, not raised -- the same rule stage 3b already applies to
a missing OCR engine. A perception service that dies takes the generation with it.
"""

from __future__ import annotations

import base64
import json
import time
from datetime import datetime, timezone
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from .stages.detect_regions import detect_regions
from .stages.extract_text import extract_text, load_reader
from .stages.read_regions import RegionReader, load_region_reader
from .stages.fuse import fuse
from .stages.normalise import NormalisationError, normalise

# Accepted image types, section 13.1. Node enforces this too; doing it here as well
# means the service is honest when called directly, which is how it gets tested.
ACCEPTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}

# Section 13.1: over 8 MB is a 413 at the Node boundary. This service sees only
# what Node forwards, but refuses oversized input rather than trusting the caller.
MAX_IMAGE_BYTES = 8 * 1024 * 1024


def detect_device() -> str:
    """Report the device we are ACTUALLY on. Never a hardcoded 'cuda:0'.

    The repository has two Python environments with different torch builds -- a
    CPU-only one and a CUDA one -- and reporting the wrong answer here sends the
    perception owner hunting a GPU fault that does not exist. Roadmap gate 0.7 is
    "GET /health returns cuda:0", and it is only meaningful if this function can
    also return 'cpu'.
    """
    # PADDLE IS ASKED FIRST, AND WHICH ONE ASKS FIRST IS THE WHOLE FIX.
    #
    # EC-014 (below) records that torch and paddlepaddle-gpu cannot share a
    # process. What it did not record is that the ORDER decides which one
    # survives, and that /health was choosing the wrong winner: this function ran
    # before detect_models(), so torch loaded first and paddle then died with
    #
    #     ImportError: generic_type: type "_gpuDeviceProperties" is already registered!
    #
    # leaving detect_models() reporting ['opencv-contours'] on a machine with a
    # working PaddleOCR install. Stage 3 therefore ran with NO TEXT EXTRACTION AT
    # ALL, and the pipeline invented the copy it could not read — the exact
    # failure §18's critic exists to catch, caused here rather than by any model.
    #
    # Paddle wins because paddle does the work. torch is used nowhere in the
    # serving path; it appears in this function and nowhere else in this module,
    # purely to name a device. Trading OCR for a device string is a bad trade,
    # and it was being made silently.
    #
    # Normalised to §12's `cuda:N`, not paddle's own `gpu:0`. Roadmap gate 0.7 is
    # "GET /health returns cuda:0" and that is the string it must return; the
    # device is the same piece of hardware whichever library names it.
    try:
        import paddle  # noqa: PLC0415 - optional, exactly as torch is below

        if paddle.device.is_compiled_with_cuda():
            place = str(paddle.device.get_device())  # 'gpu:0' | 'cpu' | 'xpu:0'
            if place.startswith("gpu:"):
                return f"cuda:{place.split(':', 1)[1]}"
    except Exception:
        # Same reasoning as the torch branch: an unloadable paddle is a state, and
        # health reports state rather than failing. Falls through to torch, which
        # is the correct answer on a machine that has torch and no paddle.
        pass

    try:
        import torch  # noqa: PLC0415 - optional, and absence is a supported state
    except Exception:
        # NOT `except ImportError`. torch raises OSError -- not ImportError --
        # when its DLLs will not load, and on this repository's GPU machine that
        # happens whenever paddle has been initialised first:
        #
        #     OSError: [WinError 127] ... Error loading ... torch\lib\shm.dll
        #
        # torch and paddlepaddle-gpu cannot share a process (EC-014), and /health
        # touches both -- it reports the device from torch and the models from
        # paddleocr. A narrower except here turned a known coexistence problem
        # into a 500 on the liveness endpoint. This function's own contract is
        # "health reports state, it does not fail"; an unloadable torch is a
        # state, and the honest report of it is "cpu".
        return "cpu"

    try:
        if torch.cuda.is_available():
            return f"cuda:{torch.cuda.current_device()}"
    except Exception:
        # A broken CUDA install must degrade to 'cpu', not crash /health. Section
        # 13.4: health reports state, it does not fail.
        return "cpu"
    return "cpu"


def detect_models() -> list[str]:
    """The models actually importable right now, not the ones we intend to use.

    Section 12's example is ["opencv-contours", "paddleocr"]. This returns the
    subset that is genuinely present, so an empty list is a true statement about a
    machine where nothing is installed yet -- which is exactly what T-055 and
    T-056 install.
    """
    available: list[str] = []
    try:
        import cv2  # noqa: F401, PLC0415
        available.append("opencv-contours")
    except Exception:  # not ImportError -- see detect_device, and EC-014
        pass
    try:
        import paddleocr  # noqa: F401, PLC0415
        available.append("paddleocr")
    except Exception:  # not ImportError -- see detect_device, and EC-014
        pass
    return available


# --- the deterministic split-hero template --------------------------------
#
# These are the IR's named sub-objects from section 6, verbatim. They are the
# fallback shape the pipeline is guaranteed to produce, and they are what this
# scaffold returns until T-057 assembles them from real detections.


def template_layout() -> dict[str, Any]:
    return {
        "direction": "row",
        "breakpoint": "md",
        "mobileBehaviour": "stack",
        "container": {"maxWidth": "1920px", "padding": "px-0 md:px-12"},
        "regions": [
            {"role": "media", "side": "left", "width": "1/2", "children": ["heroImage"]},
            {
                "role": "content",
                "side": "right",
                "width": "1/2",
                "children": [
                    "brandBadge",
                    "headlineMain",
                    "headlineSub",
                    "description",
                    "statBadges",
                    "ctaButton",
                ],
            },
        ],
        "accents": [
            {"edge": "left", "width": "w-8", "colour": "red-500", "fromBreakpoint": "md"},
            {"edge": "right", "width": "w-8", "colour": "red-500", "fromBreakpoint": "md"},
        ],
    }


def template_theme() -> dict[str, Any]:
    return {"accent": "red-500", "surface": "white", "text": "gray-800", "textMode": "auto"}


def template_cards() -> dict[str, Any]:
    # Section 4 rule 4: card count is not fixed at 3, it is whatever the IR says,
    # defaulting to 3. And section 6: cards.items carry CONTENT ONLY -- no field
    # IDs appear in the IR at all, because the API attaches them after the IR is
    # final. A model that emits an ID is producing invalid IR.
    return {
        "of": "statBadges",
        "count": 3,
        "gridColumns": 3,
        "layoutMode": "grid",
        "fieldsPerItem": 2,
        "items": [
            {"field1": "1000+", "field2": "Community<br />Members"},
            {"field1": "40+", "field2": "Fitness<br />Programmes"},
            {"field1": "150+", "field2": "Fitness<br />Channels"},
        ],
    }


def _element(
    name: str, content_type: str, tag: str, order: int, default: str, classes: str, alt: str | None = None
) -> dict[str, Any]:
    return {
        "elementName": name,
        "contentType": content_type,
        "tag": tag,
        "order": order,
        "default": default,
        "classes": classes,
        "css": None,
        "alt": alt,
        # null, not a number. Nothing has looked at the image. Section 10.
        "confidence": None,
        # "default" -- not "wireframe". Section 6: sourceOf is what makes the
        # conflict-resolution rule auditable rather than assumed, so claiming a
        # wireframe source for a template value would corrupt that audit trail.
        "sourceOf": "default",
        "bbox": None,
    }


def template_elements() -> list[dict[str, Any]]:
    """The reference element set for the split hero, section 3.

    NOTE: no entry carries a fieldId. Section 12 is explicit -- "the perception
    service never allocates a fieldId" -- and elements come back identified by
    position and elementName only.
    """
    return [
        _element("heroImage", "Image", "img", 0, "default/images/hero-placeholder.jpg",
                 "w-full h-auto object-cover", alt="Athlete performing a dumbbell exercise"),
        _element("brandBadge", "Text", "span", 1, "PULSE FIT",
                 "text-sm font-semibold tracking-widest"),
        _element("headlineMain", "Text", "h1", 2, "CHALLENGE YOUR LIMITS",
                 "text-4xl md:text-5xl font-extrabold tracking-tight leading-tight"),
        _element("headlineSub", "Text", "h2", 3, "Be a part of the tribe that's limitless.",
                 "text-xl md:text-2xl font-medium text-gray-600"),
        _element("description", "Textfield", "p", 4,
                 "Join trainer-led workout sessions designed to kickstart your fitness "
                 "journey, at your convenience.",
                 "text-base text-gray-500 max-w-prose"),
        _element("statBadges", "Cards", "div", 5, "", "grid grid-cols-3 gap-4 py-2"),
        _element("ctaButton", "Button", "Button", 6, "FIND A WORKOUT",
                 "bg-red-500 px-6 py-3 text-white font-semibold"),
    ]


def _skipped_stage(stage: int, name: str, task: str) -> dict[str, Any]:
    """A stage-trace record for work this scaffold has not done.

    Section 11.1's stage status is a closed set: pending, running, ok, degraded,
    failed, skipped. "skipped" is the accurate one -- "degraded" means the stage
    did not do its real work but the pipeline continued, which is reserved for a
    genuine runtime failure (the canonical case being this service unreachable),
    not for code nobody has written yet.

    `artifact` carries the stage output INLINE. Section 11.2 requires this -- the
    Python service never writes a file, it "returns its stage outputs inline in
    the /perceive response body, and Node persists them" -- but the contract
    describes the behaviour without naming the field. Logged as a gap to close;
    do not rename it without updating both sides of the seam.
    """
    return {
        "stage": stage,
        "name": name,
        "status": "skipped",
        "startedAt": None,
        "ms": 0,
        "inputRef": None,
        "outputRef": None,
        "artifact": None,
        "model": None,
        "confidence": None,
        "warnings": [f"{name} is not implemented yet - scheduled as {task}."],
    }


def template_stages() -> list[dict[str, Any]]:
    """Stages 2-4 only. Section 11.0: stages 1 and 5-7 belong to Node."""
    return [
        _skipped_stage(2, "preprocessing-normalization", "T-055"),
        _skipped_stage(3, "multimodal-understanding", "T-056"),
        _skipped_stage(4, "semantic-planning-ir", "T-057"),
    ]


def _timestamp() -> str:
    """An ISO-8601 UTC instant for `startedAt`, section 11.1's shape.

    The clock lives HERE and in no stage. Section 11 rule 3 makes a stage a pure
    function of its persisted input, and a stage that timestamps itself is no longer
    one -- two identical calls would differ. The service layer is where time belongs,
    because the service is the thing being traced.
    """
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def _stage_record(
    stage: int,
    name: str,
    status: str,
    started_at: str,
    ms: int,
    *,
    artifact: Any = None,
    model: str | None = None,
    confidence: float | None = None,
    warnings: Any = (),
    model_calls: Any = (),
) -> dict[str, Any]:
    """One stage-trace record, section 11.1.

    `inputRef` and `outputRef` are null and always will be from this side. Section
    11.2: artifacts are owned by Node and live on the Node machine, and this service
    "never writes artifacts -- it returns its stage outputs inline". A path written
    here would resolve to nothing on the machine that reads it, so null is the honest
    value and the real output travels in `artifact`.
    """
    return {
        "stage": stage,
        "name": name,
        "status": status,
        "startedAt": started_at,
        "ms": ms,
        "inputRef": None,
        "outputRef": None,
        "artifact": artifact,
        "model": model,
        "confidence": confidence,
        "warnings": list(warnings),
        # Section 16.2's per-call trace. Present on every record and empty on most,
        # because "this stage made no model calls" is a fact worth being able to
        # read rather than infer from a missing key.
        "modelCalls": [dict(c) for c in model_calls],
    }


# JPEG, NOT PNG, AND THE NUMBERS ARE THE ARGUMENT. Measured on the reference wireframe,
# encoding the same 1024x1024 normalised canvas:
#
#     png, default      1171 KB raw    1561 KB base64
#     png, level 9       891 KB raw    1188 KB base64
#     jpeg, quality 85   141 KB raw     188 KB base64
#
# The raster is a BACKDROP: the human-in-the-loop overlay draws a bbox on top of it so a
# person can say what an element is. Nothing measures it, nothing re-reads geometry off
# it -- stage 3 already did that on the array itself, and the bbox arrives as numbers.
# Lossy is free here, and eight times the response size for a picture nobody analyses is
# not.
JPEG_QUALITY = 85


def _encode_preview(image: np.ndarray) -> dict[str, Any] | None:
    """The normalised canvas as a base64 JPEG, for section 11.2's inline artifact.

    Returns None rather than raising if the encode fails. A stage 2 that normalised
    correctly and could not serialise its own preview has still done its job, and the
    pipeline must not lose a good transform over a picture -- section 12's degradation
    rule applied one level down.

    THE SIZE IS REPORTED ALONGSIDE, because this is the one field in the response that
    can dominate it. A reader deciding whether to keep it should see what it costs
    without having to measure it.
    """
    ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        return None
    raw = buffer.tobytes()
    return {
        "contentType": "image/jpeg",
        "extension": "jpg",
        "bytes": len(raw),
        "base64": base64.b64encode(raw).decode("ascii"),
    }


def _mean_confidence(values: list[float]) -> float | None:
    """The mean of what was actually measured, or None if nothing was.

    None rather than 0.0, for the reason section 10 gives and this module's docstring
    repeats: they mean opposite things. 0.0 says we looked and saw nothing; None says
    we did not look.
    """
    return float(sum(values) / len(values)) if values else None


def _template_response(
    normalisation: dict[str, Any],
    stages: list[dict[str, Any]],
    warnings: list[str],
) -> dict[str, Any]:
    """The deterministic answer, for a run where a stage failed after stage 2.

    AGENTS.md rule 5: the deterministic path always works. A perception failure has to
    degrade to the template rather than to an error, because the emitter downstream
    builds a section from the reference set and a missing `ctaButton` is a missing
    button in the demo. Every element keeps `sourceOf: "default"` and `confidence:
    null`, which is true -- nothing claimed them.
    """
    return {
        "layout": template_layout(),
        "theme": template_theme(),
        "cards": template_cards(),
        "elements": template_elements(),
        "normalisation": normalisation,
        "confidence": None,
        "questions": [],
        "stages": stages,
        "warnings": warnings,
    }


def perceive_image(
    payload: bytes,
    *,
    reader: Any | None = None,
    region_reader: RegionReader | None = None,
) -> dict[str, Any]:
    """Stages 2, 3 and 4 over one upload. Returns section 12's response body.

    Raises `NormalisationError` and nothing else. An undecodable upload is section
    12's 422 and belongs to the caller to shape; every other failure is reported as a
    failed stage inside a successful response, because a 500 here is a dead generation
    and section 12 does not define one.
    """
    stages: list[dict[str, Any]] = []

    # --- stage 2: normalisation. Section 6 requires the transform to be recorded ---
    started_at, clock = _timestamp(), time.perf_counter()
    stage2 = normalise(payload)  # NormalisationError propagates -- see the docstring
    stages.append(
        _stage_record(
            2,
            "preprocessing-normalization",
            "ok",
            started_at,
            int((time.perf_counter() - clock) * 1000),
            # THE TRANSFORM AND THE CANVAS, BOTH. Section 6 requires the transform to be
            # recorded, and section 11.2 requires stage outputs to travel inline -- "the
            # service returns its stage outputs inline in the response body, and Node
            # persists them". The normalised canvas IS stage 2's output, and until T-112
            # only the transform was sent, so the raster existed nowhere outside this
            # process. The human-in-the-loop overlay draws a bbox over that raster; with
            # no raster the box is drawn over a 404.
            #
            # BASE64 AND NOT A PATH, for section 11.2's own reason: this service runs on
            # a different machine, so a path written here resolves to nothing there.
            artifact={**stage2.to_dict(), "raster": _encode_preview(stage2.image)},
            model="opencv",
        )
    )
    height, width = stage2.image.shape[:2]

    # --- stage 3: 3a finds WHERE, 3b reads WHAT IT SAYS. One stage in section 11.0 ---
    started_at, clock = _timestamp(), time.perf_counter()
    try:
        regions = detect_regions(stage2.image)
        extraction = extract_text(
            stage2.image, regions, reader=reader, region_reader=region_reader
        )
    except Exception as exc:  # noqa: BLE001 - a failed stage, never a failed request
        elapsed = int((time.perf_counter() - clock) * 1000)
        stages.append(
            _stage_record(
                3,
                "multimodal-understanding",
                "failed",
                started_at,
                elapsed,
                warnings=[f"Stage 3 failed: {type(exc).__name__}: {exc}"],
            )
        )
        stages.append(
            _stage_record(
                4,
                "semantic-planning-ir",
                "skipped",
                _timestamp(),
                0,
                warnings=["Stage 4 did not run because stage 3 failed."],
            )
        )
        return _template_response(
            stage2.to_dict(),
            stages,
            [
                "Perception failed after normalisation; this is the deterministic "
                "template, not a detection result."
            ],
        )

    # "degraded" is section 11.1's word for a stage that did not do its real work and
    # let the pipeline continue -- which is exactly regions-without-text. EC-015:
    # `ocr_available` is false when the page was never actually read, as against read
    # and found to be empty, and those must not be reported as the same thing.
    ocr_ran = extraction.ocr_available
    stages.append(
        _stage_record(
            3,
            "multimodal-understanding",
            "ok" if ocr_ran else "degraded",
            started_at,
            int((time.perf_counter() - clock) * 1000),
            artifact=extraction.to_dict(),
            # NAMED FROM WHAT ACTUALLY RAN. T-122 gave stage 3b a second reader,
            # so this had to stop being a constant: a page read by a hosted model
            # and a page read by PaddleOCR are different facts, and a hardcoded
            # label would report the first as the second on the Glass Box.
            model=(
                f"opencv-contours+{extraction.reader_name}" if ocr_ran else "opencv-contours"
            ),
            confidence=_mean_confidence(
                [r.effective_confidence for r in extraction.regions]
            ),
            warnings=extraction.warnings,
            # Section 16.2: every hosted-model call carries
            # { purpose, model, ms, attempts, ok }. Empty on the deterministic
            # path, which makes the empty list itself a readable statement.
            model_calls=extraction.model_calls,
        )
    )

    # --- stage 4: fusion. The reference set is covered whatever stage 3 returned ---
    started_at, clock = _timestamp(), time.perf_counter()
    try:
        fused = fuse(
            extraction,
            width=width,
            height=height,
            layout=template_layout(),
            theme=template_theme(),
            cards=template_cards(),
            elements=template_elements(),
        )
    except Exception as exc:  # noqa: BLE001
        stages.append(
            _stage_record(
                4,
                "semantic-planning-ir",
                "failed",
                started_at,
                int((time.perf_counter() - clock) * 1000),
                warnings=[f"Stage 4 failed: {type(exc).__name__}: {exc}"],
            )
        )
        return _template_response(
            stage2.to_dict(),
            stages,
            ["Fusion failed; this is the deterministic template."],
        )

    claimed = sum(1 for e in fused["elements"] if e.get("sourceOf") == "wireframe")

    # A RESPONSE THAT IS THE TEMPLATE MUST SAY SO. Fusion warns when regions existed
    # and claimed nothing, but says nothing at all when there were no regions to begin
    # with -- and that is the case which looks most like a successful detection from
    # the outside: a complete, plausible element set, every value a default. The
    # scaffold carried this warning permanently and it must not be lost now that the
    # pipeline is real; a reader who cannot tell a detection from a default is exactly
    # who section 6's `sourceOf` audit exists for.
    template_warnings: list[str] = []
    if claimed == 0:
        template_warnings.append(
            "Nothing in this image claimed an element; every value below is the "
            "deterministic template, not a detection result. "
            f"{len(extraction.regions)} region(s) were detected."
        )
    stages.append(
        _stage_record(
            4,
            "semantic-planning-ir",
            "ok",
            started_at,
            int((time.perf_counter() - clock) * 1000),
            # The artifact is the ASSIGNMENT, not the elements -- those are already in
            # the response body, and section 11.2's artifacts are persisted separately
            # by Node. Repeating them would double the payload to say nothing new.
            artifact={
                "slots": {
                    e["elementName"]: {
                        "bbox": e.get("bbox"),
                        "confidence": e.get("confidence"),
                        "sourceOf": e.get("sourceOf"),
                    }
                    for e in fused["elements"]
                },
                "claimedFromWireframe": claimed,
                "cardCount": (fused.get("cards") or {}).get("count"),
            },
            confidence=fused.get("confidence"),
            warnings=fused.get("warnings", []),
        )
    )

    return {
        "layout": fused["layout"],
        "theme": fused["theme"],
        "cards": fused["cards"],
        "elements": fused["elements"],
        "normalisation": stage2.to_dict(),
        "confidence": fused["confidence"],
        "questions": fused["questions"],
        "stages": stages,
        "warnings": template_warnings + list(fused.get("warnings", [])),
    }


# The OCR reader, built at most once per process. `load_reader()` probes the worker by
# asking it to read a real image (EC-014), which costs a subprocess and several seconds,
# and doing that per request would put that cost on every upload. `extract_text` is
# explicit that caching this is the service layer's decision and not the stage's: "the
# service layer owns that decision, not this stage."
#
# None is cached as a real answer, so a machine with no usable worker probes once and
# then degrades quickly rather than paying the probe on every call. `_READER_PROBED` is
# what distinguishes "cached None" from "not yet asked" -- the same distinction section
# 12's degradation path turns on everywhere else in this service.
_READER: Any = None
_READER_PROBED = False


def _reader() -> Any | None:
    global _READER, _READER_PROBED  # noqa: PLW0603 - process-wide, by design
    if not _READER_PROBED:
        try:
            _READER = load_reader()
        except Exception:  # noqa: BLE001 - absence is a supported state, not an error
            _READER = None
        _READER_PROBED = True
    return _READER


def _region_reader() -> RegionReader | None:
    """The hosted reader, or None. T-122.

    NOT CACHED, unlike `_reader()` above, and the asymmetry is deliberate.
    `load_reader()` probes a subprocess and imports a heavy library, which is why
    paying that once per process matters. This reads three environment variables
    and builds a closure. Caching it would mean a key added while the service is
    running never takes effect, and someone chasing why would find a `global`.
    """
    try:
        return load_region_reader()
    except Exception:  # noqa: BLE001 - absence is a supported state, not an error
        return None


def parse_failure(message: str) -> JSONResponse:
    """Section 12's 422 shape, which is section 13's error envelope."""
    return JSONResponse(
        status_code=422,
        content={"ok": False, "error": {"code": "PARSE_FAILURE", "message": message}},
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="Framewright perception",
        version="0.1.0",
        description="Wireframe to IR sub-objects. CONTRACT.md section 12.",
    )

    @app.get("/health")
    def health() -> dict[str, Any]:
        # Section 12's exact shape: { ok, models, device }. Nothing more.
        return {"ok": True, "models": detect_models(), "device": detect_device()}

    @app.post("/perceive")
    async def perceive(
        image: UploadFile = File(...),
        hints: str = Form("{}"),
    ) -> Any:
        if image.content_type not in ACCEPTED_IMAGE_TYPES:
            return parse_failure(
                f"Unsupported image type {image.content_type!r}. "
                f"Accepted: {', '.join(sorted(ACCEPTED_IMAGE_TYPES))} (section 13.1)."
            )

        payload = await image.read()
        if not payload:
            return parse_failure("The uploaded image is empty.")
        if len(payload) > MAX_IMAGE_BYTES:
            return parse_failure(
                f"Image is {len(payload)} bytes; the limit is {MAX_IMAGE_BYTES} (section 13.1)."
            )

        try:
            json.loads(hints or "{}")
        except json.JSONDecodeError as exc:
            return parse_failure(f"hints is not valid JSON: {exc.msg}")

        # Section 12: no irFragment. The named sub-objects are returned directly,
        # and Node assembles the full IR by taking irVersion, pageName,
        # sectionName, source and idPolicy from the request.
        #
        # `hints` is parsed to validate it and then not used. That is deliberate and
        # not an oversight: nothing in section 12 defines a hint that changes what
        # perception does, so acting on one would be inventing a field. Validating it
        # still earns its keep -- a malformed hint is the caller's bug and it should
        # be told, not silently ignored.
        try:
            return perceive_image(
                payload, reader=_reader(), region_reader=_region_reader()
            )
        except NormalisationError as exc:
            # The one failure section 12 gives a shape to. Everything else is a
            # failed stage inside a 200; see perceive_image's docstring.
            return parse_failure(str(exc))

    return app


app = create_app()
