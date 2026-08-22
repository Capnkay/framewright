"""B-005 -- a hosted VLM on the same wireframe as B-001 through B-004. T-121.

WHY IT EXISTS. A Bedrock key made qwen3-vl-235b reachable, and a first probe read
every handwritten word on our wireframe correctly where PaddleOCR returned "eeneb"
and "bceanse.ad.ioipqincsm". That is a large result and it is not the whole result:
the same reply declared the image 1000x800 when it is 1600x1168, and its boxes read
as corners rather than [x, y, w, h]. So the TEXT was excellent and the GEOMETRY was
in an invented space, and a wireframe-to-layout pipeline needs both.

    perception/.venv/Scripts/python -m perception.benchmarks.vlm_wireframe <image>

Requires LLM_API_KEY, LLM_BASE_URL and LLM_MODEL. With no key it refuses and says so
rather than reporting a zero -- a benchmark that silently scores 0 of 7 because
nobody set an environment variable is worse than one that stops.

SCORED AGAINST B-003's ANNOTATIONS, IMPORTED RATHER THAN RETYPED. TARGETS, iou,
HIT_IOU and DEGENERATE_AREA_FRACTION all come from contours_wireframe. Re-annotating
by eye for a new detector is how ground truth drifts toward whatever the new thing
happened to return, and the point of this run is a number comparable to 7 of 7.

THE COORDINATE PROBLEM, AND WHY THIS SCORES FOUR READINGS INSTEAD OF PICKING ONE.
The model tells us its own width and height, and it may or may not mean them; it
emits four numbers per box and does not say whether they are a corner and a size or
two corners. That is four plausible readings of the same reply:

    xywh in declared space, rescaled     xyxy in declared space, rescaled
    xywh in real pixels                  xyxy in real pixels

Choosing one and reporting its score would let the benchmark's author pick the
reading that flatters the model -- which is exactly the fitted-threshold failure
B-003's docstring already warns about, one level up. So all four are scored, all
four are printed, and `best_interpretation` names which one won. If the winner is
not stable across images, the geometry is not usable no matter how good its number
looks here.

NOTE ON WHAT A GOOD SCORE WOULD AND WOULD NOT LICENSE. Even 7 of 7 here does not
make this the detector. It costs a network round trip and a key, and AGENTS.md rule 5
means the OpenCV path stays the one the demo runs on. This measures whether a VLM is
worth offering as an enhancement, not whether it replaces anything.

TWO MODES, AND THE SECOND ONE IS THE RESULT.

    ... vlm_wireframe <image>            localiser: can it place a box?   0 of 7
    ... vlm_wireframe <image> --crops    reader: can it read one?         7 of 7

The localiser run scores 0 of 7 at IoU 0.5, mean IoU 0.15, stable across three runs,
and a fair reading of that alone is "this model is no use here". That reading is
wrong, and stopping at it would have thrown away the best perception result this
project has. A third probe (not kept: it is T-122's subject, not this task's) handed
the model OpenCV's own 7-of-7 boxes as a numbered list and asked only for a label per
box -- and it put "button/SUBMIT" on the headline's box and "label/LABEL" on the
description's. So it can neither emit coordinates nor consume them. One deficit,
two symptoms: it cannot ground text to coordinates.

`--crops` takes coordinates out of the exchange entirely -- one crop in, one string
out -- and scores 7 of 7, including both regions that carry no text and correctly
came back empty rather than hallucinated. That is the shape the pairing has to take:
OpenCV owns geometry, the VLM owns reading, and neither is asked to do the other's
job.
"""

from __future__ import annotations

import base64
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from perception.benchmarks.contours_wireframe import (
    DEGENERATE_AREA_FRACTION,
    HIT_IOU,
    TARGETS,
    iou,
)

# The reply must name a role from this set. It is the same vocabulary stage 4's
# fusion already speaks, so a role outside it is not a near miss -- it is a value
# nothing downstream can use.
ROLES = "headline|subheadline|body|button|input|label|image|card|nav"

PROMPT_TEMPLATE = (
    "This is a hand-drawn UI wireframe. The image is exactly {width} pixels wide and "
    "{height} pixels tall. Return STRICT JSON only, with no prose and no markdown "
    "fence:\n"
    '{{"width":{width},"height":{height},"regions":[{{"role":"{roles}",'
    '"text":"<the exact handwritten text, or an empty string if the shape carries none>",'
    '"bbox":[x,y,width,height]}}]}}\n'
    "bbox MUST be [x, y, width, height] with x and y the TOP-LEFT corner, in the "
    "{width} by {height} pixel space of this image. Do NOT return corners. Do NOT "
    "rescale to any other resolution. Include every distinct drawn box and every line "
    "of handwritten text."
)


def _require_env() -> dict:
    missing = [k for k in ("LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL") if not os.environ.get(k)]
    if missing:
        raise SystemExit(
            "error: this benchmark needs a hosted model. Unset: "
            + ", ".join(missing)
            + "\nSee .env.example. Refusing rather than reporting a zero, which would "
            "read as a model result and is a configuration result."
        )
    return {
        "key": os.environ["LLM_API_KEY"],
        "base_url": os.environ["LLM_BASE_URL"].rstrip("/"),
        "model": os.environ["LLM_MODEL"],
    }


def call_vlm(raw: bytes, width: int, height: int, cfg: dict, timeout: float) -> tuple[dict, float, dict]:
    """One call. Returns (parsed reply, seconds, usage)."""
    prompt = PROMPT_TEMPLATE.format(width=width, height=height, roles=ROLES)
    body = {
        "model": cfg["model"],
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "data:image/png;base64," + base64.b64encode(raw).decode()
                        },
                    },
                ],
            }
        ],
        "max_tokens": 2000,
        "temperature": 0,
    }
    request = urllib.request.Request(
        cfg["base_url"] + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + cfg["key"],
        },
    )

    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read())
    seconds = time.perf_counter() - started

    content = payload["choices"][0]["message"]["content"]
    return parse_reply(content), seconds, payload.get("usage", {})


def parse_reply(content: str) -> dict:
    """Take the JSON out of a reply that may have wrapped it in a fence or prose.

    Not defensiveness for its own sake: a model that answers correctly and wraps it
    in ```json is a formatting problem, and scoring it 0 of 7 would record a
    modelling failure that did not happen.
    """
    text = content.strip()
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        braced = re.search(r"\{.*\}", text, re.S)
        if not braced:
            raise
        return json.loads(braced.group(0))


def interpretations(reply: dict, width: int, height: int) -> dict[str, list[dict]]:
    """The same four numbers per box, read four ways, each in real image pixels."""
    declared_w = reply.get("width") or width
    declared_h = reply.get("height") or height
    sx = width / float(declared_w) if declared_w else 1.0
    sy = height / float(declared_h) if declared_h else 1.0

    out: dict[str, list[dict]] = {
        "xywh_declared_rescaled": [],
        "xyxy_declared_rescaled": [],
        "xywh_raw": [],
        "xyxy_raw": [],
    }

    for region in reply.get("regions", []):
        bbox = region.get("bbox")
        if not (isinstance(bbox, list) and len(bbox) == 4):
            continue
        a, b, c, d = (float(v) for v in bbox)
        meta = {"role": region.get("role"), "text": region.get("text", "")}

        out["xywh_raw"].append({**meta, "box": [a, b, c, d]})
        out["xyxy_raw"].append({**meta, "box": [a, b, max(c - a, 0.0), max(d - b, 0.0)]})
        out["xywh_declared_rescaled"].append(
            {**meta, "box": [a * sx, b * sy, c * sx, d * sy]}
        )
        out["xyxy_declared_rescaled"].append(
            {**meta, "box": [a * sx, b * sy, max(c - a, 0.0) * sx, max(d - b, 0.0) * sy]}
        )

    return out


def score(boxes: list[dict], image_area: float) -> dict:
    """B-003's scoring, unchanged, including its degenerate-answer rule."""
    scored = {}
    for name, target in TARGETS.items():
        best, best_iou = None, 0.0
        for candidate in boxes:
            box = candidate["box"]
            if box[2] <= 0 or box[3] <= 0:
                continue
            if (box[2] * box[3]) / image_area >= DEGENERATE_AREA_FRACTION:
                continue
            overlap = iou(target, box)
            if overlap > best_iou:
                best, best_iou = candidate, overlap
        scored[name] = {
            "target": target,
            "iou": round(best_iou, 3),
            "located": best_iou >= HIT_IOU,
            "region": None
            if best is None
            else {
                "role": best["role"],
                "text": best["text"],
                "box": [round(v, 1) for v in best["box"]],
            },
        }

    located = sum(1 for v in scored.values() if v["located"])
    return {
        "targets_located": located,
        "targets_total": len(TARGETS),
        "score": f"{located} of {len(TARGETS)}",
        "mean_iou": round(sum(v["iou"] for v in scored.values()) / len(TARGETS), 3),
        "targets": scored,
    }


def run(image_path: Path, timeout: float = 180.0) -> dict:
    cfg = _require_env()
    raw = image_path.read_bytes()

    from PIL import Image  # local: the rest of this module needs no imaging

    with Image.open(image_path) as image:
        width, height = image.size

    reply, seconds, usage = call_vlm(raw, width, height, cfg, timeout)

    readings = interpretations(reply, width, height)
    image_area = float(width * height)
    scores = {name: score(boxes, image_area) for name, boxes in readings.items()}

    best_name = max(
        scores,
        key=lambda k: (scores[k]["targets_located"], scores[k]["mean_iou"]),
    )

    # The text result, kept separate from the geometry result on purpose. The first
    # probe was excellent at one and unusable at the other, and averaging them into a
    # single verdict would have hidden both.
    read_text = [r.get("text", "") for r in reply.get("regions", []) if r.get("text")]

    return {
        "detector": f"hosted VLM ({cfg['model']}) via {cfg['base_url']}",
        "device": "hosted",
        "weights": None,
        "network": True,
        "image": image_path.name,
        "image_size": [width, height],
        "declared_size": [reply.get("width"), reply.get("height")],
        "declared_size_matches": [reply.get("width"), reply.get("height")] == [width, height],
        "call_seconds": round(seconds, 2),
        "usage": usage,
        "hit_iou": HIT_IOU,
        "regions_returned": len(reply.get("regions", [])),
        "roles_returned": sorted({r.get("role") for r in reply.get("regions", []) if r.get("role")}),
        "text_read": read_text,
        "best_interpretation": best_name,
        "best_score": scores[best_name]["score"],
        "scores_by_interpretation": {k: v["score"] for k, v in scores.items()},
        "mean_iou_by_interpretation": {k: v["mean_iou"] for k, v in scores.items()},
        "detail": scores,
        "raw_reply": reply,
    }


# What the wireframe actually says in each annotated region, read by eye off the
# original image. Two of them carry no text BY DESIGN -- `description` is four ruled
# lines and `statBadges` is three empty squares -- and they are kept in rather than
# excluded, because "does it invent words that are not there" is the failure mode a
# reader is most likely to have and the one an exclusion would hide.
EXPECTED_TEXT = {
    "heroImage": "Image",
    "brandBadge": "LABEL",
    "headlineMain": "HEADLINE",
    "headlineSub": "SUB HEADLINE",
    "description": "",
    "statBadges": "",
    "ctaButton": "SUBMIT",
}

# Breathing room around each crop, so a stroke on the boundary is not clipped in a
# way that makes the reader look worse than it is.
CROP_PAD = 12


def read_crop(png: bytes, cfg: dict, timeout: float) -> tuple[str, float, dict]:
    """Ask for the text in one crop. No coordinates appear in this exchange at all."""
    body = {
        "model": cfg["model"],
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "This is a crop from a hand-drawn wireframe. Transcribe the "
                            "handwritten text in it, exactly as written. If there is no "
                            "text, reply with an empty string. Reply with STRICT JSON "
                            'only: {"text":"..."}'
                        ),
                    },
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
        cfg["base_url"] + "/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg["key"]},
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read())
    seconds = time.perf_counter() - started

    content = payload["choices"][0]["message"]["content"]
    try:
        text = parse_reply(content).get("text", "")
    except json.JSONDecodeError:
        text = content.strip()
    return text, seconds, payload.get("usage", {})


def run_crops(image_path: Path, timeout: float = 120.0) -> dict:
    """The VLM as a READER over geometry it did not have to find.

    Why this mode exists, and it is the whole point of the task: the localisation
    run below scores 0 of 7, and a fair reading of that is "the model is useless
    here". It is not. Both of its failures -- emitting boxes, and labelling boxes
    it was handed -- are the SAME deficit, an inability to ground text to
    coordinates. Take coordinates out of the exchange entirely and what is left is
    the thing it is actually good at.

    The crops here come from the B-003 annotations rather than from the detector,
    so this measures the READER in isolation. Wiring it to `detect_regions`'
    real output is T-122's job and will score slightly differently, because the
    detector's boxes are not the annotations.
    """
    cfg = _require_env()

    from PIL import Image

    source = Image.open(image_path).convert("RGB")

    rows = []
    total_seconds = 0.0
    total_tokens = 0
    correct = 0

    for name, (x, y, w, h) in TARGETS.items():
        crop = source.crop(
            (
                max(x - CROP_PAD, 0),
                max(y - CROP_PAD, 0),
                min(x + w + CROP_PAD, source.width),
                min(y + h + CROP_PAD, source.height),
            )
        )
        buffer = io.BytesIO()
        crop.save(buffer, format="PNG")

        text, seconds, usage = read_crop(buffer.getvalue(), cfg, timeout)
        total_seconds += seconds
        total_tokens += usage.get("total_tokens", 0)

        want = EXPECTED_TEXT[name]
        got = text.strip()
        # An empty region is right only when it comes back empty. A substring match
        # would make "" match everything, which would score hallucination as success.
        ok = (want.lower() in got.lower()) if want else (got == "")
        correct += ok
        rows.append({"target": name, "expected": want, "read": got, "correct": ok})

    return {
        "mode": "crops",
        "detector": f"hosted VLM ({cfg['model']}) reading crops, geometry NOT from the model",
        "image": image_path.name,
        "regions_read": len(TARGETS),
        "correct": correct,
        "score": f"{correct} of {len(TARGETS)}",
        "call_seconds_total": round(total_seconds, 1),
        "tokens_total": total_tokens,
        "calls": len(TARGETS),
        "rows": rows,
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    crops = "--crops" in sys.argv

    if not args:
        print(__doc__)
        print("error: give the path to a wireframe image", file=sys.stderr)
        print("       add --crops to score the reader instead of the localiser", file=sys.stderr)
        return 1

    image_path = Path(args[0])
    if not image_path.exists():
        print(f"error: no such file: {image_path}", file=sys.stderr)
        return 1

    try:
        result = run_crops(image_path) if crops else run(image_path)
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:400]
        print(f"error: the model endpoint returned {err.code}: {detail}", file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
