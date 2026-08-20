# Edge Cases

Things that behave surprisingly, and what to do about them. One entry per case.

This file exists so that a session with none of the original conversation behind it can
pick up a problem and act correctly. If you burn twenty minutes on something confusing,
that is not lost time — it is an entry. Write it while it is fresh.

**Format:** what happened, why, what to do, and how to tell it is this and not something
else. Add the date. Do not delete entries; mark them resolved.

---

## EC-001 · A perfect-looking preview with a completely dead store
**Date:** 2026-08-19 · **Status:** guarded

Every text node renders `data?.[id] || "DEFAULT"`. With no store data at all, the section
renders pixel-identical to a working one — correct copy, correct layout, correct
responsive behaviour. It compiles, lints, and passes schema validation and screenshot
comparison.

**How to tell:** change a value and watch. If the preview does not move, the store is dead.
Check `state.cms.missing[pageName]` — a non-empty array names exactly which IDs never
arrived.

**Common causes:** `pageName` case mismatch (`Home` vs `home`); elements written under a
different `sectionId`; the API returning `{data:[...]}` where the reducer expects `[...]`;
nested card IDs absent from the mount-time fetch.

**Do:** never disable the §9 assertion. It is the only thing that catches this.

---

## EC-002 · Card fields render defaults forever while everything else works
**Date:** 2026-08-19 · **Status:** guarded by CONTRACT §5.0

A `Cards` element writes its `loop` array at its own `fieldId`. If the reducer stops
there, `data[item.fieldId1]` is permanently `undefined`, every card falls back to its
baked-in default, and per-card CSS overlay becomes impossible — silently.

**How to tell:** PATCH a nested card field. If the text does not change, the flattening
step is missing.

**Do:** the reducer must ALSO write every nested `fieldIdN` as its own top-level key. See
CONTRACT §5.0.

---

## EC-003 · Regeneration wipes the content it was supposed to preserve
**Date:** 2026-08-19 · **Status:** guarded by CONTRACT §6 `contentPolicy`

Preserving a `fieldId` while overwriting its `content` preserves nothing a human can see.
The judge's typed headline is replaced by the default, under the same ID.

**How to tell:** type something into a field, regenerate, see if it survives.

**Do:** regeneration forces `contentPolicy: "keep"`. An ID is not the thing being
preserved; the content reachable through it is.

---

## EC-004 · A four-card array renders three stale defaults
**Date:** 2026-08-19 · **Status:** guarded by CONTRACT §7 R9

The reference component in the source brief guards with `length === 3`. Copied literally,
any card count other than three fails the check and silently falls back.

**Do:** guard on `Array.isArray(...) && length > 0`, and render `items.length` cards. Never
compare against a literal.

---

## EC-005 · Hooks block something legitimate
**Date:** 2026-08-19 · **Status:** open, by design

The security floor will occasionally deny correct work. It has already done so twice
during setup — once blocking a required deliverable, once blocking a legitimate audit
command.

**Do:** fix the hook and log it in `docs/corrections/REGISTER.md`. **Never weaken a hook to
get past it, and never disable one.** A floor that gets removed at hour 40 is worse than a
smaller floor that survives, because the team still believes it is protected.

---

## EC-006 · Manifest fails on a fresh clone, but is fine locally
**Date:** 2026-08-20 · **Status:** guarded by `.gitattributes`

`sha256sum -c LAW-MANIFEST.sha256` passes on the machine that generated it and fails on
every clone, because Git rewrote line endings on checkout. If the manifest file itself is
converted, the filenames inside it carry a trailing `\r` and cannot be opened at all —
the error reads "No such file or directory" for a file that plainly exists.

**How to tell:** `file .githooks/pre-commit` reports CRLF, or the error names a file you
can see on disk.

**Do:** `.gitattributes` pins `* text=auto eol=lf`. If you ever regenerate the manifest,
regenerate it from LF content, and check `git diff --stat` after — a whole-file diff on
something you did not edit means line endings moved.

---

## EC-007 · You finished a task and now you cannot commit it
**Date:** 2026-08-20 · **Status:** fixed

The ritual is build → `baton done` → commit. `done` marks your claim complete. If the
pre-commit check requires an *active* claim, step 8 is blocked by step 7 — on every task.

**How to tell:** `baton done` succeeds, then the very commit it tells you to make is
refused for having no open claim.

**Do:** already fixed — the hook accepts a claim that is `active` **or** `done`, belonging
to you. If you see this again, the hook has regressed; fix the hook, do not skip it.

---

## EC-008 · A vision model that describes your wireframe perfectly and finds nothing in it
**Date:** 2026-08-20 · **Status:** measured, architecture changed

Florence-2 called our hand-drawn wireframe *"a hand-drawn website layout"* — correct — and
then returned one bounding box around the entire image. Short labels via
`<OPEN_VOCABULARY_DETECTION>` returned no boxes at all.

**How to tell:** the box covers >75% of the frame, or the caption is accurate while the
detection is empty. The model is not confused; it is answering a different question well.

**Why:** general vision models are trained on photographs. Nothing in that distribution
teaches that a line drawing decomposes into UI components. This is not fixable by
prompting.

**Do:** do not spend hours on prompt variations. Use classical CV for a drawing of
rectangles, and train a detector on data you generate yourself. Record the measurement —
it is worth more to a judge than a working model would have been, because it explains why
the architecture is shaped the way it is.

---

## EC-010 · Vercel refuses to deploy, and the cause is the commit author
**Date:** 2026-08-20 · **Status:** fixed

Four deployments failed in a row. The build was never the problem. Vercel rejected them
because the commit author email was `team@example.local`, which is not a deliverable
address, so Vercel could not identify the author and declined to deploy at all.

**How to tell:** the GitHub commit shows a failed check, the site returns 404 rather than
a broken page, and Vercel's own message says *"the commit author email is not a valid
email address."* The absence of a *build* error is the tell — if the build had run and
failed, there would be a build log.

**Why it happened here:** an automated commit used a deliberately fake address to avoid
committing a real one. The `.local` TLD is reserved and unroutable, which is exactly why
it looked safe and exactly why Vercel rejected it.

**Do:** commit as a real person. `git config user.email` should be the address on the
GitHub account, and automated commits must use it too rather than inventing a placeholder.
A commit author is not the same kind of secret as an API key.

**Cost of getting this wrong:** roughly an hour, and three fixes to things that were never
broken. When a deploy fails and there is no build log, look at the commit metadata before
looking at the build configuration.

---

## EC-011 · A page loses its stylesheet only when deployed
**Date:** 2026-08-20 · **Status:** fixed

`/stages` rendered completely unstyled on Vercel while working perfectly locally.

**Cause:** `cleanUrls` rewrites `/stages/index.html` to `/stages` — with no trailing slash.
A relative `href="_card.css"` then resolves against `/` instead of `/stages/`, so the
browser requests `/_card.css` and gets a 404. Locally the URL keeps its `/index.html`, the
relative path resolves correctly, and nothing looks wrong.

Only the directory index breaks. Pages one level deeper (`/stages/01-...`) resolve
relative paths correctly, which makes it look like a one-page problem rather than a
configuration one.

**How to tell:** the page renders with default serif fonts and no layout, and the console
shows a single 404 for the stylesheet.

**Do:** use root-absolute stylesheet paths — `/stages/_card.css`, not `_card.css`. All 14
pages in that directory now do. Check the browser console on the deployed site, not only
locally; this class of fault is invisible until it is served.

---

## EC-012 · /health says `cpu` on the machine with the GPU in it
**Date:** 2026-08-20 · **Status:** RESOLVED same day — `/health` reports `cuda:0`

Roadmap gate 0.7 is "`GET /health` returns `cuda:0`". On this machine it returns `cpu`, and
nothing is broken.

**Why:** there are two Python interpreters here with different torch builds, and **neither
one can run the service on the GPU**:

| Interpreter | torch | CUDA | fastapi |
|---|---|---|---|
| system `python` (3.14) | `2.12.1+cpu` | no | yes |
| `gpu-test/.venv` | `2.6.0+cu124` | **yes, RTX 3050** | **no** |

So the service runs on the interpreter without CUDA, and the interpreter with CUDA cannot
import the service. Gate 0.7 cannot pass until one environment has both.

**How to tell it is this and not a GPU fault:** `detect_device()` returns `cpu` while
`gpu-test/.venv/Scripts/python -c "import torch; print(torch.cuda.is_available())"` prints
`True`. The GPU is fine. The interpreter is wrong.

**Root cause worth remembering:** `pip install torch` pulls the **CPU** build from PyPI.
The CUDA wheels live on a separate index and must be asked for explicitly. Nothing warns
you — the install succeeds, the import succeeds, and only `torch.cuda.is_available()` tells
the truth.

**Do:** build one venv that has both, GPU wheel first — **and build it on Python 3.10**:

```
"C:/Users/<you>/AppData/Local/Programs/Python/Python310/python.exe" -m venv perception/.venv
perception/.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu124
perception/.venv/Scripts/python -m pip install -r perception/requirements.txt
```

**The interpreter version is the part that bites, and the first version of this entry got
it wrong.** `python -m venv` picks whatever `python` is first on PATH — here that is 3.14 —
and there is no `cu124` wheel for it. The cached wheel is `cp310`, meaning CPython 3.10 and
nothing else. Use the `py` launcher to see what you actually have: `py -0p`.

Then check `/health` before writing any perception code. `perception/requirements.txt`
deliberately does **not** list torch, with a comment saying why, so nobody installs the CPU
build by accident.

**Do not** hardcode `cuda:0` to make the gate pass. `detect_device()` returning `cpu`
honestly is what makes gate 0.7 mean anything — a hardcoded answer passes on a machine with
no GPU at all and sends the next person hunting a fault that does not exist. T-054's test
asserts the function agrees with `torch.cuda.is_available()` in both directions.

**Resolved, 2026-08-20.** `perception/.venv` built on Python 3.10.11 from the wheel already
cached at `gpu-test/torch-2.6.0+cu124-cp310-cp310-win_amd64.whl`, which skipped a 2.5 GB
download — check for that file before pulling from the index again.

```
$ curl -s http://127.0.0.1:8100/health
{"ok":true,"models":["opencv-contours"],"device":"cuda:0"}
```

**Half of roadmap gate 0.7 is closed.** The gate is two claims — "`GET /health`
returns `cuda:0`; one wireframe survives the perception path" — and only the first is
true today. The second needs T-055 and T-056; nothing has read a wireframe yet. Do not
record 0.7 as passed until it has. `pytest perception/tests` is 15/15 on the CUDA interpreter as
well as the CPU one, which matters more than it looks: until now, only the `cpu` branch of
`detect_device()` had ever run. Both branches are now exercised, and the test that asserts
the function agrees with `torch.cuda.is_available()` has been checked against a machine
where that value is `True`.

`models` reports `["opencv-contours"]` and not PaddleOCR, because `requirements.txt` leaves
PaddleOCR commented out until T-056 claims it — it is heavy and nothing needs it yet. That
is `/health` telling the truth about the machine, which is the whole point of building it
that way.

**One loose thread:** `fastapi.testclient` emits a `StarletteDeprecationWarning` asking for
`httpx2`. Harmless today, one warning, tests pass. Worth pinning if it ever becomes an
error rather than a warning.
