# Framewright — The Contract

**Status: FROZEN — both verification gates passed.** Version 1.5, 2026-08-20.

*v1.0 drafted. **v1.1** after a cold-boot re-derivation from the brief: full wire shapes
for every endpoint, the `fetchElementsByIds` signature, regeneration semantics, the store
adapter, accepted image formats, and one internal contradiction fixed. **v1.2** after
adversarial review: the card-field flattening rule, `contentPolicy`, the R9 length trap,
the `preserve` map shape, a hardened §9 assertion, canonical stage numbering, status
enumerations, artifact ownership and retrieval, the human-in-the-loop surface, and the
generated-component mounting seam.*

**v1.3** after the golden component was built against it: the §14 environment block and
placeholder rule now match what is actually built, tested, and enforced by the gate.*

**v1.5** reconciles the architecture diagram's four unbuilt layers into the contract:
§15 caching and object storage, §16 model services, §17 observability, §18 automated
quality gates. Additive only — nothing in §1–§14 changed. Every addition is optional and
degrades to nothing when its dependency is absent, because Standing Rule 3 says the
deterministic path always works.*

*All changes and why each mattered: `docs/corrections/REGISTER.md`.*

This file is the single source of truth. The generator, the preview, the Node API, the
Python perception service, the validators, the seed data and the checked-in reference
component all derive from this document. If any two of them disagree, this file wins
and the other is a bug.

**Change rule.**

- **Before the clock starts** — additive changes are free, and **contradiction repair is
  explicitly permitted**, including renames, type changes and removals. A frozen document
  that contradicts itself is worse than an unfrozen one, and forbidding the repair does
  not make the contradiction disappear.
- **After the clock starts** — additive only. New optional fields. **No renames, no type
  changes, no removals.**

Every change, in either window, bumps the version line above and is logged in
`docs/corrections/REGISTER.md` with what changed and why.

**Language and runtime, so two tracks do not scaffold differently:** JavaScript with ES
modules, Node 20 LTS, npm. TypeScript is not used — the contract is enforced by Ajv
schemas and runtime assertions, and introducing a type system mid-event costs more than
it returns.

Why this is frozen before any code exists: three-plus people and an orchestrated
executor build against it simultaneously. Renegotiating it mid-event costs more time
than the event contains.

---

## 1. Identifiers

IDs are allocated by the **Node API** and persisted. Never by a model, never by the
Python service, never at render time.

| Kind | Range | Example | Notes |
|---|---|---|---|
| `sectionId` | `1000000001` upward | `1000000001` | 10 digits, unique per project |
| `fieldId` (element) | `2000000001` upward | `2000000003` | 10 digits, unique per project |
| `fieldIdN` (card field) | `3000000001` upward | `3000000001` | 10 digits, one per field per loop item |

Rules, all mandatory:

1. **Exactly 10 digits, as a string.** Not a number. Leading digit is the range marker.
2. **Allocated centrally.** A single counter per range, persisted. Two concurrent jobs
   must never receive the same ID.
3. **`Math.random()`, `Date.now()`, `uuid` and `nanoid` are forbidden** for IDs.
   `Date.now()` is 13 digits and `uuid` is not numeric — both fail the range check.
4. **Stable across regeneration.** See §6, `idPolicy`.
5. A pre-submit check asserts every ID in the repo falls inside its sanctioned range.
   A real production ID would fail this check. That is the point.

`pageName` is a human page key used in Redux. Default `Home`. **Case-sensitive** —
`Home` and `home` are different keys, and mixing them is the most common way to get a
preview that renders correctly from defaults while the store is empty. See §9.

---

## 2. Section document

One per generated section instance.

```json
{
  "sectionName": "Custom",
  "sectionId": "1000000001",
  "variations": "2",
  "path": "/client/sample-brand/Custom/CustomHero",
  "sectionStatus": "Pending",
  "wireframes": "sample/wireframes/hero-section.png",
  "platform": "Website",
  "pageName": "Home",
  "isGenerated": true,
  "cardGridColumns": 3,
  "cardLayoutMode": "grid",
  "sectionTextMode": "auto",
  "sectionColor": "",
  "sectionPaddingTop": "",
  "sectionPaddingBottom": "",
  "sectionPaddingLeft": "",
  "sectionPaddingRight": ""
}
```

`sectionStatus` is one of `Pending | Approved | Rejected`.
`cardLayoutMode` is one of `grid | list`. `sectionTextMode` is one of `auto | light | dark`.
**`variations` is a string** (`"1"`, `"2"`), matching the source appendix. It is a string
in the IR too. There is no numeric form of this field anywhere.

**Fields the source appendix carries that we do not require.** The organiser's sample
section document includes `_id`, `pageId`, `layoutPlacementId`, `isBuild`,
`cardClassName`, `cardCssText`, `cardListBodyGapPx`, `sectionClassName`,
`tableClassName`, `tableCssText`, `createdAt`, `updatedAt`. These are **permitted and
ignored**. Our writer does not emit them; our reader must not choke on them. Seed data
copied from the appendix therefore loads without modification. The same rule applies to
the element document's `_id`, `section`, `pageId` and `isCustom`.

### 2.1 Store adapter

Mongo and the JSON file store sit behind one interface. Neither is visible above it.

```
findSections({ pageName? })          -> SectionDoc[]
findSection(sectionId)               -> SectionDoc | null
insertSection(doc)                   -> SectionDoc
updateSection(sectionId, patch)      -> SectionDoc
findElements({ pageName?, sectionId?, fieldIds? }) -> ElementDoc[]
updateElement(fieldId, patch)        -> ElementDoc | null
allocateId(range)                    -> string      // range: "section" | "element" | "cardField"
```

`allocateId` is the **only** ID source in the system and must be atomic. Two concurrent
jobs must never receive the same value. On the JSON store that means a written lock or a
single-writer queue — not a read-modify-write.

`_id` and `$oid` are storage details. They never cross this interface and never appear
in an API response.

---

## 3. Element document

```json
{
  "sectionId": "1000000001",
  "elementName": "headlineMain",
  "fieldId": "2000000003",
  "content": "CHALLENGE YOUR LIMITS",
  "contentType": "Text",
  "css": "font-weight: bold; text-align: left;",
  "loop": null,
  "projectName": "sample-brand",
  "pageName": "Home"
}
```

`contentType` is one of `Image | Text | Textfield | Button | Cards`.
`css` is `null` or a CSS declaration string — see §8 for the allow-list it must satisfy.
`loop` is **required and non-null when `contentType` is `Cards`**, and `null` otherwise.
`projectName` is always `sample-brand`. `pageName` must equal the parent section's.

### Reference element set for the split hero

| elementName | contentType | Tag | Default content |
|---|---|---|---|
| `heroImage` | Image | `img` | `default/images/hero-placeholder.jpg` |
| `brandBadge` | Text | `span` | `PULSE FIT` |
| `headlineMain` | Text | `h1` | `CHALLENGE YOUR LIMITS` |
| `headlineSub` | Text | `h2` | `Be a part of the tribe that's limitless.` |
| `description` | Textfield | `p` | `Join trainer-led workout sessions designed to kickstart your fitness journey, at your convenience.` |
| `statBadges` | Cards | `div` | loop of 3, see §4 |
| `ctaButton` | Button | `Button` | `FIND A WORKOUT` |

---

## 4. Cards loop item

Each item pairs a value with a label. Both carry their own field ID.

```json
{
  "field1": "1000+",
  "fieldType1": "Text",
  "fieldId1": "3000000001",
  "field2": "Community<br />Members",
  "fieldType2": "Text",
  "fieldId2": "3000000002"
}
```

Rules:

1. **Every loop item's nested field IDs are allocated and persisted like any other ID.**
2. **Nested field IDs must be included in the mount-time fetch.** Omitting them is the
   single most common contract failure — the cards then render from defaults forever
   while everything else appears to work.
3. The reference implementation uses **two fields per item**. A third (`field3`) is
   permitted when the wireframe shows an icon, but the count must be uniform across
   the loop and recorded in the IR as `cards.fieldsPerItem`.
4. Card count is **not fixed at 3**. It is whatever the IR says, defaulting to 3. The
   component must render `n` items, not assume three.

---

## 5. Redux runtime shape

```
state.cms.allSections[pageName][fieldId]     = string | loopArray
state.cms.allSectionsCss[pageName][fieldId]  = cssText string
state.cms.sectionNames[sectionId]            = sectionName
```

The generated component reads from this shape and nothing else. Fetching inside JSX
without going through the store is a contract failure, not a shortcut.

**Hydration source:** `GET /api/elements?pageName=Home` — the response array is reduced
into `allSections[pageName]` keyed by `fieldId`.

### 5.0 The flattening rule — read this twice

A `Cards` element writes **two kinds of key**, and missing the second is the single most
common way to ship a broken build that looks perfect:

1. Its own `fieldId` gets the **whole `loop` array**, so the component can iterate.
2. **Every nested `fieldIdN` inside every loop item gets its own top-level key**, holding
   that field's string value.

```js
// element: fieldId 2000000006, contentType "Cards"
allSections.Home["2000000006"] = [ {field1:"1000+", fieldId1:"3000000001", ...}, ... ]
allSections.Home["3000000001"] = "1000+"
allSections.Home["3000000002"] = "Community<br />Members"
allSections.Home["3000000003"] = "40+"
// ...one key per nested field, for every item
```

Both are required. The reference component renders card values as
`data?.[item.fieldId1] || item.field1` — so without the flattened keys, every card field
falls back to its baked-in default forever, while the rest of the section hydrates
correctly. Nothing visibly fails. The CSS-overlay rule (R10) has the same dependency:
`allSectionsCss[pageName][fieldId]` is keyed by nested field ID too, so an unflattened
store makes per-card styling silently impossible.

Every other `contentType` writes one key: its `fieldId` → its `content` string.

### 5.1 `fetchElementsByIds` — the exact signature

```js
fetchElementsByIds({ elementIds, pageName })
```

- Issues **one** request: `GET /api/elements?pageName=<pageName>`. It does not fetch per ID.
- Reduces the **whole** response into `allSections[pageName]` and `allSectionsCss[pageName]`.
- `elementIds` is **not** a server-side filter. It is the component's declaration of which
  keys it depends on, and it is used for exactly one thing: after the reduce, the thunk
  asserts that every ID in `elementIds` is present. Any that are missing are recorded as
  `state.cms.missing[pageName]`.

That last point is deliberate and load-bearing. `elementIds` is what turns the
store-liveness failure in §9 from silent into observable — the component itself declares
what it needs, and the store can say what never arrived. The automated assertion reads
`state.cms.missing`. Removing the parameter as "unused" breaks the safety net.

### 5.2 Slice state

```
state.cms = {
  allSections:    { [pageName]: { [fieldId]: string | loopArray } },
  allSectionsCss: { [pageName]: { [fieldId]: string } },
  sectionNames:   { [sectionId]: string },
  status:         "idle" | "loading" | "succeeded" | "failed",
  error:          string | null,
  missing:        { [pageName]: string[] }
}
```

`status` and `error` exist so a failed hydration is visible in the UI instead of hiding
behind the component's default fallbacks.

---

## 6. The Intermediate Representation — IR v1.0

The IR is the bridge. Perception writes it, generation reads it, validation compares
against it, and the Glass Box replays from it. It is deliberately more complete than
the sketch in the source brief, because the gaps in that sketch are exactly where two
parallel tracks would otherwise invent different answers.

```json
{
  "irVersion": "1.0",
  "sectionType": "split-hero",
  "platform": "Website",
  "pageName": "Home",
  "sectionName": "Custom",

  "source": {
    "mode": "combined",
    "inputs": ["wireframe", "prompt"],
    "wireframeRef": "uploads/job-0000000001.png"
  },

  "layout": {
    "direction": "row",
    "breakpoint": "md",
    "mobileBehaviour": "stack",
    "container": { "maxWidth": "1920px", "padding": "px-0 md:px-12" },
    "regions": [
      { "role": "media",   "side": "left",  "width": "1/2", "children": ["heroImage"] },
      { "role": "content", "side": "right", "width": "1/2",
        "children": ["brandBadge","headlineMain","headlineSub","description","statBadges","ctaButton"] }
    ],
    "accents": [
      { "edge": "left",  "width": "w-8", "colour": "red-500", "fromBreakpoint": "md" },
      { "edge": "right", "width": "w-8", "colour": "red-500", "fromBreakpoint": "md" }
    ]
  },

  "theme": {
    "accent": "red-500",
    "surface": "white",
    "text": "gray-800",
    "textMode": "auto"
  },

  "cards": {
    "of": "statBadges",
    "count": 3,
    "gridColumns": 3,
    "layoutMode": "grid",
    "fieldsPerItem": 2,
    "items": [
      { "field1": "1000+", "field2": "Community<br />Members" },
      { "field1": "40+",   "field2": "Fitness<br />Programmes" },
      { "field1": "150+",  "field2": "Fitness<br />Channels" }
    ]
  },

  "elements": [
    {
      "elementName": "headlineMain",
      "contentType": "Text",
      "tag": "h1",
      "order": 2,
      "default": "CHALLENGE YOUR LIMITS",
      "classes": "text-4xl md:text-5xl font-extrabold tracking-tight text-gray-800 leading-tight",
      "css": null,
      "alt": null,
      "confidence": 0.94,
      "sourceOf": "wireframe",
      "bbox": [500, 80, 350, 60]
    }
  ],

  "idPolicy": {
    "mode": "allocate",
    "contentPolicy": "overwrite",
    "preserve": {
      "elements": { "headlineMain": "2000000003" },
      "cards": { "statBadges": [ ["3000000001","3000000002"] ] }
    }
  },

  "variations": "1",
  "warnings": []
}
```

### Field notes — the ones that matter

- **`order`** — position within the region. Explicit, because ordering derived from a
  bounding box at read time and ordering derived from a prompt at read time will not
  agree. Perception sets it; generation obeys it.
- **`confidence`** — `0.0`–`1.0`, or `null` when the element did not come from an image.
  Scored by the brief. See §10 for what the bands mean.
- **`sourceOf`** — `wireframe | code | prompt | default`. This is what makes the
  conflict-resolution rule auditable rather than assumed.
- **`bbox`** — `[x, y, w, h]` in the coordinate space of the **normalised** image, not
  the original upload. `null` for non-visual sources.
- **`bbox`** coordinate space is the **normalised** image. The normaliser is therefore
  required to record its transform in the stage-2 trace as
  `{ "scale": 0.5, "offsetX": 0, "offsetY": 12, "width": 1024, "height": 768 }`, so any
  consumer can map a box back onto the original upload. A bbox without a recorded
  transform is unusable by anyone who did not write the normaliser — and the person who
  did is on a different machine.

- **`idPolicy.mode`** — `allocate` mints new IDs. `preserve` reuses the maps below and
  mints only for things not in them. Code-input mode and section regeneration both use
  `preserve`.

- **`idPolicy.contentPolicy`** — **`overwrite` or `keep`, and it is a separate axis from
  `mode`.** This distinction is the demo.
  - `overwrite` — the regenerated element's `content` is set from the IR's `default`.
  - `keep` — **the element keeps whatever content is currently stored.** The IR's
    `default` is applied *only* to elements that did not previously exist.

  **Regeneration forces `contentPolicy: "keep"`.** Preserving an ID while overwriting its
  content preserves nothing a human can see: the judge's typed headline would be replaced
  by `CHALLENGE YOUR LIMITS` on regeneration, with the same field ID, and the moment
  fails live. An ID is not the thing being preserved — the *content reachable through it*
  is. Anyone implementing `preserve` as ID-only has implemented the wrong feature.

  The one exception: when the regeneration prompt explicitly changes a field's copy, that
  field is overwritten and the change is recorded in `warnings`.

- **`idPolicy.preserve`** has two maps, because cards cannot be addressed by element name:
  - **`elements`** — `{ elementName: fieldId }`.
  - **`cards`** — `{ elementName: [[fieldId1, fieldId2], ...] }`, one inner array per loop
    item, **positional by index**. Growing three stats to four preserves items 0–2 and
    allocates a new pair for item 3. Shrinking leaves the orphaned pair unreferenced but
    stored, so a later variation can bring it back with its content intact.
- **`cards.items`** carries content only. **No field IDs appear in the IR at all** —
  the API attaches them after the IR is final. A model that emits an ID is producing
  invalid IR and the validator rejects it.

### Conflict resolution, when inputs disagree

Applied in this order, and recorded in `warnings` whenever it fires:

1. **Prompt wins** for copy, colour, CTA behaviour and card count.
2. **Wireframe wins** for spatial layout — regions, order, alignment.
3. **Code wins** for technical patterns — selector shape, helper names, class conventions.

---

## 7. Generated component rules

Every generated component satisfies all of these. A judge opens the file and the DOM.

| # | Rule |
|---|---|
| R1 | Declare `const ids = { semanticName: "fieldId", ... }` |
| R2 | Accept `pageName` as a prop, defaulting to `"Home"` |
| R3 | On mount, dispatch `fetchElementsByIds` with **every** field ID in the tree, nested card IDs included |
| R4 | Read live values from `state.cms.allSections[pageName]` |
| R5 | Every editable node carries `id={ids.x}` or `id={item.fieldIdN}` |
| R6 | Text nodes use `dangerouslySetInnerHTML` with a hard-coded default fallback, via the sanitiser helper in §8 |
| R7 | Images go through `getImage`, prefix `VITE_STORAGE_URL`, pass `blob:` through untouched, and set `onError` to the placeholder |
| R8 | Buttons use PrimeReact `Button` with the label from CMS, an `aria-label`, and an `onClick` stub |
| R9 | Repeating items render from the loop array, falling back to a `DEFAULT_*` constant **only when the CMS value is missing or is not an array**. See the note below — never compare against a fixed count |
| R10 | Apply `allSectionsCss` onto matching DOM ids after `cssData` changes |
| R11 | Tailwind for layout. Two columns on desktop, stacked on mobile, inside a max-width container |
| R12 | `dynamicStyle` class on text and button nodes, `dynamicStyle2` on images |
| R13 | No real secrets, no real bucket URLs, no real customer identifiers |
| R14 | `export default` the section component |

**R9 in detail — the length trap.** The reference component in the source brief guards
with `data[ids.statBadges].length === 3`. **Copy that and the four-stat regeneration beat
dies on stage:** a CMS array of four items fails the equality check and the component
silently renders three stale defaults. The correct guard is:

```js
const items = Array.isArray(data?.[ids.statBadges]) && data[ids.statBadges].length > 0
  ? data[ids.statBadges]
  : DEFAULT_STAT_CARDS;
```

Render `items.length` cards. Never a fixed number.

**Forbidden outright:** hard-coded production storage hosts; imports of helpers that do
not exist in this repo; rendering only defaults without touching Redux; generating IDs
at render time; comparing a CMS array's length against a literal.

**How a generated component reaches the preview.** The API writes to
`client/src/sections/generated/<SectionName>-<sectionId>-v<variation>.jsx` — never a
fixed filename, or variation 2 destroys variation 1. The preview app discovers them with
a Vite eager glob:

```js
const modules = import.meta.glob('./sections/generated/*.jsx', { eager: true });
```

and selects by the `sectionId` and `variation` recorded on the section document. Vite's
dev server picks up the new file by HMR; no restart, no manifest, no dynamic import path.
This is stated here because it is the seam between the API track and the preview track,
and each will otherwise assume the other owns it.

**Two helpers must be written by hand before anything else compiles.** The reference
component in the source brief imports `fetchElementsByIds` and
`getSectionTextContrastClass` from paths that do not exist here. They are ours to
implement. Copying the reference verbatim without them produces a build failure, and
dead imports are penalised directly under code quality.

**Accessibility:** images carry meaningful `alt`; the CTA carries `aria-label`; body
copy is `gray-500` or darker on white — never `gray-400` for long text; nested card
fields never carry an empty `id`.

---

## 8. Sanitisation

Two chokepoints, both required. Write-side alone is insufficient because seed JSON and
the database can be populated out of band; read-side alone is insufficient because
stored content should never be dirty in the first place.

- **Write-side** — sanitise in the API before persisting, on `POST /api/generate` and
  `PATCH /api/elements/:fieldId`.
- **Read-side** — sanitise at render inside a `getHtml(value, fallback)` helper that
  replaces the raw `data?.[id] || "DEFAULT"` pattern.

### HTML allow-list

| Setting | Value |
|---|---|
| `ALLOWED_TAGS` | `b`, `i`, `br`, `span`, `strong`, `em` |
| `ALLOWED_ATTR` | **empty** |
| `ALLOW_DATA_ATTR` | `false` |
| `ALLOW_ARIA_ATTR` | `false` |
| Forbidden | `script`, `style`, `iframe`, `object`, `embed`, `svg`, `math`, `form`, `template`, `a`, and HTML comments |

An empty attribute list eliminates `onerror`, `onload`, `style`, `href`, `src`,
`srcset` and `formaction` in one rule, and costs nothing — no element in the reference
set uses an attribute inside its content string.

### CSS allow-list — the second injection channel

`el.style.cssText = cssData[id]` is not HTML, so an HTML sanitiser never sees it. Every
`css` value must match a repeated declaration shape:

```
^(\s*[a-z-]+\s*:\s*[^;{}()<>"']+;?\s*)+$
```

and must not contain `url(`, `expression(`, `@import`, `behavior:`, or `-moz-binding`.
The reference value `font-weight: bold; text-align: left;` satisfies this, so the rule
costs us nothing real.

### Pasted code is parsed, never executed

User-supplied JSX is parsed to an AST with `@babel/parser` in `jsx` + `typescript` mode
with `errorRecovery`. **Never** `eval`, `new Function`, `require()` of a written temp
file, `vm.runInNewContext`, or a child process. Node's `vm` is not a security boundary.

User strings may land only in the `content` field of element documents — as data. Never
in a JSX expression position, an import specifier, or an attribute name.

---

## 9. The store-liveness invariant

**This is the single most dangerous property of this design, and it must be stated
plainly so that nobody optimises it away.**

Every text node in the contract renders as `data?.[id] || "DEFAULT"`. That fallback is
what makes the component robust — and it is also a **mask**. If the store never
hydrates, the component renders *pixel-identical to a working system*: correct copy,
correct layout, correct responsive behaviour. It compiles. It passes lint. It passes
schema validation. It passes a screenshot comparison.

It fails only when someone changes a value and the preview does not move.

Causes, all of which have produced this exact failure elsewhere: a `pageName` case
mismatch; elements written under a different `sectionId` than the one being previewed;
the API returning `{ data: [...] }` where the reducer expects `[...]`; nested card IDs
missing from the mount-time fetch.

**Therefore the following assertion is mandatory, is wired as an automated check, and
runs from the first hour the preview exists:**

1. Generate a section.
2. Assert `state.cms.allSections.Home` is non-empty **and `state.cms.missing.Home` is
   empty** — the second half is what catches a partial hydration.
3. Assert every field ID in `ids` is present in the DOM, **and** that every nested card
   field ID has its own top-level key in `allSections.Home` per §5.0.
4. `PATCH` a **top-level** element's content. Assert the rendered text changed.
5. **`PATCH` a nested card field.** Assert *that* rendered text changed too.

**Step 5 is not optional and it is not a duplicate of step 4.** A DOM presence check
alone passes on a completely dead store, because `DEFAULT_STAT_CARDS` puts those exact
IDs in the DOM with no data behind them — the very mask this section exists to defeat.
Only patching a card field and watching it move proves the flattening in §5.0 actually
happened. An assertion that skips step 5 is theatre.

A build that passes every other gate and fails this one is a build that will fail in
front of a judge, at the exact moment the demo script says to change a headline.

---

## 10. Confidence

| Band | Meaning | Behaviour |
|---|---|---|
| `>= 0.85` | Accept | Use directly |
| `0.60 – 0.85` | Verify | Second-pass check; record a warning |
| `< 0.60` | Escalate | Ask the human, or fall back to the deterministic template |

Confidence is surfaced in the API response and in the Glass Box timeline. Elements that
did not come from an image carry `null`, not a fabricated number.

---

## 11. Job and stage trace — the Glass Box

Every generation is a job. Every stage writes one immutable trace record. This is what
makes the pipeline inspectable, replayable, and demonstrable.

### 11.0 The seven stages — canonical numbering

Two people will number these differently unless the numbering lives here. It does.

| # | `name` | Owner | Runs where |
|---|---|---|---|
| 1 | `input-acquisition` | Node | Node |
| 2 | `preprocessing-normalization` | Perception | Python |
| 3 | `multimodal-understanding` | Perception | Python |
| 4 | `semantic-planning-ir` | Perception → Node | Python emits, Node finalises |
| 5 | `code-generation-assembly` | Node | Node + hosted model |
| 6 | `validation-qa` | Node | Node |
| 7 | `output-delivery` | Node | Node |

`replay.fromStage` uses exactly these numbers. **Stages 5, 6 and 7 are replayable without
the perception machine**; stages 2, 3 and 4 require it. A replay targeting stage ≤ 4 with
the perception service down returns `422` rather than hanging.

### 11.1 Status enumerations

Both are closed sets. The studio progress UI and the timeline both switch on them.

- **Job `status`** — `queued | running | awaiting-input | succeeded | failed`
- **Stage `status`** — `pending | running | ok | degraded | failed | skipped`

`degraded` means the stage did not do its real work but the pipeline continued — the
perception service being unreachable is the canonical case. It is a success for the job
and a warning for the stage. `awaiting-input` is the human-in-the-loop pause, §11.3.

```json
{
  "jobId": "job-0000000001",
  "status": "running",
  "mode": "combined",
  "pageName": "Home",
  "sectionId": null,
  "createdAt": "2026-08-19T12:00:00.000Z",
  "stages": [
    {
      "stage": 3,
      "name": "multimodal-understanding",
      "status": "ok",
      "startedAt": "2026-08-19T12:00:02.100Z",
      "ms": 1840,
      "inputRef":  "artifacts/job-0000000001/s2-normalised.png",
      "outputRef": "artifacts/job-0000000001/s3-regions.json",
      "model": "florence-2-base",
      "confidence": 0.88,
      "warnings": []
    }
  ]
}
```

Rules:

1. **Stage records are append-only.** A retry appends; it never overwrites.
2. **Every stage persists its input and output as artifacts**, referenced by path. This
   is what makes replay possible and what makes the timeline inspectable.
3. **Every stage is a pure function from a persisted input to a persisted output.**
   No stage reaches around the trace for state.

### Replay

```
POST /api/jobs/:jobId/replay
{ "fromStage": 5, "ir": { ...optionally hand-edited... } }
```

Re-runs stages `fromStage` onward using the supplied IR, or the stored one if omitted.
Earlier stages are not re-executed. This is what lets a human correct a mislabelled
region and regenerate without touching the GPU path — and it is what turns a live
perception miss into a recoverable moment rather than a failed demo.

### 11.2 Artifacts — storage and retrieval

**Artifacts are owned by Node and live on the Node machine**, under
`artifacts/<jobId>/<stage>-<name>.<ext>`. The Python service **never writes artifacts**.
It returns its stage outputs inline in the `/perceive` response body, and Node persists
them. This is deliberate: the perception service runs on a different laptop, so a
relative path written there resolves to nothing anywhere else.

Retrieval, because a path in a response is useless without a way to read it:

```
GET /api/jobs/:jobId/artifacts/:name   -> the artifact, with its own content type
GET /api/jobs/:jobId/component         -> text/plain, the generated JSX source
```

The second exists because the generate response returns `componentFile` as a path, and
the studio is required to display the generated JSX read-only. Without this endpoint
someone invents a static mount that the pre-submit gate does not scan.

`artifacts/` is gitignored alongside `uploads/`.

### 11.3 Human in the loop

When an element lands below `0.60` confidence and the studio has opted into review, the
job halts at `awaiting-input` rather than guessing.

```
GET  /api/jobs/:jobId/questions
  -> [ { "questionId":"q1", "elementRef":"el-3", "bbox":[500,400,200,60],
         "prompt":"What is this component?",
         "options":["Button","Card","Badge","Image","Text"],
         "modelGuess":"Button", "confidence":0.43 } ]

POST /api/jobs/:jobId/answers
  { "answers": [ { "questionId":"q1", "choice":"Button" } ] }
  -> { "ok": true, "resumedFrom": 4 }
```

Answers are written into the IR, the job resumes from stage 4, and the correction is
recorded in `warnings`. **If the studio does not opt in, there is no pause** — the
low-confidence element falls through to the deterministic template and a warning. A
headless run never blocks waiting for a human who is not there.

---

## 12. HTTP contract — Node to Python

The Node API is the only graded backend. The Python service is a swappable adapter
behind one endpoint.

```
POST /perceive          multipart: image, plus JSON field `hints`
  200 -> {
    "layout":     { ...the IR's layout object, in full... },
    "theme":      { ...the IR's theme object, in full... },
    "cards":      { ...the IR's cards object, or null... },
    "elements":   [ ...IR element entries, WITHOUT fieldId... ],
    "normalisation": { "scale":0.5, "offsetX":0, "offsetY":12, "width":1024, "height":768 },
    "confidence": 0.88,
    "questions":  [ ...low-confidence items needing a human, or []... ],
    "stages":     [ ...stage trace records for stages 2-4, artifacts INLINE... ],
    "warnings":   []
  }
  422 -> { "ok": false, "error": { "code": "PARSE_FAILURE", "message": "..." } }

GET  /health -> { "ok": true, "models": ["opencv-contours","paddleocr"], "device": "cuda:0" }
```

**There is no `irFragment`.** The service returns the IR's named sub-objects directly,
and Node assembles the full IR by taking `irVersion`, `pageName`, `sectionName`, `source`
and `idPolicy` from the request and everything else from this response. A single opaque
"fragment" is exactly the field one track emits as a whole IR and the other consumes as a
partial, and they discover the mismatch at integration.

**The perception service never allocates a `fieldId`** and never writes a file. Elements
come back identified by position and `elementName` only.

**Degradation is mandatory and is part of the contract, not an afterthought.** If
`/perceive` is unreachable, times out, or returns non-200, the Node API records the
stage as `degraded`, emits a warning, and continues down the deterministic path. Prompt
mode and the CMS contract must remain fully demonstrable with the Python service
stopped, the GPU absent, and no network.

---

## 13. Public HTTP API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/generate` | multipart: `mode`, `prompt`, `code`, `wireframe`, `pageName`, `sectionName` |
| GET | `/api/sections` | list |
| GET | `/api/sections/:sectionId` | one |
| GET | `/api/elements?pageName=` or `?sectionId=` | hydration source for Redux |
| PATCH | `/api/elements/:fieldId` | update `content` and/or `css` |
| POST | `/api/sections/:sectionId/regenerate` | variation 2, `idPolicy.mode = preserve` |
| GET | `/api/jobs/:jobId` | job record with stage traces |
| POST | `/api/jobs/:jobId/replay` | replay from a stage |
| GET | `/api/health` | liveness |

`mode` is one of `wireframe | code | prompt | combined`.

Success shape:

```json
{
  "ok": true,
  "jobId": "job-0000000001",
  "sectionId": "1000000001",
  "pageName": "Home",
  "componentFile": "src/sections/generated/HeroSection.jsx",
  "elementIds": ["2000000001", "2000000002"],
  "warnings": ["headlineSub inferred with low confidence"],
  "ir": { "sectionType": "split-hero" }
}
```

Error shape:

```json
{ "ok": false, "error": { "code": "INVALID_INPUT", "message": "At least one of wireframe, code, or prompt is required." } }
```

Status codes: `400` validation, `413` image over 8 MB, `422` model or parse failure,
`500` unexpected. **A failed generation must never leave persisted element IDs without
a parent section row.**

**Envelope convention, applied without exception.** Endpoints that *act* return the
`{ ok, ... }` envelope. Endpoints that *read a collection* return a **bare array**.
Endpoints that read one document return that **bare document**, or `404`. Errors always
return the `{ ok: false, error }` envelope, whatever the endpoint.

### 13.1 `POST /api/generate`

Accepted image types: **PNG, JPEG, WebP**. Anything else is `400`. Over 8 MB is `413`.
Uploads are written to `uploads/` and referenced in the IR as `uploads/<jobId>.<ext>`;
they are served read-only under `VITE_STORAGE_URL`. `uploads/` is the write root,
storage is the read root, and they address the same files.

### 13.2 `PATCH /api/elements/:fieldId`

The trigger of the §9 assertion and of the demo's central moment. Its shape is not
negotiable.

```
PATCH /api/elements/2000000003
Content-Type: application/json

{ "content": "TRAIN WITHOUT LIMITS", "css": "font-weight: bold;" }
```

Both fields are optional; **at least one is required**, or `400`. `content` is sanitised
write-side per §8. `css` must satisfy the §8 declaration allow-list or the request is
`400`. Setting `css` to `null` clears the overlay.

```json
{ "ok": true, "fieldId": "2000000003", "element": { "...full element document..." } }
```

`404` if the `fieldId` does not exist. The response carries the **whole** element
document so the client can replace its store entry without a refetch.

**For a `Cards` element**, `content` is ignored and `loop` is patched instead:

```
PATCH /api/elements/2000000006
{ "loop": [ { "field1": "2000+", "fieldId1": "3000000001",
              "field2": "Community<br />Members", "fieldId2": "3000000002" } ] }
```

Nested field IDs in a patched loop **must already exist**. A loop item carrying an
unknown `fieldIdN` is `400`. New card slots are created by regeneration, not by PATCH.

**Patching a single card field directly also works, and must**, because the side-editor
edits one field at a time and the §9 step-5 assertion depends on it:

```
PATCH /api/elements/3000000001
{ "content": "2000+" }
```

The API resolves a `3…`-range ID to its parent element, updates that position inside the
parent's `loop`, and returns the **parent's** full element document. It does not `404`.
An implementation that rejects nested IDs here makes card fields uneditable and quietly
fails the store-liveness gate's most important step.

### 13.3 `POST /api/sections/:sectionId/regenerate`

```json
{ "variation": "2", "prompt": "make the CTA green and use four stats", "mode": "prompt" }
```

Semantics, ruled explicitly because guessing them breaks the demo:

1. **The `sectionId` does not change.** The existing section row is updated in place and
   its `variations` value is set to the new count.
2. **`idPolicy.mode` is forced to `preserve`.** Every element whose `elementName` is
   unchanged keeps its existing `fieldId`, and therefore keeps its CMS content.
3. **Only genuinely new elements receive newly allocated IDs.** An element that
   disappears from the new layout is left in the store, not deleted — its content
   survives in case a later variation brings it back.
4. **Card slots grow and shrink by index.** Going from three stats to four preserves the
   first three items' nested IDs and allocates two new ones for the fourth. Shrinking
   leaves the orphaned items in place.

```json
{
  "ok": true,
  "jobId": "job-0000000002",
  "sectionId": "1000000001",
  "componentFile": "src/sections/generated/HeroSection.jsx",
  "preservedIds": { "headlineMain": "2000000003", "ctaButton": "2000000007" },
  "newIds": ["2000000008"],
  "warnings": []
}
```

Rule 2 is the whole demo. A judge types their own headline, we change the design, and
their words are still there because `headlineMain` kept `2000000003`. If regeneration
mints a new ID, the moment fails live and publicly.

### 13.4 Read endpoints

```
GET /api/sections?pageName=Home        -> SectionDoc[]        (bare array, [] if none)
GET /api/sections/1000000001           -> SectionDoc          (bare doc, 404 if absent)
GET /api/elements?pageName=Home        -> ElementDoc[]        (bare array)
GET /api/elements?sectionId=1000000001 -> ElementDoc[]        (bare array)
GET /api/elements?fieldIds=2000000003,2000000004 -> ElementDoc[]
GET /api/jobs/job-0000000001           -> JobDoc              (bare doc, 404 if absent)
GET /api/health -> { "ok": true, "store": "mongo", "perception": "up" | "down" }
```

At least one query parameter is required on `GET /api/elements`; an unfiltered request
is `400`. `/api/health` reports the perception service as `down` rather than failing —
its absence is a supported state, not an error.

---

## 14. What must never appear in this repository

Enforced by the pre-submit gate, checked against **full git history** and not merely the
working tree — a secret removed in a later commit is still a leak.

- Real API keys, credentials, `.pem`, `.key`, or a populated `.env`
- Real client or brand names. Demo content is Pulse Fit and `sample-brand`, always
- Real storage hosts, CDN URLs, or database URIs. Only `localhost`, `127.0.0.1`,
  `example.com`, `.local`
- Real MongoDB ObjectIds. Placeholders only
- Field IDs outside the sanctioned `1000…` / `2000…` / `3000…` ranges
- Absolute local paths — `C:\Users\`, `/home/`, `/Users/` — they leak real names
- Model weights: `*.pt`, `*.onnx`, `*.safetensors`. They drag their licence into the repo
- `node_modules/`, `uploads/`

`.env.example` **must be tracked**, and every value must match the placeholder shape.
The gate asserts both directions — present, and containing nothing real. The canonical
contents:

```
VITE_STORAGE_URL=http://localhost:5000/storage/
VITE_API_URL=http://localhost:5000/api
PERCEPTION_SERVICE_URL=http://localhost:8000
MONGODB_URI=mongodb://localhost:27017/framewright_dev
LLM_API_KEY=YOUR_LLM_API_KEY_HERE
LLM_BASE_URL=https://api.example.com/v1
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=framewright-sample
S3_ACCESS_KEY_ID=YOUR_S3_ACCESS_KEY_ID_HERE
S3_SECRET_ACCESS_KEY=YOUR_S3_SECRET_ACCESS_KEY_HERE
EMBEDDING_BASE_URL=https://api.example.com/v1
EMBEDDING_API_KEY=YOUR_EMBEDDING_API_KEY_HERE
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

The block from `REDIS_URL` down is v1.5, and **every one of those variables is optional**.
Unset means the deterministic fallback named in §15, §16 and §17 — the in-process cache,
local disk, the keyword scorer, dropped spans. A machine with none of them set runs the
full demo.

A right-hand side is a valid placeholder if it is empty, or contains any of:
`YOUR_` / `YOUR-`, `placeholder`, `xxx`, `changeme` / `change_me`, `dummy`, `redacted`,
`sample`, or resolves to `localhost` / `127.0.0.1` / `example.com` / a `.local` host.
Case-insensitive. Anything else fails.

**`VITE_STORAGE_URL` keeps its trailing slash.** The reference component concatenates it
directly — `${VITE_STORAGE_URL}default/images/hero-placeholder.jpg` — so dropping the
slash produces `storagedefault/...`. Our helper joins defensively either way, but the
canonical value carries the slash so that a judge comparing our component against the
brief's reference sees the same shape.

**The gate must also detect duplicate IDs, not merely out-of-range ones.** A
read-modify-write counter issues duplicates that are perfectly in range, so a range check
alone is blind to the exact failure the atomicity rule in §2.1 exists to prevent. The
check asserts that every `fieldId` in the element store is unique, and that every nested
`fieldIdN` across every loop of every element is unique.

---

## 15. Caching and object storage

Added in v1.5 from the architecture diagram's data and storage layers. Both are
**optional accelerators behind the interfaces that already exist**, and Standing Rule 3
governs them absolutely: with Redis stopped, the object store unreachable and no network,
every behaviour in §1–§14 still works. A dependency that can stop the deterministic path
is not permitted here, whatever it accelerates.

### 15.1 Cache adapter

```
cacheGet(key)                 -> value | null
cacheSet(key, value, ttlMs)   -> void
cacheDel(key)                 -> void
```

Two implementations behind that interface, selected by environment exactly as the store
is in §2.1: an in-process `Map` with TTL (the default, always available) and Redis
(`REDIS_URL`). **The in-process implementation is the reference.** Redis is chosen only
when `REDIS_URL` is set *and* reachable at boot; an unreachable Redis logs one warning and
falls back to the in-process cache rather than failing the boot.

What may be cached, and nothing else:

| Key shape | Holds | TTL |
|---|---|---|
| `ir:<jobId>` | the finalised IR for a job | 1 h |
| `render:<sectionId>:v<variation>` | emitted component source | 1 h |
| `embed:<sha256 of text>` | an embedding vector (§16.1) | 24 h |
| `perceive:<sha256 of upload bytes>` | a `/perceive` response body | 24 h |

**Element and section documents are never cached.** They are the live CMS store, and a
cache in front of them reintroduces exactly the failure §9 exists to catch: a PATCH lands,
the store is correct, and the preview does not move. `GET /api/elements` reads through to
the store on every request, always.

A cache miss is never an error. Every key above is recomputable from persisted state.

### 15.2 Object storage adapter

```
putObject(key, bytes, contentType) -> { key, url }
getObject(key)                     -> { bytes, contentType } | null
deleteObject(key)                  -> void
```

Two implementations: local disk under `uploads/` and `artifacts/` (the default, and what
§11.2 and §13.1 already mandate) and S3-compatible object storage — MinIO or equivalent —
selected by `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

Rules that do not move:

1. **§11.2 stands unchanged.** Artifacts are owned by Node. The Python service still never
   writes an artifact, whatever storage backend Node is using.
2. **Keys are the paths §11.2 and §13.1 already define** — `uploads/<jobId>.<ext>`,
   `artifacts/<jobId>/<stage>-<name>.<ext>`. The backend changes; the key does not, so a
   stored `outputRef` resolves under either backend.
3. **`VITE_STORAGE_URL` remains the single read root**, trailing slash intact (§14). When
   the S3 backend is active, Node proxies reads through the same URL rather than handing
   out a bucket URL — a real bucket host in a response body is a §14 violation and an
   R13 violation.
4. Credentials are `.env` only, and every value in `.env.example` stays a placeholder.

---

## 16. Model services

Added in v1.5 from the architecture diagram's ML/AI services layer. As with §15, every
service here is optional and every one has a deterministic fallback. **No model call is on
the critical path of prompt mode** — §6's keyless prompt-to-IR path is what that means in
practice, and it does not change.

### 16.1 Embedding and reranking

Used for one thing: choosing which section template and which element role best matches a
described or detected region, when more than one candidate scores close.

```
embed(texts)                    -> number[][] | null
rerank(query, candidates)       -> [{ index, score }]
```

- `embed` returns `null` when no embedding service is configured. Every caller must handle
  `null` by falling back to the deterministic keyword scorer in §6's keyless path. A caller
  that cannot proceed without an embedding is a contract violation.
- `rerank` falls back to lexical overlap scoring when `embed` returns `null`. It is
  therefore always callable and always returns a full ranking.
- Embeddings are cached under `embed:<sha256>` per §15.1.
- Licence rules from the README's forbidden table apply to embedding models exactly as
  they apply to vision models.

### 16.2 Model orchestrator

Every hosted-model call in the system goes through one orchestrator. Stage 5 does not call
a provider directly, and neither does anything else.

```
callModel({ purpose, input, schema, timeoutMs }) -> { ok, value, meta } | { ok: false, error }
```

| Rule | |
|---|---|
| Timeout | Default 30 s, hard ceiling 60 s — NFR-02's budget, inherited from the brief |
| Retries | **Exactly one**, on timeout or a schema-validation failure. Never on a 4xx |
| Validation | Output is validated against the caller's Ajv schema before it is returned. An invalid response is a failure, not a value |
| Fallback | On final failure the orchestrator returns `{ ok: false }`. **The caller falls back to the deterministic path** — it never propagates the failure to the user as a crash |
| Trace | Every call appends `{ purpose, model, ms, attempts, ok }` to the job's stage-5 record. §11's append-only rule applies |
| Keys | `LLM_API_KEY` unset means every `callModel` returns `{ ok: false }` immediately, without a network attempt. This is a supported state, not an error |

**Model output is untrusted input.** It is validated against a schema, and any string that
reaches an element's `content` is sanitised write-side per §8. A model never supplies a
field ID (§1, §6).

---

## 17. Observability

Added in v1.5 from the architecture diagram's observability layer. All four are additive
and none may fail a request.

### 17.1 Structured logging

One JSON line per event, to stdout. Fields: `ts`, `level`, `msg`, and `jobId` whenever a
job is in scope. Levels `debug | info | warn | error`.

**A log line is subject to §14 in full.** No key, no credential, no absolute local path, no
real host. Upload filenames are logged as the `<jobId>.<ext>` key, never the user's
original path — an original path is exactly the leak §14 names.

### 17.2 Metrics

Counters and histograms held in-process and exposed at `GET /api/metrics` in Prometheus
text format. **No Prometheus server is required** — the endpoint is the contract; scraping
it is optional.

Minimum set: `framewright_jobs_total{status}`, `framewright_stage_duration_ms{stage}`,
`framewright_model_calls_total{purpose,ok}`, `framewright_perception_up`.

### 17.3 Tracing

One trace per job, one span per stage, span names matching §11.0's seven stage names
exactly. Emitted via OpenTelemetry when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and
**dropped silently when it is not**. The stage trace in §11 is the authoritative record
either way; tracing is a second view of it, never a replacement.

### 17.4 Alerts

Out of scope for the event. `GET /api/health` (§13.4) is the liveness surface, and the
job's `status` (§11.1) is the failure surface. Nothing pages anyone.

---

## 18. Automated quality gates

Added in v1.5 from the architecture diagram's validation layer. These extend stage 6,
`validation-qa` (§11.0). They **add** checks; they do not replace the §9 store-liveness
assertion, which remains mandatory, separate, and never disabled.

Each gate records a result on the stage-6 trace and, on failure, appends to the job's
`warnings`. **No gate below fails a generation.** A component that lints clean, validates
against its schemas and hydrates a live store is a success even if it scores poorly here —
these gates inform, and §9 decides.

| Gate | Tool | Records |
|---|---|---|
| Static analysis | ESLint, fixed hermetic inline config (§8 — a config path derived from user input is code execution at lint time) | error and warning counts |
| Structure | Ajv against §2, §3, §4, §6, plus the duplicate-ID check from §14 | pass/fail per schema |
| Visual | pixelmatch, generated preview against the normalised wireframe | similarity 0.0–1.0, `null` when there was no wireframe |
| Accessibility | axe-core against the rendered preview | violation count by impact |
| Performance | bundle size and render cost of the generated section only | bytes, ms |

### 18.1 The quality score

One number, 0–100, surfaced in the API response and on the Glass Box timeline.

```
score = 40 * structurePass
      + 25 * (1 - min(1, eslintErrors / 10))
      + 15 * (visualSimilarity ?? 1.0)
      + 15 * (1 - min(1, axeSeriousViolations / 5))
      +  5 * confidenceMean
```

- `structurePass` is `1` or `0`. Nothing else can move it, because a document that fails
  its schema is not a partially good document.
- `visualSimilarity` is `null` — and therefore scored as `1.0` — when no wireframe was
  supplied. **Prompt mode must not be penalised for having no image to compare against.**
- The formula is stated here so two people cannot compute two different scores from the
  same job, and so a judge can check the arithmetic.

**The score is not a gate.** It is displayed. Nothing branches on it.
