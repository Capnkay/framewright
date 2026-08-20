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

**This works right now, on a fresh clone, with no `npm install`.** The checks are
zero-dependency on purpose. Expect **13 passing, 0 failing** — including the two that
matter most: that every nested card field gets its own store key, and that patching a
nested card field actually changes what renders.

If this fails on a clean clone, stop and say so before building anything on top of it.

## 6. Install project dependencies

Not available yet — the wired application has not been scaffolded. See `docs/ROADMAP.md`
Phase 1 for what lands next and the commands it introduces.

## Working on this build

Set your name once per machine: `echo "Your Name" > _build/.me`.
Then, every session: `continue build`.
Full protocol: `docs/BATON.md`.
