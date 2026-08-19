# Verifying the Invisible

A UI defect announces itself. A perception pipeline that silently degrades from 90% to
55% element recall looks exactly the same from the outside — right up until a judge uploads
a wireframe you have never tested.

Most of this project's risk lives in code with no visual output: the perception service,
the IR, the ID allocator, the validators, the store wiring. This document is how we know
those work, without staring at them.

---

## The property that makes all of this possible

**Every stage is a pure function from a persisted input to a persisted output.**

That is not an accident of style — it is the Glass Box requirement in `CONTRACT.md` §11,
and it is what makes each stage independently testable without running the ones before it.
Stage 5 can be tested against a checked-in stage-4 artifact, on a laptop with no GPU, by
someone who has never run the perception service.

Protect this property. Any stage that reaches around the trace for state, or depends on a
side effect of the previous stage, destroys the ability to test it in isolation — and the
cost of that lands at hour 40, not now.

---

## Five techniques, and what each one actually catches

### 1. Golden files — the workhorse

A fixture input, a checked-in expected output, and a diff.

```
tests/fixtures/
  wireframes/hero-split.png
  expected/hero-split.ir.json
  expected/hero-split.elements.json
  expected/hero-split.component.jsx
```

**Catches:** regression. Someone improves the hierarchy engine and quietly breaks two
element roles. Nothing throws. The diff is the only thing that notices.

**Rule:** when a golden file changes, the diff goes in the PR body and a human says why.
A golden file updated without explanation is a test being silenced, which is worse than
having no test — the team now trusts something that no longer checks anything.

### 2. Schema assertions at every boundary

Ajv on the IR, on the section document, on the element document, on the `/perceive`
response, on every stage output.

**Catches:** malformed data crossing a stage boundary — which is precisely where the
cross-machine bugs live, because the Node side and the Python side are written by
different people on different laptops in different languages.

### 3. Invariants — cheap, and they catch the expensive failures

Assertions that must hold for *every* generation, not just the fixtures:

- every `fieldId` is exactly 10 digits, in its sanctioned range
- **no `fieldId` is ever issued twice** — the check a range test cannot make
- every element in the IR has a `fieldId` after allocation, and only after
- every `fieldId` in the component appears in the mount-time fetch
- every nested card field has its own top-level store key (§5.0)
- the generated component parses, and imports nothing outside the allow-list

**Catches:** the failures that are invisible until a judge opens the DOM. A read-modify-write
ID counter issues duplicates that are perfectly in range and pass every other check.

### 4. Metrics over a labelled fixture set — the honest answer to "does perception work?"

Hand-label 10–15 wireframes with their true element sets. Then measure:

| Metric | Question it answers |
|---|---|
| Element recall | Of the regions that are really there, how many did we find? |
| Element precision | Of what we found, how much is real? |
| Role accuracy | Did we call the headline a headline, or a paragraph? |
| Hierarchy match | Did we get the tree right, not just the boxes? |
| End-to-end contract pass rate | Of N wireframes, how many produce a fully compliant component? |

**Catches:** silent degradation, and the difference between "it worked on the one I tried"
and a number.

This is also the single most valuable artifact for the demo. *"Our pipeline recovers 91%
of elements against hand-labelled ground truth; a direct model call recovers 64%"* is a
sentence a professional judge can weigh. "It works well" is not.

Build the fixture set early and small. Fifteen labelled wireframes beat a thousand
unlabelled ones.

### 5. Determinism

Same input, run twice, byte-identical IR.

**Catches:** unpinned temperature, unstable dict ordering, a timestamp leaking into a
hash, hidden randomness in the detector. Non-determinism makes every other test flaky,
and flaky tests get disabled at hour 35.

Where a model is genuinely non-deterministic, pin temperature to 0, cache by input hash,
and record the model and version in the stage trace so a mismatch is explainable rather
than mysterious.

---

## What "done" means for a task with no visible output

A Baton task is done when its `verify` command exits zero. For invisible work, that
command must assert **behaviour**, never presence.

| Not acceptable | Acceptable |
|---|---|
| the file exists | the function returns the placeholder for empty input, passes `blob:` through, and prefixes otherwise |
| the service starts | `GET /health` reports the loaded models and the device |
| perception "runs" | recall against the fixture set is at or above the recorded baseline |
| the component compiles | the store hydrates, and a PATCH to a **nested card field** changes the rendered text |

That last row is the one that matters most, and it is the one most likely to be quietly
softened when time is short. Do not soften it.

---

## The one thing no test here can do

Every technique above compares against an expectation **we wrote**. That is regression
protection, not proof of correctness. A fixture set we labelled ourselves cannot tell us
that our idea of a "hero image region" matches a judge's.

Which is why the fixture set includes the organiser's own sample wireframe, and why the
demo puts a wireframe in front of a judge that we did not choose. Self-graded homework is
worth exactly what it costs.
