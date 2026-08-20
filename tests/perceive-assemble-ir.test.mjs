// tests/perceive-assemble-ir.test.mjs
//
// T-058 — CONTRACT.md §12 and §6.
//
// doneWhen: "Node takes irVersion, pageName, sectionName, source and idPolicy from
// the request and everything else from the /perceive response, producing a
// schema-valid full IR."
//
// That sentence has two halves and both are tested as rules rather than as one happy
// path: the request-owned fields must be immune to anything the response says, and the
// response-owned sub-objects must not be invented by Node. A test that only checked a
// well-formed exchange would pass on an implementation that merged the two objects and
// let whichever came last win.
//
// No service is started. `fetch` is injected, so these run on a machine with no Python.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleIr,
  callPerceive,
  deriveSectionType,
  perceiveAndAssembleIr,
  DEFAULT_PERCEIVE_URL,
} from '../server/src/generate/perceiveAndAssembleIr.js';
import { validateIr } from '../server/src/validate/irValidator.js';

// A §12-shaped response body, complete enough to validate against §6.
function perceptionBody(overrides = {}) {
  return {
    layout: {
      direction: 'row',
      breakpoint: 'md',
      mobileBehaviour: 'stack',
      container: { maxWidth: '1920px', padding: 'px-0 md:px-12' },
      regions: [
        { role: 'media', side: 'left', width: '1/2', children: ['heroImage'] },
        { role: 'content', side: 'right', width: '1/2', children: ['headlineMain'] },
      ],
      accents: [],
    },
    theme: { accent: 'red-500', surface: 'white', text: 'gray-800', textMode: 'auto' },
    cards: {
      of: 'statBadges', count: 3, gridColumns: 3, layoutMode: 'grid', fieldsPerItem: 2,
      items: [
        { field1: '1000+', field2: 'Community<br />Members' },
        { field1: '40+', field2: 'Fitness<br />Programmes' },
        { field1: '150+', field2: 'Fitness<br />Channels' },
      ],
    },
    elements: [
      {
        elementName: 'headlineMain', contentType: 'Text', tag: 'h1', order: 2,
        default: 'CHALLENGE YOUR LIMITS', classes: 'text-4xl', css: null, alt: null,
        confidence: 0.94, sourceOf: 'wireframe', bbox: [500, 80, 350, 60],
      },
    ],
    normalisation: { scale: 0.5, offsetX: 0, offsetY: 12, width: 1024, height: 768 },
    confidence: 0.88,
    questions: [],
    stages: [],
    warnings: [],
    ...overrides,
  };
}

const REQUEST = {
  pageName: 'Home',
  sectionName: 'Custom',
  mode: 'wireframe',
  wireframeRef: 'uploads/job-0000000001.png',
};

/** A fetch that returns one canned response and records what it was given. */
function stubFetch(body, { status = 200, ok = true } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------
// doneWhen, half 1 — the five request-owned fields come from the REQUEST
// ---------------------------------------------------------------------

test('doneWhen — irVersion, pageName, sectionName, source and idPolicy come from the request', () => {
  const { ir } = assembleIr(
    { ...REQUEST, pageName: 'Landing', sectionName: 'Hero', idPolicy: { mode: 'preserve', contentPolicy: 'keep', preserve: { elements: {}, cards: {} } } },
    perceptionBody(),
  );

  assert.equal(ir.irVersion, '1.0');
  assert.equal(ir.pageName, 'Landing');
  assert.equal(ir.sectionName, 'Hero');
  assert.equal(ir.source.mode, 'wireframe');
  assert.equal(ir.source.wireframeRef, 'uploads/job-0000000001.png');
  assert.equal(ir.idPolicy.mode, 'preserve');
});

test('§12 — a response that tries to set the request-owned fields cannot', () => {
  // The rule only means something if the response losing is tested. An
  // implementation that merged the two objects would pass every other test here.
  const hostile = perceptionBody({
    irVersion: '9.9',
    pageName: 'FromPython',
    sectionName: 'FromPython',
    source: { mode: 'prompt', inputs: ['prompt'], wireframeRef: 'somewhere/else.png' },
    idPolicy: { mode: 'preserve', contentPolicy: 'keep', preserve: { elements: {}, cards: {} } },
  });

  const { ir } = assembleIr(REQUEST, hostile);

  assert.equal(ir.irVersion, '1.0');
  assert.equal(ir.pageName, 'Home');
  assert.equal(ir.sectionName, 'Custom');
  assert.equal(ir.source.mode, 'wireframe');
  assert.equal(ir.source.wireframeRef, 'uploads/job-0000000001.png');
  assert.equal(ir.idPolicy.mode, 'allocate', 'the request had none, so the default wins — not the response');
});

// ---------------------------------------------------------------------
// doneWhen, half 2 — everything else comes from the RESPONSE
// ---------------------------------------------------------------------

test('doneWhen — layout, theme, cards and elements come from the response', () => {
  const body = perceptionBody();
  const { ir } = assembleIr(REQUEST, body);

  assert.deepEqual(ir.layout, body.layout);
  assert.deepEqual(ir.theme, body.theme);
  assert.equal(ir.cards.count, 3);
  assert.equal(ir.elements[0].elementName, 'headlineMain');
  assert.equal(ir.elements[0].confidence, 0.94);
  assert.equal(ir.elements[0].sourceOf, 'wireframe');
});

test('doneWhen — the assembled IR is schema-valid per §6', () => {
  const { ir } = assembleIr(REQUEST, perceptionBody());
  const result = validateIr(ir);

  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('§12 — there is no irFragment anywhere in the assembled IR', () => {
  const { ir } = assembleIr(REQUEST, perceptionBody());
  assert.equal(ir.irFragment, undefined);
  assert.ok(!JSON.stringify(ir).includes('irFragment'));
});

test('a missing sub-object warns rather than producing a silently partial IR', () => {
  const { ir, warnings } = assembleIr(REQUEST, perceptionBody({ theme: undefined }));
  assert.ok(warnings.some((w) => w.includes('theme')));
  assert.deepEqual(ir.theme, {});
});

// ---------------------------------------------------------------------
// §12 — the service never allocates a fieldId
// ---------------------------------------------------------------------

test('§12 — a fieldId arriving from the service is stripped, not trusted', () => {
  const body = perceptionBody();
  body.elements[0].fieldId = '2000000003';
  body.elements.push({
    elementName: 'statBadges', contentType: 'Cards', tag: 'div', order: 5,
    default: '', classes: '', css: null, alt: null, confidence: null,
    sourceOf: 'default', bbox: null,
    loop: [{ field1: '1000+', fieldId1: '3000000001' }],
  });
  body.cards.items[0].fieldId1 = '3000000001';

  const { ir } = assembleIr(REQUEST, body);

  assert.equal(ir.elements[0].fieldId, undefined);
  assert.equal(ir.elements[1].loop[0].fieldId1, undefined);
  assert.equal(ir.elements[1].loop[0].field1, '1000+', 'the content survives');
  assert.equal(ir.cards.items[0].fieldId1, undefined);
  assert.equal(ir.cards.items[0].field1, '1000+');
});

// ---------------------------------------------------------------------
// sectionType — derived by Node, because §6 needs it and §12 does not send it
// ---------------------------------------------------------------------

test('sectionType is derived from the layout, not guessed', () => {
  assert.equal(deriveSectionType(perceptionBody().layout), 'split-hero');
  assert.equal(
    deriveSectionType({ direction: 'column', regions: [{ role: 'content' }] }),
    'stacked-hero',
  );
  assert.equal(deriveSectionType({}), 'generic');
  assert.equal(deriveSectionType(null), 'generic');
});

test('an unrecognised layout is labelled generic rather than mislabelled split-hero', () => {
  const { ir } = assembleIr(REQUEST, perceptionBody({
    layout: { direction: 'column', breakpoint: 'md', mobileBehaviour: 'stack', container: {}, regions: [] },
  }));
  assert.equal(ir.sectionType, 'generic');
});

// ---------------------------------------------------------------------
// §6 — variations is always a string
// ---------------------------------------------------------------------

test('variations is coerced to a string — §6 has no numeric form', () => {
  const { ir } = assembleIr({ ...REQUEST, variations: 2 }, perceptionBody());
  assert.equal(ir.variations, '2');
  assert.equal(validateIr(ir).valid, true);
});

test('designTokens is carried only when the request supplied it — §6.1 optional', () => {
  const without = assembleIr(REQUEST, perceptionBody()).ir;
  assert.equal('designTokens' in without, false);

  const with_ = assembleIr({ ...REQUEST, designTokens: { accent: 'blue-500' } }, perceptionBody()).ir;
  assert.deepEqual(with_.designTokens, { accent: 'blue-500' });
});

// ---------------------------------------------------------------------
// §12 — the multipart request shape
// ---------------------------------------------------------------------

test('§12 — POSTs multipart with the image and a JSON hints field', async () => {
  const fetchImpl = stubFetch(perceptionBody());
  const result = await callPerceive({
    image: new Uint8Array([1, 2, 3]),
    hints: { pageName: 'Home' },
    fetchImpl,
  });

  assert.equal(result.ok, true);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, `${DEFAULT_PERCEIVE_URL}/perceive`);
  assert.equal(init.method, 'POST');
  assert.ok(init.body instanceof FormData);
  assert.ok(init.body.get('image'), 'the image field is required by §12');
  assert.deepEqual(JSON.parse(init.body.get('hints')), { pageName: 'Home' });
});

// ---------------------------------------------------------------------
// §12 — degradation. Unreachable, timeout, non-200 all degrade, never throw.
// ---------------------------------------------------------------------

test('§12 — an unreachable service degrades rather than throwing', async () => {
  const result = await perceiveAndAssembleIr({
    image: new Uint8Array([1]),
    request: REQUEST,
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /unreachable/);
  assert.ok(result.warnings.length > 0);
});

test('§12 — a non-200 degrades and names the status', async () => {
  const result = await perceiveAndAssembleIr({
    image: new Uint8Array([1]),
    request: REQUEST,
    fetchImpl: stubFetch({}, { ok: false, status: 422 }),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /422/);
});

test('§12 — a timeout degrades and names the budget', async () => {
  const result = await perceiveAndAssembleIr({
    image: new Uint8Array([1]),
    request: REQUEST,
    timeoutMs: 5,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /timed out after 5ms/);
});

test('a missing image degrades rather than posting an empty body', async () => {
  const result = await callPerceive({ fetchImpl: stubFetch({}) });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no wireframe/);
});

test('no fetch implementation degrades rather than throwing a TypeError', async () => {
  // `null`, not `undefined`: undefined triggers the default parameter, which is
  // globalThis.fetch, and this test then makes a REAL request to a service that may
  // well be running on the dev machine. It did, the first time it was written.
  const result = await callPerceive({ image: new Uint8Array([1]), fetchImpl: null });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no fetch/);
});

// ---------------------------------------------------------------------
// Validation is enforced here, not deferred to the caller
// ---------------------------------------------------------------------

test('an IR that fails §6 validation degrades instead of being handed onward', async () => {
  // A response whose layout is missing every required key.
  const result = await perceiveAndAssembleIr({
    image: new Uint8Array([1]),
    request: REQUEST,
    fetchImpl: stubFetch(perceptionBody({ layout: { direction: 'row' } })),
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /fails §6 validation/);
  assert.ok(result.ir, 'the invalid IR is returned for the trace, not discarded');
});

test('the happy path returns ok, the IR, and the raw perception body', async () => {
  const body = perceptionBody();
  const result = await perceiveAndAssembleIr({
    image: new Uint8Array([1]),
    request: REQUEST,
    fetchImpl: stubFetch(body),
  });

  assert.equal(result.ok, true);
  assert.equal(validateIr(result.ir).valid, true);
  assert.equal(result.perception.confidence, 0.88, 'the raw body survives for the stage trace');
});

test('assembleIr is pure — the same inputs give the same IR', () => {
  const first = assembleIr(REQUEST, perceptionBody()).ir;
  const second = assembleIr(REQUEST, perceptionBody()).ir;
  assert.deepEqual(first, second);
});

test('assembleIr does not mutate the perception body it was given', () => {
  const body = perceptionBody();
  const before = JSON.stringify(body);
  assembleIr(REQUEST, body);
  assert.equal(JSON.stringify(body), before);
});
