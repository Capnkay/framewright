// T-108 — POST /api/generate, mode=wireframe. §13, §11.0, §11.2, §12.
//
// WHAT THIS TASK EXISTED FOR. On main at 4bc768f, with the board reading 100 of 100,
// generate.js:35 returned 501 for every mode but `prompt`. Of §13's four modes one
// worked. Stages 1, 2 and 3 were only ever `skipStage`-d, so they never ran anywhere
// in the system, and `perceiveAndAssembleIr.js` — T-058, built and tested — had zero
// callers. These tests are about that seam.
//
// NO PERCEPTION SERVICE IS STARTED. `fetchImpl` is injected all the way down through
// perceiveOrDegrade, so the happy path runs against a stubbed /perceive that returns
// §12's shape, and the degraded path runs against one that refuses to connect. That
// is not a convenience: §12 makes the service being absent a SUPPORTED state, and a
// suite that needed it running could not test the state the contract cares most about.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postGenerate } from '../server/src/routes/generate.js';
import { createStore } from '../server/src/store/index.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';
import { deterministicIr } from '../server/src/generate/perceiveAndAssembleIr.js';

const REFERENCE_SET = [
  'heroImage', 'brandBadge', 'headlineMain', 'headlineSub',
  'description', 'statBadges', 'ctaButton',
];

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
}

/** A 1x1 PNG. Real enough to post; the stub decides what perception "sees". */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

function wireframeFile(overrides = {}) {
  return {
    buffer: PNG_1PX,
    originalname: 'wireframe.png',
    mimetype: 'image/png',
    size: PNG_1PX.length,
    ...overrides,
  };
}

/** §12's response body, as the real service returns it (shape measured at T-101).
 *
 * BUILT FROM `deterministicIr` RATHER THAN TRANSCRIBED. The IR schema requires fields
 * a hand-written stub forgets -- `layout.direction`, `layout.breakpoint`,
 * `layout.mobileBehaviour` -- and a stub that omits them fails §6 validation, which
 * `perceiveOrDegrade` correctly reports as a degradation. The first version of this
 * file did exactly that and every "successful" test was silently exercising the
 * degraded path instead. Deriving the sub-objects from the deterministic IR keeps the
 * stub valid by construction and keeps it honest when the schema changes.
 */
function perceptionBody({ pageName = 'TestPage', sectionName = 'TestSection' } = {}) {
  const ir = deterministicIr({ pageName, sectionName, mode: 'wireframe' });

  // What a real detection adds on top of the template: geometry, a measured
  // confidence, and `sourceOf: "wireframe"` on the elements a region claimed.
  const boxes = {
    heroImage: [75, 269, 618, 270],
    brandBadge: [745, 292, 161, 28],
    headlineMain: [427, 561, 233, 45],
    headlineSub: [246, 622, 551, 66],
    description: [733, 368, 172, 87],
    statBadges: [687, 460, 233, 52],
    ctaButton: [796, 521, 162, 45],
  };
  const texts = { brandBadge: 'LABEL', headlineMain: 'HEADLINE', ctaButton: 'SUBMIT' };

  const elements = ir.elements.map((el) => {
    const { fieldId, ...rest } = el;      // §12: perception never allocates a fieldId
    const bbox = boxes[el.elementName] || null;
    return {
      ...rest,
      bbox,
      confidence: bbox ? 0.9 : null,
      sourceOf: bbox ? 'wireframe' : 'default',
      ...(texts[el.elementName] ? { default: texts[el.elementName] } : {}),
    };
  });

  return {
    layout: ir.layout,
    theme: ir.theme,
    cards: ir.cards,
    elements,
    normalisation: { scale: 0.64, offsetX: 0, offsetY: 138, width: 1024, height: 1024 },
    confidence: 0.8497,
    questions: [],
    stages: [
      { stage: 2, name: 'preprocessing-normalization', status: 'ok', ms: 153,
        artifact: { scale: 0.64, width: 1024, height: 1024 }, warnings: [] },
      { stage: 3, name: 'multimodal-understanding', status: 'ok', ms: 5077,
        artifact: { count: 35, regions: [] }, model: 'opencv-contours+paddleocr', warnings: [] },
      { stage: 4, name: 'semantic-planning-ir', status: 'ok', ms: 0,
        artifact: { claimedFromWireframe: 7 }, warnings: [] },
    ],
    warnings: [],
  };
}

/** A /perceive that answers. */
function stubPerceive(body = perceptionBody()) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

/** A /perceive that is not running — §12's canonical degradation case. */
function deadPerceive() {
  return async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8000'); };
}

async function generate(env, { files, fetchImpl, body = {} } = {}) {
  const previous = globalThis.fetch;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  try {
    return await postGenerate({
      env,
      body: {
        mode: 'wireframe',
        pageName: 'TestPage',
        sectionName: 'TestSection',
        ...body,
      },
      files,
    });
  } finally {
    globalThis.fetch = previous;
  }
}

// ---------------------------------------------------------------------
// The defect this task existed for
// ---------------------------------------------------------------------

test('mode=wireframe is no longer 501', async () => {
  const env = await isolatedEnv('wf-not-501');
  const { status, body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  assert.notEqual(status, 501, `still NOT_IMPLEMENTED: ${JSON.stringify(body)}`);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
  assert.equal(body.job.mode, 'wireframe');
});

test('stages 1, 2 and 3 actually run rather than being skipped', async () => {
  // Before T-108 these three were only ever skipStage-d, in every mode, so no
  // wireframe was ever normalised or read anywhere in this system.
  const env = await isolatedEnv('wf-stages');
  const { body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  const jobs = createJobStore({ filePath: env.JOB_STORE_PATH });
  const job = await jobs.getJob(body.job.jobId);
  const byStage = Object.fromEntries(job.stages.map((s) => [s.stage, s]));

  for (const stage of [1, 2, 3]) {
    assert.ok(byStage[stage], `stage ${stage} has no record`);
    assert.notEqual(byStage[stage].status, 'skipped', `stage ${stage} was skipped`);
  }
});

test('the perceived IR reaches the store, not the template', async () => {
  const env = await isolatedEnv('wf-ir');
  const { body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  const store = createStore(env);
  const section = await store.findSection(body.job.sectionId);
  assert.ok(section, 'the section was not persisted');

  const elements = await store.findElements({ fieldIds: section.fieldIds });
  const names = elements.map((e) => e.elementName);
  for (const expected of REFERENCE_SET) {
    assert.ok(names.includes(expected), `${expected} missing from the persisted elements`);
  }

  const cta = elements.find((e) => e.elementName === 'ctaButton');
  assert.equal(cta.content, 'SUBMIT', 'the wireframe’s own copy did not survive to the store');
});

test('every persisted element carries an API-allocated fieldId', async () => {
  // Rule 4, and §12: the perception service never allocates one, so this path must.
  const env = await isolatedEnv('wf-ids');
  const { body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  const store = createStore(env);
  const section = await store.findSection(body.job.sectionId);
  for (const fieldId of section.fieldIds) {
    assert.match(String(fieldId), /^\d{10}$/, `${fieldId} is not a ten-digit allocated id`);
  }
  assert.equal(new Set(section.fieldIds).size, section.fieldIds.length, 'duplicate fieldIds');
});

// ---------------------------------------------------------------------
// §12 — degradation is part of the contract, not an afterthought
// ---------------------------------------------------------------------

test('a stopped perception service degrades the job rather than failing it', async () => {
  // AGENTS.md rule 5: "the deterministic path always works". §11.1: degraded means
  // the stage did not do its real work but the pipeline continued.
  const env = await isolatedEnv('wf-degraded');
  const { status, body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: deadPerceive(),
  });

  assert.equal(status, 200, `a stopped service must not fail the job: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true);
  assert.equal(body.degraded, true, 'the caller was not told the upload was ignored');
  assert.ok(
    (body.warnings || []).some((w) => /degraded/i.test(w)),
    `no degradation warning: ${JSON.stringify(body.warnings)}`
  );
});

test('a degraded run still produces the whole reference set', async () => {
  const env = await isolatedEnv('wf-degraded-set');
  const { body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: deadPerceive(),
  });

  const store = createStore(env);
  const section = await store.findSection(body.job.sectionId);
  const elements = await store.findElements({ fieldIds: section.fieldIds });
  const names = elements.map((e) => e.elementName);

  for (const expected of REFERENCE_SET) {
    assert.ok(names.includes(expected), `${expected} missing from a degraded run`);
  }
});

test('a successful run is not reported as degraded', async () => {
  const env = await isolatedEnv('wf-not-degraded');
  const { body } = await generate(env, {
    files: { wireframe: wireframeFile() },
    fetchImpl: stubPerceive(),
  });

  assert.notEqual(body.degraded, true);
});

// ---------------------------------------------------------------------
// §13.1 — the upload's own rules
// ---------------------------------------------------------------------

test('mode=wireframe without an image is a 400, not a crash', async () => {
  const env = await isolatedEnv('wf-no-image');
  const { status } = await generate(env, { files: {}, fetchImpl: stubPerceive() });

  assert.equal(status, 400);
});

test('an unsupported image type is refused before any job is created', async () => {
  const env = await isolatedEnv('wf-bad-type');
  const { status, body } = await generate(env, {
    files: { wireframe: wireframeFile({ mimetype: 'image/gif' }) },
    fetchImpl: stubPerceive(),
  });

  assert.equal(status, 400);
  assert.match(JSON.stringify(body), /image\/gif|Unsupported/);
});

test('an oversized image is 413 per §13.1', async () => {
  const env = await isolatedEnv('wf-too-big');
  const { status } = await generate(env, {
    files: { wireframe: wireframeFile({ size: 9 * 1024 * 1024 }) },
    fetchImpl: stubPerceive(),
  });

  assert.equal(status, 413);
});

test('prompt mode still skips the image stages and is untouched', async () => {
  // The regression that matters most: T-108 changed the shared path.
  const env = await isolatedEnv('wf-prompt-regression');
  const { status, body } = await postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'P', sectionName: 'S', prompt: 'a hero with stats' },
    files: {},
  });

  assert.equal(status, 200, JSON.stringify(body));
  const jobs = createJobStore({ filePath: env.JOB_STORE_PATH });
  const job = await jobs.getJob(body.job.jobId);
  for (const stage of [1, 2, 3]) {
    const record = job.stages.find((s) => s.stage === stage);
    assert.equal(record.status, 'skipped', `prompt mode must still skip stage ${stage}`);
  }
});

test('code and combined still say they are unbuilt rather than half-working', async () => {
  const env = await isolatedEnv('wf-unbuilt-modes');
  for (const mode of ['code', 'combined']) {
    const { status } = await postGenerate({
      env,
      body: { mode, pageName: 'P', sectionName: 'S', prompt: 'x', code: 'x' },
      files: {},
    });
    assert.equal(status, 501, `mode=${mode} should still be 501`);
  }
});
