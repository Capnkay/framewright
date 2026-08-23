// The Regenerate control on the preview page. §13.3, §11.1.
//
// THE DEFECT, found by clicking it. `handleRegenerate` posted
// `{ prompt, variation, variations }` and NO mode, so every click answered
//
//   400  "mode is required and must be one of: wireframe, code, prompt, combined."
//
// and the handler was `if (res.ok) window.location.reload()` — so on failure it
// neither reloaded nor reported anything. A visible control that does nothing
// and says nothing is worse than no control at all, because the person clicking
// it has no way to learn that.
//
// Found alongside it: regenerate left the job at "queued" after running every
// stage. That is the terminal-status bug T-138 fixed in generate.js, which never
// reached this route — two handlers, one omission, and only one of them was in
// that task's `files` list.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { postGenerate } from '../server/src/routes/generate.js';
import { postRegenerate } from '../server/src/routes/regenerate.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

const PREVIEW = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/src/routes/PreviewPage.jsx',
);

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    ARTIFACT_ROOT: path.join(dir, 'artifacts'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
    PERCEPTION_URL: 'http://127.0.0.1:1',
  };
}

async function aSection(env) {
  const { body } = await postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'Home', sectionName: 'Regen', prompt: 'a bold hero with three stats' },
    files: {},
  });
  return body.job.sectionId;
}

test('the control sends a mode, because §13.3 requires one', async () => {
  const source = await fs.readFile(PREVIEW, 'utf8');
  assert.match(source, /mode:\s*'prompt'/, 'the regenerate request still sends no mode');
});

test('a failed regenerate is shown to the person who clicked it', async () => {
  const source = await fs.readFile(PREVIEW, 'utf8');

  assert.match(source, /setRegenerateError/, 'failures are still swallowed');
  // And the §13.4 envelope is unwrapped to a STRING — assigning the object whole
  // renders it as a React child and blanks the page, which is what T-114 hit.
  assert.match(source, /typeof body\.error\.message === 'string'/, 'the error object is used raw');
});

test('a regenerate that ran every stage reports a terminal status', async () => {
  const env = await isolatedEnv('regen-status');
  const sectionId = await aSection(env);

  const { status, body } = await postRegenerate({
    env,
    params: { sectionId },
    body: { mode: 'prompt', prompt: 'four stats and a green accent', variation: '2', variations: '2' },
  });

  assert.equal(status, 200, JSON.stringify(body));

  const store = createJobStore({ filePath: env.JOB_STORE_PATH });
  const job = await store.getJob(body.jobId);
  assert.equal(job.status, 'succeeded', 'the regenerated job is still queued');
});

test('§13.3 — the section id and its field ids survive a regenerate', async () => {
  // idPolicy is `preserve` for this call. A regenerate that reallocated ids would
  // orphan every element the CMS already points at.
  const env = await isolatedEnv('regen-preserve');
  const sectionId = await aSection(env);

  const { createStore } = await import('../server/src/store/index.js');
  const store = createStore(env);
  const before = await store.findSection(sectionId);

  const { status } = await postRegenerate({
    env,
    params: { sectionId },
    body: { mode: 'prompt', prompt: 'four stats', variation: '2', variations: '2' },
  });
  assert.equal(status, 200);

  const after = await store.findSection(sectionId);
  assert.equal(after.sectionId, before.sectionId, 'the section id changed');
  assert.deepEqual(after.fieldIds, before.fieldIds, 'the field ids were reallocated');
});
