# Journal — Mohit Gupta

## T-002 — Scaffold the Express API skeleton with route stubs for every endpoint in §13
- Started: 2026-08-20T14:51:50.389Z
- Finished: 2026-08-20T15:08:15.593Z
- Duration: 16m
- Device: Mohits_Victus
- Files: server/package.json, server/src/app.js, server/src/server.js, server/src/routes/index.js, server/src/http/envelope.js, tests/api-skeleton.test.mjs, tools/test.mjs, package.json

## T-054 — Scaffold the Python perception service exposing POST /perceive and GET /health per §12
- Started: 2026-08-20T15:33:04.207Z
- Finished: 2026-08-20T15:40:27.969Z
- Duration: 7m
- Device: Mohits_Victus
- Files: perception/__init__.py, perception/app.py, perception/server.py, perception/requirements.txt, perception/tests/__init__.py, perception/tests/test_health.py, .gitignore

## T-055 — Implement stage 2, preprocessing-normalization (OpenCV), recording the normalisation transform
- Started: 2026-08-20T16:57:30.015Z
- Finished: 2026-08-20T17:03:34.506Z
- Duration: 6m
- Device: Mohits_Victus
- Files: perception/stages/normalise.py, perception/tests/test_normalise.py

## T-097 — Benchmark DETR on a real wireframe before T-056 builds on it
- Started: 2026-08-20T17:08:01.176Z
- Finished: 2026-08-20T17:22:03.590Z
- Duration: 14m
- Device: Mohits_Victus
- Files: perception/benchmarks/detr_wireframe.py, docs/BENCHMARK-RESULTS.md
- Note: DETR measured 0 of 7 on the real wireframe: one box, 'cell phone', 64% of frame, identical at thresholds 0.5 down to 0.05, and COCO has no UI classes at all. Recorded as B-002; matches B-001's Florence-2 result. F-006's DETR half confirmed.

## T-056 — Implement stage 3a, contour and rectangle region detection (OpenCV)
- Started: 2026-08-20T17:49:07.715Z
- Finished: 2026-08-20T18:32:12.529Z
- Duration: 43m
- Device: Mohits_Victus
- Files: perception/stages/detect_regions.py, perception/tests/test_detect_regions.py, perception/benchmarks/contours_wireframe.py, docs/BENCHMARK-RESULTS.md

