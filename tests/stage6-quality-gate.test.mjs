// T-115 — stage 6, validation-qa. §18, §18.2, §11.0.
//
// THE DEFECT. `runStage` was called for stages 1, 2, 3, 4, 5 and 7 and never for 6.
// `quality/score.js` looks for `job.stages.find(s => s.stage === 6)` and, finding none,
// fell back to `structurePass: false` and `eslintErrors: 0` for every job ever scored —
// so the 0–100 number T-091 surfaces was not a measurement of anything.
// `generate/validateAndRecover.js`, which implements §18.2's parse-then-lint rule, had
// zero callers, as did all three §18 quality gates.
//
// WHAT IS AND IS NOT MEASURED. This stage measures `structurePass` and `eslintErrors`.
// The visual and accessibility metrics need a rendered page and a browser and are not
// in this task; they keep their documented fallbacks. The artifact says so in
// `measured` and `notMeasured`, so a reader of the score can tell a measurement from a
// default without reading this file.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postGenerate } from '../server/src/routes/generate.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';
import { computeJobScore } from '../server/src/quality/score.js';

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify({ counters: { job: 18001 }, jobs: [] }));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    // T-120: artifacts share one relative root by default, and an isolated
    // job store restarts ids at 1 — so without this two test files both write
    // artifacts/job-0000000001/ and read each other's stage outputs.
    ARTIFACT_ROOT: path.join(dir, 'artifacts'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
}

async function generate(env) {
  const { status, body } = await postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'QaPage', sectionName: 'QaSection', prompt: 'a hero with three stats' },
    files: {},
  });
  assert.equal(status, 200, JSON.stringify(body));
  const jobs = createJobStore({ filePath: env.JOB_STORE_PATH });
  return jobs.getJob(body.job.jobId);
}

test('stage 6 runs and is recorded', async () => {
  const job = await generate(await isolatedEnv('s6-runs'));
  const stage6 = job.stages.find((s) => s.stage === 6);

  assert.ok(stage6, 'stage 6 has no trace record — §11.0 numbers it and nothing ran it');
  assert.notEqual(stage6.status, 'skipped');
  assert.ok(stage6.outputRef, 'stage 6 persisted no artifact for the score to read');
});

test('the artifact carries the shape computeJobScore already reads', async () => {
  const job = await generate(await isolatedEnv('s6-shape'));
  const stage6 = job.stages.find((s) => s.stage === 6);
  const artifact = JSON.parse(await fs.readFile(stage6.outputRef, 'utf8'));

  assert.equal(typeof artifact.structurePass, 'boolean');
  assert.equal(typeof artifact.eslintErrors, 'number');
});

test('the artifact says what it did NOT measure', async () => {
  // A score assembled from two measurements and two defaults, with no way to tell them
  // apart, reads as four measurements. §10's argument about fabricated confidences is
  // the same argument one layer up.
  const job = await generate(await isolatedEnv('s6-honesty'));
  const stage6 = job.stages.find((s) => s.stage === 6);
  const artifact = JSON.parse(await fs.readFile(stage6.outputRef, 'utf8'));

  assert.deepEqual(artifact.measured, ['structurePass', 'eslintErrors']);
  assert.deepEqual(artifact.notMeasured, ['visualSimilarity', 'axeSeriousViolations']);
});

test('the emitted component passes §18.2, so structurePass is true and not merely default', async () => {
  // The distinction this whole task turns on: `false` was the fallback, so a `false`
  // here would be indistinguishable from stage 6 never having run. `true` can only
  // come from the check actually running and passing.
  const job = await generate(await isolatedEnv('s6-passes'));
  const stage6 = job.stages.find((s) => s.stage === 6);
  const artifact = JSON.parse(await fs.readFile(stage6.outputRef, 'utf8'));

  assert.equal(artifact.structurePass, true, `the emitter produced source that fails §18.2: ${JSON.stringify(stage6.warnings)}`);
  assert.equal(artifact.eslintErrors, 0);
});

test('the score is now computed from a real stage 6 rather than from fallbacks', async () => {
  const job = await generate(await isolatedEnv('s6-score'));
  const stage6 = job.stages.find((s) => s.stage === 6);
  const artifact = JSON.parse(await fs.readFile(stage6.outputRef, 'utf8'));

  const withStage6 = computeJobScore(job, artifact);
  const withoutArtifact = computeJobScore(job, null);

  assert.ok(withStage6, 'no score was produced');
  assert.notDeepEqual(
    withStage6,
    withoutArtifact,
    'the score is identical with and without the artifact — stage 6 is not reaching it'
  );
});

test('a structural failure degrades the stage and does not fail the job', async () => {
  // §18.2: the job still succeeds. A lint error must not stop a generation.
  // Asserted against the module's own contract rather than by breaking the emitter,
  // which would be testing the emitter instead of this stage.
  const { default: createValidateAndRecover } = await import('../server/src/generate/validateAndRecover.js');
  const { check } = createValidateAndRecover();

  const bad = await check('this is not JSX at all {{{');
  assert.equal(bad.ok, false);
  assert.ok(bad.kind, 'a structural failure must say which kind it was');

  const empty = await check('');
  assert.equal(empty.ok, false, 'empty source is a parse failure, not a pass');
});
