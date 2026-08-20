import { STATUS, document, badRequest } from '../http/envelope.js';
import { createJobStore } from '../jobs/jobStore.js';

const JOB_ID = /^job-\d{10}$/;

/** GET /api/jobs/:jobId - §13.4, §11. Bare document, or 404. */
export async function getJob(ctx = {}) {
  const { jobId } = ctx.params || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }

  // Create job store for the environment (defaults to jobs.json in production)
  // If env.JOB_STORE_PATH is set, use it.
  const env = ctx.env || {};
  const filePath = env.JOB_STORE_PATH;
  const storeArgs = filePath ? { filePath } : undefined;
  const store = createJobStore(storeArgs);

  const job = await store.getJob(jobId);
  return document(job, `job ${jobId}`);
}
