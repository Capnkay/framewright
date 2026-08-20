// tests/perception-degradation.test.mjs
//
// T-059 — CONTRACT.md §12 and §11.1.
//
// doneWhen: "With the perception service stopped, unreachable, or returning non-200,
// the stage is recorded as degraded, a warning is emitted, and generation continues
// down the deterministic path — prompt mode and the CMS contract stay fully
// demonstrable."
//
// The clause that carries the weight is the last one. It is easy to write a
// degradation path that returns a status and a warning and then hands back nothing
// usable, and every assertion above would still pass. So most of what follows is about
// the IR that comes out the other side: it must be schema-valid, it must carry the
// reference element set, and it must be honest about where it came from.
//
// §11.1 supplies the vocabulary and the trap: `degraded` is "a success for the job and
// a warning for the stage". A degradation path that fails the job is the bug this file
// exists to prevent, because a stopped Python service would then end the demo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deterministicIr,
  perceiveOrDegrade,
  STAGE_DEGRADED,
  STAGE_OK,
} from '../server/src/generate/perceiveAndAssembleIr.js';
import { validateIr } from '../server/src/validate/irValidator.js';
import { JOB_STATUSES, STAGE_STATUSES } from '../server/src/jobs/jobStore.js';

const REQUEST = {
  pageName: 'Home',
  sectionName: 'Custom',
  mode: 'wireframe',
  wireframeRef: 'uploads/job-0000000001.png',
};

const REFERENCE_SET = [
  'heroImage', 'brandBadge', 'headlineMain', 'headlineSub',
  'description', 'statBadges', 'ctaButton',
];

/** The three §12 triggers, as fetch implementations. */
const UNREACHABLE = async () => { throw new Error('ECONNREFUSED 127.0.0.1:8000'); };
const NON_200 = async () => ({ ok: false, status: 503, json: async () => ({}) });
const STOPPED = async () => { throw Object.assign(new Error('fetch failed'), { cause: 'ECONNREFUSED' }); };

async function degradeWith(fetchImpl, request = REQUEST) {
  return perceiveOrDegrade({ image: new Uint8Array([1, 2, 3]), request, fetchImpl });
}

// ---------------------------------------------------------------------
// doneWhen — all three triggers degrade, and none of them fails
// ---------------------------------------------------------------------

for (const [name, impl] of [
  ['stopped', STOPPED],
  ['unreachable', UNREACHABLE],
  ['non-200', NON_200],
]) {
  test(`doneWhen — a ${name} service records the stage as degraded, not failed`, async () => {
    const result = await degradeWith(impl);

    assert.equal(result.degraded, true);
    assert.equal(result.stageStatus, STAGE_DEGRADED);
    assert.ok(STAGE_STATUSES.includes(result.stageStatus), '§11.1 closed set');
    assert.notEqual(result.stageStatus, 'failed', '§11.1: degraded is a success for the job');
  });

  test(`doneWhen — a ${name} service emits a warning naming the cause`, async () => {
    const result = await degradeWith(impl);

    assert.ok(result.warnings.length > 0, 'a degraded stage must say so');
    assert.match(result.warnings[0], /degraded/i);
    assert.ok(result.reason, 'the machine-readable reason is carried too');
  });

  test(`doneWhen — a ${name} service still yields a schema-valid IR`, async () => {
    const result = await degradeWith(impl);

    assert.ok(result.ir, 'there is no shape in which this returns no IR');
    const validation = validateIr(result.ir);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  });
}

test('doneWhen — the deterministic IR carries the full reference element set', async () => {
  const result = await degradeWith(UNREACHABLE);
  const names = result.ir.elements.map((e) => e.elementName);

  for (const expected of REFERENCE_SET) {
    assert.ok(names.includes(expected), `${expected} must survive degradation`);
  }
});

test('doneWhen — the CMS contract survives: the cards sub-object is intact', async () => {
  // §9 step 5 patches a nested card field. If degradation dropped `cards`, the
  // store-liveness assertion would have nothing to patch and the demo's central
  // moment would fail with the Python service merely stopped.
  const result = await degradeWith(UNREACHABLE);

  assert.ok(result.ir.cards, 'cards must not vanish');
  assert.ok(Array.isArray(result.ir.cards.items));
  assert.ok(result.ir.cards.items.length >= 1);
});

// ---------------------------------------------------------------------
// §12 — no key, no GPU, no network
// ---------------------------------------------------------------------

test('§12 — the deterministic path needs no API key', () => {
  const previous = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const ir = deterministicIr(REQUEST);
    assert.equal(validateIr(ir).valid, true);
  } finally {
    if (previous !== undefined) process.env.LLM_API_KEY = previous;
  }
});

test('§12 — the deterministic path makes no network call at all', async () => {
  // If deterministicIr ever reached for fetch, this would throw rather than pass.
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('the deterministic path must not use the network'); };
  try {
    const ir = deterministicIr(REQUEST);
    assert.equal(validateIr(ir).valid, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------------------------------------------------------------------
// Honesty about provenance — §6's sourceOf audit
// ---------------------------------------------------------------------

test('a degraded IR reports the mode the user actually asked for', async () => {
  // Not "prompt", even though the keyless prompt path built it. Claiming an input
  // the user never gave would corrupt §6's audit trail and mislead T-061's
  // combined-mode conflict rule.
  const result = await degradeWith(UNREACHABLE);

  assert.equal(result.ir.source.mode, 'wireframe');
  assert.equal(result.ir.source.wireframeRef, 'uploads/job-0000000001.png');
});

test('no element claims a wireframe source when nothing read the wireframe', async () => {
  const result = await degradeWith(UNREACHABLE);

  for (const element of result.ir.elements) {
    assert.notEqual(
      element.sourceOf, 'wireframe',
      `${element.elementName} claimed a wireframe source in a degraded run`,
    );
  }
});

test('no element carries a fabricated confidence in a degraded run — §10', async () => {
  const result = await degradeWith(UNREACHABLE);

  for (const element of result.ir.elements) {
    assert.ok(
      element.confidence === null || element.confidence === undefined,
      `${element.elementName} carried ${element.confidence} without an image being read`,
    );
  }
});

test('perception is null on the degraded path — there is no body to trace', async () => {
  const result = await degradeWith(NON_200);
  assert.equal(result.perception, null);
});

// ---------------------------------------------------------------------
// The success path must NOT be marked degraded
// ---------------------------------------------------------------------

test('a working service is recorded as ok, with no degradation warning', async () => {
  const body = {
    layout: {
      direction: 'row', breakpoint: 'md', mobileBehaviour: 'stack',
      container: { maxWidth: '1920px', padding: 'px-0' },
      regions: [
        { role: 'media', side: 'left', width: '1/2', children: ['heroImage'] },
        { role: 'content', side: 'right', width: '1/2', children: ['headlineMain'] },
      ],
      accents: [],
    },
    theme: { accent: 'red-500', surface: 'white', text: 'gray-800', textMode: 'auto' },
    cards: { of: 'statBadges', count: 3, gridColumns: 3, layoutMode: 'grid', fieldsPerItem: 2, items: [{ field1: '1', field2: 'a' }] },
    elements: [{
      elementName: 'headlineMain', contentType: 'Text', tag: 'h1', order: 2,
      default: 'X', classes: '', css: null, alt: null,
      confidence: 0.94, sourceOf: 'wireframe', bbox: [1, 2, 3, 4],
    }],
    warnings: [],
  };

  const result = await perceiveOrDegrade({
    image: new Uint8Array([1]),
    request: REQUEST,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => body }),
  });

  assert.equal(result.degraded, false);
  assert.equal(result.stageStatus, STAGE_OK);
  assert.equal(result.reason, null);
  assert.ok(!result.warnings.some((w) => /degraded/i.test(w)));
  assert.equal(result.ir.elements[0].sourceOf, 'wireframe');
});

// ---------------------------------------------------------------------
// §11.1 — the vocabulary is the contract's, not this file's
// ---------------------------------------------------------------------

test('§11.1 — the statuses used here are members of the closed sets', () => {
  assert.ok(STAGE_STATUSES.includes(STAGE_DEGRADED));
  assert.ok(STAGE_STATUSES.includes(STAGE_OK));
  assert.ok(!JOB_STATUSES.includes(STAGE_DEGRADED), 'degraded is a STAGE status, not a job one');
});

test('a degraded stage never produces a failed job status', async () => {
  const result = await degradeWith(UNREACHABLE);
  assert.notEqual(result.stageStatus, 'failed');
  assert.equal(result.degraded, true);
});

// ---------------------------------------------------------------------
// A prompt supplied alongside the wireframe is still honoured
// ---------------------------------------------------------------------

test('combined mode degrades to the prompt rather than to the bare template', async () => {
  // The wireframe could not be read, but the prompt is still perfectly usable, and
  // throwing it away would lose input the user did give.
  const result = await degradeWith(UNREACHABLE, {
    ...REQUEST,
    mode: 'combined',
    prompt: 'a split-hero with four stats',
  });

  assert.equal(result.ir.source.mode, 'combined');
  assert.ok(result.ir.source.inputs.includes('prompt'));
  assert.equal(result.ir.cards.count, 4, 'the prompt said four stats');
  assert.equal(validateIr(result.ir).valid, true);
});

test('the request idPolicy survives degradation', async () => {
  const idPolicy = {
    mode: 'preserve',
    contentPolicy: 'keep',
    preserve: { elements: { headlineMain: '2000000003' }, cards: {} },
  };
  const result = await degradeWith(UNREACHABLE, { ...REQUEST, idPolicy });

  assert.equal(result.ir.idPolicy.mode, 'preserve');
  assert.equal(result.ir.idPolicy.preserve.elements.headlineMain, '2000000003');
});

test('degradation is deterministic — the same failure gives the same IR', async () => {
  const first = await degradeWith(UNREACHABLE);
  const second = await degradeWith(UNREACHABLE);
  assert.deepEqual(first.ir, second.ir);
});
