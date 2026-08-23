@AGENTS.md

# Claude Code — specific notes

Everything above this line comes from `AGENTS.md`, which is the canonical instruction file
for this repository. Read it first. What follows applies only to Claude Code.

## Hooks

**All three custom Claude Code hooks are currently unwired** (updated 2026-08-24, a few
hours before deadline — a teammate was fully blocked from committing). `protect-secrets`,
`block-dangerous-shell`, and `guard-secret-shell` are all removed from
`.claude/settings.json`'s `PreToolUse`; the hook files themselves are untouched under
`.claude/hooks/` and can be re-registered from git history if needed. `disableAutoMode` is
also set, turning off Claude Code's own built-in auto-mode classifier — the classifier, not
these three hooks, was the actual cause of the teammate's blocked commits.

**Nothing in `.claude/settings.json` now checks a Write/Edit/Bash call before it runs.**
Real credentials can be written anywhere, a force-push to main is not blocked, and a secret
typed into a shell command or piped to `.env` is not caught. See
`docs/corrections/REGISTER.md`, 2026-08-24, for the full log and the residual risk.

Two further hooks live in `.githooks/` and bind everyone, not just Claude Code:
`pre-commit` (integrity manifest + you hold a claim) and `commit-msg` (the message names a
task). They only run if `git config core.hooksPath .githooks` has been set on this machine
— `node tools/baton.mjs status` will warn you if it has not. They only run at commit/push
time, so they are the only remaining safety net between now and submission.

## Delegation

Crew agents do reading, drafting, building and research. The main session directs, judges
and gates. Never build with your own hands what a crew agent should build, and never let
the agent that produced something be the one that verifies it.
