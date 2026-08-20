"""B-003 -- OpenCV contour detection on the same wireframe as B-001 and B-002. T-056.

WHY IT EXISTS. T-056's doneWhen: "a classical-CV result that cannot be compared
against the two model results is not evidence of anything." B-001 scored Florence-2
and B-002 scored DETR against seven targets on one image; unless stage 3a is scored
against the same seven targets on the same image, the pivot to classical CV rests on
an assertion rather than a number.

    perception/.venv/Scripts/python -m perception.benchmarks.contours_wireframe <image>

SCORED THE SAME WAY, WITH ONE DELIBERATE DIFFERENCE. B-001 and B-002 were scored by
a human reading the returned boxes and asking whether any of them plausibly isolated
a target. That was the right call for those runs -- both models returned a single
whole-image box, and no amount of scoring machinery makes 1 box into 7 -- but it does
not survive being run a second time by a second person.

So this one writes the ground truth down. TARGETS below carries a box for each of the
seven reference elements, annotated by eye off the original 1600x1168 image against a
100px coordinate grid, and a target counts as located when some returned region
overlaps it at IoU >= 0.5.

THE HONESTY PROBLEM WITH THAT, STATED PLAINLY. The person who annotated these boxes
also wrote the detector, and ground truth authored after the fact can be nudged
toward whatever the detector happened to return. Three things constrain it:

  1. The boxes are in the ORIGINAL image's coordinates and were read off the grid,
     not off the detector's output.
  2. Every target's actual IoU is printed, not just the pass or fail. A hit at 0.51
     and a hit at 0.84 are different claims, and hiding the difference behind a
     boolean is how a fitted threshold stays invisible.
  3. `regions_returned` is printed beside the score. Locating 7 of 7 by returning
     four hundred boxes is not detection, it is enumeration, and the ratio is the
     only thing that tells the two apart.

A reader who disagrees with an annotation can edit one tuple and rerun.

NO GPU, NO WEIGHTS, NO NETWORK. That is the result as much as the score is: B-001
spent 98 s loading a model to return one box, and this returns its answer from the
CPU with nothing downloaded.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from perception.stages.detect_regions import detect_regions
from perception.stages.normalise import normalise, to_original

# The reference element set, section 3 -- the same seven B-001 and B-002 used.
# Boxes are [x, y, w, h] in the ORIGINAL image's pixels, annotated by eye.
TARGETS: dict[str, list[int]] = {
    "heroImage": [125, 225, 960, 375],  # the box with "Image" written in it
    "brandBadge": [1120, 235, 335, 60],  # "LABEL"
    "headlineMain": [405, 650, 800, 110],  # "HEADLINE"
    "headlineSub": [390, 765, 850, 90],  # "SUB HEADLINE"
    "description": [1150, 355, 205, 140],  # the four ruled lines
    "statBadges": [1075, 510, 350, 70],  # the row of three small squares
    "ctaButton": [1250, 605, 240, 60],  # "SUBMIT"
}

# Overlap at which a returned region counts as having located a target.
HIT_IOU = 0.5

# B-001's degenerate-answer threshold, carried over unchanged so the same rule
# that disqualified a whole-image box there disqualifies one here.
DEGENERATE_AREA_FRACTION = 0.75


def iou(a: list[float], b: list[float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    left, top = max(ax, bx), max(ay, by)
    right, bottom = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    if right <= left or bottom <= top:
        return 0.0
    overlap = (right - left) * (bottom - top)
    return overlap / float(aw * ah + bw * bh - overlap)


def run(image_path: Path) -> dict:
    raw = image_path.read_bytes()

    started = time.perf_counter()
    stage2 = normalise(raw)
    normalise_seconds = time.perf_counter() - started

    started = time.perf_counter()
    regions = detect_regions(stage2.image)
    detect_seconds = time.perf_counter() - started

    original_area = float(
        (stage2.transform["width"] - 2 * stage2.transform["offsetX"])
        * (stage2.transform["height"] - 2 * stage2.transform["offsetY"])
        / stage2.transform["scale"] ** 2
    )

    detections = []
    for region in regions:
        box = [round(v, 1) for v in to_original(list(region.bbox), stage2.transform)]
        detections.append(
            {
                "kind": region.kind,
                "confidence": region.confidence,
                "members": region.members,
                "box_normalised": list(region.bbox),
                "box_original": box,
                "area_fraction": round(box[2] * box[3] / original_area, 4),
            }
        )

    scored = {}
    for name, target in TARGETS.items():
        best, best_iou = None, 0.0
        for detection in detections:
            # A whole-image box is not a hit. B-001 explains why at length: a
            # degenerate answer landing near a real one by coincidence is the
            # same failure, counted as a success.
            if detection["area_fraction"] >= DEGENERATE_AREA_FRACTION:
                continue
            overlap = iou(target, detection["box_original"])
            if overlap > best_iou:
                best, best_iou = detection, overlap
        scored[name] = {
            "target": target,
            "iou": round(best_iou, 3),
            "located": best_iou >= HIT_IOU,
            "region": best,
        }

    located = sum(1 for v in scored.values() if v["located"])

    return {
        "detector": "opencv-contours (perception.stages.detect_regions)",
        "opencv": __import__("cv2").__version__,
        "device": "cpu",
        "weights": None,
        "network": False,
        "image": image_path.name,
        "normalise_seconds": round(normalise_seconds, 2),
        "detect_seconds": round(detect_seconds, 2),
        "normalisation": stage2.transform,
        "hit_iou": HIT_IOU,
        "regions_returned": len(detections),
        "degenerate_count": sum(
            1 for d in detections if d["area_fraction"] >= DEGENERATE_AREA_FRACTION
        ),
        "targets_located": located,
        "targets_total": len(TARGETS),
        "score": f"{located} of {len(TARGETS)}",
        "targets": scored,
        "detections": detections,
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
