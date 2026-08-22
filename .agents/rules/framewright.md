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

## Working on UI? Read `docs/UI-SYSTEM.md` first

The Generator Studio's tool chrome (Login, Composer, the Studio page itself — everything
under `client/src/studio/*.jsx` and the route shells) is mid-redesign. Before touching any
of it:

- **The token boundary is the one rule that cannot slip.** Two separate systems now exist:
  `--color-*` in `client/src/index.css` / the `colors` block in `tailwind.config.js` —
  frozen, `docs/CONTRACT.md` §6-§8, generated CMS sections only, never touch it — versus
  `studio-*` (the `.studio-theme` scope, `studio` key in `tailwind.config.js`'s
  `theme.extend`) — this redesign, everything else. A `studio-*` class and a bare
  `bg-background`/`text-accent`/etc. class must never land on the same element.
- `docs/UI-SYSTEM.md` has the full surface inventory + priority order (Login and Composer
  are done — T-135, T-136; Stage Inspector is next), the codified component-variant
  catalog (buttons, inputs, pills, cards — reuse these, don't invent a second style), and
  the motion discipline (restrained everywhere, one signature moment reserved for the
  pipeline timeline, not built yet).
- `docs/DESIGN-TOKENS.md`, `docs/SURFACE-INSPO.md`, `docs/VISUAL-INSPO.md`,
  `docs/MOTION-INSPO.md` are the research behind those choices, if the why matters mid-build.
- This is a Cap'n-directed initiative that sits outside the normal task queue until a
  surface gets its own registered task — `docs/UI-SYSTEM.md` §6 has the exact pattern
  (register in `_build/tasks.json`, claim, build, verify, commit) so it stays visible on
  `baton status` instead of landing as a surprise.

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
