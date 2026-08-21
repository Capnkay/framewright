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

## T-038 — Build the Job Timeline UI — seven stages, real timings, per-stage status per §11.1
- Started: 2026-08-20T20:40:03.231Z
- Finished: 2026-08-20T20:41:23.599Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/JobTimeline.jsx, tests/job-timeline-ui.test.mjs

## T-042 — Implement zip export of a generated section (FR-G09)
- Started: 2026-08-20T20:42:38.809Z
- Finished: 2026-08-20T20:48:01.274Z
- Duration: 5m
- Device: Jainam
- Files: server/src/routes/exportZip.js, tests/export-zip.test.mjs

## T-047 — Build the Generator Studio’s generation progress and plain-language error surfacing (FR-G05)
- Started: 2026-08-21T17:03:20.696Z
- Finished: 2026-08-21T17:04:44.092Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/GenerationProgress.jsx, client/src/studio/ErrorBanner.jsx, tests/studio-progress-errors.test.mjs

## T-048 — Build the Generator Studio’s job history (FR-G08)
- Started: 2026-08-21T17:06:13.332Z
- Finished: 2026-08-21T17:07:14.780Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/JobHistory.jsx, tests/job-history.test.mjs

## T-049 — Build the Generator Studio’s read-only generated JSX view and preview link (FR-G06)
- Started: 2026-08-21T17:08:40.234Z
- Finished: 2026-08-21T17:09:20.345Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/GeneratedSourceView.jsx, tests/generated-source-view.test.mjs

## T-053 — Build the css overlay editing hook in the side-editor, validated client-side against §8
- Started: 2026-08-21T17:10:57.308Z
- Finished: 2026-08-21T17:11:43.542Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/SideEditor.jsx, tests/css-overlay-editor.test.mjs

## T-064 — Wire replay-from-stage into the Timeline UI, including the 422 case
- Started: 2026-08-21T17:12:44.960Z
- Finished: 2026-08-21T17:13:48.290Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/JobTimeline.jsx, tests/replay-ui.test.mjs

## T-065 — Implement the human-in-the-loop questions and answers endpoints per §11.3
- Started: 2026-08-21T17:15:30.963Z
- Finished: 2026-08-21T17:18:51.107Z
- Duration: 3m
- Device: Jainam
- Files: server/src/routes/questions.js, server/src/routes/answers.js, tests/hitl-endpoints.test.mjs

## T-066 — Build the human-in-the-loop UI — question, bbox overlay, options, submit
- Started: 2026-08-21T17:20:38.210Z
- Finished: 2026-08-21T17:21:53.348Z
- Duration: 1m
- Device: Jainam
- Files: client/src/studio/QuestionPrompt.jsx, tests/hitl-ui.test.mjs

## T-068 — Surface confidence per element in the Studio and preview
- Started: 2026-08-21T17:24:38.706Z
- Finished: 2026-08-21T17:27:45.063Z
- Duration: 3m
- Device: Jainam
- Files: client/src/studio/ConfidenceBadge.jsx, tests/confidence-surfaced-studio.test.mjs

## T-069 — Ship variation 2, selectable in the preview without disturbing variation 1
- Started: 2026-08-21T17:29:22.469Z
- Finished: 2026-08-21T17:32:56.973Z
- Duration: 4m
- Device: Jainam
- Files: client/src/routes/PreviewPage.jsx, tests/variation-2.test.mjs

## T-070 — Rehearse Gate 4 — the judge's headline survives redesign and regeneration
- Started: 2026-08-21T17:34:46.210Z
- Finished: 2026-08-21T17:35:18.594Z
- Duration: 1m
- Device: Jainam
- Files: (none named)
- Note: Rehearsed Gate 4 successfully, content changes via API are preserved upon regenerate using Variation 2 and new prompt.

## T-080 — Implement the Redis cache backend with boot-time fallback to the in-process cache (§15.1)
- Started: 2026-08-21T17:36:53.944Z
- Finished: 2026-08-21T17:41:31.933Z
- Duration: 5m
- Device: Jainam
- Files: server/src/cache/redisCache.js, tests/cache-redis.test.mjs

