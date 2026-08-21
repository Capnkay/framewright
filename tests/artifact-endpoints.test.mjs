// tests/artifact-endpoints.test.mjs
//
// Verification for T-037: artifact and component-source endpoints (§11.2).
//
// doneWhen: GET /api/jobs/:jobId/artifacts/:name returns the artifact with its
// own content type; GET /api/jobs/:jobId/component returns the generated JSX
// as text/plain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { getArtifact, getComponentSource } from '../server/src/routes/artifacts.js';
import { createJobStore, formatJobId } from '../server/src/jobs/jobStore.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fw-t037-'));
}

// The job store file is per-test and temporary, but the job COUNTER inside it
// restarts at 1 every time, so every suite that made a job got job-0000000001.
// The physical artifacts directory is repo-relative and shared — the key
// `artifacts/<jobId>/...` is fixed by §11.2 and §15.2 rule 2, so it is not ours
// to relocate — which meant three suites running in parallel processes all wrote
// to, and removed, the same artifacts/job-0000000001. That surfaced as ENOTEMPTY
// here and as a missing artifact in tests/regenerate-base, on alternating runs.
// Seeding the counter into a range no other suite uses gives this file its own
// directories. The seed is arbitrary but must stay distinct per suite.
const JOB_COUNTER_SEED = 7001;

function makeTmpJobStore(tmpDir) {
  const filePath = path.join(tmpDir, 'jobs.json');
  fs.writeFileSync(filePath, JSON.stringify({ counters: { job: JOB_COUNTER_SEED }, jobs: [] }));
  return createJobStore({ filePath });
}

async function createTestJob(store, mode = 'prompt') {
  return store.createJob({ mode, pageName: 'Home', sectionId: null });
}

// ---------------------------------------------------------------------------
// Validation: jobId format
// ---------------------------------------------------------------------------
test('getArtifact: bad jobId returns 400', async () => {
  const result = await getArtifact({ params: { jobId: 'bad-id', name: 'test.png' } });
  assert.equal(result.status, 400, 'bad jobId must return 400');
  assert.equal(result.body.ok, false);
});

test('getComponentSource: bad jobId returns 400', async () => {
  const result = await getComponentSource({ params: { jobId: 'bad-id' } });
  assert.equal(result.status, 400, 'bad jobId must return 400');
  assert.equal(result.body.ok, false);
});

// ---------------------------------------------------------------------------
// Job not found
// ---------------------------------------------------------------------------
test('getArtifact: non-existent job returns 404', async () => {
  const tmp = makeTmpDir();
  const result = await getArtifact({
    params: { jobId: 'job-0000000099', name: 'test.png' },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });
  assert.equal(result.status, 404, 'non-existent job must return 404');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('getComponentSource: non-existent job returns 404', async () => {
  const tmp = makeTmpDir();
  const result = await getComponentSource({
    params: { jobId: 'job-0000000099' },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });
  assert.equal(result.status, 404);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Artifact not found for real job
// ---------------------------------------------------------------------------
test('getArtifact: artifact file missing returns 404', async () => {
  const tmp = makeTmpDir();
  const store = makeTmpJobStore(tmp);
  const job = await createTestJob(store);

  const result = await getArtifact({
    params: { jobId: job.jobId, name: 'nonexistent.png' },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });
  assert.equal(result.status, 404);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Artifact found — correct content type
// ---------------------------------------------------------------------------
test('getArtifact: PNG artifact returns image/png with buffer body', async () => {
  const tmp = makeTmpDir();
  const store = makeTmpJobStore(tmp);
  const job = await createTestJob(store);

  // Write a fake artifact
  const artifactDir = path.join(REPO_ROOT, 'artifacts', job.jobId);
  fs.mkdirSync(artifactDir, { recursive: true });
  const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
  fs.writeFileSync(path.join(artifactDir, 'wireframe.png'), pngData);

  const result = await getArtifact({
    params: { jobId: job.jobId, name: 'wireframe.png' },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });

  assert.equal(result.status, 200, 'found artifact must return 200');
  assert.equal(result.raw, true, 'raw flag must be set to skip JSON serialisation');
  assert.equal(result.contentType, 'image/png', 'PNG must return image/png content type');
  assert.ok(result.body instanceof Buffer, 'body must be a Buffer');

  // Cleanup
  fs.rmSync(artifactDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('getArtifact: JSON artifact returns application/json', async () => {
  const tmp = makeTmpDir();
  const store = makeTmpJobStore(tmp);
  const job = await createTestJob(store);

  const artifactDir = path.join(REPO_ROOT, 'artifacts', job.jobId);
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, 'ir.json'), JSON.stringify({ irVersion: '1.0' }));

  const result = await getArtifact({
    params: { jobId: job.jobId, name: 'ir.json' },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });

  assert.equal(result.status, 200);
  assert.equal(result.contentType, 'application/json');

  fs.rmSync(artifactDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Directory traversal prevention
// ---------------------------------------------------------------------------
test('getArtifact: path traversal in name returns 400', async () => {
  const tmp = makeTmpDir();
  const store = makeTmpJobStore(tmp);
  const job = await createTestJob(store);

  const result = await getArtifact({
    params: { jobId: job.jobId, name: '../../../etc/passwd' },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });

  assert.equal(result.status, 400, 'path traversal must return 400');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getComponentSource — no componentFile yet
// ---------------------------------------------------------------------------
test('getComponentSource: job with no componentFile returns 404', async () => {
  const tmp = makeTmpDir();
  const store = makeTmpJobStore(tmp);
  const job = await createTestJob(store);

  const result = await getComponentSource({
    params: { jobId: job.jobId },
    env: { JOB_STORE_PATH: path.join(tmp, 'jobs.json') },
  });

  assert.equal(result.status, 404, 'missing componentFile must return 404');
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getComponentSource — componentFile exists on disk
// ---------------------------------------------------------------------------
test('getComponentSource: returns JSX source as text/plain', async () => {
  const tmp = makeTmpDir();
  const store = makeTmpJobStore(tmp);
  const job = await createTestJob(store);

  // Write a fake generated component
  const generatedDir = path.join(REPO_ROOT, 'client', 'src', 'sections', 'generated');
  fs.mkdirSync(generatedDir, { recursive: true });
  const componentPath = path.join(generatedDir, `TestSection-${job.jobId}-v1.jsx`);
  const jsxSource = '// Generated\nexport default function Test() { return null; }\n';
  fs.writeFileSync(componentPath, jsxSource, 'utf8');

  // Manually patch componentFile onto the job (T-033 does this in production)
  // We do it by reading the store file and writing it back
  const storeFile = path.join(tmp, 'jobs.json');
  const storeData = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  storeData.jobs[0].componentFile = componentPath;
  fs.writeFileSync(storeFile, JSON.stringify(storeData, null, 2), 'utf8');

  const result = await getComponentSource({
    params: { jobId: job.jobId },
    env: { JOB_STORE_PATH: storeFile },
  });

  assert.equal(result.status, 200, 'found component must return 200');
  assert.equal(result.raw, true, 'raw flag must be set');
  assert.ok(result.contentType.startsWith('text/plain'), 'must be text/plain');
  assert.equal(result.body, jsxSource, 'body must be the JSX source string');

  // Cleanup
  fs.unlinkSync(componentPath);
  fs.rmSync(tmp, { recursive: true, force: true });
});
