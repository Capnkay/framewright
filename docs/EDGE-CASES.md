# Edge Cases

Things that behave surprisingly, and what to do about them. One entry per case.

This file exists so that a session with none of the original conversation behind it can
pick up a problem and act correctly. If you burn twenty minutes on something confusing,
that is not lost time — it is an entry. Write it while it is fresh.

**Format:** what happened, why, what to do, and how to tell it is this and not something
else. Add the date. Do not delete entries; mark them resolved.

---

## EC-001 · A perfect-looking preview with a completely dead store
**Date:** 2026-08-19 · **Status:** guarded

Every text node renders `data?.[id] || "DEFAULT"`. With no store data at all, the section
renders pixel-identical to a working one — correct copy, correct layout, correct
responsive behaviour. It compiles, lints, and passes schema validation and screenshot
comparison.

**How to tell:** change a value and watch. If the preview does not move, the store is dead.
Check `state.cms.missing[pageName]` — a non-empty array names exactly which IDs never
arrived.

**Common causes:** `pageName` case mismatch (`Home` vs `home`); elements written under a
different `sectionId`; the API returning `{data:[...]}` where the reducer expects `[...]`;
nested card IDs absent from the mount-time fetch.

**Do:** never disable the §9 assertion. It is the only thing that catches this.

---

## EC-002 · Card fields render defaults forever while everything else works
**Date:** 2026-08-19 · **Status:** guarded by CONTRACT §5.0

A `Cards` element writes its `loop` array at its own `fieldId`. If the reducer stops
there, `data[item.fieldId1]` is permanently `undefined`, every card falls back to its
baked-in default, and per-card CSS overlay becomes impossible — silently.

**How to tell:** PATCH a nested card field. If the text does not change, the flattening
step is missing.

**Do:** the reducer must ALSO write every nested `fieldIdN` as its own top-level key. See
CONTRACT §5.0.

---

## EC-003 · Regeneration wipes the content it was supposed to preserve
**Date:** 2026-08-19 · **Status:** guarded by CONTRACT §6 `contentPolicy`

Preserving a `fieldId` while overwriting its `content` preserves nothing a human can see.
The judge's typed headline is replaced by the default, under the same ID.

**How to tell:** type something into a field, regenerate, see if it survives.

**Do:** regeneration forces `contentPolicy: "keep"`. An ID is not the thing being
preserved; the content reachable through it is.

---

## EC-004 · A four-card array renders three stale defaults
**Date:** 2026-08-19 · **Status:** guarded by CONTRACT §7 R9

The reference component in the source brief guards with `length === 3`. Copied literally,
any card count other than three fails the check and silently falls back.

**Do:** guard on `Array.isArray(...) && length > 0`, and render `items.length` cards. Never
compare against a literal.

---

## EC-005 · Hooks block something legitimate
**Date:** 2026-08-19 · **Status:** open, by design

The security floor will occasionally deny correct work. It has already done so twice
during setup — once blocking a required deliverable, once blocking a legitimate audit
command.

**Do:** fix the hook and log it in `docs/corrections/REGISTER.md`. **Never weaken a hook to
get past it, and never disable one.** A floor that gets removed at hour 40 is worse than a
smaller floor that survives, because the team still believes it is protected.

---

## EC-006 · Manifest fails on a fresh clone, but is fine locally
**Date:** 2026-08-20 · **Status:** guarded by `.gitattributes`

`sha256sum -c LAW-MANIFEST.sha256` passes on the machine that generated it and fails on
every clone, because Git rewrote line endings on checkout. If the manifest file itself is
converted, the filenames inside it carry a trailing `\r` and cannot be opened at all —
the error reads "No such file or directory" for a file that plainly exists.

**How to tell:** `file .githooks/pre-commit` reports CRLF, or the error names a file you
can see on disk.

**Do:** `.gitattributes` pins `* text=auto eol=lf`. If you ever regenerate the manifest,
regenerate it from LF content, and check `git diff --stat` after — a whole-file diff on
something you did not edit means line endings moved.

---

## EC-007 · You finished a task and now you cannot commit it
**Date:** 2026-08-20 · **Status:** fixed

The ritual is build → `baton done` → commit. `done` marks your claim complete. If the
pre-commit check requires an *active* claim, step 8 is blocked by step 7 — on every task.

**How to tell:** `baton done` succeeds, then the very commit it tells you to make is
refused for having no open claim.

**Do:** already fixed — the hook accepts a claim that is `active` **or** `done`, belonging
to you. If you see this again, the hook has regressed; fix the hook, do not skip it.

---

## EC-008 · A vision model that describes your wireframe perfectly and finds nothing in it
**Date:** 2026-08-20 · **Status:** measured, architecture changed

Florence-2 called our hand-drawn wireframe *"a hand-drawn website layout"* — correct — and
then returned one bounding box around the entire image. Short labels via
`<OPEN_VOCABULARY_DETECTION>` returned no boxes at all.

**How to tell:** the box covers >75% of the frame, or the caption is accurate while the
detection is empty. The model is not confused; it is answering a different question well.

**Why:** general vision models are trained on photographs. Nothing in that distribution
teaches that a line drawing decomposes into UI components. This is not fixable by
prompting.

**Do:** do not spend hours on prompt variations. Use classical CV for a drawing of
rectangles, and train a detector on data you generate yourself. Record the measurement —
it is worth more to a judge than a working model would have been, because it explains why
the architecture is shaped the way it is.
