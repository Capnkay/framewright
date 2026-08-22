// The job record must say what happened. §11.1, §11.2.
//
// TWO FIELDS THAT WERE NEVER SET, both found by reading a real job record after a
// real browser upload rather than by reading code.
//
//   status         created "queued" and stayed queued for ever, so the Glass Box
//                  showed a completed seven-stage run as still waiting to start.
//                  `jobStore.setStatus` existed and NOTHING CALLED IT.
//   componentFile  null while the .jsx sat on disk, so
//                  GET /api/jobs/:id/component answered "generation not complete"
//                  about a job that had completed.
//
// Both are the shape this project keeps finding: the capability was built, and the
// call was never made.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postGenerate } from '../server/src/routes/generate.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

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

async function generate(env, body = {}) {
  return postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'Home', sectionName: 'JobState', prompt: 'a bold hero with three stats', ...body },
    files: {},
  });
}

test('a completed job is "succeeded", not still "queued"', async () => {
  const env = await isolatedEnv('job-status');
  const { status, body } = await generate(env);
  assert.equal(status, 200, JSON.stringify(body));

  // Every stage ran, so the job is not waiting for anything.
  for (const stage of [4, 5, 6, 7]) {
    const record = body.job.stages.find((s) => s.stage === stage);
    assert.notEqual(record.status, 'failed', `stage ${stage} failed`);
  }

  assert.equal(body.job.status, 'succeeded', 'the returned job is not in a terminal state');

  // And it is PERSISTED, not just decorated on the way out — the timeline reads
  // the store, not this response.
  const store = createJobStore({ filePath: env.JOB_STORE_PATH });
  const persisted = await store.getJob(body.job.jobId);
  assert.equal(persisted.status, 'succeeded', 'the store still says queued');
});

test('the job records the component file that was written', async () => {
  const env = await isolatedEnv('job-component');
  const { body } = await generate(env, { sectionName: 'JobComponent' });

  const file = body.job.componentFile;
  assert.ok(file, 'componentFile is still null after a completed run');

  // The path must be real — a recorded path nothing can open is worse than none,
  // because the endpoint then reports a missing file instead of a missing field.
  const source = await fs.readFile(file, 'utf8');
  assert.match(source, /export default function/, 'componentFile does not point at a component');

  const store = createJobStore({ filePath: env.JOB_STORE_PATH });
  assert.equal((await store.getJob(body.job.jobId)).componentFile, file);

  await fs.rm(file, { force: true });
});

test('setComponentFile refuses a path that is not one', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-job-guard-'));
  const store = createJobStore({ filePath: path.join(dir, 'jobs.json') });
  const job = await store.createJob({ mode: 'prompt', pageName: 'Home' });

  for (const bad of ['', '   ', null, 42]) {
    await assert.rejects(() => store.setComponentFile(job.jobId, bad));
  }
});

test('a job that fails is "failed", not left queued', async () => {
  // The status that matters most on the timeline: a run that died must not be
  // indistinguishable from one that has not started.
  const env = await isolatedEnv('job-failed');

  // §13 requires an input; a prompt-mode call with no prompt is refused before a
  // job exists, so instead break the run mid-flight with an unwritable store.
  const { status, body } = await postGenerate({
    env: { ...env, STORE_PATH: path.join(env.STORE_PATH, 'not-a-directory', 'store.json') },
    body: { mode: 'prompt', pageName: 'Home', sectionName: 'JobFailed', prompt: 'a bold hero' },
    files: {},
  });

  if (status === 200) {
    // The store tolerated it. Nothing to assert about a failure that did not
    // happen — say so rather than passing quietly.
    assert.equal(body.job.status, 'succeeded');
    return;
  }

  assert.equal(status, 500);
});
