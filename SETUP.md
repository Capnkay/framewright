# Setup

Exact commands to get from a fresh clone to a verified, hook-protected working copy.
Run these once per machine.

## 1. Clone

```
git clone <repository-url> framewright
cd framewright
```

## 2. Install this repository's own git hooks

The pre-commit and pre-push checks (secret scanning, `LAW-MANIFEST.sha256`
verification, and the full-history pre-submit gate) live in `.githooks/` and are
inert until you point git at that folder — a fresh clone does not do this
automatically:

```
git config core.hooksPath .githooks
```

Verify it took effect:

```
git config core.hooksPath
```

This should print `.githooks`.

## 3. Set up your environment file

```
cp .env.example .env
```

Then open `.env` and fill in real values for your machine. Never commit `.env` — it
is git-ignored, and both the Claude Code hooks in `.claude/hooks/` and the git hooks
in `.githooks/` refuse writes/commits that would leak it.

## 4. Verify the harness is live

Confirm `.env.example` is NOT ignored:

```
git check-ignore -v .env.example
```

`git check-ignore -v` prints the winning pattern for ANY path a pattern touches,
including a negation, and exits `0` whenever a pattern matched at all — so seeing
output here is expected and is not by itself a failure. What matters is which pattern
won: this should print `.gitignore:<line>:!.env.example    .env.example` — note the
leading `!`. The `!` means the negation is what decided the outcome, so the file is
NOT actually ignored. If the line printed does NOT start with `!` (for example if it
shows the plain `.env.*` rule instead), the negation is broken and `.env.example`
really is being ignored; stop and fix `.gitignore` before doing anything else.

To confirm this in a way that isn't sensitive to reading the `!`, also run:

```
git status --ignored --porcelain -- .env.example
```

`.env.example` should show as `?? .env.example` (untracked, not ignored). It must
never show as `!! .env.example` (ignored).

Confirm `.env` IS ignored:

```
git check-ignore -v .env
```

This should print `.gitignore:<line>:.env.*    .env` (or the plain `.env` rule) with
no leading `!`, and exit `0`.

Run the commit-time checks directly, without needing to actually commit anything:

```
sh .githooks/pre-commit
```

This should exit `0` on a clean working copy.

Run the full-history pre-submit gate directly, without needing to actually push
anything:

```
sh .githooks/pre-push
```

This should exit `0` when the repository's history contains no secret, no forbidden
hostname, no out-of-range ID, no absolute local path, and no model weight file, and
when `.env.example` is tracked and placeholder-only.

## 5. Verify the golden component

```bash
npm test
```

**Run `npm install` first — the root one is enough for this check.** The §9 assertion
itself is zero-dependency on purpose, and the store, envelope, schemas and sanitiser still
are; but `npm test` as a whole now needs the API's dependencies too, because T-124 wired an
AST parser into `mode=code`. Section 6 below installs them, and until it has, every suite
fails with `ERR_MODULE_NOT_FOUND`.

Expect **13 passing, 0 failing** — including the two that matter most: that every nested
card field gets its own store key, and that patching a nested card field actually changes
what renders.

If this fails on a clean clone, stop and say so before building anything on top of it.

## 6. Install the API dependencies

```bash
cd server && npm install && cd ..
npm run server        # http://localhost:5000
```

`GET /api/health` should return `{"ok":true,"store":"json","perception":"down"}`. Both
values are honest reports, not failures — `json` because no `MONGODB_URI` is set, and
`down` because the perception service is optional and is not running.

The client app arrives with Phase 1's T-001. See `docs/ROADMAP.md`.

## 7. Install the perception service — GPU machine only

Skip this entirely if you are not the perception owner. **Nothing else in this repository
needs it**, and the whole build is required to work with this service stopped
(`docs/CONTRACT.md` section 12).

**Build the virtual environment on Python 3.10, not on whatever `python` resolves to.**
torch's CUDA wheels are built per CPython version and the one this project uses is `cp310`.
`python -m venv` picks the first `python` on `PATH`, and if that is 3.13 or 3.14 there is no
CUDA wheel for it — you will silently get the CPU build.

```bash
py -0p                                        # list the interpreters you have
"<path-to-python3.10>" -m venv perception/.venv
```

Then install the GPU torch build **first**, before anything else. Check for a cached wheel
before pulling 2.5 GB from the index:

```bash
# if gpu-test/torch-2.6.0+cu124-cp310-cp310-win_amd64.whl exists, install that file
perception/.venv/Scripts/python -m pip install "gpu-test/torch-2.6.0+cu124-cp310-cp310-win_amd64.whl"

# otherwise, from the CUDA index — NOT plain `pip install torch`, which gives you CPU
perception/.venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu124
```

Then the service itself:

```bash
perception/.venv/Scripts/python -m pip install -r perception/requirements.txt
perception/.venv/Scripts/python -m perception.server        # http://localhost:8000
```

**Verify before writing any perception code:**

```bash
curl http://localhost:8000/health
```

This must report `"device":"cuda:0"` — roadmap gate 0.7. If it says `"cpu"`, you are on the
wrong interpreter or the wrong wheel; do not start debugging the GPU. `docs/EDGE-CASES.md`
EC-012 is the full account of getting this wrong, including how to tell it apart from an
actual hardware fault.

Run the perception checks with that interpreter:

```bash
perception/.venv/Scripts/python -m pytest perception/tests -q
```

Expect **15 passing**. One of them asserts that `/health` agrees with
`torch.cuda.is_available()` in *both* directions, so it is meaningful on a CPU machine too.

## Working on this build

Set your name once per machine: `echo "Your Name" > _build/.me`.
Then, every session: `continue build`.
Full protocol: `docs/BATON.md`.
