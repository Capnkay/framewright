"""B-002 — DETR on a real wireframe. T-097.

WHY THIS RUNS AT ALL. Both committed architecture diagrams route detection through
DETR, and F-006 points out that DETR has never been measured here. The one
measurement we do have on a comparable model — B-001, Florence-2, 0 of 7 twice —
says a photograph-trained detector does not decompose a line drawing into UI
components. DETR is COCO-trained: person, car, chair. That is the same
distribution, and it is exactly why YOLOv8 was rejected on capability as well as
licence.

Either answer closes T-097. If DETR works, F-006 is wrong and we have a second
measured result, which is worth more than the assumption it replaces. If it does
not, the evidence behind the classical-CV pivot doubles for about an hour's work.

SCORED THE SAME WAY B-001 WAS, so the two numbers can sit in the same table:
seven targets from the reference element set, and a box counts only if it
plausibly isolates one of them. A whole-image box is not a hit — B-001 explains
why at length, and counting it would flatter the result.

LICENCE: DETR is Apache-2.0 and is approved in the README table. This benchmark
adds no forbidden dependency. Weights are downloaded to the HuggingFace cache
OUTSIDE the repository — §14 forbids committing *.pt / *.safetensors.

    node tools/pytest.mjs --version     # not this; this is not a test
    perception/.venv/Scripts/python -m perception.benchmarks.detr_wireframe <image>
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import DetrForObjectDetection, DetrImageProcessor

from perception.stages.normalise import normalise, to_original

MODEL_ID = "facebook/detr-resnet-50"

# The reference element set, §3. These are the seven things a wireframe of the
# split hero must decompose into for perception to be worth having.
TARGETS = [
    "heroImage",
    "brandBadge",
    "headlineMain",
    "headlineSub",
    "description",
    "statBadges",
    "ctaButton",
]

# A box covering most of the frame is the degenerate answer B-001 documented:
# the model returning "there is one thing here, and it is the whole picture".
DEGENERATE_AREA_FRACTION = 0.75


def load_model(device: str):
    processor = DetrImageProcessor.from_pretrained(MODEL_ID)
    model = DetrForObjectDetection.from_pretrained(MODEL_ID).to(device)
    model.eval()
    return processor, model


def run(image_path: Path, threshold: float = 0.5) -> dict:
    device = "cuda" if torch.cuda.is_available() else "cpu"

    raw = image_path.read_bytes()

    # Fed through stage 2 first, deliberately. This measures the pipeline as it
    # would actually run, not the model in isolation -- and it means a poor
    # result cannot be blamed on unnormalised input.
    stage2 = normalise(raw)
    rgb = Image.fromarray(stage2.image[:, :, ::-1])  # BGR -> RGB

    started = time.perf_counter()
    processor, model = load_model(device)
    load_seconds = time.perf_counter() - started

    inputs = processor(images=rgb, return_tensors="pt").to(device)

    started = time.perf_counter()
    with torch.no_grad():
        outputs = model(**inputs)
    infer_seconds = time.perf_counter() - started

    results = processor.post_process_object_detection(
        outputs, target_sizes=torch.tensor([rgb.size[::-1]]).to(device), threshold=threshold
    )[0]

    canvas_area = rgb.size[0] * rgb.size[1]
    detections = []
    for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
        x0, y0, x1, y1 = (float(v) for v in box.tolist())
        w, h = x1 - x0, y1 - y0
        detections.append(
            {
                "label": model.config.id2label[int(label)],
                "score": round(float(score), 4),
                "box_normalised": [round(x0, 1), round(y0, 1), round(w, 1), round(h, 1)],
                "box_original": [round(v, 1) for v in to_original([x0, y0, w, h], stage2.transform)],
                "area_fraction": round((w * h) / canvas_area, 4),
            }
        )

    degenerate = [d for d in detections if d["area_fraction"] >= DEGENERATE_AREA_FRACTION]

    peak_vram_gb = (
        round(torch.cuda.max_memory_allocated() / 1024**3, 2) if device == "cuda" else None
    )

    return {
        "model": MODEL_ID,
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else None,
        "image": image_path.name,
        "threshold": threshold,
        "model_load_seconds": round(load_seconds, 1),
        "inference_seconds": round(infer_seconds, 2),
        "peak_vram_gb": peak_vram_gb,
        "normalisation": stage2.transform,
        "detection_count": len(detections),
        "degenerate_count": len(degenerate),
        "labels": sorted({d["label"] for d in detections}),
        "ui_labels_available": [
            label
            for label in model.config.id2label.values()
            if label.lower() in {"button", "text", "image", "heading", "card", "badge"}
        ],
        "targets": TARGETS,
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

    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5
    report = run(image_path, threshold)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
