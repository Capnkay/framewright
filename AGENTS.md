# Framewright — instructions for coding agents and humans

This is the canonical instruction file for this repository. Every other instruction file
points here. If you are an AI coding agent, read this before touching anything.

**What this is.** A generator that turns a wireframe image, existing React code, or a
natural-language prompt into a CMS-ready React section — component, section metadata,
element records, and a live preview. Built for a 2–2.5 day hackathon. **React and Node
are mandatory.**

---

## Start here — the whole ritual is one command

```
continue build
```

Which means, in order:

1. `git pull --rebase` — other people's claims land before you take one.
2. `node tools/baton.mjs status` — the board. Who holds what, what is blocked.
3. `node tools/baton.mjs next` — the next task whose dependencies are met.
4. **Open the contract sections the task names.** `docs/CONTRACT.md` is the specification.
   The task title is a label. Building from the title is how the contract gets violated by
   someone who believes they are complying.
5. `node tools/baton.mjs claim <id>` — then push the claim immediately.
6. Build it.
7. `node tools/baton.mjs done <id>` — runs the task's verification. A failing verification
   means not done. It does not mean the verification is wrong.
8. Commit with the task id in the message, and push.

Full protocol, failure cases, takeover rules: `docs/BATON.md`.

**First time on this machine?** `SETUP.md`. It is four commands and one of them matters
more than the others: `git config core.hooksPath .githooks`.

---

## Where the current state lives

| Question | File |
|---|---|
| What is done, in flight, next, blocked? | **`_build/STATE.md`** — machine-generated, never hand-edited |
| Full task list with dependencies | `_build/TASKS.md` — also generated |
| The specification | `docs/CONTRACT.md` — frozen, versioned |
| The plan, phases, gates, demo script | `docs/ROADMAP.md` |
| What changed in a frozen document, and why | `docs/corrections/REGISTER.md` |
| Things that behave surprisingly | `docs/EDGE-CASES.md` |
| Measured results, not assumptions | `docs/BENCHMARK-RESULTS.md` |
| How each pipeline stage works | `docs/html/stages/index.html` |
| Security posture | `docs/THREAT-MODEL.md` |

**Do not restate build progress anywhere else.** `_build/STATE.md` is generated from
`_build/tasks.json` by the tooling. A hand-written progress summary drifts from it within
hours and then quietly lies to whoever reads it next.

---

## The rules that decide whether we score

1. **`docs/CONTRACT.md` wins.** If code and contract disagree, the code is a bug. If you
   believe the contract is wrong, fix the contract *and* log it in
   `docs/corrections/REGISTER.md`. Never quietly diverge.

2. **The store must be alive, and you must prove it.** Every text node renders as
   `data?.[id] || "DEFAULT"`, so a completely dead store looks pixel-identical to a
   working one. It compiles, lints, passes schema validation and passes a screenshot
   check. It fails only when someone changes a value and nothing moves — which is exactly
   what the judging script asks a judge to do. The §9 assertion is the only thing that
   catches it. It runs on every commit. **Never disable it.**

3. **The contract's oddities are requirements, not smells.** `dangerouslySetInnerHTML`,
   the `dynamicStyle` and `dynamicStyle2` marker classes, the `const ids` map, applying
   CSS via `getElementById` — every one of these looks like something to clean up, and
   every one is graded. "Improving" them costs the 25-point criterion. This is the single
   most likely way an AI executor damages this project while believing it is helping.

4. **IDs come from the API. Always.** Ten digits, allocated centrally, persisted. Never
   `Math.random()`, `Date.now()`, `uuid`, or `nanoid`. Never from a model.

5. **The deterministic path always works.** Any change that makes generation *require* an
   API key, a GPU, or a network is rejected. Prompt mode and the CMS contract must stay
   fully demonstrable with the perception service stopped and `LLM_API_KEY` unset.

6. **Producer and verifier are never the same.** Nothing is done until something that did
   not build it has checked it — a test, a schema, or another person.

7. **No secret ever reaches a commit.** The hooks are not advisory; a hook that errors
   denies. If a hook blocks something legitimate, fix the hook and log it — never weaken
   it to get past it.

8. **Every claim carries a source**, and says whether it was verified or merely reported.

---

## Never

- Commit a real key, hostname, client name, or database URI.
- Execute user-pasted code. Parse it to an AST. Never `eval`, `new Function`, or `vm` —
  Node's `vm` is not a security boundary.
- Use **YOLOv8** (AGPL, network clause), **LayoutLMv3 weights** (CC-BY-NC-SA even though
  the code repo is MIT), or **Qwen2.5-Coder-3B** (non-commercial — and it is precisely the
  one that fits a small GPU, which is the trap). See the README licence table.
- Commit model weights, `uploads/`, `artifacts/`, or `node_modules/`.
- Add a git remote, push to a public repository, or deploy. Those are deliberate team
  decisions, not side effects of a build step.
- Mark a task done because it looks right. The verification decides.

---

## Working agreement for AI executors specifically

- **One task at a time.** Claim it, build only what its `files` list covers, finish it.
  If you need to edit a file the task does not declare, stop — either the task is wrong
  (fix `tasks.json` and log it) or you are doing someone else's task.
- **The task names its contract sections. Open them.** They are the requirement; the title
  is not.
- **Do not refactor adjacent code.** Six people are working in this repository
  concurrently. A tidy-up outside your task's scope creates a merge conflict for someone
  who is asleep.
- **Do not invent fields, endpoints, or file shapes.** If the contract does not define it,
  it does not exist yet. Ask, or log the gap.
- **If a verification fails, report it.** Do not adjust the verification to pass.

---

## Tooling notes

This repository follows the [AGENTS.md](https://agents.md/) convention — one canonical
instruction file, with tool-specific files pointing at it rather than duplicating it.

| Tool | Reads | Status here |
|---|---|---|
| Claude Code | `CLAUDE.md` | imports this file, plus Claude-specific notes |
| Antigravity IDE | `.agents/rules/` | rule file present, references this file |
| Cursor, Copilot, Devin Desktop, Gemini CLI, Codex | `AGENTS.md` | this file |

**Unverified:** Antigravity's own documentation describes `.agents/rules/` and
`.agents/skills/`, and does **not** state that it auto-reads a root `AGENTS.md`. Several
third-party sources claim it does; the primary docs contradict them. We have covered both
paths rather than betting on either. If you are the first person to run Antigravity on
this repo, please confirm which file it actually picks up and record it in
`docs/EDGE-CASES.md`.
