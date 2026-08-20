# Findings

One file per finding: `F-001.md`, `F-002.md`, ...

A finding is addressed to the person who owns the code. It is not a fix, and it is not a
complaint — it names a defect, ties it to a contract section or a rubric line, and
suggests a starting point.

Format and severity ladder: `docs/REVIEW-PROTOCOL.md`.

**Findings are never deleted.** A finding that turns out to be wrong is marked
`wont-fix` with a reason. This directory is how the team reconstructs what happened, and
a pruned register lies.

## Finding ids collide, and that is by design

Two collisions happened on 2026-08-20 within a few hours: two people filed an `F-002`, then
two filed an `F-006`. Both surfaced as a git **add/add conflict** at push.

That is the same property `docs/BATON.md` describes for claim files, and it is the desired
behaviour — a collision that is loud beats one that is silent. Unlike claims, though,
nothing hands out finding ids, so **expect to renumber**.

**When it happens:** keep the id for whichever finding reached `main` first, renumber yours
to the next free number, and note the renumbering in your finding so anyone following a
reference from a commit message can still find it. Never resolve by picking a side — that
deletes somebody's finding without a trace.

**Before filing:** `git pull --rebase`, then `ls _build/findings/` and take the next free id.
It narrows the window; it does not close it.
