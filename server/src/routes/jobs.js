import fs from 'node:fs/promises';
import path from 'node:path';
import { STATUS, document, badRequest } from '../http/envelope.js';
import { createJobStore } from '../jobs/jobStore.js';

const JOB_ID = /^job-\d{10}$/;

function getBand(confidence) {
  if (confidence === null || confidence === undefined) return null;
  if (confidence >= 0.85) return 'Accept';
  if (confidence >= 0.60) return 'Verify';
  return 'Escalate';
}

/** GET /api/jobs/:jobId - §13.4, §11. Bare document, or 404. */
export async function getJob(ctx = {}) {
  const { jobId } = ctx.params || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }

  const env = ctx.env || {};
  const filePath = env.JOB_STORE_PATH;
  const storeArgs = filePath ? { filePath } : undefined;
  const store = createJobStore(storeArgs);

  const job = await store.getJob(jobId);
  if (!job) {
    return document(job, 'job ' + jobId);
  }

  for (const stage of job.stages) {
    if (stage.confidence !== undefined && stage.confidence !== null) {
      stage.confidenceBand = getBand(stage.confidence);
    } else if (stage.confidence === null) {
      stage.confidenceBand = null;
    }
  }

  const s4 = job.stages.slice().reverse().find(s => s.name === 'semantic-planning-ir' && s.status === 'ok');
  if (s4 && s4.outputRef) {
    try {
      const artifactPath = path.join(process.cwd(), s4.outputRef);
      const content = await fs.readFile(artifactPath, 'utf8');
      const ir = JSON.parse(content);
      if (ir.elements && Array.isArray(ir.elements)) {
        job.elements = ir.elements.map(el => ({
          ...el,
          confidenceBand: getBand(el.confidence)
        }));
      }
    } catch (err) {
      // Missing or unparseable artifact: ignore
    }
  }

  return document(job, 'job ' + jobId);
}
