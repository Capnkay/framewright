@AGENTS.md

# Claude Code — specific notes

Everything above this line comes from `AGENTS.md`, which is the canonical instruction file
for this repository. Read it first. What follows applies only to Claude Code.

## Hooks

Three hooks run in this repository via `.claude/settings.json`:

| Hook | Fires on | Denies |
|---|---|---|
| `protect-secrets` | Write, Edit | secret-shaped paths and credential-shaped content — with a positive carve-out so `.env.example` can be written |
| `block-dangerous-shell` | Bash | pipe-to-shell, eval-of-download, destructive removes, force-push to main |
| `guard-secret-shell` | Bash | shell redirects into secret paths, credential literals in a command, `git add -f` of an ignored secret |

**All three fail closed.** Malformed input denies; only genuinely empty input passes. If a
hook blocks something legitimate, fix the hook and log it in
`docs/corrections/REGISTER.md`. Never weaken one to get past it — that has been tested
here, and a floor that gets removed at hour 40 is worse than a smaller floor that survives.

Two further hooks live in `.githooks/` and bind everyone, not just Claude Code:
`pre-commit` (integrity manifest + you hold a claim) and `commit-msg` (the message names a
task). They only run if `git config core.hooksPath .githooks` has been set on this machine
— `node tools/baton.mjs status` will warn you if it has not.

## Delegation

Crew agents do reading, drafting, building and research. The main session directs, judges
and gates. Never build with your own hands what a crew agent should build, and never let
the agent that produced something be the one that verifies it.
