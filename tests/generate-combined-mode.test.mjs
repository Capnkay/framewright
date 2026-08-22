// T-119 — mode=combined, and §6's conflict order actually applied.
//
// §13 names four modes. Before T-108 one worked; before this, two. `resolveConflicts.js`
// implements §6's order in full — prompt wins for copy, colour, CTA behaviour and card
// count; wireframe wins for spatial layout; code wins for technical patterns — and had
// **zero callers**, the same class of gap as T-101, T-108 and T-116. The order existed
// and was never applied to anything.
//
// THESE TESTS PROVE THE ORDER, NOT THE STATUS CODE. A combined run that returns 200 by
// quietly using one input and ignoring the other passes any test that only checks the
// status, and that is the failure worth catching: the two IRs must actually meet.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postGenerate } from '../server/src/routes/generate.js';
import { createStore } from '../server/src/store/index.js';
import { deterministicIr } from '../server/src/generate/perceiveAndAssembleIr.js';

// ARTIFACTS ARE WRITTEN TO A SHARED, RELATIVE PATH. stageTrace's ARTIFACT_ROOT is the
// hardcoded string 'artifacts', resolved against the process cwd, and a job store
// isolated per test restarts its job counter at 1 — so two test FILES running in
// parallel both write `artifacts/job-0000000001/` under the repo root and overwrite
// each other's stage outputs. These tests read a stage-4 artifact, so they passed alone
// and failed in a full run until this line existed.
//
// node --test gives each file its own process, so moving this one's cwd isolates its
// artifacts without touching anyone else's. The underlying defect is not fixed here —
// it belongs to whoever owns stageTrace — but it is named so the next reader does not
// spend the evening on it twice.
process.chdir(await fs.mkdtemp(path.join(os.tmpdir(), 'fw-cb-artifacts-')));

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify({ counters: { job: 11001 }, jobs: [] }));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
}

function wireframeFile() {
  return { buffer: PNG_1PX, originalname: 'w.png', mimetype: 'image/png', size: PNG_1PX.length };
}

/**
 * A /perceive whose IR is deliberately DISTINGUISHABLE from the prompt's.
 *
 * The wireframe "says" WIREFRAME COPY and lays the media panel on the right. The prompt
 * path says something else and lays it on the left. Whichever wins each question is then
 * readable off the result, which is the only way to test an order rather than an outcome.
 */
function stubPerceive({ pageName = 'Home', sectionName = 'Combined' } = {}) {
  const ir = deterministicIr({ pageName, sectionName, mode: 'wireframe' });
  const elements = ir.elements.map((el) => {
    const { fieldId, ...rest } = el;
    return {
      ...rest,
      bbox: [10, 20, 30, 40],
      confidence: 0.9,
      sourceOf: 'wireframe',
      default: el.contentType === 'Image' ? el.default : `WIREFRAME ${el.elementName}`,
    };
  });

  const body = {
    // Flip only `side`. Replacing the region objects wholesale drops `width` and
    // `children`, the IR fails §6 validation, perceiveOrDegrade correctly reports a
    // degradation, and the test then silently measures a prompt-only run. The first
    // version of this stub did exactly that.
    layout: {
      ...ir.layout,
      regions: (ir.layout.regions || []).map((r) => ({
        ...r,
        side: r.side === 'left' ? 'right' : 'left',
      })),
    },
    theme: ir.theme,
    cards: ir.cards,
    elements,
    normalisation: { scale: 0.64, offsetX: 0, offsetY: 138, width: 1024, height: 1024 },
    confidence: 0.9,
    questions: [],
    stages: [
      { stage: 2, name: 'preprocessing-normalization', status: 'ok', ms: 5, artifact: { scale: 0.64, width: 1024, height: 1024 }, warnings: [] },
      { stage: 3, name: 'multimodal-understanding', status: 'ok', ms: 50, artifact: { count: 7 }, warnings: [] },
      { stage: 4, name: 'semantic-planning-ir', status: 'ok', ms: 0, artifact: {}, warnings: [] },
    ],
    warnings: [],
  };
  return async () => ({ ok: true, status: 200, json: async () => body });
}

function deadPerceive() {
  return async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8000'); };
}

async function generate(env, { body = {}, files = {}, fetchImpl } = {}) {
  const previous = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    return await postGenerate({
      env,
      body: { mode: 'combined', pageName: 'Home', sectionName: 'Combined', ...body },
      files,
    });
  } finally {
    globalThis.fetch = previous;
  }
}

async function elementsOf(env, sectionId) {
  const store = createStore(env);
  const section = await store.findSection(sectionId);
  return { section, elements: await store.findElements({ fieldIds: section.fieldIds }) };
}

// ---------------------------------------------------------------------

test('mode=combined is no longer 501', async () => {
  const env = await isolatedEnv('cb-not-501');
  const { status, body } = await generate(env, {
    body: { prompt: 'a bold hero with three stats' },
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  assert.notEqual(status, 501, JSON.stringify(body));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.job.mode, 'combined');
});

test('§6: the wireframe wins spatial layout', async () => {
  // The stub lays the media panel on the RIGHT; the prompt path lays it on the left.
  const env = await isolatedEnv('cb-layout');
  const { body } = await generate(env, {
    body: { prompt: 'a bold hero with three stats' },
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  const { section } = await elementsOf(env, body.job.sectionId);
  assert.ok(section, 'no section was persisted');

  // Read the layout off the emitted IR artifact rather than the section document,
  // which does not carry `layout`.
  const stage4 = body.job.stages.find((s) => s.stage === 4);
  const ir = JSON.parse(await fs.readFile(stage4.outputRef, 'utf8'));
  const media = (ir.layout.regions || []).find((r) => r.role === 'media');

  assert.equal(media.side, 'right', 'the wireframe did not win the spatial question (§6)');
});

test('both inputs reach the merge rather than one being dropped', async () => {
  // The failure a status-only test cannot see: a "combined" run that silently uses one
  // half. The wireframe's marker text must be present somewhere in the result, proving
  // the perception IR was not discarded.
  const env = await isolatedEnv('cb-both');
  const { body } = await generate(env, {
    body: { prompt: 'a bold hero with three stats' },
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  const stage4 = body.job.stages.find((s) => s.stage === 4);
  const ir = JSON.parse(await fs.readFile(stage4.outputRef, 'utf8'));

  // NOT the wireframe's COPY. §6 rule 1 gives copy to the prompt, so the stub's
  // "WIREFRAME <name>" strings are supposed to lose — the first version of this test
  // asserted they survived and was wrong about the contract, not about the code.
  // What only the wireframe can contribute is geometry.
  const withBbox = ir.elements.filter((e) => Array.isArray(e.bbox));
  assert.ok(withBbox.length > 0, 'no element carries a bbox — the wireframe IR never reached the merge');
  assert.deepEqual(withBbox[0].bbox, [10, 20, 30, 40], 'the bbox is not the one perception returned');
  assert.ok(ir.elements.length >= 7, 'the reference set did not survive the merge');
});

test('a combined run with the perception service stopped completes on the prompt half', async () => {
  // §12 and rule 5. Stopping the GPU service must not stop the generation.
  const env = await isolatedEnv('cb-degraded');
  const { status, body } = await generate(env, {
    body: { prompt: 'a bold hero with three stats' },
    files: { wireframe: wireframeFile() },
    fetchImpl: deadPerceive(),
  });

  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.degraded, true);
  const { elements } = await elementsOf(env, body.job.sectionId);
  assert.ok(elements.length >= 7, 'the reference set did not survive a degraded combined run');
});

test('combined with only a prompt behaves as a prompt run', async () => {
  // §13 requires at least one input and does not require combined to carry both.
  // Refusing a one-sided combined would invent a rule the contract does not have.
  const env = await isolatedEnv('cb-prompt-only');
  const { status, body } = await generate(env, {
    body: { prompt: 'a bold hero with three stats' },
    files: {},
  });

  assert.equal(status, 200, JSON.stringify(body));
  const stage3 = body.job.stages.find((s) => s.stage === 3);
  assert.equal(stage3.status, 'skipped', 'perception ran for a combined request with no image');
});

test('combined with neither a prompt nor an image is a 400', async () => {
  const env = await isolatedEnv('cb-empty');
  const { status } = await postGenerate({
    env,
    body: { mode: 'combined', pageName: 'Home', sectionName: 'Combined', code: 'x' },
    files: {},
  });

  assert.equal(status, 400);
});

test('the merge does not leak resolveConflicts’ own warnings array into the IR', async () => {
  // resolveConflicts returns `{ ...ir, warnings }`. Persisting that shape would put a
  // field in the IR that §6 does not define, and §6's schema is validated downstream.
  const env = await isolatedEnv('cb-no-warnings-field');
  const { body } = await generate(env, {
    body: { prompt: 'a bold hero with three stats' },
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  const stage4 = body.job.stages.find((s) => s.stage === 4);
  const ir = JSON.parse(await fs.readFile(stage4.outputRef, 'utf8'));

  assert.equal('warnings' in ir, false, 'the IR carries a `warnings` field §6 does not define');
});
