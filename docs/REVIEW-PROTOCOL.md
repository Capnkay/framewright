# Review Protocol

How the roughly three-hourly code review works, what it produces, and — the part that
matters most — **when the reviewer is allowed to touch the keyboard.**

---

## The jurisdiction rule

**A finding belongs to the person who owns the code.**

The reviewer's default output is a written finding addressed to that person, not a fix.
This is deliberate and it is not politeness. The person who wrote a subsystem is the
person who will stand in front of a judge and explain it. Every time someone else silently
repairs their code, that explanation gets thinner, and the repair arrives without the
context that produced the bug.

Fixing someone's code is faster. Keeping them able to explain it is worth more.

---

## Cadence

Roughly every three hours during the build, the reviewer:

1. Fetches and reads everything merged to `main` since the last pass.
2. Reads open pull requests.
3. Checks each change against `docs/CONTRACT.md` — by section, not by impression.
4. Runs the store-liveness assertion and any `verify` commands for completed tasks.
5. Writes findings.
6. Reports a one-line summary: what was reviewed, findings by severity, anything blocking.

A pass that finds nothing still reports. Silence is ambiguous; "reviewed T-031..T-038,
clean" is not.

---

## Severity

| | Meaning | Response time | Who acts |
|---|---|---|---|
| **BLOCKER** | Costs us the rubric, breaks `main`, or blocks another person right now | Immediately | Owner. Reviewer only under the escalation rule below |
| **MAJOR** | Contract breach, or a defect that will surface in the demo | Same working block | Owner |
| **MINOR** | Quality, clarity, a missing test, an inconsistency | Before the next gate | Owner, when convenient |
| **NOTE** | Something worth knowing. Not a defect | Never blocking | Anyone |

Anything that touches the 25-point CMS contract, secrets, or the store-liveness invariant
starts at MAJOR and is argued down, not up.

---

## Findings are files, so an agent can pick them up

Every finding is written to `_build/findings/F-nnn.md`. Files, not chat messages, because
a chat message is gone by hour 30 and a file can be handed to a fresh session that has
none of the conversation behind it.

```markdown
---
id: F-014
severity: MAJOR
task: T-031
owner: priya
contract: ["§5.0", "§9"]
status: open        # open | acknowledged | fixed | wont-fix | superseded
found: 2026-08-20T14:10:00Z
---

## What is wrong
One sentence. No preamble.

## Where
`client/src/redux/cmsSlice.js:47`

## Why it matters
Tie it to a contract section or a rubric line. A finding with no consequence
named is an opinion, and opinions do not belong in this directory.

## How to reproduce
The exact commands. If it cannot be reproduced, say so and mark it as a suspicion.

## Suggested fix
Concrete enough to act on. The owner may do something better — this is a
starting point, not an instruction.
```

`status` is updated by whoever acts. A finding is never deleted; a wrong one is marked
`wont-fix` with a reason. The register is how the team reconstructs what happened, and a
pruned register lies.

---

## Escalation — when the reviewer operates

The reviewer takes the keyboard only when **all three** conditions hold at once:

1. The finding is a **BLOCKER**, and
2. it sits on the **critical path** — other people are stopped by it, and
3. the **owner cannot act** — asleep, offline, or otherwise unreachable now.

Two out of three is a flag, not a fix. Impatience is not a fourth condition.

When the reviewer does operate:

- The finding file is written **first**, then the fix.
- The finding records `fixed-by: reviewer` and exactly what changed.
- The commit message says so plainly.
- The owner is told at their next appearance, before they read their own code and find it
  different from how they left it.

**Nobody discovers a silent change in their own subsystem.** That rule has no exceptions.

There is one further case: a fix that **crosses tracks** — where the correct repair spans
two people's subsystems. That is never a unilateral fix regardless of severity. It is a
finding addressed to both owners, and they decide together, because a cross-track repair
made by one hand is how a seam quietly acquires two incompatible halves.

---

## What the review actually checks

Not style. Style is what linters are for. The review checks the things that cost points:

- **Contract compliance**, section by section — especially R1–R14, the §5.0 flattening
  rule, and the §9 store-liveness invariant.
- **Whether the store is genuinely alive**, or merely appears to be. This is checked by
  running the assertion, never by reading the code.
- **ID discipline** — 10 digits, from the API, unique, in range, stable across regeneration.
- **The deterministic path** — does generation still work with the key unset and the
  perception service stopped?
- **Secrets**, across the diff *and* the history.
- **Whether the executor "improved" something graded** — a stripped
  `dangerouslySetInnerHTML`, a pruned `dynamicStyle` class, an inlined `ids` map, a
  refactored CSS effect. These look like cleanups and each one costs the 25-point criterion.
- **Whether a task marked done actually passes its own `verify` command.**
