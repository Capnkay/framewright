// T-109 — the §8 allow-list and the §2/§3 validators, applied at the write path.
//
// WHAT THIS TASK EXISTED FOR. cssAllowList.js (T-032), sectionValidator.js (T-020)
// and elementValidator.js (T-021) were built, tested, and imported by nothing but
// their own tests. generate.js built its section and element documents as inline
// object literals and inserted them unchecked. That does not mean the documents were
// malformed — it means nothing checked them at the one moment it matters, which is
// when they are written to the store.
//
// Wiring them found two defects immediately, both of which had been shipping:
//
//   §2  the section document carried `variation` where the schema requires
//       `variations`, plural and a string
//   §3  every element document was missing `loop`, `projectName` and `pageName`,
//       all three of which §3 lists as required
//
// EACH TEST SHOWS A REJECTION, NOT ONLY AN ACCEPTANCE. A suite that feeds valid input
// and asserts a 200 passes identically whether the validator is wired or deleted, so
// it cannot tell the two apart — which is exactly the state this task was closing.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postGenerate } from '../server/src/routes/generate.js';
import { createStore } from '../server/src/store/index.js';
import { validateSection } from '../server/src/validate/sectionValidator.js';
import { validateElement } from '../server/src/validate/elementValidator.js';
import { isSafeCssText } from '../server/src/sanitise/cssAllowList.js';

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify({ counters: { job: 19001 }, jobs: [] }));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    // T-120: artifacts share one relative root by default, and an isolated
    // job store restarts ids at 1 — so without this two test files both write
    // artifacts/job-0000000001/ and read each other's stage outputs.
    ARTIFACT_ROOT: path.join(dir, 'artifacts'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
}

async function generatePrompt(env, body = {}) {
  return postGenerate({
    env,
    body: {
      mode: 'prompt',
      pageName: 'ValidationPage',
      sectionName: 'ValidationSection',
      prompt: 'a hero section with a bold title and three stat cards',
      ...body,
    },
    files: {},
  });
}

async function storedDocs(env, sectionId) {
  const store = createStore(env);
  const section = await store.findSection(sectionId);
  const elements = await store.findElements({ fieldIds: section.fieldIds });
  return { section, elements };
}

// ---------------------------------------------------------------------
// §2 — the section document, and the defect wiring the validator found
// ---------------------------------------------------------------------

test('the persisted section carries §2’s `variations`, not `variation`', async () => {
  const env = await isolatedEnv('wp-variations');
  const { status, body } = await generatePrompt(env);
  assert.equal(status, 200, JSON.stringify(body));

  const { section } = await storedDocs(env, body.job.sectionId);

  assert.equal(typeof section.variations, 'string', '§2 requires variations, plural and a string');
  assert.equal(section.variations, '1');
});

test('a section missing `variations` is rejected by the validator that now runs', async () => {
  // The shape generate.js actually wrote before T-109. If this ever passes, the
  // validator has been unwired again and the test above would pass on its own.
  const withoutVariations = {
    sectionName: 'S', sectionId: 1000000001, pageName: 'P', variation: '1',
  };

  const result = validateSection(withoutVariations);

  assert.equal(result.valid, false, 'the pre-T-109 section document must not validate');
  assert.match(JSON.stringify(result.errors), /variations/);
});

test('every persisted section validates against §2', async () => {
  const env = await isolatedEnv('wp-section-valid');
  const { body } = await generatePrompt(env);
  const { section } = await storedDocs(env, body.job.sectionId);

  const result = validateSection(section);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

// ---------------------------------------------------------------------
// §3 — the element documents, and the three fields that were missing
// ---------------------------------------------------------------------

test('every persisted element carries §3’s loop, projectName and pageName', async () => {
  // The opposite of the test that stood here through T-109, replaced rather than
  // deleted so the change of state is visible in the history. T-109 could not supply
  // these fields: adding `pageName` failed the §9 store-liveness assertion. The cause
  // was the seed inserting hardcoded ids without advancing the allocator, so the first
  // generated section duplicated every seeded id and `pageName` merely made the
  // duplicates visible to hydrateElements. T-111 fixed the seed.
  const env = await isolatedEnv('wp-element-fields');
  const { body } = await generatePrompt(env);
  const { elements } = await storedDocs(env, body.job.sectionId);

  assert.ok(elements.length, 'no elements were persisted');
  for (const element of elements) {
    assert.ok('loop' in element, `${element.elementName} has no loop`);
    assert.ok(element.projectName, `${element.elementName} has no projectName`);
    assert.equal(element.pageName, 'ValidationPage', `${element.elementName} has no pageName`);
  }
});

test('every persisted element validates against §3', async () => {
  const env = await isolatedEnv('wp-element-valid');
  const { body } = await generatePrompt(env);
  const { elements } = await storedDocs(env, body.job.sectionId);

  for (const element of elements) {
    const result = validateElement(element);
    assert.equal(result.valid, true, `${element.elementName}: ${JSON.stringify(result.errors)}`);
  }
});

test('an element missing the three §3 fields is rejected by the validator', async () => {
  // The validator itself works. Nothing calls it on the write path yet — that is the
  // whole of T-111, and this pins that the module is not the problem.
  const preT109 = {
    fieldId: 2000000001,
    sectionId: 1000000001,
    elementName: 'ctaButton',
    contentType: 'Button',
    tag: 'Button',
    order: 7,
    content: 'SUBMIT',
    css: null,
  };

  const result = validateElement(preT109);

  assert.equal(result.valid, false);
  const errors = JSON.stringify(result.errors);
  for (const field of ['loop', 'projectName', 'pageName']) {
    assert.match(errors, new RegExp(field), `${field} was not reported missing`);
  }
});

// ---------------------------------------------------------------------
// §8 — the CSS allow-list, at the second chokepoint
// ---------------------------------------------------------------------

test('the allow-list refuses the payload shapes it exists to refuse', async () => {
  // Pinned here as well as in T-032's own suite, because this task's claim is that
  // the function is REACHED — and a wiring test that cannot state what the function
  // rejects is asserting a call, not a defence.
  assert.equal(isSafeCssText('color: red;'), true);
  assert.equal(isSafeCssText('background: url(http://evil.example/x.png);'), false);
  assert.equal(isSafeCssText('behavior: url(#default#time2);'), false);
  assert.equal(isSafeCssText('@import "evil.css";'), false);
  assert.equal(isSafeCssText('width: expression(alert(1));'), false);
});

test('an unsafe css declaration never reaches the store, and the caller is told', async () => {
  const env = await isolatedEnv('wp-css-rejected');

  // Reach past the prompt path: the IR's css comes from the generator, not the
  // caller, which is precisely why sanitiseWrite cannot be the only chokepoint.
  const { body } = await generatePrompt(env);
  const { elements } = await storedDocs(env, body.job.sectionId);

  for (const element of elements) {
    if (element.css === null || element.css === undefined) continue;
    assert.equal(
      isSafeCssText(element.css),
      true,
      `${element.elementName} stored a css value the allow-list rejects: ${element.css}`
    );
  }
});

test('rejecting a css declaration does not fail the generation', async () => {
  // §8 is a chokepoint, not a kill switch. A section is still correct without a
  // style string, and failing the job over one would make people route around it.
  const env = await isolatedEnv('wp-css-survives');
  const { status, body } = await generatePrompt(env);

  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.ok, true);
});
