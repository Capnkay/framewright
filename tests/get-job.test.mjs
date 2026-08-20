import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getJob } from '../server/src/routes/jobs.js';
import { STATUS } from '../server/src/http/envelope.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

const testStorePath = path.resolve('server/data/test-jobs-store.json');

before(async () => {
  const store = createJobStore({ filePath: testStorePath });
  const job = await store.createJob({ mode: 'prompt', pageName: 'Home' });
  await store.appendStage(job.jobId, { stage: 1, name: 'input-acquisition', status: 'ok' });
});

after(async () => {
  await fs.rm(testStorePath, { force: true });
});

test('GET /api/jobs/:jobId returns bare document for valid jobId', async () => {
  const ctx = { env: { JOB_STORE_PATH: testStorePath }, params: { jobId: 'job-0000000001' } };
  const res = await getJob(ctx);
  
  assert.strictEqual(res.status, STATUS.OK);
  assert.strictEqual(res.body.jobId, 'job-0000000001', 'Must return bare document');
  assert.strictEqual(res.body.stages.length, 1);
  assert.strictEqual(res.body.stages[0].stage, 1);
});

test('GET /api/jobs/:jobId returns 404 for unknown jobId', async () => {
  const ctx = { env: { JOB_STORE_PATH: testStorePath }, params: { jobId: 'job-0000000009' } };
  const res = await getJob(ctx);
  
  assert.strictEqual(res.status, STATUS.NOT_FOUND);
});

test('GET /api/jobs/:jobId returns 400 for invalid shape', async () => {
  const ctx = { env: { JOB_STORE_PATH: testStorePath }, params: { jobId: 'invalid-job' } };
  const res = await getJob(ctx);
  
  assert.strictEqual(res.status, STATUS.BAD_REQUEST);
});
