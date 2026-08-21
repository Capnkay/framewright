import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { postReplay } from '../server/src/routes/replay.js';
import { STATUS } from '../server/src/http/envelope.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

// Kept out of server/data/ so a test never writes into the repo's own store
// directory, and out of the default job store so nothing accumulates there.
const testStorePath = path.join(
  os.tmpdir(),
  `framewright-replay-store-${process.pid}-${process.hrtime.bigint()}.json`,
);

// The physical artifacts directory is repo-relative and shared by every suite:
// the key `artifacts/<jobId>/...` is fixed by §11.2 and §15.2 rule 2, so it is
// not ours to relocate. What IS ours is the job id. Left on the default counter
// this suite allocated job-0000000001 — the same id tests/regenerate-base uses —
// so the two raced over one directory: this suite's cleanup removed it while the
// other was still writing, giving ENOTEMPTY here and a missing s4-output.json
// there, on alternating runs. Seeding the counter puts this suite in its own
// directory and the collision disappears.
const JOB_COUNTER_SEED = 9001;
let artifactDir;
let jobId;

before(async () => {
  await fs.writeFile(
    testStorePath,
    JSON.stringify({ counters: { job: JOB_COUNTER_SEED }, jobs: [] }),
  );

  const store = createJobStore({ filePath: testStorePath });
  const job = await store.createJob({ mode: 'prompt', pageName: 'Home' });
  jobId = job.jobId;
  await store.assignSection(jobId, '1000000001');

  // Derived from the id actually allocated, never hard-coded.
  artifactDir = path.resolve('artifacts', job.jobId);

  // Write a mock IR to artifacts
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(
    path.join(artifactDir, '4-semantic-planning-ir.json'),
    JSON.stringify({ irVersion: '1.0', sectionName: 'Hero', pageName: 'Home' })
  );
});

after(async () => {
  await fs.rm(testStorePath, { force: true });
  if (artifactDir) await fs.rm(artifactDir, { recursive: true, force: true });
});

test('POST /api/jobs/:jobId/replay returns 422 for stage <= 4 (perception down)', async () => {
  const ctx = { env: { JOB_STORE_PATH: testStorePath }, params: { jobId }, body: { fromStage: 4 } };
  const res = await postReplay(ctx);
  
  assert.strictEqual(res.status, STATUS.UNPROCESSABLE);
  assert.strictEqual(res.body.ok, false);
});

test('POST /api/jobs/:jobId/replay runs stages 5 onward with edited IR', async () => {
  const editedIR = { irVersion: '1.0', sectionName: 'HeroEdited', pageName: 'Home', elements: [] };
  const ctx = { 
    env: { JOB_STORE_PATH: testStorePath }, 
    params: { jobId }, 
    body: { fromStage: 5, ir: editedIR } 
  };
  const res = await postReplay(ctx);
  
  assert.strictEqual(res.status, STATUS.OK);
  assert.strictEqual(res.body.ok, true);
  
  // Verify stages were written
  const store = createJobStore({ filePath: testStorePath });
  const job = await store.getJob(jobId);
  
  const stage5 = job.stages.find(s => s.stage === 5);
  assert.ok(stage5, 'Stage 5 should be recorded');
  assert.strictEqual(stage5.status, 'ok');
});
