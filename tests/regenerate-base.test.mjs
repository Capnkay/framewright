import test from 'node:test';
import assert from 'node:assert/strict';
import { postRegenerate } from '../server/src/routes/regenerate.js';
import { createStore } from '../server/src/store/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('POST /api/sections/:sectionId/regenerate per §13.3 (base semantics)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-test-regenerate-'));
  await fs.writeFile(path.join(tmpDir, 'jobs.json'), JSON.stringify({ counters: { job: 14001 }, jobs: [] }));
  const jobsFile = path.join(tmpDir, 'jobs.json');
  const storeFile = path.join(tmpDir, 'store.json');
  const env = { 
    JOB_STORE_PATH: jobsFile,
    STORE_PATH: storeFile,
    MONGODB_URI: '',
  };
  
  const store = createStore(env);
  
  // Seed a section
  const sectionId = await store.allocateId('section');
  await store.insertSection({
    sectionName: 'Custom',
    sectionId: sectionId,
    pageName: 'Home',
    platform: 'Website',
    status: 'Pending',
    jobId: 'job-0000000001',
    prompt: 'Original prompt',
    variation: '1',
    designTokens: {},
    fieldIds: []
  });

  const ctx = {
    env,
    params: { sectionId },
    body: {
      mode: 'prompt',
      prompt: 'Updated prompt with more colors',
      variation: '2'
    },
    files: {}
  };

  const { status, body } = await postRegenerate(ctx);
  
  assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true);
  assert.ok(body.job.jobId, 'Job ID should be returned');
  
  // Verify the section was updated in place
  const section = await store.findSection(sectionId);
  assert.ok(section, 'Section should still exist');
  assert.equal(section.sectionId, sectionId, 'sectionId does not change');
  assert.equal(section.variation, '2', 'variations is updated in place');
  assert.equal(section.prompt, 'Updated prompt with more colors');
  
  // Verify idPolicy.mode was forced to preserve (reflected in IR job trace or by successful run)
  const jobStore = await import('../server/src/jobs/jobStore.js').then(m => m.createJobStore({ filePath: jobsFile }));
  const job = await jobStore.getJob(body.job.jobId);
  const s4Record = job.stages.find(s => s.stage === 4);
  assert.ok(s4Record, 'Stage 4 should be recorded');
  
  const outputData = await fs.readFile(s4Record.outputRef, 'utf8');
  const ir = JSON.parse(outputData);
  assert.equal(ir.idPolicy.mode, 'preserve', 'idPolicy.mode is forced to preserve for this call');
});
