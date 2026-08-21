"""B-004 -- does the fused element set put the right region in the right SLOT? T-100.

B-003 answered a different question and answered it well: stage 3a locates 7 of 7
reference targets. Locating them is not naming them. This scores the step after --
whether stage 4 hands each located region to the element it actually is.

    perception/.venv/Scripts/python -m perception.benchmarks.slots_wireframe <image>

WHY IT IS A SEPARATE NUMBER FROM B-003. A pipeline can find every box and still emit
a section whose headline is the word "Image" and whose button carries the template's
copy. That was the measured state before T-100, and B-003's 7 of 7 could not see it,
because every one of those regions WAS located -- just handed to the wrong slot.

THE SAME SEVEN TARGETS AND THE SAME GROUND TRUTH as B-001, B-002 and B-003, imported
rather than re-annotated. Re-typing the boxes here would let the two benchmarks drift
and would make this one's score incomparable with the score it exists to extend.

SCORED ON TWO AXES, because a slot can be wrong in two different ways:

  geometry -- the slot's bbox overlaps that element's annotated target at IoU >= 0.5.
              This is B-003's question asked per slot rather than per region.
  text     -- where the target carries writing, the slot's text contains it. A slot
              can hold the right box and the wrong words if OCR bound a stray line.

Both are reported. A summary that collapsed them would hide exactly the failure this
benchmark was written to catch.

OCR IS RETRIED, NOT ASSUMED. EC-015: the worker dies intermittently on this machine
and a run where it died would score every text as absent and look like a fusion
regression. The reader is asked until it reads or gives up, and the number of attempts
is reported, so a reader can tell a fusion result from an OCR one.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from perception import app
from perception.benchmarks.contours_wireframe import HIT_IOU, TARGETS, iou
from perception.stages.detect_regions import detect_regions
from perception.stages.extract_text import extract_text, load_reader
from perception.stages.fuse import fuse
from perception.stages.normalise import normalise, to_original

# What each slot should SAY, where the wireframe writes anything in it. `description`
# and `statBadges` are absent on purpose: four ruled lines and three empty squares
# carry no text, and asserting that they do would be asserting a fiction.
EXPECTED_TEXT: dict[str, str] = {
    "brandBadge": "LABEL",
    "headlineMain": "HEADLINE",
    "headlineSub": "SUB HEADLINE",
    "ctaButton": "SUBMIT",
}

# How many times the page is re-read before the run is reported as unreadable. Above
# SubprocessReader's own retry, which handles a dead worker; this handles a reader
# that came back empty for any other reason.
READ_ATTEMPTS = 5


def run(image_path: Path) -> dict:
    raw = image_path.read_bytes()
    stage2 = normalise(raw)
    regions = detect_regions(stage2.image)

    reader = load_reader()
    started = time.perf_counter()
    attempts = 0
    extraction = extract_text(stage2.image, regions, reader=reader)
    attempts += 1
    while attempts < READ_ATTEMPTS and not any(r.text for r in extraction.regions):
        extraction = extract_text(stage2.image, regions, reader=reader)
        attempts += 1
    read_seconds = time.perf_counter() - started

    height, width = stage2.image.shape[:2]
    started = time.perf_counter()
    result = fuse(
        extraction,
        width=width,
        height=height,
        layout=app.template_layout(),
        theme=app.template_theme(),
        cards=app.template_cards(),
        elements=app.template_elements(),
    )
    fuse_seconds = time.perf_counter() - started

    scored: dict[str, dict] = {}
    for element in result["elements"]:
        name = element["elementName"]
        target = TARGETS.get(name)
        box = element.get("bbox")
        original = (
            [round(v, 1) for v in to_original(list(box), stage2.transform)]
            if box
            else None
        )
        overlap = iou(target, original) if target and original else 0.0

        expected = EXPECTED_TEXT.get(name)
        actual = element.get("default") or ""
        scored[name] = {
            "sourceOf": element.get("sourceOf"),
            "confidence": element.get("confidence"),
            "box_original": original,
            "iou": round(overlap, 3),
            "geometry_correct": overlap >= HIT_IOU,
            "expected_text": expected,
            "text": actual,
            "text_correct": (
                None if expected is None else expected.upper() in actual.upper()
            ),
        }

    geometry = sum(1 for v in scored.values() if v["geometry_correct"])
    text_checked = [v for v in scored.values() if v["text_correct"] is not None]
    text_ok = sum(1 for v in text_checked if v["text_correct"])

    return {
        "stage": "fuse (perception.stages.fuse) -- slot assignment",
        "image": image_path.name,
        "ocr_available": extraction.ocr_available,
        "read_attempts": attempts,
        "read_seconds": round(read_seconds, 2),
        "fuse_seconds": round(fuse_seconds, 4),
        "regions_detected": len(regions),
        "regions_with_text": sum(1 for r in extraction.regions if r.text),
        "hit_iou": HIT_IOU,
        "slots_geometry_correct": f"{geometry} of {len(scored)}",
        "slots_text_correct": f"{text_ok} of {len(text_checked)}",
        "questions_raised": len(result["questions"]),
        "warnings": result["warnings"],
        "slots": scored,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        print("error: give the path to a wireframe image", file=sys.stderr)
        return 1

    image_path = Path(sys.argv[1])
    if not image_path.exists():
        print(f"error: no such file: {image_path}", file=sys.stderr)
        return 1

    print(json.dumps(run(image_path), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
