// server/src/generate/wireframeSemantics.js
//
// T-153 — a semantics layer over perception's geometry. CONTRACT.md §6, §6.1, §12.
//
// THE DEFECT THIS FIXES IS NARROWER THAN IT LOOKS, and stating it precisely matters
// because the obvious reading sends you to rewrite a stage that is already correct.
// Perception does read the drawing: stage 3a finds the regions with OpenCV and stage 3b
// reads their words with PaddleOCR, and B-004 measures 6 of 7 regions reaching the right
// slot with 4 of 4 of the readable strings intact. The geometry is good.
//
// What is wrong is the SHAPE it is poured into. `perception/stages/fuse.py` builds its
// element list as "the reference set, always, in template order" — seven fixed slots,
// heroImage through ctaButton — and lets detections claim them. Two consequences follow
// for any wireframe that is not the reference split hero:
//
//   1. A region that is not one of those seven has nowhere to go. A wireframe of a
//      pricing table, a login form or a blog index comes back described as a fitness
//      hero, because that is the only vocabulary the slot table has.
//   2. A slot claimed by a region whose OCR read nothing KEEPS THE TEMPLATE'S COPY.
//      `_build_element` only overwrites `default` when `claim.text` is truthy, which is
//      the honest choice at that layer — but the copy it keeps is PULSE FIT's, so a
//      wireframe of anything ships with "Join trainer-led workout sessions…" in it.
//
// So this is a NAMING problem sitting on top of good geometry, and it is fixed by
// renaming, not by re-detecting. That is why this module lives in Node rather than in
// `fuse.py`: the boxes are not in question, and T-153's own doneWhen makes that the
// acceptance condition — "OpenCV still owns every bbox and B-003/B-004 do not regress."
// Nothing here can move a bbox, because nothing here writes one.
//
// WHAT THE MODEL IS ASKED, AND WHAT IT IS NOT.
//
// It is asked to name things: given the boxes, the words already read out of them, and
// where they sit relative to each other, what is this section and what is each element?
// It is NOT asked for coordinates. A VLM handed an image and asked to place a box
// misplaces it — B-006 measured exactly that, and T-121/T-122 are still open on the back
// of it. Handing the model OpenCV's own boxes and asking only for their meaning is the
// one arrangement of these two components that plays to both.
//
// EVERY FAILURE RETURNS TODAY'S IR, UNCHANGED AND UNCLONED. No key, a timeout, a refusal,
// a malformed response, a response that survives the schema and still leaves too little
// to render — all of them return the caller's own object by reference. AGENTS.md rule 5
// is the reason: the deterministic path must stay demonstrable with `LLM_API_KEY` unset,
// and "unchanged" has to mean identical rather than merely equivalent, or the no-key demo
// quietly becomes a different demo. The clone is made up front and thrown away on failure
// rather than mutating and rolling back, because a rollback is a thing you can get wrong.
//
// §16.2 — this module never opens a socket. It calls `callModel`, the one orchestrator,
// which owns the single retry, the timeout and the key.

import { validateIr } from '../validate/irValidator.js';
import { callModel as orchestratorCallModel } from '../models/orchestrator.js';
import { repairElementNames, repairReferences } from './repairModelIr.js';

/** §16.2's trace label for this call. */
export const PURPOSE = 'wireframe-semantics';

/**
 * `tag` is interpolated RAW into emitted JSX — `<${tag} id={ids.x} …>` in
 * emitComponent.renderElementNode. A model-supplied tag is therefore untrusted input
 * reaching a code generator, and §16.2's "model output is untrusted input" is not a
 * slogan here: `tag: "div onLoad={fetch('…')}"` would compile. So tags come from an
 * allow-list, and anything outside it keeps the element's existing tag rather than being
 * sanitised into something adjacent — a rejected tag is a naming miss, and the template's
 * tag was already valid.
 */
export const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'div', 'section', 'article', 'li', 'label', 'strong', 'em', 'small', 'img',
]);

/**
 * The model may not turn something into a `Cards` element. §6 makes `loop` required and
 * non-null for `contentType: "Cards"`, and the loop it would need is `ir.cards`, which is
 * sized from a DETECTED SERIES in fuse.py — a thing this module cannot see and must not
 * invent. An element promoted to Cards without one fails §6 validation, which would send
 * a perfectly good rename down the fallback path over a field nobody asked it to change.
 */
export const ASSIGNABLE_CONTENT_TYPES = new Set(['Image', 'Text', 'Textfield', 'Button']);

/**
 * §6's vocabulary for the section as a whole. `deriveSectionType` in
 * perceiveAndAssembleIr reports `generic` for anything that is not the reference shape,
 * which is honest and is also why a judge sees "generic" on a wireframe the pipeline
 * understood perfectly well. The model may sharpen it, within this list.
 */
export const ASSIGNABLE_SECTION_TYPES = new Set([
  'split-hero', 'stacked-hero', 'feature-grid', 'pricing', 'form', 'listing',
  'testimonials', 'cta-banner', 'navbar', 'footer', 'generic',
]);

/**
 * The floor for running at all. Below this the wireframe told us almost nothing and the
 * template is the more honest answer — renaming two boxes into a bespoke vocabulary just
 * moves the fabrication out of the copy and into the element names.
 */
export const MIN_CLAIMED_REGIONS = 2;

export const SYSTEM_PROMPT = [
  'You are naming the parts of a wireframe that has already been analysed.',
  '',
  'A computer-vision pass has found every region and read the handwriting inside it. The',
  'geometry is settled and is not yours to change. What is missing is meaning: the regions',
  'were poured into a fixed seven-slot hero template, so their names describe that template',
  'rather than the drawing.',
  '',
  'You are given each detected element with its current placeholder name, its bounding box',
  'as [x, y, w, h] over the normalised image, the text OCR actually read inside it (or null',
  'when the region carried no readable words), and its current content type.',
  '',
  'Return one entry per element you were given, keyed by its `slot` — the placeholder name,',
  'copied back verbatim so the caller can match it. For each:',
  '',
  '  elementName  A camelCase identifier naming what this element IS in THIS design:',
  '               planName, priceMonthly, emailField, signInButton, articleTitle. Never a',
  '               name from the hero template unless the element genuinely is that thing.',
  '               Unique across the response.',
  '  default      The copy this element should hold. Where OCR read text, use that text —',
  '               it is what the designer wrote. Where it read nothing, write short, plain',
  '               placeholder copy that fits the element you just named, in the subject',
  '               matter of THIS wireframe. Never fitness copy unless this is a gym.',
  '  contentType  Image, Text, Textfield or Button. Keep the one you were given unless the',
  '               geometry and words clearly say otherwise — a bordered box with a short',
  '               label above it is a Textfield; a small filled box with a verb in it is a',
  '               Button.',
  '  tag          The HTML tag: h1, h2, h3, p, span, div, label, li, img.',
  '',
  'Also return `sectionType`: what kind of section this whole drawing is.',
  '',
  'Do not return bounding boxes, coordinates, field IDs, or any element you were not given.',
  'Name only what is on the page. An element whose meaning you cannot tell from its box and',
  'its words should keep its placeholder name rather than receive a guessed one.',
].join('\n');

/**
 * The response schema handed to the orchestrator. Deliberately small: the orchestrator's
 * validator covers type/required/properties/enum/items and NOT `additionalProperties`, so
 * this cannot be the only guard — `mergeSemantics` whitelists field by field on the way
 * in. The schema is here to reject a wrong-shaped response early, with a message that
 * names the offending path.
 */
export const SEMANTICS_SCHEMA = {
  type: 'object',
  required: ['elements'],
  properties: {
    sectionType: { type: 'string' },
    elements: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['slot', 'elementName'],
        properties: {
          slot: { type: 'string' },
          elementName: { type: 'string' },
          default: { type: ['string', 'null'] },
          contentType: { type: 'string' },
          tag: { type: 'string' },
        },
      },
    },
  },
};

/**
 * claimedRegions(ir) -> number
 *
 * How many elements a region actually claimed. §6's `sourceOf` is what makes this
 * answerable rather than guessed: `wireframe` means fuse.py gave that slot a real
 * detection, `default` means the slot kept the template because nothing claimed it.
 */
export function claimedRegions(ir) {
  return (Array.isArray(ir?.elements) ? ir.elements : [])
    .filter((el) => el && el.sourceOf === 'wireframe').length;
}

/**
 * observationFor(ir) -> { sectionType, layout, elements }
 *
 * What the model is shown. Pure, and deliberately narrow — this is the whole of the
 * model's view of the wireframe, so anything absent here is a thing it cannot be wrong
 * about. Classes, css, order, confidence and the card items are all withheld: none of
 * them is evidence about what an element MEANS, and each is a field the model would
 * otherwise feel invited to rewrite.
 *
 * `text` is null rather than the template copy when nothing was read. That distinction is
 * the whole of case 2 in the file header: the model must be able to tell "the designer
 * wrote FIND A WORKOUT here" from "this box was empty and the template filled it in", and
 * passing the template's copy through as though OCR had read it destroys exactly that
 * difference.
 */
export function observationFor(ir) {
  const elements = (Array.isArray(ir?.elements) ? ir.elements : []).map((el) => ({
    slot: el.elementName,
    bbox: Array.isArray(el.bbox) ? el.bbox : null,
    text: el.sourceOf === 'wireframe' && typeof el.default === 'string' ? el.default : null,
    contentType: el.contentType,
    claimed: el.sourceOf === 'wireframe',
  }));

  const regions = (ir?.layout?.regions || []).map((r) => ({
    role: r.role,
    side: r.side,
    width: r.width,
    children: Array.isArray(r.children) ? r.children : [],
  }));

  return {
    sectionType: ir?.sectionType ?? 'generic',
    layout: { direction: ir?.layout?.direction ?? 'row', regions },
    elements,
  };
}

/**
 * mergeSemantics(ir, response) -> { warnings, renamed }
 *
 * Applies the model's naming to `ir` IN PLACE — `ir` is always the clone, never the
 * caller's object. Four fields and no others: `elementName`, `default`, `contentType`,
 * `tag`. `bbox`, `confidence`, `order`, `classes`, `css` and `sourceOf` are not in the
 * write set and are not derived from anything in the response, which is what makes
 * "OpenCV still owns every bbox" a property of the code rather than a promise about it.
 *
 * `sourceOf` staying `wireframe` is deliberate and worth defending: the geometry, the
 * words, and the fact that there IS an element here all still come from the image. The
 * model supplied a label for something the wireframe already contained. Flipping these to
 * `prompt` would tell §6's sourceOf audit that a prompt produced elements in a run that
 * had no prompt, and would hand every one of them to the wrong side of §6's
 * conflict-resolution order.
 *
 * Entries naming a slot that does not exist are ignored rather than appended. An element
 * this module invents is an element with no box, and a bespoke section is not improved by
 * a field nobody drew.
 */
export function mergeSemantics(ir, response) {
  const warnings = [];
  const bySlot = new Map(
    (Array.isArray(ir.elements) ? ir.elements : [])
      .filter((el) => el && typeof el.elementName === 'string')
      .map((el) => [el.elementName, el]),
  );

  let renamed = 0;
  const seen = new Set();

  for (const entry of Array.isArray(response?.elements) ? response.elements : []) {
    const element = bySlot.get(entry?.slot);
    if (!element) {
      warnings.push(
        `Model named a slot ${JSON.stringify(entry?.slot ?? null)} that perception did not detect; ignored — an element with no bounding box is one nobody drew.`,
      );
      continue;
    }
    if (seen.has(entry.slot)) {
      warnings.push(`Model returned slot ${JSON.stringify(entry.slot)} twice; the second entry was ignored.`);
      continue;
    }
    seen.add(entry.slot);

    if (typeof entry.default === 'string' && entry.default.trim()) {
      element.default = entry.default;
    }

    if (
      typeof entry.contentType === 'string' &&
      ASSIGNABLE_CONTENT_TYPES.has(entry.contentType) &&
      element.contentType !== 'Cards'
    ) {
      element.contentType = entry.contentType;
    } else if (typeof entry.contentType === 'string' && entry.contentType !== element.contentType) {
      warnings.push(
        `Model set ${JSON.stringify(element.elementName)} to contentType ${JSON.stringify(entry.contentType)}; kept ${JSON.stringify(element.contentType)} (a card loop is sized from a detected series, not chosen here).`,
      );
    }

    if (typeof entry.tag === 'string' && ALLOWED_TAGS.has(entry.tag)) {
      element.tag = entry.tag;
    } else if (typeof entry.tag === 'string' && entry.tag !== element.tag) {
      warnings.push(
        `Model set ${JSON.stringify(element.elementName)} to tag ${JSON.stringify(entry.tag)}, which is not in the emitter's allow-list; kept ${JSON.stringify(element.tag)}.`,
      );
    }

    // Renaming happens LAST, so every warning above still names the element by the slot
    // the reader is looking at in the perception artifact.
    if (typeof entry.elementName === 'string' && entry.elementName.trim() && entry.elementName !== element.elementName) {
      element.elementName = entry.elementName;
      renamed += 1;
    }
  }

  if (typeof response?.sectionType === 'string' && ASSIGNABLE_SECTION_TYPES.has(response.sectionType)) {
    ir.sectionType = response.sectionType;
  }

  return { warnings, renamed };
}

/**
 * dropUnclaimedElements(ir) -> warnings
 *
 * Case 2 from the file header, finished. Renaming alone leaves the slots NOTHING claimed
 * still sitting in the IR carrying the reference section's copy: a wireframe with three
 * regions still emits seven elements, four of them PULSE FIT's. Those four are not a
 * degraded reading of the drawing — no region claimed them at all, which `sourceOf:
 * "default"` states outright — so they are template residue inside a section that is
 * otherwise the user's.
 *
 * Only ever runs behind a successful model call. A wireframe run with no key must return
 * today's IR exactly, and today's IR has all seven.
 *
 * The by-name references go stale as elements leave; `repairReferences` is what puts them
 * right, and it runs immediately after this in the one caller. Doing it here as well
 * would be two implementations of one rule.
 */
export function dropUnclaimedElements(ir) {
  const warnings = [];
  const unclaimed = (Array.isArray(ir.elements) ? ir.elements : [])
    .filter((el) => el && el.sourceOf === 'default');
  if (!unclaimed.length) return warnings;

  ir.elements = ir.elements.filter((el) => el && el.sourceOf !== 'default');
  warnings.push(
    `${unclaimed.length} element(s) were dropped because no detected region claimed them ` +
    `(${unclaimed.map((el) => JSON.stringify(el.elementName)).join(', ')}); they would have ` +
    "shipped the reference template's copy inside a section built from this wireframe.",
  );
  return warnings;
}

/**
 * applyWireframeSemantics(ir, options) -> { ir, applied, reason, warnings, meta }
 *
 * `applied: false` returns the caller's own `ir` by reference. See the file header on why
 * that is identity rather than equivalence.
 */
export async function applyWireframeSemantics(ir, options = {}) {
  const { callModel = orchestratorCallModel, timeoutMs } = options;

  const unchanged = (reason) => ({ ir, applied: false, reason, warnings: [], meta: null });

  if (!ir || !Array.isArray(ir.elements) || !ir.elements.length) {
    return unchanged('no elements to name');
  }

  // Perception degraded, or ran and claimed almost nothing. Either way the drawing is not
  // the source of what is in this IR, and naming the template's own slots after a
  // wireframe nobody could read is a fabrication with a model's confidence behind it.
  const claimed = claimedRegions(ir);
  if (claimed < MIN_CLAIMED_REGIONS) {
    return unchanged(
      `only ${claimed} region(s) claimed an element; below the floor of ${MIN_CLAIMED_REGIONS} for naming a section from a drawing`,
    );
  }

  let response;
  try {
    // ONE call. §16.2 gives the single retry to the orchestrator; a second one here is
    // how a two-attempt budget silently becomes four.
    response = await callModel({
      purpose: PURPOSE,
      input: JSON.stringify(observationFor(ir)),
      system: SYSTEM_PROMPT,
      schema: SEMANTICS_SCHEMA,
      timeoutMs,
    });
  } catch (err) {
    return unchanged(`model orchestrator threw: ${err && err.message ? err.message : String(err)}`);
  }

  if (!response || response.ok !== true) {
    return unchanged((response && response.error) || 'model call failed');
  }

  const value = response.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return unchanged('model returned a non-object naming');
  }

  const candidate = structuredClone(ir);
  const warnings = [];

  warnings.push(...mergeSemantics(candidate, value).warnings);
  warnings.push(...dropUnclaimedElements(candidate));

  // The same floor every model-written IR gets. `repairElementNames` runs first, so that a
  // region child written against the pre-normalisation name is compared with the name it
  // now has rather than reported dangling by the step that renamed it — and so a model
  // that answers "Plan Name" cannot emit `Plan Name: '2000000546'` into §9's `ids` map.
  warnings.push(...repairElementNames(candidate));
  const { warnings: refWarnings, viable } = repairReferences(candidate);
  warnings.push(...refWarnings);

  // §6 makes `cards` REQUIRED, and `repairReferences` deletes it outright when nothing is
  // left to own the loop — which is the ordinary case here, because `statBadges` is one of
  // the seven template slots and a wireframe that drew no series of boxes never claimed
  // it. Deleting the key fails validation and would send every such run down the fallback
  // path over a loop the drawing never had.
  //
  // codeToIr already met this shape for pasted React with no `.map` in it: "§6 makes
  // `cards` required, so it stays, but nothing populates it" — count 0, no items. Same
  // answer here, with one difference that is deliberate rather than a divergence.
  //
  // `of` is emptied as well. codeToIr leaves the template's `"statBadges"` in place, and
  // emitComponent computes `hasCards = Boolean(cards && cards.of)` — so a name left
  // pointing at an element that no longer exists reports "this section has a card loop"
  // to the emitter for a section that does not. An empty `of` is the truthful statement
  // of no owner, it satisfies §6's `string`, and it is the only value that cannot be
  // mistaken for a live reference. (codeToIr is T-154's file, not this one's.)
  if (!candidate.cards || typeof candidate.cards !== 'object') {
    candidate.cards = { ...(ir.cards || {}), of: '', count: 0, gridColumns: 0, items: [] };
  }

  if (!viable) {
    return unchanged('naming left too few placed elements to form an editable section (§9)');
  }

  // §16.2 — output is validated before it is believed. Validated AFTER the repairs, for
  // the same reason promptToIrHosted does it that way: a candidate the repairs could not
  // save is a real failure and should report the schema's own reason for it.
  const result = validateIr(candidate);
  if (!result.valid) {
    const first = result.errors[0];
    return unchanged(
      `naming produced an IR that fails §6 validation (${first ? `${first.path}: ${first.message}` : 'unknown schema error'})`,
    );
  }

  return {
    ir: candidate,
    applied: true,
    reason: null,
    warnings,
    meta: response.meta || null,
  };
}

export default applyWireframeSemantics;
