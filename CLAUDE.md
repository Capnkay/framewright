# Framewright — working agreement

Auto-loaded every session. Short on purpose. Detail lives in `docs/`.

**What this is.** A generator that turns a wireframe, existing code, or a prompt into a
CMS-ready React section — component, section metadata, element records, and a live
preview — built for a 2–2.5 day hackathon. React and Node are mandatory.

---

## On "begin build" or "continue build"

Do this in order. Do not skip step 1 and do not skip step 5.

1. **`git pull --rebase`** — other people's claims must land before you take one.
2. **`node tools/baton.mjs status`** — the board. Who holds what, what is blocked.
3. **`node tools/baton.mjs next`** — the next available task.
4. **Open the contract sections the task names.** `docs/CONTRACT.md` is the spec. The
   task title is a label, not a requirement. Building from the title is how the contract
   gets violated by someone who believes they are complying.
5. **`node tools/baton.mjs claim <id>`**, then push the claim immediately.
6. Build it.
7. **`node tools/baton.mjs done <id>`** — runs the verification. A failing verification
   means not done. It does not mean the verification is wrong.
8. Commit with the task id in the message, and push.

Full protocol, failure cases, and takeover rules: `docs/BATON.md`.

---

## The rules that decide whether we score

1. **`docs/CONTRACT.md` wins.** If code and contract disagree, the code is a bug. If you
   believe the contract is wrong, fix the contract and log it in
   `docs/corrections/REGISTER.md` — do not quietly diverge.

2. **The store must be alive, and you must prove it.** Every text node renders as
   `data?.[id] || "DEFAULT"`, so a completely dead store looks pixel-identical to a
   working one. It compiles, it lints, it passes schema validation, it passes a
   screenshot check. It fails only when a judge changes a value and nothing moves — which
   is exactly what the demo script asks them to do. The §9 assertion is the only thing
   that catches it. It runs on every commit. Never disable it.

3. **The contract's oddities are requirements, not smells.** `dangerouslySetInnerHTML`,
   the `dynamicStyle` and `dynamicStyle2` marker classes, the `const ids` map, applying
   CSS by `getElementById` — every one of these looks like something to clean up, and
   every one is graded. Improving them costs the 25-point criterion.

4. **IDs come from the API. Always.** Ten digits, allocated centrally, persisted. Never
   `Math.random()`, `Date.now()`, `uuid`, or `nanoid`. Never from a model.

5. **The deterministic path always works.** Any change that makes generation require a
   key, a GPU, or a network is rejected. Prompt mode and the CMS contract must stay fully
   demonstrable with the perception service stopped and `LLM_API_KEY` unset.

6. **Producer and verifier are never the same.** Nothing is done until something that did
   not build it has checked it — a test, a schema, or another person.

7. **No secret ever reaches a commit.** The hooks are not advisory. A hook that errors
   denies. If a hook blocks something legitimate, fix the hook and log it — never weaken
   it to get past it.

8. **Every claim carries a source.** Registries and documentation say where a fact came
   from and whether it was verified or merely reported.

---

## Never

- Commit a real key, a real hostname, a real client name, or a real database URI.
- Execute user-pasted code. Parse it to an AST. Never `eval`, `new Function`, or `vm`.
- Use YOLOv8 (AGPL, network clause), LayoutLMv3 weights (CC-BY-NC-SA), or
  Qwen2.5-Coder-3B (non-commercial). See the README licence table for what to use instead.
- Commit model weights, `uploads/`, or `artifacts/`.
- Add a git remote, push to a public repository, or deploy. Those are the team's calls to
  make deliberately, not a side effect of a build step.
- Mark a task done because it looks right. The verification decides.

---

## Where things are

| | |
|---|---|
| The spec, frozen | `docs/CONTRACT.md` |
| Plan, phases, gates, demo | `docs/ROADMAP.md` |
| Handoff protocol | `docs/BATON.md` |
| What changed and why | `docs/corrections/REGISTER.md` |
| Security posture | `docs/THREAT-MODEL.md` |
| How each stage works | `docs/html/stages/` |
| The board | `_build/STATE.md` |
| Setup, hooks, environment | `SETUP.md` |
