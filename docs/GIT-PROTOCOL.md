# Git Protocol

Six people. Three or four building at once. Two days. This document exists because the
thing that kills a build this shape is not merge conflicts — it is **someone spending two
hours on code that a merge invalidated ninety minutes ago.**

---

## The model: trunk-based, one branch per task

```
main ──●────●────●────●────●────●──→    always green, always demoable
        \  /      \  /      \  /
     task/T-018  task/T-021  task/T-024        each lives under an hour
```

One Baton task → one branch → one pull request → one squash-merge → branch deleted.

**Branch naming is not decoration.** `task/T-018-image-helpers`. The task id appears in
the branch, the claim file, every commit message, the PR title and your journal entry —
so all five agree without anyone maintaining that agreement, and the pre-commit hook can
check it mechanically.

### Why conflicts are rare here, and it is not luck

Every task in `_build/tasks.json` declares the `files` it touches. The work list was
authored so that concurrently-available tasks do not overlap. **Conflict avoidance is a
task-authoring property, not a branching one.** Branches only need to be short enough
that the rare genuine overlap is cheap to resolve.

If you find yourself needing to edit a file your task does not declare, stop. Either the
task is wrong — fix `tasks.json` and say so in `docs/corrections/REGISTER.md` — or you
are doing someone else's task.

---

## Cadence

| When | Do | Why |
|---|---|---|
| Before claiming anything | `git pull --rebase` | You cannot claim against a stale board |
| The instant you claim | push the claim file **alone**, on `main` | Shrinks the collision window from hours to seconds |
| Then | `git switch -c task/T-018-short-name` | |
| **Every 45–60 minutes** | push the task branch, **even mid-work** | A dead laptop costs an hour, not a day. It is a branch; half-finished is exactly what branches are for |
| On `baton done` | open the PR, merge, delete the branch | Integration is continuous. Deferred integration is where six-person builds die |
| After any merge | `node tools/baton.mjs sync` | Tells you if what just landed affects what you hold |

**Never leave work unpushed overnight or through a break.** A branch nobody can see is
not progress, it is risk.

---

## Pull requests

Keep them boring. A task-sized PR should take two minutes to review.

- **Title:** `T-018 — write the getImage and errorImage helpers`
- **Body:** the contract sections the task named, and anything you decided that the task
  did not specify.
- **Merge:** squash. One task, one commit on `main`. The history reads as the task list,
  which is exactly what you want when you are reconstructing events at hour 40.
- **Review:** one other person, or an automated check, but **never the author alone.**
  Producer and verifier are never the same. For a mechanical task the passing `verify`
  command is sufficient review; for anything touching the contract, a human looks.

`main` is protected in one respect that matters: **never force-push to it.** The hooks
block it. If you think you need to, you need help instead.

---

## Staying in sync — and why "someone pushed" is the wrong alert

A notification on every push becomes noise within an hour and everyone mutes it. The only
alert worth interrupting someone for is:

> **A merged change touches the files of the task you are currently holding, or a contract
> section that task depends on.**

That is what `node tools/baton.mjs sync` reports. It fetches, then prints only the
intersection with what you hold. **Silence means nothing relevant moved** — which makes
silence trustworthy, which is the whole point.

Run it after any merge, when you come back from a break, and before you push.

### When sync says your work is stale

1. Finish the thought you are on. Do not abandon mid-edit.
2. Commit to your branch.
3. `git fetch origin && git rebase origin/main`
4. Re-read the contract section, in case that is what moved.
5. Fix, and carry on.

### When two people claimed the same task

Git raises an add/add conflict on `_build/claims/T-018.json` at push. **That is the system
working** — the collision surfaced instead of hiding. Talk. Keep one claim, delete the
other, and whoever drops it runs `baton next` for something else.

### When a conflict is genuinely hard

Do not resolve a contract-bearing conflict alone under time pressure. Push your branch,
say what you hit, and get a second pair of eyes. A bad merge resolution at hour 30 is how
a frozen contract silently un-freezes.

---

## Hosting

`docs/html/` publishes to **Vercel** as a static site: the team rules, the project map,
the stage cards, and the generated board — always current, phone-readable, shareable with
a judge.

- **Docs only.** The application itself runs locally. The brief expects judges to run it.
- **No environment variables, no secrets, no build step reaching into the app.** A static
  docs deploy carries none of the credential risk that a deployed application would, and
  the rubric scores zero with possible disqualification on a leaked secret.
- **Connecting Vercel and deploying is the team's action, not an automated one.** Import
  the repo, set the output directory to `docs/html`, deploy. Nothing else.

---

## Never

- Force-push to `main`.
- Commit directly to `main` — the claim file is the single exception.
- Merge your own contract-bearing PR without a second reader.
- Leave a branch unpushed for more than an hour.
- Commit `node_modules/`, `uploads/`, `artifacts/`, model weights, or a real `.env`.
- Add a remote, publish, or deploy as a side effect of a build step. Those are deliberate
  team decisions, taken once, on purpose.
