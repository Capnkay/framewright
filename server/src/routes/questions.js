import fs from 'node:fs/promises';
import path from 'node:path';
import { STATUS, badRequest, error, ERROR_CODE, ok, collection } from '../http/envelope.js';
import { createJobStore } from '../jobs/jobStore.js';

const JOB_ID = /^job-\d{10}$/;

export async function getQuestions(ctx = {}) {
  const { jobId } = ctx.params || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (A 11.1).');
  }

  const env = ctx.env || {};
  const store = createJobStore({ filePath: env.JOB_STORE_PATH });
  const job = await store.getJob(jobId);

  if (!job) {
    return { status: STATUS.NOT_FOUND, body: error(ERROR_CODE.NOT_FOUND, 'job not found') };
  }

  const artifactPath = path.resolve(`artifacts/${jobId}/questions.json`);
  let questions = [];
  try {
    const data = await fs.readFile(artifactPath, 'utf8');
    questions = JSON.parse(data);
  } catch (err) {
    // Return empty if file not found
    questions = [];
  }

  return { status: STATUS.OK, body: collection(questions) };
}
