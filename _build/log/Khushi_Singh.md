# Journal — Khushi Singh

## T-095 — Phase 0 review pass — audit the board and the contract against the committed code, file findings
- Started: 2026-08-20T16:02:29.706Z
- Finished: 2026-08-20T16:03:11.609Z
- Duration: 1m
- Device: LAPTOP-PUPG5T28
- Files: _build/findings/, docs/corrections/REGISTER.md
- Note: Filed F-002 (board client paths), F-003 (nested-card css has no storage slot in §4), F-004 (sectionNames written by nothing); all repro commands run, no frozen document changed.

## T-022 — Build the job record schema and job store — the Glass Box's foundation
- Started: 2026-08-20T16:11:53.224Z
- Finished: 2026-08-20T16:16:22.551Z
- Duration: 4m
- Device: LAPTOP-PUPG5T28
- Files: server/src/jobs/jobStore.js, server/src/schemas/job.schema.json, tests/job-store.test.mjs

## T-001 — Scaffold the client app shell (Vite, React, Tailwind, Redux Toolkit, react-router) with /generate and /preview/:pageName routes
- Started: 2026-08-20T16:23:13.966Z
- Finished: 2026-08-20T16:30:52.174Z
- Duration: 8m
- Device: LAPTOP-PUPG5T28
- Files: client/package.json, client/index.html, client/vite.config.js, client/tailwind.config.js, client/postcss.config.js, client/src/index.css, client/src/main.jsx, client/src/App.jsx, client/src/redux/reducers.js, client/src/routes/GeneratePage.jsx, client/src/routes/PreviewPage.jsx, tests/app-shell.test.mjs
- Note: Verified beyond the filtered test — npm install (151 packages), npm run build (49 modules, 10.11 kB CSS, proving the PostCSS/Tailwind chain expands), and npm run dev serving /generate and /preview/Home on the pinned port 5173. Wired to client/src/redux/, not the board's client/src/store/, which is the F-002 collision avoided. client/package-lock.json deliberately not committed: it carries a paulmillr.com funding URL absent from the pre-push allow-list.
