# Framewright

Framewright is a studio application that turns a wireframe, a prompt, or existing
component code into a CMS-editable, contract-compliant React section — validated,
traced, and reproducible. The full behavioural contract lives in `docs/CONTRACT.md`;
the build plan lives in `docs/ROADMAP.md`. If any two artifacts in this repository
ever disagree with `docs/CONTRACT.md`, the contract wins and the other is a bug.

## Status

**Harness only.** This repository currently contains repository hygiene, git hooks,
and configuration — the enforcement floor the rest of the project is built on. No
application code has been written yet. See `docs/ROADMAP.md` Phase 0 for what this
repository satisfies today, and Phase 1 onward for what has not started.

## Run commands

The application itself does not exist yet. These are the commands it will use once
the corresponding roadmap phase lands; each row is marked with the phase that
introduces it, so this table stays honest as the project grows instead of describing
software that isn't there yet.

| Command | Purpose | Introduced |
|---|---|---|
| `npm install` | install frontend and API dependencies | Phase 1 |
| `npm run dev` | start the Vite frontend, `http://localhost:5173` | Phase 1 |
| `npm run server` | start the Node/Express API, `http://localhost:5000` | Phase 1 |
| `npm test` | run the automated checks, including the store-liveness assertion (`docs/CONTRACT.md` section 9) | Phase 1 |
| `npm run lint` | run ESLint against generated and hand-written code | Phase 2 |
| `python -m perception.server` | start the local Python perception service | Phase 3 |

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

Every component below is approved for use as of the date this table was last
reviewed. `docs/CONTRACT.md` is the source of truth if this table and the code ever
disagree.

| Component | Licence | Status |
|---|---|---|
| DETR | Apache-2.0 | Approved |
| PaddleOCR | Apache-2.0 | Approved |
| Florence-2 | MIT | Approved |
| PrimeReact | MIT | Approved |
| Tailwind CSS | MIT | Approved |
| Ajv | MIT | Approved |
| ESLint | MIT | Approved |
| multer | MIT | Approved |
| @babel/parser | MIT | Approved |
| isomorphic-dompurify | MIT | Approved |

## Forbidden dependencies

Each of these is named explicitly because it is a real licence trap for a project
with this shape, not a hypothetical one. Do not add any of them, and check before
adding a dependency that might vendor one of them in transitively.

| Component | Licence issue | Why it is forbidden |
|---|---|---|
| YOLOv8 / Ultralytics | AGPL-3.0 | AGPL's network-use clause requires source disclosure for any networked use of the software, including a hosted API. That is incompatible with a project deliverable that runs as a service under evaluation. |
| LayoutLMv3 (the published pretrained weights) | CC-BY-NC-SA-4.0 on the weights | The LayoutLMv3 **code** repository is MIT, but the published pretrained **weights** are released under a non-commercial, share-alike licence. Using the code is fine; loading the published weights is not — they would need to be trained from scratch under a compatible licence to be usable here. |
| Qwen2.5-Coder-3B | `qwen-research` licence — non-commercial only | The 3B checkpoint's licence restricts use to research. The 7B checkpoint of the same model family is released under Apache-2.0 and is the approved substitute — use the 7B size instead of the 3B. |
| OmniParser | Conflicting licence signals across its own repository and its dependencies | Not verified clean as of this writing. Treat as forbidden until a licence audit clears it explicitly — do not use it in the meantime. |

## What must never appear in this repository

See `docs/CONTRACT.md` section 14 for the full list: real credentials, real client or
brand names, real storage hosts or database URIs, real MongoDB ObjectIds, field IDs
outside the sanctioned `1000…`/`2000…`/`3000…` ranges, absolute local paths, and model
weight files (`*.pt`, `*.onnx`, `*.safetensors`). It is enforced at write time by the
hooks in `.claude/hooks/`, at commit time by `.githooks/pre-commit`, and at push time
by `.githooks/pre-push` — the last of which scans the repository's **full git
history**, not just the current working tree, because a secret removed in a later
commit is still a leak.
