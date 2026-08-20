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

