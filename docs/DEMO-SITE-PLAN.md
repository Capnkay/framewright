# Judge Demo Site — PARKED

**Status: PARKED. Do not build any of this yet.**

Captured 2026-08-19 so the idea survives the session it was conceived in. It is not
scheduled, not owned, and not on the critical path. Nothing here starts until the product
itself clears Gate 4 — because a beautiful explainer wrapped around an incomplete
generator loses to a plain one wrapped around a working generator, every time.

---

## The idea

A separate static site — HTML or JSX, served locally, no backend — that a judge can walk
through. Not slides. An interactive map of the system where **clicking a surface shows how
that surface actually works in our codebase.**

Sketched elements:

- A 3D or depth-layered view of the seven-stage pipeline
- Clickable cards per stage that expand into: what goes in, what comes out, the model or
  algorithm, and why that one
- Each card links to the real file and the real contract section it implements
- Live artifacts from an actual generation run, not mock-ups

## Why it could be worth real points

Judges reward **showing the process, not just the output** — that is the one thing every
judging source we checked agreed on, from named judges at Google, Square and Databricks.
This turns an architecture diagram from a claim into a thing they can interrogate.

It also directly serves the harder goal: six people needing to explain a system none of
them built alone. Building the explainer is how the team learns to explain it.

## The honest case against

- **It is not scored.** No rubric line rewards a demo site. The 100 points are the
  product, and the site competes for hours with things that are scored.
- **It duplicates the Glass Box.** The running Job Timeline already shows real stages with
  real timings and real artifacts, on the actual product, live. A separate site risks being
  a worse version of something we already built — and a judge trusts the running system
  more than a companion site.
- **It can go stale.** A site describing the codebase drifts from the codebase within
  hours under time pressure, and a confidently wrong explainer is worse than none.
- **It sets an expectation.** A polished explainer implies a polished product. If the two
  do not match, the gap is what gets remembered.

## If it is ever built

Preconditions, all of them:

1. Gate 4 is clear — the demo moment works end to end.
2. The product's own README and demo script are finished.
3. Someone owns it who is not on the critical path.
4. It reads from real artifacts. **Nothing hand-written that describes code**, because
   that is the part that goes stale.

Cheapest viable version, if the hours are not there: extend the Glass Box timeline with a
"what is this stage" panel per stage, sourced from the Stage Cards we are building anyway.
Same explanatory value, inside the product, cannot drift, costs a fraction.

**Decide this at Phase 5, not before.**
