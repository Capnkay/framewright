"""The out-of-process OCR worker. CONTRACT.md section 12, docs/EDGE-CASES.md EC-014.

Run as a subprocess, never imported by the service:

    python -m perception.stages.ocr_worker <image-path>

Reads one image, writes ONE LINE of JSON to stdout, exits. The line is always valid
JSON, including on failure, so the parent never has to guess whether a crash produced
partial output:

    {"ok": true,  "lines": [{"text": "...", "bbox": [x,y,w,h], "confidence": 0.97}]}
    {"ok": false, "error": "..."}

--------------------------------------------------------------------------------
WHY THIS RUNS IN ITS OWN PROCESS AT ALL

torch and paddle cannot coexist in one interpreter (EC-014). Whichever loads second
fails -- `_gpuDeviceProperties is already registered` one way, `WinError 127 ...
shm.dll` the other. The perception service loads torch to report the device on
/health, so the service can never also run PaddleOCR in-process. A process boundary
is the only place the two can both exist in one pipeline.

WHY IT STILL HAS TO STUB torch, which is the part that surprises

Being a separate process is NOT sufficient, and this was measured rather than
assumed: a clean interpreter running `from paddleocr import PaddleOCR` still fails.
PaddleOCR 2.10 imports paddle in its own `__init__`, then reaches albumentations,
which imports torch -- so the collision happens *inside paddleocr's own import chain*,
with no help from us at all.

So before that chain starts, a stub module is installed under the name `torch`.
albumentations finds something importable, never touches the real DLLs, and paddle
keeps the process to itself. The stub is deliberately minimal: albumentations only
probes for presence and a couple of attributes at import time.

THIS IS SAFE HERE AND WOULD NOT BE ANYWHERE ELSE. It works because nothing in this
process wants real torch -- the worker's entire job is OCR. That is exactly why it is
confined to a worker rather than done in the service, where torch is load-bearing.
If a future paddleocr genuinely calls into torch, this fails loudly at that call
rather than corrupting a result, because the stub has no methods to return wrong
answers with.

CPU, NOT GPU, AND ON PURPOSE. paddlepaddle-gpu 2.6.2 needs cuDNN 8 shared libraries
that are not installed on this machine -- torch bundles its own, so a working torch
CUDA install proves nothing about paddle's. With `use_gpu=True` the process dies with
"Could not locate cudnn_ops_infer64_8.dll", killing the worker rather than returning
an error. Wireframe pages carry a few dozen words; CPU inference is well under a
second and needs no CUDA at all. Section 12 requires the pipeline to run with the GPU
absent, so the OCR path not depending on one is a feature.

OUTPUT IS NORMALISED HERE, in PaddleOCR's 2.x shape, so the parent reuses
`extract_text._lines_from_result` unchanged rather than growing a third shape to
parse.
"""

from __future__ import annotations

import json
import sys
import types


def _install_torch_stub() -> None:
    """Occupy the name `torch` before anything can import the real one.

    Must run before paddleocr is imported. See the module docstring.
    """
    if "torch" in sys.modules:
        return
    stub = types.ModuleType("torch")
    stub.__version__ = "0.0.0-framewright-stub"
    stub.Tensor = type("Tensor", (), {})
    stub.device = lambda *a, **k: None
    stub.__getattr__ = lambda name: None  # tolerate incidental attribute probes
    sys.modules["torch"] = stub


def _poly_to_bbox(points) -> list[int]:
    xs = [float(p[0]) for p in points]
    ys = [float(p[1]) for p in points]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    return [round(x0), round(y0), max(1, round(x1 - x0)), max(1, round(y1 - y0))]


def run(image_path: str) -> dict:
    _install_torch_stub()

    import cv2  # noqa: PLC0415 - after the stub, deliberately

    image = cv2.imread(image_path)
    if image is None:
        return {"ok": False, "error": f"could not read image: {image_path}"}

    from paddleocr import PaddleOCR  # noqa: PLC0415

    reader = PaddleOCR(lang="en", show_log=False, use_gpu=False)
    result = reader.ocr(image)

    lines = []
    for page in result or []:
        for entry in page or []:
            try:
                poly, (text, score) = entry[0], entry[1]
            except (TypeError, ValueError, IndexError):
                continue
            text = str(text).strip()
            if not text:
                continue
            lines.append(
                {"text": text, "bbox": _poly_to_bbox(poly), "confidence": float(score)}
            )
    return {"ok": True, "lines": lines}


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: ocr_worker <image-path>"}))
        return 2
    try:
        payload = run(argv[1])
    except BaseException as exc:  # noqa: BLE001 - a worker must never die silently
        # BaseException, not Exception: paddle can raise SystemExit and low-level
        # loader errors, and a worker that exits without printing JSON leaves the
        # parent unable to tell "no text" from "crashed".
        payload = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
