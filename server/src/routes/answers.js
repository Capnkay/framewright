import fs from 'node:fs/promises';
import path from 'node:path';
import { STATUS, badRequest, error, ERROR_CODE, ok } from '../http/envelope.js';
import { createJobStore } from '../jobs/jobStore.js';
import { postReplay } from './replay.js';

const JOB_ID = /^job-\d{10}$/;

export async function postAnswers(ctx = {}) {
  const { jobId } = ctx.params || {};
  const body = ctx.body || {};

  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return badRequest('answers is required and must be a non-empty array (§11.3).');
  }

  const env = ctx.env || {};
  const store = createJobStore({ filePath: env.JOB_STORE_PATH });
  const job = await store.getJob(jobId);

  if (!job) {
    return { status: STATUS.NOT_FOUND, body: error(ERROR_CODE.NOT_FOUND, 'job not found') };
  }

  const artifactDir = path.resolve(`artifacts/${jobId}`);
  let questions = [];
  try {
    const qData = await fs.readFile(path.join(artifactDir, 'questions.json'), 'utf8');
    questions = JSON.parse(qData);
  } catch (err) {
    // ignore
  }

  let ir;
  try {
    const irData = await fs.readFile(path.join(artifactDir, '4-semantic-planning-ir.json'), 'utf8');
    ir = JSON.parse(irData);
  } catch (err) {
    return { status: STATUS.SERVER_ERROR, body: error(ERROR_CODE.INTERNAL, 'IR not found') };
  }

  // Write answers into IR
  for (const answer of body.answers) {
    const q = questions.find(q => q.questionId === answer.questionId);
    if (q && q.elementRef) {
      const el = ir.elements.find(e => e.fieldId === q.elementRef);
      if (el) {
        el.elementName = answer.choice;
      }
    }
  }

  // Save IR
  await fs.writeFile(path.join(artifactDir, '4-semantic-planning-ir.json'), JSON.stringify(ir, null, 2));

  // Resume job
  await store.setStatus(jobId, 'running');

  // Trigger replay from stage 4
  // But wait, the client returns { "ok": true, "resumedFrom": 4 }
  // We can just call postReplay directly, or just return the envelope since replay might run asynchronously.
  // Let's run replay asynchronously to avoid blocking the response.
  postReplay({ params: { jobId }, body: { stage: 4 }, env }).catch(() => {});

  return { status: STATUS.OK, body: ok({ resumedFrom: 4 }) };
}
