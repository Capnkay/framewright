---
name: Framewright build rules
activation: Always On
---

# Framewright

Read `AGENTS.md` at the repository root before doing anything. It is the canonical
instruction file and everything below is a summary of it.

## The ritual

`git pull --rebase` → `node tools/baton.mjs status` → `node tools/baton.mjs next` →
**open the contract sections the task names** → `claim` → build → `done` (runs the
verification) → commit with the task id → push.

Current state is always `_build/STATE.md`. It is generated — never hand-edit it and never
restate build progress anywhere else.

## The five that matter most

1. **`docs/CONTRACT.md` wins.** Code that disagrees with it is a bug. Disagree in the
   register, never silently in code.
2. **Never "clean up" the contract's oddities.** `dangerouslySetInnerHTML`, the
   `dynamicStyle` / `dynamicStyle2` marker classes, the `const ids` map, CSS applied via
   `getElementById` — all look like smells, all are graded. Tidying them costs 25 points.
3. **IDs come from the API.** Ten digits, central, persisted. Never `Math.random()`,
   `Date.now()`, `uuid`, `nanoid`, never from a model.
4. **The deterministic path always works.** Nothing may make generation *require* a key,
   a GPU, or a network.
5. **One task at a time, only the files it declares.** Do not refactor adjacent code —
   other people are in this repository right now.

## Never

No real secrets, hostnames, or client names. Never execute pasted code — parse to an AST.
No YOLOv8 (AGPL network clause), no LayoutLMv3 weights (non-commercial), no
Qwen2.5-Coder-3B (non-commercial). No model weights, `uploads/`, or `artifacts/` in git.
Never add a remote, publish, or deploy. Never mark a task done because it looks right —
the verification decides.
