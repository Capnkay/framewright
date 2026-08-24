"""B-019 -- a detector trained on synthetic wireframes, scored against B-003's targets. T-150.

WHY IT EXISTS, AND THE OBJECTION THAT IS ON RECORD BEFORE IT RUNS. T-150's own
`doneWhen` requires the objection stated before the attempt, not after it:
three learned models have already been measured on this exact input and all
three scored 0 of 7 -- Florence-2 (B-001), DETR across four confidence
thresholds (B-002), and a hosted VLM over three runs (B-006) -- against OpenCV
contour detection at 7 of 7 (B-003). PS7 section 5.2 also puts training out of
scope. This is attempted anyway at the owner's explicit direction, after that
evidence was presented, because a fourth measurement is evidence even when it
is negative.

THE SHIP RULE IS FIXED HERE, IN ADVANCE, AND IS NOT NEGOTIABLE AFTERWARDS.
A trained detector replaces `detect_regions` only if it scores at least 7 of 7
on B-003's targets at IoU >= 0.5 AND does not reduce B-004's 7 of 7 geometry or
4 of 4 text. Anything else is written up as a measured negative result and
nothing ships. This file therefore prints the ship decision as a field
(`shipRule`) rather than leaving it to the reader's judgement after the fact --
a threshold chosen once the number is known is not a threshold.

    perception/.venv/Scripts/python -m perception.benchmarks.train_detector \
        --train-dir perception/synthetic/dataset/train \
        --val-dir   perception/synthetic/dataset/val \
        --eval-image ../gpu-test/wireframe.png

SCORED BY B-003'S HARNESS, NOT A NEW ONE. `TARGETS`, `iou`, `HIT_IOU` and
`DEGENERATE_AREA_FRACTION` are IMPORTED from
`perception.benchmarks.contours_wireframe` rather than restated, so this number
cannot drift from the one OpenCV was measured against. The matching rule is
copied from that module deliberately and is CLASS-AGNOSTIC: for each target,
the best-overlapping returned box wins regardless of what label the detector
put on it, and any box covering >= 75% of the frame is discarded first, exactly
as B-001's degenerate-answer rule requires. A learned detector emits class
labels and the contour detector does not, so scoring the labels here would be
scoring something OpenCV was never asked to do. The class-aware number is
computed too, but it is reported as a SECONDARY diagnostic and never as the
headline -- the headline is the number that is comparable.

THE EXPERIMENT IS A TRANSFER QUESTION, AND THE HELD-OUT SYNTHETIC SCORE PROVES
NOTHING. Training data is synthetic and generated here -- the only labelled
set obtainable today without licence risk, and the only one that gives exact
ground truth. Evaluation is on the real photograph every other number in this
project comes from. B-009 already measured that synthetic images have different
detection characteristics from a photographed page, so a good score on held-out
synthetic data is a statement about the generator, not about the detector's
usefulness. It is printed under `heldOutSynthetic` with that caveat attached in
the payload itself, so a reader quoting the JSON cannot quote it bare.

LICENCE. TorchVision's Faster R-CNN (BSD-3-Clause, already declared in the
README table and pinned in perception/constraints.txt). The forbidden list in
AGENTS.md rules out YOLOv8 (AGPL, network clause), LayoutLMv3 weights
(CC-BY-NC-SA) and Qwen2.5-Coder-3B (non-commercial); none is used or
downloaded here. The COCO-pretrained backbone ships under TorchVision's own
BSD-3-Clause terms. No weight file is committed -- the checkpoint is written
under perception/synthetic/dataset/, which .gitignore already excludes, and
`*.pt` is separately excluded.

ADDITIVE ONLY. This module imports from `detect_regions`, `normalise` and
`contours_wireframe` and writes back to none of them. No shipped pipeline stage
is modified by this task.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset

from perception.benchmarks.contours_wireframe import (
    DEGENERATE_AREA_FRACTION,
    HIT_IOU,
    TARGETS,
    iou,
)
from perception.stages.normalise import normalise, to_original

# The seven reference elements, in a fixed order. Index 0 is background, which
# is what torchvision's detection heads reserve it for.
CLASS_NAMES: list[str] = [
    "__background__",
    "heroImage",
    "brandBadge",
    "headlineMain",
    "headlineSub",
    "description",
    "statBadges",
    "ctaButton",
]
CLASS_INDEX: dict[str, int] = {name: i for i, name in enumerate(CLASS_NAMES)}


# --- data -------------------------------------------------------------------


def _to_model_image(bgr: np.ndarray) -> torch.Tensor:
    """HxWx3 uint8 BGR -> 3xHxW float32 RGB in [0, 1], which is what
    torchvision's detection models expect. They normalise internally."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return torch.from_numpy(rgb).permute(2, 0, 1).to(torch.float32) / 255.0


def _stage2(bgr: np.ndarray) -> np.ndarray:
    """Run a synthetic image through the SAME stage-2 preprocessing the real
    upload gets at evaluation time.

    The generator writes a raw 1024x1024 canvas; a real upload reaches the
    detector only after `normalise()` has letterboxed it and run `enhance()`'s
    illumination correction over it. Training on the raw canvas and evaluating
    on the enhanced one would introduce a pixel-distribution gap that has
    nothing to do with the question being asked, and would make a poor transfer
    result unattributable -- it could not be told apart from a preprocessing
    mismatch. At 1024x1024 the geometry half of the transform is the identity
    (scale 1.0, zero offsets), so ground-truth boxes need no remapping; only the
    enhancement actually changes the pixels.
    """
    ok, buf = cv2.imencode(".png", bgr)
    if not ok:
        raise RuntimeError("could not re-encode a synthetic image for stage 2")
    return normalise(buf.tobytes()).image


class WireframeDataset(Dataset):
    """PNG + ground-truth-JSON pairs as the generator writes them.

    Ground truth arrives in `Region.to_dict()`'s shape plus `elementName` --
    `{"count": N, "regions": [...]}` -- and boxes are [x, y, w, h] in the
    1024-canvas's own pixels. torchvision wants [x0, y0, x1, y1], so the
    conversion happens here and nowhere else.
    """

    def __init__(self, root: Path, limit: int | None = None, apply_stage2: bool = True):
        self.root = Path(root)
        self.apply_stage2 = apply_stage2
        manifest_path = self.root / "manifest.json"
        if not manifest_path.exists():
            raise FileNotFoundError(
                f"no manifest.json in {self.root} -- generate a dataset first with "
                "python -m perception.synthetic.generate_wireframe --count N --out <dir>"
            )
        items = json.loads(manifest_path.read_text())["items"]
        if limit is not None:
            items = items[:limit]
        self.items = items

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, index: int):
        item = self.items[index]
        image = cv2.imread(str(self.root / item["image"]), cv2.IMREAD_COLOR)
        if image is None:
            raise FileNotFoundError(self.root / item["image"])
        if self.apply_stage2:
            image = _stage2(image)

        regions = json.loads((self.root / item["groundTruth"]).read_text())["regions"]
        boxes, labels = [], []
        for region in regions:
            name = region.get("elementName")
            if name not in CLASS_INDEX:
                continue
            x, y, w, h = region["bbox"]
            if w <= 0 or h <= 0:
                continue
            boxes.append([float(x), float(y), float(x + w), float(y + h)])
            labels.append(CLASS_INDEX[name])

        target = {
            "boxes": torch.as_tensor(boxes, dtype=torch.float32).reshape(-1, 4),
            "labels": torch.as_tensor(labels, dtype=torch.int64),
            "image_id": torch.tensor([int(item["seed"])]),
        }
        return _to_model_image(image), target


def collate(batch):
    return tuple(zip(*batch))


# --- model ------------------------------------------------------------------


def build_model(pretrained_backbone: bool = True):
    """Faster R-CNN, ResNet-50 FPN. BSD-3-Clause, and already a declared
    dependency -- no new licence surface is introduced by this benchmark."""
    from torchvision.models.detection import fasterrcnn_resnet50_fpn
    from torchvision.models.detection.faster_rcnn import FastRCNNPredictor

    weights = "DEFAULT" if pretrained_backbone else None
    model = fasterrcnn_resnet50_fpn(weights=weights)
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, len(CLASS_NAMES))
    return model


# --- training ---------------------------------------------------------------


def train(
    model,
    loader: DataLoader,
    device: torch.device,
    epochs: int,
    lr: float,
    amp: bool,
) -> dict[str, Any]:
    model.to(device).train()
    params = [p for p in model.parameters() if p.requires_grad]
    optimiser = torch.optim.SGD(params, lr=lr, momentum=0.9, weight_decay=5e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimiser, T_max=max(epochs, 1))
    scaler = torch.amp.GradScaler("cuda", enabled=amp and device.type == "cuda")

    history = []
    started = time.perf_counter()
    for epoch in range(epochs):
        running, batches = 0.0, 0
        for images, targets in loader:
            images = [i.to(device) for i in images]
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]

            optimiser.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", enabled=amp and device.type == "cuda"):
                losses = model(images, targets)
                loss = sum(losses.values())
            scaler.scale(loss).backward()
            scaler.step(optimiser)
            scaler.update()

            running += float(loss.detach())
            batches += 1
            if batches % 100 == 0:
                print(
                    f"  epoch {epoch + 1}/{epochs}  batch {batches}/{len(loader)}  "
                    f"loss {running / batches:.4f}",
                    flush=True,
                )
        scheduler.step()
        mean_loss = running / max(batches, 1)
        history.append({"epoch": epoch + 1, "meanLoss": round(mean_loss, 4)})
        print(f"epoch {epoch + 1}/{epochs}  mean loss {mean_loss:.4f}", flush=True)

    return {
        "epochs": epochs,
        "trainSeconds": round(time.perf_counter() - started, 1),
        "history": history,
        "peakVramGb": (
            round(torch.cuda.max_memory_allocated() / 1024**3, 2)
            if device.type == "cuda"
            else 0.0
        ),
    }


# --- inference + scoring ----------------------------------------------------


@torch.no_grad()
def predict(model, image_bgr: np.ndarray, device: torch.device, score_threshold: float):
    """Boxes in the 1024-canvas's coordinates, as [x, y, w, h] -- the same shape
    and the same space `detect_regions` returns, so the mapping back through
    `to_original` is identical to B-003's."""
    model.to(device).eval()
    tensor = _to_model_image(image_bgr).to(device)
    output = model([tensor])[0]

    predictions = []
    for box, label, score in zip(output["boxes"], output["labels"], output["scores"]):
        score = float(score)
        if score < score_threshold:
            continue
        x0, y0, x1, y1 = (float(v) for v in box)
        predictions.append(
            {
                "label": CLASS_NAMES[int(label)],
                "score": round(score, 4),
                "bbox_normalised": [x0, y0, x1 - x0, y1 - y0],
            }
        )
    return predictions


def score_against_targets(
    predictions: list[dict[str, Any]], transform: dict[str, Any], original_area: float
) -> dict[str, Any]:
    """B-003's scoring loop, applied to this detector's boxes.

    Deliberately a copy of `contours_wireframe.run`'s inner loop rather than a
    variation on it: same degenerate-area filter, same class-agnostic
    best-overlap match, same HIT_IOU, all four values imported from that module
    so they cannot drift apart. The class-aware column is extra information
    beside the comparable number, not a replacement for it.
    """
    detections = []
    for prediction in predictions:
        box = [round(v, 1) for v in to_original(prediction["bbox_normalised"], transform)]
        detections.append(
            {
                "label": prediction["label"],
                "score": prediction["score"],
                "box_normalised": prediction["bbox_normalised"],
                "box_original": box,
                "area_fraction": round(box[2] * box[3] / original_area, 4),
            }
        )

    scored = {}
    for name, target in TARGETS.items():
        best, best_iou = None, 0.0
        best_labelled, best_labelled_iou = None, 0.0
        for detection in detections:
            if detection["area_fraction"] >= DEGENERATE_AREA_FRACTION:
                continue
            overlap = iou(target, detection["box_original"])
            if overlap > best_iou:
                best, best_iou = detection, overlap
            if detection["label"] == name and overlap > best_labelled_iou:
                best_labelled, best_labelled_iou = detection, overlap
        scored[name] = {
            "target": target,
            "iou": round(best_iou, 3),
            "located": best_iou >= HIT_IOU,
            "region": best,
            "classAwareIou": round(best_labelled_iou, 3),
            "classAwareLocated": best_labelled_iou >= HIT_IOU,
            "classAwareRegion": best_labelled,
        }

    located = sum(1 for v in scored.values() if v["located"])
    class_aware = sum(1 for v in scored.values() if v["classAwareLocated"])
    return {
        "regions_returned": len(detections),
        "degenerate_count": sum(
            1 for d in detections if d["area_fraction"] >= DEGENERATE_AREA_FRACTION
        ),
        "targets_located": located,
        "targets_total": len(TARGETS),
        "score": f"{located} of {len(TARGETS)}",
        "classAwareScore": f"{class_aware} of {len(TARGETS)}",
        "targets": scored,
        "detections": detections,
    }


@torch.no_grad()
def score_held_out_synthetic(
    model, dataset: WireframeDataset, device: torch.device, score_threshold: float, limit: int
) -> dict[str, Any]:
    """Per-element recall on generated images the model never trained on.

    THIS NUMBER DOES NOT ANSWER THE QUESTION T-150 ASKS, and the caveat travels
    inside the payload so it cannot be quoted without it. B-009 measured that a
    synthetic wireframe has different detection characteristics from a
    photographed one; a detector can score perfectly here and still be useless
    on the real input, which is exactly the failure mode B-001 and B-002 already
    demonstrated in the other direction.
    """
    model.to(device).eval()
    total = min(limit, len(dataset))
    hits = {name: 0 for name in CLASS_NAMES[1:]}
    counts = {name: 0 for name in CLASS_NAMES[1:]}

    for index in range(total):
        image, target = dataset[index]
        output = model([image.to(device)])[0]
        boxes = [
            [float(v) for v in box]
            for box, score in zip(output["boxes"], output["scores"])
            if float(score) >= score_threshold
        ]
        for gt_box, gt_label in zip(target["boxes"].tolist(), target["labels"].tolist()):
            name = CLASS_NAMES[gt_label]
            counts[name] += 1
            gt_xywh = [gt_box[0], gt_box[1], gt_box[2] - gt_box[0], gt_box[3] - gt_box[1]]
            best = 0.0
            for box in boxes:
                overlap = iou(gt_xywh, [box[0], box[1], box[2] - box[0], box[3] - box[1]])
                best = max(best, overlap)
            if best >= HIT_IOU:
                hits[name] += 1

    return {
        "caveat": (
            "Held-out SYNTHETIC data. B-009 measured that synthetic wireframes have "
            "different detection characteristics from the photographed page every other "
            "number in this project is measured on. A good score here is a statement "
            "about the generator, not evidence that the detector transfers. It is NOT "
            "the T-150 result and must not be reported as if it were."
        ),
        "images": total,
        "recallAtIou50": {
            name: (round(hits[name] / counts[name], 3) if counts[name] else None)
            for name in CLASS_NAMES[1:]
        },
    }


# --- entry point ------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--train-dir",
        nargs="+",
        default=["perception/synthetic/dataset/train"],
        help="one or more generated dataset directories; concatenated, seeds are disjoint",
    )
    parser.add_argument("--val-dir", default="perception/synthetic/dataset/val")
    parser.add_argument("--eval-image", default="../gpu-test/wireframe.png")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=0.005)
    parser.add_argument("--limit", type=int, default=None, help="cap training images")
    parser.add_argument("--val-limit", type=int, default=50)
    parser.add_argument("--score-threshold", type=float, default=0.5)
    parser.add_argument(
        "--sweep",
        type=float,
        nargs="*",
        default=[0.5, 0.3, 0.1, 0.05],
        help="confidence thresholds to report, as B-002 did for DETR",
    )
    parser.add_argument(
        "--load-checkpoint",
        default=None,
        help="skip training and evaluate this checkpoint instead",
    )
    parser.add_argument("--workers", type=int, default=0)
    parser.add_argument("--no-amp", action="store_true")
    parser.add_argument("--no-pretrained-backbone", action="store_true")
    parser.add_argument(
        "--checkpoint",
        default="perception/synthetic/dataset/detector_fasterrcnn.pt",
        help="gitignored by .gitignore's *.pt rule AND its dataset/ rule",
    )
    parser.add_argument("--out", default=None, help="write the result JSON here too")
    args = parser.parse_args()

    eval_path = Path(args.eval_image)
    if not eval_path.exists():
        print(f"error: no such image: {eval_path}", file=sys.stderr)
        return 1

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    parts = [WireframeDataset(Path(d), limit=args.limit) for d in args.train_dir]
    train_set = parts[0] if len(parts) == 1 else torch.utils.data.ConcatDataset(parts)
    val_set = WireframeDataset(Path(args.val_dir))
    loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.workers,
        collate_fn=collate,
    )

    print(
        f"device={device}  train={len(train_set)}  val={len(val_set)}  "
        f"epochs={args.epochs}  batch={args.batch_size}",
        flush=True,
    )

    model = build_model(pretrained_backbone=not args.no_pretrained_backbone)

    if args.load_checkpoint:
        state = torch.load(args.load_checkpoint, map_location="cpu", weights_only=False)
        model.load_state_dict(state["model"])
        training = {"loadedFrom": args.load_checkpoint, "epochs": 0, "note": "not retrained"}
        print(f"loaded checkpoint {args.load_checkpoint}; skipping training", flush=True)
    else:
        training = train(model, loader, device, args.epochs, args.lr, amp=not args.no_amp)
        checkpoint_path = Path(args.checkpoint)
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        torch.save({"model": model.state_dict(), "classes": CLASS_NAMES}, checkpoint_path)

    # --- the measurement that answers T-150: the real photograph ---
    raw = eval_path.read_bytes()
    started = time.perf_counter()
    stage2 = normalise(raw)
    normalise_seconds = time.perf_counter() - started

    started = time.perf_counter()
    predictions = predict(model, stage2.image, device, args.score_threshold)
    detect_seconds = time.perf_counter() - started

    original_area = float(
        (stage2.transform["width"] - 2 * stage2.transform["offsetX"])
        * (stage2.transform["height"] - 2 * stage2.transform["offsetY"])
        / stage2.transform["scale"] ** 2
    )
    result = score_against_targets(predictions, stage2.transform, original_area)

    # The same confidence sweep B-002 ran for DETR, and for the same reason: a
    # detector that has seven weak hypotheses under the cutoff is a different
    # animal from one that has none, and only a sweep tells them apart. The
    # HEADLINE number stays the one at --score-threshold; every row prints
    # `regions_returned` beside its score, because locating 7 of 7 by returning
    # hundreds of boxes is enumeration rather than detection (B-003's rule 3).
    sweep = []
    for threshold in sorted(set(args.sweep), reverse=True):
        swept = score_against_targets(
            predict(model, stage2.image, device, threshold), stage2.transform, original_area
        )
        sweep.append(
            {
                "scoreThreshold": threshold,
                "score": swept["score"],
                "targetsLocated": swept["targets_located"],
                "classAwareScore": swept["classAwareScore"],
                "regions_returned": swept["regions_returned"],
                "degenerate_count": swept["degenerate_count"],
                "perTargetIou": {k: v["iou"] for k, v in swept["targets"].items()},
            }
        )
        print(
            f"sweep t={threshold}: {swept['score']} "
            f"({swept['regions_returned']} regions)",
            flush=True,
        )

    held_out = score_held_out_synthetic(
        model, val_set, device, args.score_threshold, args.val_limit
    )

    located = result["targets_located"]
    payload = {
        "detector": "torchvision fasterrcnn_resnet50_fpn, trained on synthetic wireframes",
        "licence": "BSD-3-Clause (TorchVision) -- declared in README; no forbidden weights used",
        "torch": torch.__version__,
        "device": str(device),
        "gpu": torch.cuda.get_device_name(0) if device.type == "cuda" else None,
        "trainImages": len(train_set),
        "training": training,
        "image": eval_path.name,
        "scoreThreshold": args.score_threshold,
        "normalise_seconds": round(normalise_seconds, 2),
        "detect_seconds": round(detect_seconds, 2),
        "normalisation": stage2.transform,
        "hit_iou": HIT_IOU,
        "scoringMethodology": (
            "B-003's harness, imported from perception.benchmarks.contours_wireframe "
            "(TARGETS, iou, HIT_IOU, DEGENERATE_AREA_FRACTION). Class-agnostic best-overlap "
            "match per target, degenerate boxes >= 75% of frame discarded first. Identical "
            "to the rule OpenCV's 7 of 7 was measured under."
        ),
        **result,
        "thresholdSweep": sweep,
        "heldOutSynthetic": held_out,
        "baselineB003": {"score": "7 of 7", "regions_returned": 35, "iouRange": "0.69 - 0.88"},
        "shipRule": {
            "rule": (
                "Replaces detect_regions ONLY IF >= 7 of 7 on B-003's targets at IoU 0.5 "
                "AND B-004's 7 of 7 geometry / 4 of 4 text do not regress. Fixed in advance "
                "by T-150's doneWhen; not negotiable after the number is known."
            ),
            "targetsLocated": located,
            "meetsDetectionBar": located >= 7,
            "shipDecision": (
                "DOES NOT SHIP -- written up as a measured negative result"
                if located < 7
                else "MEETS THE DETECTION BAR -- B-004 fusion regression check still required "
                "before anything ships"
            ),
        },
    }

    text = json.dumps(payload, indent=2)
    print(text)
    if args.out:
        Path(args.out).write_text(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
