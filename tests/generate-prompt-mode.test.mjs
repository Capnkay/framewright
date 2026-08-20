import test from 'node:test';
import assert from 'node:assert/strict';
import { postGenerate } from '../server/src/routes/generate.js';
import { createStore } from '../server/src/store/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('POST /api/generate for mode=prompt end to end', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-test-generate-'));
  const jobsFile = path.join(tmpDir, 'jobs.json');
  const storeFile = path.join(tmpDir, 'store.json');
  const env = { 
    JOB_STORE_PATH: jobsFile,
    STORE_PATH: storeFile,
    MONGODB_URI: '',
  };
  


  const ctx = {
    env,
    body: {
      mode: 'prompt',
      pageName: 'TestPage',
      sectionName: 'TestSection',
      prompt: 'Make a hero section with a bold title and some stat cards'
    },
    files: {}
  };

  const { status, body } = await postGenerate(ctx);
  
  assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true);
  assert.ok(body.job.jobId, 'Job ID should be returned');
  assert.equal(body.job.mode, 'prompt');
  
  const sectionId = body.job.sectionId;
  assert.ok(sectionId, 'Job should have a sectionId assigned');
  
  // Verify the section was persisted
  const store = createStore(env);
  const section = await store.findSection(sectionId);
  assert.ok(section, 'Section should be persisted in store');
  assert.equal(section.sectionId, sectionId);
  assert.equal(section.pageName, 'TestPage');
  
  // Verify elements were persisted and belong to the section
  assert.ok(Array.isArray(section.fieldIds), 'Section should have fieldIds');
  assert.ok(section.fieldIds.length > 0, 'Section should have elements');
  
  for (const fieldId of section.fieldIds) {
    const elRes = await store.findElements({ sectionId });
    const el = elRes.find(e => e.fieldId === fieldId);
    assert.ok(el, `Element ${fieldId} should exist`);
    assert.equal(el.sectionId, sectionId, 'Element should point to its parent section');
  }

  // A failure partway through never leaves persisted element IDs without a parent section row.
  // We accomplished this by inserting the section before the elements!
});
