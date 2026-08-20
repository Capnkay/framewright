# Framewright

Framewright is a studio application that turns a wireframe, a prompt, or existing
component code into a CMS-editable, contract-compliant React section — validated,
traced, and reproducible. The full behavioural contract lives in `docs/CONTRACT.md`;
the build plan lives in `docs/ROADMAP.md`. If any two artifacts in this repository
ever disagree with `docs/CONTRACT.md`, the contract wins and the other is a bug.

## Start here

**If you are here to build — human or AI agent — read [`AGENTS.md`](AGENTS.md) first.**
It is the canonical instruction file: the ritual, the rules, and where everything lives.

Then, every session, one command:

```
continue build
```

Which runs `node tools/baton.mjs status` and `next`, hands you the next task whose
dependencies are met, and names the contract sections that task must satisfy. Full
protocol in [`docs/BATON.md`](docs/BATON.md); first-time machine setup in
[`SETUP.md`](SETUP.md).

## Status

**Current build state is always [`_build/STATE.md`](_build/STATE.md)** — generated from
the task board, never hand-maintained, so it cannot go stale. Do not look for progress
anywhere else and do not restate it anywhere else.

Today: the harness is complete and Phase 1 has not started. On disk and working —
repository hygiene, five hooks, the task board and its tooling, the frozen contract, and
the **golden reference component with its seed data, four helpers and 13 passing tests**.
The wired Vite/Express application does not exist yet; the component that application will
mount does, and its tests run today.

## Run commands

`npm test` works **right now**, on a fresh clone, with no `npm install` — the store, the
envelope, the schemas, the sanitiser and the quality gates are all zero-dependency by
design, and `tools/test.mjs` runs them on the system Node.

**Every command below was run as written against this repository before being listed.**
Where a command needs a prefix or a different interpreter to work, that is shown, because
a run-command table whose commands do not run is worse than no table.

| Command | Purpose | State |
|---|---|---|
| `npm test` | the full Node suite | **runs — 410/413 pass**, no install needed |
| `npm test -- <name>` | one suite, e.g. `npm test -- sanitise-write` | runs |
| `npm run server` | Node/Express API on `http://localhost:5000` (`PORT` overrides) | runs |
| `npm run build` | copy `docs/html/` into `public/` for the docs site | runs (POSIX shell) |
| `node tools/baton.mjs status` | the build board — who holds what, what is blocked | runs |
| `node tools/baton.mjs next` | the next task whose dependencies are met | runs |
| `node tools/pytest.mjs <path>` | perception tests, **on the perception interpreter** | runs — 113/113 |
| `cd client && npm run dev` | Vite frontend on `http://localhost:5173` | needs `npm install` in `client/` first |
| `perception/.venv/Scripts/python -m perception.server` | perception service on `http://localhost:8000` | runs (Windows path; `bin/` on POSIX) |

### Commands that do NOT work as previously documented

Recorded rather than quietly deleted, because they were in this table and someone may
have them in a terminal history.

- **`npm run dev` at the repository root does not exist.** The Vite app is a separate
  package; use `cd client && npm run dev`.
- **`npm run lint` does not exist.** ESLint runs against *emitted* components through
  `tools/lint-generated.mjs` with a hermetic inline config — §8 notes that a config path
  derived from user input is code execution at lint time — not as a repository-wide
  script.
- **`python -m perception.server` fails as written.** Bare `python` resolves to whichever
  interpreter is first on `PATH` (3.14 on the build machine), which has no OpenCV, and the
  failure reads as `ModuleNotFoundError: No module named 'cv2'` rather than as "wrong
  interpreter". The perception dependencies live in `perception/.venv` and must, because
  the CUDA torch build is cp310 (`docs/EDGE-CASES.md` EC-012). This is the same trap
  `tools/pytest.mjs` exists to close for the tests.

### Three suites currently fail, and why

`npm test` reports 410/413. The three are named here rather than left for a judge to
discover:

| Suite | Cause |
|---|---|
| `tests/stage1.test.mjs` | imports `multer`, which is **not declared in `package.json`** |
| `tests/code-to-ir.test.mjs` | imports `@babel/parser`, likewise **not declared** |
| `tests/element-schema.test.mjs` | schema assertion failure, owner's to fix |

The first two are the same defect: `server/src/pipeline/stage1InputAcquisition.js` and
`server/src/generate/codeToIr.js` import packages that no manifest lists, so they resolve
only on a machine where something else installed them. Both belong in `dependencies`.

## Environment setup

1. Copy the template: `cp .env.example .env`
2. Fill in real values in `.env` for your machine. `.env` is git-ignored and must
   never be committed — enforced both at write time (`.claude/hooks/protect-secrets.mjs`,
   `.claude/hooks/guard-secret-shell.mjs`) and at push time
   (`.githooks/pre-push`, over full git history).
3. `.env.example` is tracked on purpose: a documented, placeholder-only reference for
   every variable the project reads. Every value in it is a placeholder — never a
   real host, key, or credential (`docs/CONTRACT.md` section 14).
4. See `SETUP.md` for the full clone-to-verified sequence, including installing this
   repository's own git hooks: `git config core.hooksPath .githooks`.

## Third-party licences

Cross-checked against `package.json`, `client/package.json` and
`perception/requirements.txt` as they exist today. `docs/CONTRACT.md` is the source of
truth if this table and the code ever disagree.

**Declared and in use:**

| Component | Licence | Where |
|---|---|---|
| React, React-DOM | MIT | `client/package.json` |
| Redux Toolkit, React-Redux | MIT | `client/package.json` |
| React Router | MIT | `client/package.json` |
| PrimeReact | MIT | `client/package.json` |
| Vite, `@vitejs/plugin-react` | MIT | `client/package.json` |
| Tailwind CSS, PostCSS, Autoprefixer | MIT | `client/package.json` |
| MongoDB Node driver | Apache-2.0 | root `devDependencies` |
| `mongodb-memory-server` | MIT | root `devDependencies` |
| FastAPI, `python-multipart` | MIT | `perception/requirements.txt` |
| Uvicorn | BSD-3-Clause | `perception/requirements.txt` |
| httpx | BSD-3-Clause | `perception/requirements.txt` |
| pytest | MIT | `perception/requirements.txt` |
| OpenCV (`opencv-python-headless`) | Apache-2.0 | `perception/requirements.txt` |
| NumPy | BSD-3-Clause | `perception/requirements.txt` |
| Pillow | MIT-CMU (HPND) | `perception/requirements.txt` |
| PaddleOCR | Apache-2.0 | installed for T-098; see EC-014 |
| PaddlePaddle | Apache-2.0 | installed for T-098 |
| PyTorch, TorchVision | BSD-3-Clause | `perception/constraints.txt` |
| DETR (`facebook/detr-resnet-50`) | Apache-2.0 | benchmark B-002 only |
| Florence-2 | MIT | benchmark B-001 only |

**Undeclared but imported — a defect, not an approval:**

| Component | Licence | Problem |
|---|---|---|
| multer | MIT | imported by `stage1InputAcquisition.js`, absent from `package.json` |
| `@babel/parser` | MIT | imported by `codeToIr.js`, absent from `package.json` |

Both licences are fine; the packaging is not. They resolve only where something else
happened to install them, which is why their suites fail on a clean checkout.

**Listed previously but NOT actually dependencies:**

| Component | Reality |
|---|---|
| Ajv | Not installed. `server/src/validate/irValidator.js` is a hand-written schema evaluator, so `npm test` runs with no `node_modules`. The contract's "Ajv" means "JSON Schema validation", and that is what is implemented. |
| `isomorphic-dompurify` | Not installed. Both §8 chokepoints are hand-written for the same reason, and both files say a vetted library is the right production answer. See `docs/THREAT-MODEL.md`. |
| ESLint | Not a root dependency. Invoked against emitted components via `tools/lint-generated.mjs`. |
| pixelmatch | Not installed. `server/src/quality/visual.js` implements pixelmatch's own YIQ metric and its 0.1 default threshold directly. |

## What must never appear in this repository

See `docs/CONTRACT.md` section 14 for the full list: real credentials, real client or
brand names, real storage hosts or database URIs, real MongoDB ObjectIds, field IDs
outside the sanctioned `1000…`/`2000…`/`3000…` ranges, absolute local paths, and model
weight files (`*.pt`, `*.onnx`, `*.safetensors`). It is enforced at write time by the
hooks in `.claude/hooks/`, at commit time by `.githooks/pre-commit`, and at push time
by `.githooks/pre-push` — the last of which scans the repository's **full git
history**, not just the current working tree, because a secret removed in a later
commit is still a leak.
