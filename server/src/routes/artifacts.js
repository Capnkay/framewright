// server/src/routes/artifacts.js
//
// Artifact and component-source endpoints — T-037, CONTRACT.md §11.2.
//
// GET /api/jobs/:jobId/artifacts/:name
//   Serves the named artifact from artifacts/<jobId>/<name> with the correct
//   content type derived from the file extension.
//
// GET /api/jobs/:jobId/component
//   Serves the generated JSX source as text/plain, read from the path stored
//   in the job record's `componentFile` field (set by T-033 when the job
//   completes stage 5).
//
// Both endpoints sit behind a jobId validity check (JOB_ID regex, §11.1).
// A missing job → 404. A missing artifact → 404. No directory traversal is
// possible because the artifact name is path.basename'd before joining.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJobStore } from '../jobs/jobStore.js';
import { STATUS, ERROR_CODE } from '../http/envelope.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts');

/** §11.1: job ids are `job-` followed by 10 digits. */
const JOB_ID = /^job-\d{10}$/;

/** Derive a safe content type from a file extension. */
const CONTENT_TYPES = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.txt':  'text/plain',
  '.jsx':  'text/plain',
  '.js':   'text/plain',
  '.html': 'text/html',
  '.css':  'text/css',
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function notFound(message) {
  return {
    status: STATUS.NOT_FOUND,
    body: { ok: false, error: { code: ERROR_CODE.NOT_FOUND, message } },
  };
}

function badRequest(message) {
  return {
    status: STATUS.BAD_REQUEST,
    body: { ok: false, error: { code: ERROR_CODE.INVALID_INPUT, message } },
  };
}

/**
 * GET /api/jobs/:jobId/artifacts/:name
 *
 * Returns the artifact file with the appropriate content type.
 * The name parameter is sanitised (basename only) to prevent directory traversal.
 *
 * ctx.env is optional; if provided it selects the job store backend.
 */
export async function getArtifact(ctx = {}) {
  const { jobId, name } = ctx.params || {};

  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }
  if (!name || typeof name !== 'string') {
    return badRequest('artifact name is required.');
  }

  // Sanitise: take basename only, no directory traversal.
  const safeName = path.basename(name);
  if (!safeName || safeName !== name) {
    return badRequest('artifact name must be a simple filename with no path separators.');
  }

  // Verify job exists.
  const store = createJobStore({ filePath: ctx.env?.JOB_STORE_PATH });
  const job = await store.getJob(jobId);
  if (!job) {
    return notFound(`No such job: ${jobId}`);
  }

  const artifactPath = path.join(ARTIFACTS_DIR, jobId, safeName);
  if (!fs.existsSync(artifactPath)) {
    return notFound(`No artifact '${safeName}' found for job ${jobId}.`);
  }

  const buffer = fs.readFileSync(artifactPath);
  const contentType = contentTypeFor(artifactPath);

  return {
    status: STATUS.OK,
    raw: true,           // signals app.js to skip JSON serialisation
    contentType,
    body: buffer,
  };
}

/**
 * GET /api/jobs/:jobId/component
 *
 * Returns the generated JSX source file as text/plain.
 * The path is taken from the job record's `componentFile` field.
 */
export async function getComponentSource(ctx = {}) {
  const { jobId } = ctx.params || {};

  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }

  const store = createJobStore({ filePath: ctx.env?.JOB_STORE_PATH });
  const job = await store.getJob(jobId);
  if (!job) {
    return notFound(`No such job: ${jobId}`);
  }

  // componentFile is set by the generate pipeline (T-033, stage 5).
  // Until then the job will not have this field.
  if (!job.componentFile || typeof job.componentFile !== 'string') {
    return notFound(`Job ${jobId} does not have a componentFile yet (generation not complete).`);
  }

  if (!fs.existsSync(job.componentFile)) {
    return notFound(`componentFile for job ${jobId} does not exist on disk: ${job.componentFile}`);
  }

  const source = fs.readFileSync(job.componentFile, 'utf8');

  return {
    status: STATUS.OK,
    raw: true,
    contentType: 'text/plain; charset=utf-8',
    body: source,
  };
}
