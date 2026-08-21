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

## T-017 — Seed the Pulse Fit sample-brand section and element documents into the active store on server start
- Started: 2026-08-20T18:41:57.055Z
- Finished: 2026-08-20T18:57:03.606Z
- Duration: 15m
- Device: Mohits_Victus
- Files: server/data/seed/sections.json, server/data/seed/elements.json, server/src/store/seed.js, tests/seed-data.test.mjs, server/src/server.js, server/src/store/index.js, server/src/store/adapter.js, server/src/store/jsonStore.js, server/src/store/mongoStore.js, docs/CONTRACT.md, docs/corrections/REGISTER.md

## T-030 — Implement §8’s write-side sanitisation chokepoint on POST /api/generate and PATCH /api/elements/:fieldId
- Started: 2026-08-20T19:28:57.842Z
- Finished: 2026-08-20T19:37:01.093Z
- Duration: 8m
- Device: Mohits_Victus
- Files: server/src/sanitise/sanitiseWrite.js, server/src/routes/elements.js, server/src/routes/index.js, tests/sanitise-write.test.mjs

## T-098 — Implement stage 3b, text extraction with PaddleOCR, bound to detected regions
- Started: 2026-08-20T19:38:45.222Z
- Finished: 2026-08-20T20:14:14.097Z
- Duration: 35m
- Device: Mohits_Victus
- Files: perception/stages/extract_text.py, perception/tests/test_extract_text.py, perception/requirements.txt, perception/app.py, perception/tests/test_health.py, docs/EDGE-CASES.md

## T-057 — Implement fusion and hierarchy — assemble the IR's layout/theme/cards sub-objects for the /perceive response
- Started: 2026-08-20T20:23:21.299Z
- Finished: 2026-08-20T20:28:59.845Z
- Duration: 6m
- Device: Mohits_Victus
- Files: perception/stages/fuse.py, perception/tests/test_fuse.py

## T-058 — Wire Node’s call to POST /perceive and assemble the full IR per §12
- Started: 2026-08-20T20:43:46.684Z
- Finished: 2026-08-20T20:46:48.416Z
- Duration: 3m
- Device: Mohits_Victus
- Files: server/src/generate/perceiveAndAssembleIr.js, tests/perceive-assemble-ir.test.mjs

## T-059 — Implement the perception degradation path per §12 and §11.1
- Started: 2026-08-20T20:47:08.725Z
- Finished: 2026-08-20T20:49:59.234Z
- Duration: 3m
- Device: Mohits_Victus
- Files: server/src/generate/perceiveAndAssembleIr.js, tests/perception-degradation.test.mjs

## T-089 — Implement the pixelmatch visual gate, null when there was no wireframe (§18)
- Started: 2026-08-20T20:53:08.136Z
- Finished: 2026-08-20T20:56:32.594Z
- Duration: 3m
- Device: Mohits_Victus
- Files: server/src/quality/visual.js, tests/quality-visual.test.mjs

## T-072 — Write docs/THREAT-MODEL.md, the judge-facing security artifact
- Started: 2026-08-20T20:57:33.890Z
- Finished: 2026-08-20T21:00:50.103Z
- Duration: 3m
- Device: Mohits_Victus
- Files: docs/THREAT-MODEL.md
- Note: Merged implementation status, defects-found-during-build, and judge-runnable checks into the existing threat model; all 10 original sections preserved; every cited file and test verified present.

## T-073 — Complete README's run-command table and licence cross-check
- Started: 2026-08-20T21:01:28.566Z
- Finished: 2026-08-20T21:06:13.208Z
- Duration: 5m
- Device: Mohits_Victus
- Files: README.md
- Note: Rewrote the run-command table against commands actually executed, documented three that never worked as written (npm run dev, npm run lint, python -m perception.server), and cross-checked the licence tables against package.json, client/package.json and requirements.txt - finding multer and @babel/parser imported but undeclared, and Ajv/dompurify/ESLint/pixelmatch listed but not installed.

## T-074 — Verify seed data completeness against the Ajv schemas
- Started: 2026-08-20T21:06:50.860Z
- Finished: 2026-08-20T21:08:54.453Z
- Duration: 2m
- Device: Mohits_Victus
- Files: server/data/seed/sections.json, server/data/seed/elements.json, tools/check-contract.mjs

## T-075 — Commit the checked-in reference generated component and diff it against the golden component
- Started: 2026-08-20T21:09:42.415Z
- Finished: 2026-08-20T21:14:48.225Z
- Duration: 5m
- Device: Mohits_Victus
- Files: client/src/sections/generated/reference/HeroSection-reference.jsx, tests/reference-component-diff.test.mjs, tools/emit-reference.mjs

## T-099 — Fix stage 3b's silent OCR-worker crash — tell "the worker died" apart from "the page had no text", and retry before degrading
- Started: 2026-08-21T18:51:19.052Z
- Finished: 2026-08-21T18:59:55.467Z
- Duration: 9m
- Device: Mohits_Victus
- Files: perception/stages/extract_text.py, perception/tests/test_extract_text.py, docs/EDGE-CASES.md

## T-100 — Assign fusion slots from the OCR text before falling back to position
- Started: 2026-08-21T19:00:23.335Z
- Finished: 2026-08-21T19:07:18.720Z
- Duration: 7m
- Device: Mohits_Victus
- Files: perception/stages/fuse.py, perception/tests/test_fuse.py, perception/benchmarks/slots_wireframe.py, docs/BENCHMARK-RESULTS.md

