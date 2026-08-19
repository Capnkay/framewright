# The Baton

How three or more people on three or more machines hand this build between them without
colliding, without losing work, and without anyone having to ask "where are we?".

You type one thing: **`continue build`**. Everything below happens for you.

---

## The idea

The build is a list of small tasks. A task is **claimed** by exactly one person at a
time. Claims and journals are files in this repository, so they travel with the code and
work offline.

```
_build/
  tasks.json          the ordered work list, machine-readable
  TASKS.md            the same list, readable — generated, never hand-edited
  STATE.md            the board: done / in flight / next / blocked — generated
  claims/T-018.json   one file per claimed task
  log/priya.md        one journal per person
```

**One file per claim is the whole trick.** Two people claiming different tasks touch
different files and merge silently. Two people claiming the *same* task produce a git
add/add conflict — a collision that is loud instead of silent, which is what you want.

**One journal per person** means nobody ever conflicts on the log, no matter how much
they write.

---

## The ritual

```
continue build
```

1. `git pull --rebase` — get everyone else's claims first.
2. `baton status` — the board. Who holds what, what is blocked, what is next.
3. `baton next` — the first task whose dependencies are met and whose track matches you.
4. `baton claim T-018` — writes the claim file and **pushes it immediately**, so the race
   window is seconds rather than hours.
5. Read the contract sections the task names. They are the spec. Not the task title.
6. Build it.
7. `baton done T-018` — runs the task's verification. If it fails, the task stays open
   and nothing is marked complete. If it passes, your journal gets an entry and
   `STATE.md` regenerates.
8. Commit and push. The commit message must contain the task id.

That is the entire protocol. A cold session on a machine that has never seen this project
gets from `git clone` to productive work in under two minutes.

---

## A task

```json
{
  "id": "T-018",
  "phase": 1,
  "title": "Write the getImage and errorImage helpers",
  "track": "studio-preview",
  "size": "30m",
  "contract": ["§7 R7"],
  "deps": ["T-004"],
  "files": ["client/src/utils/image.js"],
  "verify": "npm test -- image",
  "doneWhen": "Empty input returns the placeholder; a blob: URL passes through untouched; anything else is prefixed with VITE_STORAGE_URL; onError swaps in the placeholder."
}
```

| Field | Why it exists |
|---|---|
| `contract` | **The task's real specification.** The title is a label; the contract sections are the requirement. Anyone building without opening them is guessing |
| `deps` | Nothing is offered to you until its dependencies are done. This is what makes `next` trustworthy |
| `track` | `studio-preview`, `generation`, `api-glassbox`, `perception`, or `any`. Phases 1 and 2 are all `any` — everyone is on the spine |
| `verify` | One command decides done. Not an opinion, not a feeling |
| `doneWhen` | Plain English, for the human. The verify command is for the machine. Both, always |
| `size` | 20–60 minutes. If a task looks bigger than an hour, it is two tasks |

**A baton task and an Antigravity work unit are the same object.** Both need an id, a
scope, the contract sections they satisfy, and a verification that decides done. Hand the
executor a task from `tasks.json` verbatim and it has everything it needs.

---

## Commands

```
baton status            the board
baton next              the next task available to you
baton next --track=api  the next task on a particular track
baton claim T-018       claim it, push the claim immediately
baton done T-018        run verification, log, release, regenerate the board
baton drop T-018        release without completing — say why
baton takeover T-018    take a stale claim from someone, deliberately
baton who               what you currently hold
baton sync              fetch origin, report only what's relevant to what you hold
```

`baton done` runs the verification. **It cannot be skipped.** A task whose verification
fails does not become done because you believe it works.

---

## When things go wrong

**A session died mid-task.** The claim stands, with a timestamp. The next `status` shows
`T-018 — held by priya, 4h stale`. Anyone can `baton takeover T-018`, which records who
took it and from whom. Nothing is lost silently.

**Two people claimed the same task.** Git raises an add/add conflict on
`claims/T-018.json` at push. That is the system working. Talk, keep one claim, delete the
other.

**You worked offline for two hours.** Your rebase will bring in claims made meanwhile. If
one of them is yours-in-progress, `status` will show the conflict plainly. This is the one
real cost of the git transport, and it is the reason step 1 of the ritual is a pull.

**The verification is wrong, not the code.** Fix the verification in the same commit, and
say so in `docs/corrections/REGISTER.md`. A verification nobody trusts is worse than none,
because people route around it.

---

## What the hooks enforce

Deliberately light. Two things only, across two hooks:

1. **`pre-commit`** — you hold a claim on at least one task.
2. **`commit-msg`** — your commit message contains a task id matching `T-\d{3}`.

Why two hooks rather than one: git runs `pre-commit` *before* the commit message
exists — true even for `git commit -m`. A message check there would pass every manual
test and then block every real commit. `commit-msg` is the hook git guarantees receives
the actual message.

That is enough for precise per-person attribution and enough to stop accidental
double-work. It is not enough to physically prevent you from editing a file outside your
task, and that is on purpose — a floor that blocks legitimate work at three in the
morning is a floor that gets removed at three in the morning.
