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

---

## EC-013 · Installing any package silently replaces your CUDA torch with the CPU build
**Date:** 2026-08-20 · **Status:** guarded by `perception/constraints.txt`

`pip install transformers` in `perception/.venv` upgraded torch from **2.6.0+cu124** to
**2.13.0+cpu** and destroyed a working CUDA install.

**Nothing warned.** The install printed a success line. `import torch` worked. The only
symptom was `torch.cuda.is_available()` flipping from `True` to `False`, and `GET /health`
going from `cuda:0` back to `cpu` — which reads exactly like EC-012, a problem you have
already "fixed", so the temptation is to go and rebuild the venv from scratch.

**Why it happens:** the CUDA wheels live on `download.pytorch.org`, not PyPI. Any package
that declares a `torch` dependency lets pip resolve it from **PyPI**, where the only wheel is
the CPU one — and pip considers 2.13.0 an upgrade over 2.6.0, so it takes it.

**How to tell it is this and not a broken GPU:** `nvidia-smi` still shows the card,
`torch.__version__` ends in `+cpu` rather than `+cu124`. The version string is the tell, and
it is the first thing to check.

**The second failure, which arrives while fixing the first.** Reinstalling the CUDA torch
leaves torchvision pinned to the version installed alongside the newer torch, and it fails at
import with:

```
RuntimeError: operator torchvision::nms does not exist
```

That error names neither package's version and reads like a corrupt install. It is a
mismatch: **torch and torchvision versions are coupled.** torch 2.6.0 pairs with torchvision
0.21.0.

**Do — recover:**

```
python -m pip install --force-reinstall --no-deps <cached torch cu124 wheel>
python -m pip install --force-reinstall --no-deps torchvision==0.21.0+cu124 \
  --index-url https://download.pytorch.org/whl/cu124
python -c "import torch,torchvision;from torchvision.ops import nms;print(torch.__version__,torch.cuda.is_available())"
```

`--no-deps` is the load-bearing flag: it stops pip resolving torch's dependency tree and
reaching for a PyPI wheel, which is how the CPU build gets back in.

**Do — prevent.** Use the constraints file on every install into that venv:

```
perception/.venv/Scripts/python -m pip install -c perception/constraints.txt <package>
```

Verified: with the constraints file, `pip install torch==2.13.0` fails with
`ResolutionImpossible`, and `pip install transformers` resolves without touching torch.

**Why a constraints file and not just this warning.** EC-012 already documented the CPU-wheel
trap, in detail, with the reasoning. The person who hit EC-013 is the person who wrote
EC-012, the same day. A comment does not stop a resolver; a constraint does, because pip
enforces it rather than relying on anyone reading anything.

**One thing not to do:** never paste `pip freeze` output into a tracked file. It records this
venv's torch as a `file:///D:/...` URL — an absolute local path, which §14 forbids because it
leaks a real username. `constraints.txt` uses plain version specifiers for that reason.

---

## EC-014 · torch and paddlepaddle-gpu cannot share a process, in either order
**Date:** 2026-08-21 · **Status:** stage 3b degrades; `/health` guarded

Installing PaddleOCR for T-098 produced a hard conflict with the CUDA torch this venv
already had. Both are installed, both work **alone**, and they cannot be used together:

```
import paddle                  ->  paddle 2.6.2, gpu True        OK
import torch                   ->  torch 2.6.0+cu124, cuda True  OK
import torch;  import paddle   ->  ImportError: generic_type: type
                                   "_gpuDeviceProperties" is already registered!
import paddle; import torch    ->  OSError: [WinError 127] ... Error loading
                                   ...	orch\lib\shm.dll or one of its dependencies
```

Both libraries bind CUDA device properties into the same process-global pybind11 type
registry. Whichever loads second finds the name taken. There is no import order that
works, so this is not something to sequence around.

**The two error messages are both misleading, which is the expensive part.** Neither
names the other library. `_gpuDeviceProperties is already registered` reads like a
duplicate-install problem, and `WinError 127 ... shm.dll` reads exactly like the broken
CUDA install of EC-012 and EC-013 — a trap this repository has now fallen into twice.
**Check whether paddle is in `sys.modules` before you rebuild the venv again.**

**Do not "fix" it by removing the constraints file.** It is not the CPU-wheel problem.
torch is intact throughout: `2.6.0+cu124`, `cuda True`, `torchvision.ops.nms` imports.
`perception/constraints.txt` did its job — the install added paddle without touching
torch, which is exactly what it exists to guarantee.

### A second finding, which is the one that actually bit

**`except ImportError` is too narrow for an optional dependency.** Three places guarded
an optional import that way, and all three broke, because *a library that is installed
but cannot load raises `OSError`, not `ImportError`*:

| Site | Was | Effect of the narrow except |
|---|---|---|
| `app.py` `detect_device` | `except ImportError` | `GET /health` returned 500 — on a liveness endpoint whose own docstring says it "reports state, it does not fail" |
| `app.py` `detect_models` | `except ImportError` | same |
| `extract_text.load_reader` | `except ImportError` | a DLL failure escaped as a stage crash, the outcome §12 forbids |

All three now catch `Exception`. The rule worth carrying: **an optional dependency's
guard must catch failure to LOAD, not merely failure to FIND.** Absent and
present-but-broken are the same fact to a caller, and only the broad except treats them
that way.

Note this was invisible until PaddleOCR was really installed. Every one of these guards
was tested — with the dependency absent, where `ImportError` is exactly what is raised.

### Consequence for stage 3b, stated plainly

**OCR does not currently run on this machine.** `load_reader()` returns `None`,
`extract_text` degrades to regions-without-text, and §12's degradation path — which is
mandatory, not a fallback — carries the pipeline. Region detection is unaffected: T-056
is pure OpenCV and scores B-003's 7/7 regardless.

**torch's only production use in `perception/` is reporting the device on `/health`**
(`app.py:50`). Its other two uses are `benchmarks/detr_wireframe.py`, the B-002
benchmark that scored 0 of 7, and a test. So the conflict is between an OCR engine the
pipeline wants and a device-reporting convenience it does not need. Three ways out, none
taken here because none is T-098's to take:

1. **Drop torch from `perception/.venv`.** Paddle then loads, OCR runs, and
   `detect_device` reads the device from `paddle.device` instead. Cheapest, and it
   matches what the perception stack actually is: OpenCV plus PaddleOCR. Costs the
   ability to re-run B-002 in this venv.
2. **CPU `paddlepaddle`.** Untested here — it plausibly never registers the GPU type at
   all. Stage 3b runs slower; nothing else changes.
3. **Run OCR out of process.** Correct, and the most work.

### RESOLVED 2026-08-21 — OCR runs out of process

Stage 3b now reads text. `perception/stages/ocr_worker.py` runs PaddleOCR in its own
interpreter and `SubprocessReader` in `extract_text.py` drives it, so the service keeps
real torch for `/health` and the worker keeps paddle to itself.

Verified end to end with real torch loaded in the parent:

```
parent torch: 2.6.0+cu124 cuda True
reader: SubprocessReader
  region -> 'TRAIN WITHOUT LIMITS'  0.988
  region -> 'FIND A WORKOUT'        0.968
```

**A process boundary alone was not enough, and this is the part worth remembering.** A
clean interpreter running `from paddleocr import PaddleOCR` *still* fails: paddleocr
2.10 imports paddle in its own `__init__` and then reaches albumentations, which imports
torch. The collision happens inside paddleocr's own import chain. The worker therefore
installs a stub module under the name `torch` before that chain starts. Safe only
because nothing in the worker wants real torch — which is exactly why it is confined to
a worker instead of done in the service.

**Two more things the install taught, neither of which was guessable:**

1. **A working torch CUDA install proves nothing about paddle's.** With `use_gpu=True`
   the worker died on `Could not locate cudnn_ops_infer64_8.dll` — torch bundles its own
   cuDNN, paddle expects system libraries. The worker runs **CPU** inference. A
   wireframe carries a few dozen words, it costs well under a second, and §12 wants the
   pipeline to run with the GPU absent anyway.
2. **Availability must be probed by RUNNING, not by importing.** `import paddleocr`
   succeeds in the service and then cannot run. `load_reader()` asks the worker to read
   a 1×1 image and believes the answer. A `find_spec` check would hand back a reader
   that reports success and returns nothing, which is worse than no reader at all.

**Known limitation.** `GET /health` still probes paddleocr in-process, so it omits
`paddleocr` from `models` even though OCR now works. It under-reports rather than
over-reports, which is the right direction to be wrong in, and fixing it means giving
`detect_models` a cached worker probe rather than an import — a `perception/app.py`
change belonging to whoever owns T-054.


---

## EC-015 · The OCR worker dies at random, and reports it as "the page had no text"
**Date:** 2026-08-22 · **Updated:** 2026-08-23 (T-131) · **Status:** reported honestly and retried; the standing suspicion is now ELIMINATED and the cause is still not found

Three back-to-back runs of the full perception pipeline on `gpu-test/wireframe.png`,
same interpreter, same image, nothing changed between them:

| Run | `ocrAvailable` | Regions with text | Worker exit |
|---|---|---|---|
| 1 | true | **7** | 0 |
| 2 | true | **0** | `3221225477` |
| 3 | true | **0** | `3221225477` |

`3221225477` is `0xC0000005` — **ACCESS_VIOLATION**. The worker segfaults after printing
its startup banner and before printing its JSON. This is next door to EC-014 and almost
certainly the same underlying quarrel between torch and paddle over CUDA globals, but
that is a guess and it is labelled as one: the cause was **not** established.

### The part that cost real time: the failure was invisible

`SubprocessReader.ocr` parsed stdout inside a `try` and returned `[None]` from a bare
`except` for every failure. It never looked at `returncode`. So a killed worker and a
blank page arrived at `extract_text` as the same value, and both were reported as:

> `OCR ran but found no text in the image.`

which was **false two times in three**, and which points a reader at the wireframe —
where nothing is wrong — instead of at the worker. The Glass Box showed stage 3b green
with an empty result. `Extraction`'s own docstring already said why this matters: "a
page where OCR ran and found nothing and a page where OCR never ran are different facts,
and the degradation path in §12 depends on telling them apart." The code had the field
and threw away the input to it.

**The rule worth carrying, and it is EC-014's rule one layer out:** a subprocess guard
must inspect the **exit code**, not only the output. Output-only parsing cannot tell a
process that finished with nothing to say from one that was killed mid-sentence, and on
Windows the killed one still prints enough to look plausible.

### What was changed

- `_run_once` inspects `returncode` and returns a *reason*, distinguishing exit code,
  timeout, unparseable output, and a worker that reported its own failure. `0xC0000005`
  is glossed in words, because nobody recognises it in decimal.
- A worker that **died** is retried (`WORKER_RETRIES = 2`). A worker that exited cleanly
  having found nothing is **not** — it answered the question, and retrying it would
  spend a 5 s start-up per attempt to hear the same answer and turn the one healthy case
  into the slowest one.
- `extract_text` emits the worker-death warning or the empty-page warning, never the
  wrong one, and `ocrAvailable` is now `false` when the page was never actually read.

### The measurement, and what it does and does not show

Ten consecutive pipeline runs after the change: **10/10 read all 7 regions**, every run
≈5 s.

**That 10/10 is not evidence the retry works.** Every run took a single attempt — a
rescued crash would have cost ≈10 s — so the crash simply did not recur in that window.
Across the session it appeared in bursts: 2/2 crashes in one window, 0/8 in another,
2/3 in a third, 0/10 in the last. It is **episodic**, and its trigger is unknown.

The retry path itself is exercised under fault injection in
`test_a_dead_worker_is_retried_before_the_page_is_given_up_on`, not by a live crash.
Treat the retry as insurance whose premium has been paid and whose payout has not yet
been observed in production.

**Still open.** Root cause. If it recurs, the next thing to try is a dedicated
paddle-only virtualenv — `SubprocessReader(python=...)` already takes the interpreter as
a constructor argument precisely so that is a config change and not a rewrite.


---

### T-131 · The torch hypothesis, tested and eliminated

The suspicion above — a quarrel between torch and paddle over CUDA globals, next
door to EC-014 — was labelled a guess. It was testable, and it has now been tested.

**It is not supported.** 55 runs of the worker, spawned exactly as `SubprocessReader`
spawns it, across three conditions:

| condition | runs | crashes |
|---|---|---|
| sequential, from a bare interpreter | 20 | **0** |
| sequential, parent holding torch with a **live CUDA context** | 20 | **0** |
| three workers concurrently, five rounds | 15 | **0** |

The middle row is the one that matters, and it is why the first harness was not
enough. `/health` imports torch and reports the device, so in production the process
that spawns the worker is already holding torch and, on a GPU machine, a CUDA
context. A harness that spawns from a bare interpreter never reproduces that. The
second run allocates on the GPU and synchronises first — the state the service is
actually in — and the worker still did not die, 20 times.

Every run read the same 8 lines. `torch 2.6.0+cu124`, RTX 3050 6GB.

**So the plan this was going to justify was not carried out, and that is the
finding.** The next step on the board was a paddle-only virtual environment, to
remove real torch from the worker's interpreter. Against a 0% baseline that would
have produced a second 0% and no information — two identical numbers and nothing
learned. Building it anyway and reporting "no crashes after the fix" would have been
a claim the measurement does not support.

Worth noting for whoever revisits this: the worker **already** neutralises torch. It
installs a stub module under that name before `paddleocr` imports albumentations, for
the reason the worker's own docstring gives. So the interpreter was never loading real
torch in the first place, which makes the negative result less surprising in
hindsight than it looked going in.

### What replaced it: a correlation, stated as one

One thing did change between the crash window and these clean runs. The crashes were
recorded on 2026-08-22. On that same day the drive holding this machine's temp
directory was found **completely full** — a probe write returned `ENOSPC` directly —
and clearing ~5 GB of package cache also turned an unrelated suite from shifting
failures to 712 of 712.

`_run_once` writes the page into `tempfile.mkdtemp()`, on that drive, and PaddleOCR
reads its model cache from it. **A native library that hits `ENOSPC` mid-write is
entirely capable of faulting rather than returning an error.**

That is a correlation and nothing more. It was not reproduced, because refilling the
disk to test it is not a reasonable thing to do to a working machine, and one
coincidence of dates is not a cause.

### What was changed

`_run_once` checks free space before spawning and refuses in words:

> `only 3 MB free on the drive holding C:\...ramewright-ocr-xyz; the OCR worker
> needs room for the page and its model cache (docs/EDGE-CASES.md EC-015)`

**This does not fix a cause it cannot name.** It makes the most plausible one legible.
EC-015's real cost was never the crash — it was that the crash arrived disguised as
"OCR ran but found no text in the image", which sends the reader to the wireframe,
where nothing is wrong. If the disk is the trigger, the next occurrence now says so
instead of arriving as a number in decimal that nobody recognises.

Two tests hold it: one that the guard fires with a named, actionable reason and
**not** the empty-page sentence, and one that it stays invisible on a machine with
room — a check that refuses on a healthy machine would trade an episodic failure for
a constant one, which is worse than the bug.
