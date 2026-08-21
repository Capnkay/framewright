import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getQuestions, postAnswers } from '../server/src/routes/index.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

test('hitl-endpoints (T-065)', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framewright-hitl-'));
  const jobsFile = path.join(tmpDir, 'jobs.json');
  
  const store = createJobStore({ filePath: jobsFile });
  const job = await store.createJob({ mode: 'combined' });
  await store.setStatus(job.jobId, 'awaiting-input');

  const artifactDir = path.resolve(`artifacts/${job.jobId}`);
  await fs.mkdir(artifactDir, { recursive: true });

  const questions = [
    {
      questionId: 'q1',
      elementRef: '2000000001',
      bbox: [500, 400, 200, 60],
      prompt: 'What is this component?',
      options: ['Button', 'Card', 'Badge', 'Image', 'Text'],
      modelGuess: 'Button',
      confidence: 0.43
    }
  ];

  await fs.writeFile(path.join(artifactDir, 'questions.json'), JSON.stringify(questions));

  const ir = {
    sectionId: '1000000001',
    elements: [
      { fieldId: '2000000001', elementName: 'Text', tag: 'p', default: '...' }
    ]
  };

  await fs.writeFile(path.join(artifactDir, '4-semantic-planning-ir.json'), JSON.stringify(ir));

  // Test GET /questions
  const getRes = await getQuestions({
    params: { jobId: job.jobId },
    env: { JOB_STORE_PATH: jobsFile }
  });

  assert.equal(getRes.status, 200, 'GET /questions should return 200');
  assert.equal(getRes.body.length, 1, 'Should return questions array');
  assert.equal(getRes.body[0].questionId, 'q1');

  // Test POST /answers
  const postRes = await postAnswers({
    params: { jobId: job.jobId },
    body: { answers: [{ questionId: 'q1', choice: 'Button' }] },
    env: { JOB_STORE_PATH: jobsFile }
  });

  assert.equal(postRes.status, 200, 'POST /answers should return 200');
  assert.equal(postRes.body.resumedFrom, 4, 'Should indicate resume from stage 4');
  assert.equal(postRes.body.ok, true, 'Should return ok envelope');

  // Verify IR update
  const updatedIrData = await fs.readFile(path.join(artifactDir, '4-semantic-planning-ir.json'), 'utf8');
  const updatedIr = JSON.parse(updatedIrData);
  assert.equal(updatedIr.elements[0].elementName, 'Button', 'IR element should be updated with choice');

  // Wait a tick for async replay
  await new Promise(r => setTimeout(r, 100));
});
