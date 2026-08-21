import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getJob } from '../server/src/routes/jobs.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

test('Confidence bands are surfaced in the API response and timeline (T-067)', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-confidence-'));
  const jobsFile = path.join(tmpDir, 'jobs.json');
  const store = createJobStore({ filePath: jobsFile });
  
  // Bump the job counter to avoid artifact collisions with other tests
  for (let i = 0; i < 5; i++) {
    await store.createJob({ mode: 'combined', pageName: 'Home' });
  }
  const job = await store.createJob({ mode: 'combined', pageName: 'Home' }); // job-0000000006
  
  const artifactDir = path.join(process.cwd(), 'artifacts', job.jobId);

  try {
    await store.appendStage(job.jobId, {
      stage: 3,
      name: 'multimodal-understanding',
      status: 'ok',
      confidence: 0.88
    });

    const outputRef = 'artifacts/' + job.jobId + '/s4-semantic-planning-ir.json';
    await store.appendStage(job.jobId, {
      stage: 4,
      name: 'semantic-planning-ir',
      status: 'ok',
      outputRef
    });

    await fs.mkdir(artifactDir, { recursive: true });
    const ir = {
      irVersion: '1.0',
      elements: [
        { elementName: 'el1', confidence: 0.90 },
        { elementName: 'el2', confidence: 0.70 },
        { elementName: 'el3', confidence: 0.50 },
        { elementName: 'el4', confidence: null }
      ]
    };
    await fs.writeFile(path.join(process.cwd(), outputRef), JSON.stringify(ir));

    const ctx = {
      params: { jobId: job.jobId },
      env: { JOB_STORE_PATH: jobsFile }
    };

    const res = await getJob(ctx);
    assert.equal(res.status, 200, 'Expected 200, got ' + res.status);

    const doc = res.body;
    
    const stage3 = doc.stages.find(s => s.stage === 3);
    assert.equal(stage3.confidenceBand, 'Accept', 'Stage 3 confidence 0.88 -> Accept');

    assert.ok(Array.isArray(doc.elements), 'Elements array should be surfaced');
    assert.equal(doc.elements.length, 4, 'Must return all elements');

    const bands = doc.elements.map(e => e.confidenceBand);
    assert.deepEqual(bands, ['Accept', 'Verify', 'Escalate', null], 'Elements must have correct bands per 10');
    assert.equal(doc.elements[0].confidence, 0.90, 'Real content assertion: confidence must be preserved');
    
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.rm(artifactDir, { recursive: true, force: true });
  }
});
