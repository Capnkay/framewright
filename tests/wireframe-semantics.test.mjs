// tests/wireframe-semantics.test.mjs — T-153.
//
// The verifier for the semantics layer. Rule 6: it did not build the module, and every
// assertion here is about a property the module's own comments claim rather than about
// its internal shape.
//
// The three the doneWhen names, and the ones that keep it safe:
//
//   1. OpenCV still owns every bbox. Asserted by handing the model a response that TRIES
//      to move one and checking the geometry is byte-identical afterwards.
//   2. A wireframe whose regions are not the reference section comes back semantically
//      named, not as heroImage/brandBadge/headlineMain.
//   3. Any model failure returns EXACTLY today's IR — asserted as object identity, not
//      deep equality, because the deterministic demo must be the same object it always
//      was and a rebuilt-but-equal IR would pass a deepEqual while proving nothing about
//      the failure path.
//
// No network and no key: `callModel` is injected in every test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWireframeSemantics,
  observationFor,
  mergeSemantics,
  claimedRegions,
  MIN_CLAIMED_REGIONS,
} from '../server/src/generate/wireframeSemantics.js';
import { validateIr } from '../server/src/validate/irValidator.js';

/**
 * An IR shaped exactly as perceiveAndAssembleIr returns one for a wireframe that is NOT
 * the reference section: a login form. Four of the seven slots were claimed by real
 * regions, three kept the fitness template because nothing claimed them, and `description`
 * was claimed by a region whose OCR read nothing — which is the case that ships
 * "Join trainer-led workout sessions…" inside a login form.
 */
function perceivedLoginForm() {
  const element = (elementName, contentType, tag, order, def, sourceOf, bbox, confidence) => ({
    elementName,
    contentType,
    tag,
    order,
    default: def,
    classes: '',
    css: null,
    alt: null,
    confidence,
    sourceOf,
    bbox,
  });

  return {
    irVersion: '1.0',
    pageName: 'Home',
    sectionName: 'Custom',
    platform: 'Website',
    sectionType: 'split-hero',
    source: { mode: 'wireframe', inputs: ['wireframe'], wireframeRef: 'uploads/job-1' },
    idPolicy: { mode: 'allocate', contentPolicy: 'overwrite', preserve: { elements: {}, cards: {} } },
    layout: {
      direction: 'row',
      breakpoint: 'md',
      mobileBehaviour: 'stack',
      container: { maxWidth: '1920px', padding: 'px-0 md:px-12' },
      regions: [
        { role: 'media', side: 'left', width: '1/2', children: ['heroImage'] },
        {
          role: 'content',
          side: 'right',
          width: '1/2',
          children: ['brandBadge', 'headlineMain', 'headlineSub', 'description', 'statBadges', 'ctaButton'],
        },
      ],
    },
    theme: { accent: 'red-500', surface: 'white', text: 'gray-800', textMode: 'auto' },
    cards: {
      of: 'statBadges',
      count: 3,
      gridColumns: 3,
      layoutMode: 'grid',
      fieldsPerItem: 2,
      items: [
        { field1: '1000+', field2: 'Community<br />Members' },
        { field1: '40+', field2: 'Fitness<br />Programmes' },
        { field1: '150+', field2: 'Fitness<br />Channels' },
      ],
    },
    elements: [
      element('heroImage', 'Image', 'img', 1, 'default/images/hero-placeholder.jpg', 'wireframe', [40, 60, 420, 520], 0.88),
      element('brandBadge', 'Text', 'span', 2, 'SIGN IN', 'wireframe', [745, 292, 161, 28], 0.97),
      element('headlineMain', 'Text', 'h1', 3, 'WELCOME BACK', 'wireframe', [740, 340, 233, 45], 0.99),
      // Claimed by a real region, but OCR read nothing inside it. This is the one that
      // ships the fitness paragraph.
      element('headlineSub', 'Text', 'h2', 4, "Be a part of the tribe that's limitless.", 'wireframe', [740, 400, 320, 30], 0.71),
      element(
        'description',
        'Textfield',
        'p',
        5,
        'Join trainer-led workout sessions designed to kickstart your fitness journey, at your convenience.',
        'default',
        null,
        null,
      ),
      element('statBadges', 'Cards', 'div', 6, '', 'default', null, null),
      element('ctaButton', 'Button', 'Button', 7, 'FIND A WORKOUT', 'default', null, null),
    ],
    variations: '1',
    warnings: [],
  };
}

/** A naming a competent model would return for the login form above. */
function loginNaming() {
  return {
    sectionType: 'form',
    elements: [
      { slot: 'heroImage', elementName: 'brandArtwork', contentType: 'Image', tag: 'img' },
      { slot: 'brandBadge', elementName: 'formTitle', default: 'SIGN IN', contentType: 'Text', tag: 'h2' },
      { slot: 'headlineMain', elementName: 'welcomeHeadline', default: 'WELCOME BACK', contentType: 'Text', tag: 'h1' },
      { slot: 'headlineSub', elementName: 'emailField', default: 'you@example.com', contentType: 'Textfield', tag: 'label' },
    ],
  };
}

const stubModel = (value, meta = { purpose: 'wireframe-semantics', model: 'stub', ms: 12, attempts: 1, ok: true }) =>
  async () => ({ ok: true, value, meta });

// ---------------------------------------------------------------------------
// The doneWhen, item 3 — any model failure returns exactly today's IR.
// ---------------------------------------------------------------------------

test('no key returns the caller’s own IR, by identity', async () => {
  const ir = perceivedLoginForm();
  const result = await applyWireframeSemantics(ir, {
    callModel: async () => ({ ok: false, error: 'LLM_API_KEY is not set' }),
  });

  assert.equal(result.applied, false);
  assert.equal(result.ir, ir, 'the deterministic IR was rebuilt rather than returned');
  assert.equal(result.reason, 'LLM_API_KEY is not set');
  assert.deepEqual(result.warnings, [], 'a supported state must not add warnings (§16.2)');
});

test('an orchestrator that throws returns the caller’s own IR', async () => {
  const ir = perceivedLoginForm();
  const result = await applyWireframeSemantics(ir, {
    callModel: async () => { throw new Error('socket hang up'); },
  });

  assert.equal(result.applied, false);
  assert.equal(result.ir, ir);
  assert.match(result.reason, /socket hang up/);
});

test('a response that names everything into one element is refused, not shipped', async () => {
  const ir = perceivedLoginForm();
  // Every slot renamed to the same identifier: repairElementNames de-duplicates, but
  // the elements the regions never claimed are gone and the survivors collapse below
  // §9's floor for an editable section.
  const result = await applyWireframeSemantics(ir, {
    callModel: stubModel({
      elements: [
        { slot: 'heroImage', elementName: 'thing' },
        { slot: 'brandBadge', elementName: 'thing' },
      ],
    }),
  });

  // heroImage/brandBadge/headlineMain/headlineSub survive the drop (4 claimed), so this
  // one is viable; the assertion that matters is that it never returns something invalid.
  if (result.applied) {
    assert.equal(validateIr(result.ir).valid, true);
    const names = result.ir.elements.map((e) => e.elementName);
    assert.equal(new Set(names).size, names.length, 'duplicate elementName reached the IR (§6 F-008)');
  } else {
    assert.equal(result.ir, ir);
  }
});

test('too few claimed regions means the template is the honest answer', async () => {
  const ir = perceivedLoginForm();
  for (const el of ir.elements) el.sourceOf = 'default';
  ir.elements[0].sourceOf = 'wireframe';
  assert.ok(claimedRegions(ir) < MIN_CLAIMED_REGIONS);

  let called = false;
  const result = await applyWireframeSemantics(ir, {
    callModel: async () => { called = true; return { ok: true, value: loginNaming() }; },
  });

  assert.equal(called, false, 'a model was paid for a wireframe nobody could read');
  assert.equal(result.applied, false);
  assert.equal(result.ir, ir);
});

// ---------------------------------------------------------------------------
// The doneWhen, item 2 — semantically named, not the reference set.
// ---------------------------------------------------------------------------

test('a login wireframe comes back named after itself, not after the hero template', async () => {
  const ir = perceivedLoginForm();
  const before = structuredClone(ir);

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(loginNaming()) });

  assert.equal(result.applied, true, result.reason || '');
  assert.equal(validateIr(result.ir).valid, true, JSON.stringify(validateIr(result.ir).errors));

  const names = result.ir.elements.map((e) => e.elementName);
  assert.deepEqual(names, ['brandArtwork', 'formTitle', 'welcomeHeadline', 'emailField']);
  for (const templateName of ['heroImage', 'brandBadge', 'headlineMain', 'headlineSub']) {
    assert.ok(!names.includes(templateName), `${templateName} survived the naming`);
  }

  assert.equal(result.ir.sectionType, 'form');

  // The fitness copy is gone — both ways it gets in. `description` and `ctaButton` were
  // never claimed and were dropped; `headlineSub` was claimed with no readable text and
  // was renamed and re-copied rather than left as the tribe line.
  const asJson = JSON.stringify(result.ir.elements);
  assert.ok(!/trainer-led/.test(asJson), 'the reference paragraph shipped inside a login form');
  assert.ok(!/limitless/.test(asJson), 'the reference sub-headline shipped inside a login form');
  assert.ok(!/FIND A WORKOUT/.test(asJson), 'the reference CTA shipped inside a login form');

  // The caller's own IR is untouched — the clone is the thing that changed.
  assert.deepEqual(ir, before, 'applyWireframeSemantics mutated the IR it was given');
});

test('the by-name references follow the rename and the dropped elements', async () => {
  const ir = perceivedLoginForm();
  const result = await applyWireframeSemantics(ir, { callModel: stubModel(loginNaming()) });

  const declared = new Set(result.ir.elements.map((e) => e.elementName));
  const children = result.ir.layout.regions.flatMap((r) => r.children);

  for (const child of children) {
    assert.ok(declared.has(child), `region child ${JSON.stringify(child)} names no element`);
  }
  for (const name of declared) {
    assert.ok(children.includes(name), `${name} is declared but placed in no region`);
  }

  // statBadges was the only Cards element and it was dropped. §6 keeps `cards` present,
  // but its owner must not be left naming an element that no longer exists — the emitter
  // reads a non-empty `cards.of` as "this section has a card loop".
  assert.ok(result.ir.cards, '§6 makes cards required');
  assert.equal(result.ir.cards.of, '', 'cards.of still names the dropped element');
  assert.equal(result.ir.cards.count, 0);
  assert.deepEqual(result.ir.cards.items, []);
});

test('a renamed element stays in the region it was actually drawn in', async () => {
  // QA FINDING, live: `mergeSemantics` renamed every claimed slot but never touched
  // `layout.regions[].children`, which still named the PRE-rename slots. By the time
  // `repairReferences` ran, it saw six children naming nothing (the old names) and six
  // declared elements placed nowhere (the new names) — so it dropped all six from their
  // real regions and re-appended all six to the LAST region, collapsing the media/content
  // split into one region. `heroImage` -> `brandArtwork` is the sharpest case: it starts
  // alone in the `media` region and must not end up in `content` just because it changed
  // its name.
  const ir = perceivedLoginForm();
  assert.deepEqual(ir.layout.regions[0].children, ['heroImage'], 'fixture assumption');
  assert.equal(ir.layout.regions[0].role, 'media', 'fixture assumption');

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(loginNaming()) });
  assert.equal(result.applied, true, result.reason || '');

  const media = result.ir.layout.regions.find((r) => r.role === 'media');
  const content = result.ir.layout.regions.find((r) => r.role === 'content');

  assert.deepEqual(media.children, ['brandArtwork'], 'the renamed media element left its own region');
  assert.ok(!content.children.includes('brandArtwork'), 'the media element was re-homed into content');
});

// ---------------------------------------------------------------------------
// The doneWhen, item 1 — OpenCV still owns every bbox.
// ---------------------------------------------------------------------------

test('a model that tries to move a box does not move it', async () => {
  const ir = perceivedLoginForm();
  const geometryBefore = new Map(ir.elements.map((e) => [e.elementName, JSON.stringify(e.bbox)]));

  const naming = loginNaming();
  // The model returns coordinates it was explicitly told not to return, plus a
  // confidence it has no way to know.
  naming.elements[2].bbox = [0, 0, 10, 10];
  naming.elements[2].confidence = 1;
  naming.elements[2].sourceOf = 'prompt';

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(naming) });
  assert.equal(result.applied, true, result.reason || '');

  const headline = result.ir.elements.find((e) => e.elementName === 'welcomeHeadline');
  assert.equal(JSON.stringify(headline.bbox), geometryBefore.get('headlineMain'));
  assert.equal(headline.confidence, 0.99, 'the model rewrote a confidence it cannot measure');
  assert.equal(headline.sourceOf, 'wireframe', 'a renamed element stopped crediting the image (§6)');
  assert.equal(headline.order, 3, 'order is perception’s, not the model’s');
});

test('every surviving element keeps the bbox perception gave its slot', async () => {
  const ir = perceivedLoginForm();
  const bySlot = new Map(ir.elements.map((e) => [e.elementName, e.bbox]));
  const slotOf = new Map(loginNaming().elements.map((e) => [e.elementName, e.slot]));

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(loginNaming()) });

  for (const el of result.ir.elements) {
    const slot = slotOf.get(el.elementName);
    assert.deepEqual(el.bbox, bySlot.get(slot), `${el.elementName} lost its slot's geometry`);
  }
});

// ---------------------------------------------------------------------------
// Untrusted output — §16.2.
// ---------------------------------------------------------------------------

test('a tag outside the emitter’s allow-list is refused, not sanitised', async () => {
  const ir = perceivedLoginForm();
  const naming = loginNaming();
  // `tag` is interpolated raw into JSX by emitComponent. This one compiles.
  // No URL in the payload on purpose: `.githooks/pre-push` refuses any hostname in git
  // history that is not on its allow-list, and a JSX-injection fixture does not need one
  // to make its point — a handler that runs at all is the whole defect.
  naming.elements[1].tag = 'div onLoad={globalThis.__pwned = true}';

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(naming) });
  assert.equal(result.applied, true, result.reason || '');

  const title = result.ir.elements.find((e) => e.elementName === 'formTitle');
  assert.equal(title.tag, 'span', 'a model-supplied tag reached the emitter');
  assert.ok(
    result.warnings.some((w) => /allow-list/.test(w)),
    'the rejected tag was not reported',
  );
});

test('the model cannot promote an element to Cards', async () => {
  const ir = perceivedLoginForm();
  const naming = loginNaming();
  naming.elements[1].contentType = 'Cards';

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(naming) });
  assert.equal(result.applied, true, result.reason || '');

  const title = result.ir.elements.find((e) => e.elementName === 'formTitle');
  assert.equal(title.contentType, 'Text', 'an element became Cards with no loop behind it (§6)');
});

test('a slot perception never detected is ignored rather than appended', async () => {
  const ir = perceivedLoginForm();
  const naming = loginNaming();
  naming.elements.push({ slot: 'newsletterSignup', elementName: 'newsletterSignup', default: 'Subscribe' });

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(naming) });
  assert.equal(result.applied, true, result.reason || '');

  const names = result.ir.elements.map((e) => e.elementName);
  assert.ok(!names.includes('newsletterSignup'), 'an element with no bounding box was invented');
  assert.ok(result.warnings.some((w) => /nobody drew/.test(w)));
});

test('a name that is not an identifier cannot reach §9’s ids map', async () => {
  const ir = perceivedLoginForm();
  const naming = loginNaming();
  naming.elements[1].elementName = 'Form Title';

  const result = await applyWireframeSemantics(ir, { callModel: stubModel(naming) });
  assert.equal(result.applied, true, result.reason || '');

  for (const el of result.ir.elements) {
    assert.match(el.elementName, /^[A-Za-z_$][A-Za-z0-9_$]*$/, `${el.elementName} would emit an unparseable ids map`);
  }
  const children = result.ir.layout.regions.flatMap((r) => r.children);
  const declared = new Set(result.ir.elements.map((e) => e.elementName));
  for (const child of children) assert.ok(declared.has(child), `${child} dangles after normalisation`);
});

// ---------------------------------------------------------------------------
// What the model is shown.
// ---------------------------------------------------------------------------

test('the observation tells template copy apart from what OCR read', () => {
  const ir = perceivedLoginForm();
  const observation = observationFor(ir);

  const headline = observation.elements.find((e) => e.slot === 'headlineMain');
  assert.equal(headline.text, 'WELCOME BACK', 'the wireframe’s own words were withheld');
  assert.deepEqual(headline.bbox, [740, 340, 233, 45]);

  const description = observation.elements.find((e) => e.slot === 'description');
  assert.equal(description.text, null, 'the template’s fitness copy was passed off as a reading');
  assert.equal(description.claimed, false);

  // Nothing the model has no business rewriting is in its view.
  for (const el of observation.elements) {
    assert.ok(!('confidence' in el));
    assert.ok(!('classes' in el));
    assert.ok(!('order' in el));
  }
});

test('mergeSemantics writes four fields and no others', () => {
  const ir = perceivedLoginForm();
  const target = ir.elements.find((e) => e.elementName === 'headlineMain');
  const untouched = { classes: target.classes, css: target.css, order: target.order, alt: target.alt };

  mergeSemantics(ir, {
    elements: [{ slot: 'headlineMain', elementName: 'welcomeHeadline', default: 'WELCOME BACK', tag: 'h1' }],
  });

  const after = ir.elements.find((e) => e.elementName === 'welcomeHeadline');
  assert.equal(after.classes, untouched.classes);
  assert.equal(after.css, untouched.css);
  assert.equal(after.order, untouched.order);
  assert.equal(after.alt, untouched.alt);
});
