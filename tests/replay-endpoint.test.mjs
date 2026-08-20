import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { postReplay } from '../server/src/routes/replay.js';
import { STATUS } from '../server/src/http/envelope.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

const testStorePath = path.resolve('server/data/test-replay-store.json');
const artifactDir = path.resolve('artifacts/job-0000000001');

before(async () => {
  const store = createJobStore({ filePath: testStorePath });
  const job = await store.createJob({ mode: 'prompt', pageName: 'Home' });
  await store.assignSection(job.jobId, '1000000001');
  
  // Write a mock IR to artifacts
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, '4-semantic-planning-ir.json'),
    JSON.stringify({ irVersion: '1.0', sectionName: 'Hero', pageName: 'Home' })
  );
});

after(async () => {
  await fs.rm(testStorePath, { force: true });
  await fs.rm(artifactDir, { recursive: true, force: true });
});

test('POST /api/jobs/:jobId/replay returns 422 for stage <= 4 (perception down)', async () => {
  const ctx = { env: { JOB_STORE_PATH: testStorePath }, params: { jobId: 'job-0000000001' }, body: { fromStage: 4 } };
  const res = await postReplay(ctx);
  
  assert.strictEqual(res.status, STATUS.UNPROCESSABLE);
  assert.strictEqual(res.body.ok, false);
});

test('POST /api/jobs/:jobId/replay runs stages 5 onward with edited IR', async () => {
  const editedIR = { irVersion: '1.0', sectionName: 'HeroEdited', pageName: 'Home', elements: [] };
  const ctx = { 
    env: { JOB_STORE_PATH: testStorePath }, 
    params: { jobId: 'job-0000000001' }, 
    body: { fromStage: 5, ir: editedIR } 
  };
  const res = await postReplay(ctx);
  
  assert.strictEqual(res.status, STATUS.OK);
  assert.strictEqual(res.body.ok, true);
  
  // Verify stages were written
  const store = createJobStore({ filePath: testStorePath });
  const job = await store.getJob('job-0000000001');
  
  const stage5 = job.stages.find(s => s.stage === 5);
  assert.ok(stage5, 'Stage 5 should be recorded');
  assert.strictEqual(stage5.status, 'ok');
});
