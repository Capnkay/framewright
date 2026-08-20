"""FastAPI application for the perception service. CONTRACT.md section 12.

T-054 scaffolds the two endpoints and pins their exact wire shapes. The real work
arrives later and is deliberately not faked here:

    T-055  stage 2, preprocessing-normalization (OpenCV), recording the transform
    T-056  stage 3, multimodal-understanding (contour detection + PaddleOCR)
    T-057  fusion and hierarchy, assembling the layout/theme/cards sub-objects

WHAT THIS SCAFFOLD RETURNS, AND WHY IT IS SHAPED THIS WAY. /perceive returns the
complete section 12 response with the deterministic split-hero template in it, so
the Node track can build and test its half of the seam today. Every element comes
back with `confidence: null`, `bbox: null` and `sourceOf: "default"`, and the
stage records come back `skipped` with a warning naming the task that fills them.

That is not a placeholder gap to be tidied up later -- it is the honest answer.
Section 10: "Elements that did not come from an image carry null, not a fabricated
number." Nothing here has looked at the image yet, so a confidence of 0.88 would be
a lie that reads as a measurement, and it would be believed by the Glass Box
timeline, by the confidence bands in section 10, and by whoever demos this.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

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
    try:
        import torch  # noqa: PLC0415 - optional, and absence is a supported state
    except ImportError:
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
    except ImportError:
        pass
    try:
        import paddleocr  # noqa: F401, PLC0415
        available.append("paddleocr")
    except ImportError:
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
                 "text-sm font-semibold tracking-widest text-red-500"),
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
        return {
            "layout": template_layout(),
            "theme": template_theme(),
            "cards": template_cards(),
            "elements": template_elements(),
            # Section 6 requires the normaliser to record its transform, because a
            # bbox without one is unusable by anyone who did not write the
            # normaliser. Identity here: no normalisation has happened, and the
            # real values arrive with T-055.
            "normalisation": {
                "scale": 1.0,
                "offsetX": 0,
                "offsetY": 0,
                "width": None,
                "height": None,
            },
            "confidence": None,
            "questions": [],
            "stages": template_stages(),
            "warnings": [
                "Perception is scaffolded but not implemented; this is the "
                "deterministic split-hero template, not a detection result.",
                "Every element carries confidence null and bbox null because "
                "nothing has read the image yet (section 10).",
            ],
        }

    return app


app = create_app()
