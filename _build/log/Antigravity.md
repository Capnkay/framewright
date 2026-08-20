# Journal — Antigravity

## T-003 — Define the store adapter interface (§2.1) and a store factory selecting Mongo or the JSON store from environment
- Started: 2026-08-20T15:35:01.970Z
- Finished: 2026-08-20T15:40:56.564Z
- Duration: 6m
- Device: Jainam
- Files: server/src/store/adapter.js, server/src/store/index.js, tests/store-adapter-interface.test.mjs

## T-004 — Implement the JSON file store with an atomic allocateId (single-writer queue, not read-modify-write)
- Started: 2026-08-20T15:42:56.891Z
- Finished: 2026-08-20T15:51:20.282Z
- Duration: 8m
- Device: Jainam
- Files: server/src/store/jsonStore.js, server/data/store.json, tests/json-store.test.mjs

## T-005 — Implement the Mongo store with an atomic allocateId via findOneAndUpdate
- Started: 2026-08-20T15:53:18.759Z
- Finished: 2026-08-20T16:13:47.618Z
- Duration: 20m
- Device: Jainam
- Files: server/src/store/mongoStore.js, tests/mongo-store.test.mjs

## T-006 — Implement the ID allocator's three sanctioned ranges (§1) on top of the store adapter
- Started: 2026-08-20T16:14:30.825Z
- Finished: 2026-08-20T16:16:12.535Z
- Duration: 2m
- Device: Jainam
- Files: server/src/ids/allocateId.js, tests/allocate-id.test.mjs

## T-024 — Implement stage 1, input-acquisition — writes uploads to uploads/ per §13.1's format and size rules
- Started: 2026-08-20T19:23:34.937Z
- Finished: 2026-08-20T19:25:46.232Z
- Duration: 2m
- Device: Jainam
- Files: server/src/pipeline/stage1InputAcquisition.js, tests/stage1.test.mjs

## T-021 — Write the Element document and Cards loop item Ajv schemas per §3 and §4
- Started: 2026-08-20T19:26:33.933Z
- Finished: 2026-08-20T19:27:49.984Z
- Duration: 1m
- Device: Jainam
- Files: server/src/schemas/element.schema.json, server/src/validate/elementValidator.js, tests/element-schema.test.mjs

## T-035 — Implement GET /api/sections and GET /api/sections/:sectionId per §13.4
- Started: 2026-08-20T19:32:41.724Z
- Finished: 2026-08-20T19:35:32.012Z
- Duration: 3m
- Device: Jainam
- Files: server/src/routes/sections.js, tests/get-sections.test.mjs

## T-036 — Implement GET /api/jobs/:jobId per §13.4 and §11
- Started: 2026-08-20T19:36:14.356Z
- Finished: 2026-08-20T19:38:20.652Z
- Duration: 2m
- Device: Jainam
- Files: server/src/routes/jobs.js, tests/get-job.test.mjs

## T-040 — Implement POST /api/jobs/:jobId/replay per §11's Replay section
- Started: 2026-08-20T19:43:08.419Z
- Finished: 2026-08-20T19:43:24.430Z
- Duration: 0m
- Device: Jainam
- Files: server/src/routes/replay.js, tests/replay-endpoint.test.mjs

## T-031 — Enforce §8's read-side chokepoint as the single call site — extend getHtml and assert no other component bypasses it
- Started: 2026-08-20T19:46:50.815Z
- Finished: 2026-08-20T20:01:25.216Z
- Duration: 15m
- Device: Jainam
- Files: client/src/utils/getHtml.js, tools/check-sanitise-chokepoints.mjs

## T-032 — Implement the §8 CSS declaration allow-list validator
- Started: 2026-08-20T20:02:05.524Z
- Finished: 2026-08-20T20:04:23.954Z
- Duration: 2m
- Device: Jainam
- Files: server/src/sanitise/cssAllowList.js, tests/css-allow-list.test.mjs

## T-033 — Implement POST /api/generate for mode=prompt end to end
- Started: 2026-08-20T20:05:22.942Z
- Finished: 2026-08-20T20:17:19.815Z
- Duration: 12m
- Device: Jainam
- Files: server/src/routes/generate.js, tests/generate-prompt-mode.test.mjs

## T-041 — Implement POST /api/sections/:sectionId/regenerate per §13.3 (base semantics)
- Started: 2026-08-20T20:20:06.659Z
- Finished: 2026-08-20T20:23:06.481Z
- Duration: 3m
- Device: Jainam
- Files: server/src/routes/regenerate.js, tests/regenerate-base.test.mjs

## T-029 — Wire Vite eager-glob discovery of generated sections into the preview app
- Started: 2026-08-20T20:28:06.603Z
- Finished: 2026-08-20T20:31:14.705Z
- Duration: 3m
- Device: Jainam
- Files: client/src/routes/PreviewPage.jsx, tests/generated-glob-discovery.test.mjs

## T-060 — Implement code-input mode — AST to elements to IR, IDs preserved, code parsed and never executed
- Started: 2026-08-20T20:34:54.633Z
- Finished: 2026-08-20T20:37:38.340Z
- Duration: 3m
- Device: Jainam
- Files: server/src/generate/codeToIr.js, tests/code-to-ir.test.mjs

