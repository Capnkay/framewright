// tests/job-store.test.mjs — T-022, CONTRACT.md §11 and §11.1.
//
// Verifies the two things T-022's doneWhen names — a job's status only ever
// takes one of the five §11.1 values, and sectionId defaults to null until
// assigned — plus the rule that makes the Glass Box worth having at all:
// stage records are append-only (§11 rule 1).
//
// Zero dependencies, and every test writes to its own temp file so the suite
// never touches server/data/jobs.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createJobStore,
  validateJob,
  validateStageRecord,
  formatJobId,
  JOB_STATUSES,
  STAGE_STATUSES,
  STAGE_NAMES,
  MODES,
} from '../server/src/jobs/jobStore.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'server/src/schemas/job.schema.json');
const SOURCE_PATH = path.join(REPO_ROOT, 'server/src/jobs/jobStore.js');

let tempCounter = 0;
function tempPath() {
  tempCounter += 1;
  return path.join(REPO_ROOT, `server/data/test-jobs-${tempCounter}.json`);
}

async function withStore(fn, options = {}) {
  const filePath = tempPath();
  const store = createJobStore({ filePath, ...options });
  try {
    await fn(store);
  } finally {
    await fs.rm(filePath, { force: true });
  }
}

// ---------------------------------------------------------------------
// 1. A new job's defaults — the two halves of T-022's doneWhen.
// ---------------------------------------------------------------------
test('a new job starts queued with sectionId null (§11.1)', async () => {
  await withStore(async (store) => {
    const job = await store.createJob({ mode: 'prompt', pageName: 'Home' });

    assert.equal(job.status, 'queued');
    assert.equal(job.sectionId, null, 'sectionId defaults to null until assigned (§11.1)');
    assert.ok('sectionId' in job, 'the key must be present, not merely undefined');
    assert.match(job.jobId, /^job-[0-9]{10}$/);
    assert.deepEqual(job.stages, []);
    assert.equal(validateJob(job).ok, true);
  });
});

// ---------------------------------------------------------------------
// 2. status accepts exactly the five §11.1 values and nothing else.
// ---------------------------------------------------------------------
test('status accepts exactly the five §11.1 values and rejects anything else', async () => {
  await withStore(async (store) => {
    const { jobId } = await store.createJob({ mode: 'combined' });

    for (const status of JOB_STATUSES) {
      const updated = await store.setStatus(jobId, status);
      assert.equal(updated.status, status);
    }

    assert.equal(JOB_STATUSES.length, 5, 'the closed set is five values');

    for (const bad of ['done', 'complete', 'error', 'QUEUED', '', null, undefined]) {
      await assert.rejects(
        () => store.setStatus(jobId, bad),
        /status must be one of/,
        `status ${JSON.stringify(bad)} must be rejected`,
      );
    }

    // The rejected writes left the record on its last valid value.
    const after = await store.getJob(jobId);
    assert.equal(after.status, JOB_STATUSES[JOB_STATUSES.length - 1]);
  });
});

// ---------------------------------------------------------------------
// 3. sectionId is assignable, and only to a §1 section-range id.
// ---------------------------------------------------------------------
test('sectionId is assignable only to a section-range id (§1)', async () => {
  await withStore(async (store) => {
    const { jobId } = await store.createJob({ mode: 'wireframe' });

    const assigned = await store.assignSection(jobId, '1000000001');
    assert.equal(assigned.sectionId, '1000000001');

    // Back to null is legal — a job can be detached from its section.
    const cleared = await store.assignSection(jobId, null);
    assert.equal(cleared.sectionId, null);

    // An element-range id is not a section id, even though it is 10 digits.
    await assert.rejects(() => store.assignSection(jobId, '2000000001'), /section-range id/);
    await assert.rejects(() => store.assignSection(jobId, '123'), /section-range id/);
  });
});

// ---------------------------------------------------------------------
// 4. Append-only: a retried stage appends, it never overwrites (§11 rule 1).
// ---------------------------------------------------------------------
test('a retried stage appends a second record rather than overwriting the first (§11 rule 1)', async () => {
  await withStore(async (store) => {
    const { jobId } = await store.createJob({ mode: 'wireframe' });

    await store.appendStage(jobId, {
      stage: 3,
      name: 'multimodal-understanding',
      status: 'failed',
      ms: 1200,
      warnings: ['perception timed out'],
    });
    const after = await store.appendStage(jobId, {
      stage: 3,
      name: 'multimodal-understanding',
      status: 'ok',
      ms: 1840,
      model: 'opencv-contours',
      confidence: 0.88,
    });

    const stageThree = after.stages.filter((s) => s.stage === 3);
    assert.equal(stageThree.length, 2, 'the retry must append, not replace');
    assert.equal(stageThree[0].status, 'failed', 'the original record is untouched');
    assert.equal(stageThree[0].warnings[0], 'perception timed out');
    assert.equal(stageThree[1].status, 'ok');
  });
});

// ---------------------------------------------------------------------
// 5. The §11.0 stage/name pairing is enforced, in both directions.
// ---------------------------------------------------------------------
test('a stage number must carry its canonical §11.0 name', async () => {
  await withStore(async (store) => {
    const { jobId } = await store.createJob({ mode: 'prompt' });

    // Omitted name is filled from the canonical map.
    const filled = await store.appendStage(jobId, { stage: 5, status: 'ok' });
    assert.equal(filled.stages[0].name, 'code-generation-assembly');

    // A name that contradicts the number is refused — this is the whole reason
    // §11.0 fixes the numbering in one place.
    await assert.rejects(
      () => store.appendStage(jobId, { stage: 5, name: 'validation-qa', status: 'ok' }),
      /must be named "code-generation-assembly"/,
    );
    await assert.rejects(
      () => store.appendStage(jobId, { stage: 9, name: 'whatever', status: 'ok' }),
      /stage must be an integer 1-7/,
    );
  });
});

// ---------------------------------------------------------------------
// 6. Stage status is its own closed set, and confidence is never fabricated.
// ---------------------------------------------------------------------
test('stage status is the closed §11.1 set, and confidence is null or 0-1 (§10)', async () => {
  await withStore(async (store) => {
    const { jobId } = await store.createJob({ mode: 'prompt' });

    assert.equal(STAGE_STATUSES.length, 6);
    for (const status of STAGE_STATUSES) {
      const updated = await store.appendStage(jobId, { stage: 6, status });
      assert.equal(updated.stages.at(-1).status, status);
    }

    await assert.rejects(
      () => store.appendStage(jobId, { stage: 6, status: 'succeeded' }),
      /stage status must be one of/,
      'a job status is not a stage status — the two sets are different',
    );

    // null is the honest value for a stage that scored nothing (§10).
    const withNull = await store.appendStage(jobId, { stage: 6, status: 'ok', confidence: null });
    assert.equal(withNull.stages.at(-1).confidence, null);

    await assert.rejects(
      () => store.appendStage(jobId, { stage: 6, status: 'ok', confidence: 1.4 }),
      /confidence must be null or a number between 0 and 1/,
    );
  });
});

// ---------------------------------------------------------------------
// 7. jobIds come from a persisted counter — unique and sequential under
//    concurrency, with no clock or randomness involved.
// ---------------------------------------------------------------------
test('concurrent createJob calls return unique sequential jobIds from a counter', async () => {
  await withStore(async (store) => {
    const jobs = await Promise.all(
      Array.from({ length: 25 }, () => store.createJob({ mode: 'prompt' })),
    );
    const ids = jobs.map((j) => j.jobId);

    assert.equal(new Set(ids).size, 25, 'every jobId must be unique');
    for (let i = 0; i < ids.length; i += 1) {
      assert.equal(ids[i], formatJobId(i + 1), 'ids are sequential from the persisted counter');
    }
  });
});

test('jobStore.js derives no id from the clock or from randomness', async () => {
  const source = await fs.readFile(SOURCE_PATH, 'utf8');
  // §1's rule for field ids, applied to the job counter for the same reason:
  // two concurrent jobs must never receive the same value.
  assert.ok(!source.includes('Math.random'), 'Math.random must not appear');
  assert.ok(!source.includes('Date.now'), 'Date.now must not appear');
  assert.ok(!/\buuid\b|\bnanoid\b/.test(source), 'uuid/nanoid must not appear');
});

// ---------------------------------------------------------------------
// 8. The checked-in schema and the code agree. Two copies of a closed set
//    drift; this is what notices.
// ---------------------------------------------------------------------
test('job.schema.json enumerates the same closed sets as the code', async () => {
  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, 'utf8'));
  const stageRecord = schema.definitions.stageRecord;

  assert.deepEqual(schema.properties.status.enum, JOB_STATUSES);
  assert.deepEqual(schema.properties.mode.enum, MODES);
  assert.deepEqual(stageRecord.properties.status.enum, STAGE_STATUSES);
  assert.deepEqual(
    stageRecord.properties.name.enum,
    Object.keys(STAGE_NAMES)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => STAGE_NAMES[k]),
    'schema stage names must match §11.0 order exactly',
  );

  // Every stage number carries an if/then pinning it to its canonical name.
  assert.equal(stageRecord.allOf.length, 7);
  for (const branch of stageRecord.allOf) {
    const number = branch.if.properties.stage.const;
    assert.equal(branch.then.properties.name.const, STAGE_NAMES[number]);
  }
});

// ---------------------------------------------------------------------
// 9. validateJob rejects the record shapes that would break a reader.
// ---------------------------------------------------------------------
test('validateJob rejects a missing sectionId key, a bad status, and a bad stage', () => {
  const base = {
    jobId: 'job-0000000001',
    status: 'running',
    mode: 'combined',
    pageName: 'Home',
    sectionId: null,
    createdAt: '2026-08-19T12:00:00.000Z',
    stages: [],
  };
  assert.equal(validateJob(base).ok, true);

  // Absent is not the same as null (§11.1).
  const { sectionId, ...withoutSectionId } = base;
  const missing = validateJob(withoutSectionId);
  assert.equal(missing.ok, false);
  assert.match(missing.errors.join(' '), /sectionId must be present/);

  assert.equal(validateJob({ ...base, status: 'done' }).ok, false);
  assert.equal(validateJob({ ...base, jobId: '0000000001' }).ok, false);
  assert.equal(
    validateJob({ ...base, stages: [{ stage: 2, name: 'multimodal-understanding', status: 'ok' }] }).ok,
    false,
  );

  // The §11.1 example record from the contract validates as-is.
  assert.deepEqual(
    validateStageRecord({
      stage: 3,
      name: 'multimodal-understanding',
      status: 'ok',
      startedAt: '2026-08-19T12:00:02.100Z',
      ms: 1840,
      inputRef: 'artifacts/job-0000000001/s2-normalised.png',
      outputRef: 'artifacts/job-0000000001/s3-regions.json',
      model: 'florence-2-base',
      confidence: 0.88,
      warnings: [],
    }),
    [],
  );
});

// ---------------------------------------------------------------------
// 10. Reads: a bare doc or null, and job history newest-first (FR-G08).
// ---------------------------------------------------------------------
test('getJob returns a bare doc or null, and listJobs is newest-first', async () => {
  await withStore(async (store) => {
    assert.equal(await store.getJob('job-0000009999'), null);

    const first = await store.createJob({ mode: 'prompt' });
    const second = await store.createJob({ mode: 'code' });

    const fetched = await store.getJob(first.jobId);
    assert.equal(fetched.jobId, first.jobId);
    assert.ok(!('_id' in fetched), '_id never crosses the interface (§2.1)');

    const listed = await store.listJobs({ limit: 1 });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].jobId, second.jobId, 'newest first');
  });
});
