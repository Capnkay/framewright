import { postGenerate } from '../server/src/routes/generate.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';
import { computeJobScore } from '../server/src/quality/score.js';
import fs from 'node:fs/promises';
import path from 'node:path';

async function run() {
  const env = { ...process.env, STORE_PATH: 'data/test_store.json', JOB_STORE_PATH: 'data/test_jobs.json', STORE_TYPE: 'json' };
  try { await fs.rm('data/test_jobs.json', { force: true }); } catch(e){}
  
  const { status, body } = await postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'Home', sectionName: 'Hero', prompt: 'hero section' },
    files: {},
  });
  
  const jobs = createJobStore({ filePath: 'data/test_jobs.json' });
  const job = jobs.getJob(body.job.jobId);
  const stage6 = job.stages.find(s => s.stage === 6);
  const artifact = JSON.parse(await fs.readFile(stage6.outputRef, 'utf8'));
  
  console.log('Artifact:', artifact);
  console.log('Score:', computeJobScore(job, artifact));
}
run();
