// T-120 — two runs that share a jobId must not share an artifact file. §11.2.
//
// THE DEFECT, and it was found by running `npm test` twice rather than once.
// `ARTIFACT_ROOT` was the literal string 'artifacts', resolved against the process
// cwd, and `artifactRef` built every path from it. Job ids restart at 1 in every
// isolated job store, so any two runs holding their own stores both derive
//
//   artifacts/job-0000000001/s4-output.json
//
// and the second one's write lands on the first one's file. `node --test` gives each
// test FILE its own process and runs them in parallel, so this was not hypothetical:
// tests/regenerate-base.test.mjs and tests/stage6-quality-gate.test.mjs each failed on
// one run and passed on the next, reading a stage-4 artifact that belonged to somebody
// else's job. A suite whose result depends on scheduling reports "green" as noise.
//
// WHY THIS IS NOT TESTED BY MOCKING `writeArtifact`. `createStageTrace` already takes
// an injectable sink, and a test that injects one proves nothing about the path,
// because the path is exactly what the sink replaces. These tests let both traces
// write to the real disk and then read the two files back.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import createStageTrace, { artifactRef, ARTIFACT_ROOT, artifactRootFrom } from '../server/src/jobs/stageTrace.js';
import { createJobStore } from '../server/src/jobs/jobStore.js';

async function tempDir(label) {
  return fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
}

/** A trace with its own job store and its own artifact root. */
async function isolatedRun(label) {
  const dir = await tempDir(label);
  const jobStore = createJobStore({ filePath: path.join(dir, 'jobs.json') });
  const artifactRoot = path.join(dir, 'artifacts');
  return { dir, jobStore, artifactRoot, trace: createStageTrace({ jobStore, artifactRoot }) };
}

// ---------------------------------------------------------------------

test('the default root is unchanged — §11.2 still describes what ships', async () => {
  // The fix must not move artifacts for anyone who did not ask. A deployment sets
  // nothing and gets exactly the path the contract's example shows.
  assert.equal(ARTIFACT_ROOT, 'artifacts');
  assert.equal(artifactRef('job-0000000001', 3, 'regions'), 'artifacts/job-0000000001/s3-regions.json');
  assert.equal(artifactRef('job-0000000001', 2, 'normalised', 'png'), 'artifacts/job-0000000001/s2-normalised.png');
  assert.equal(artifactRootFrom({}), 'artifacts');
  assert.equal(artifactRootFrom({ ARTIFACT_ROOT: '   ' }), 'artifacts', 'a blank override is not an override');
  assert.equal(artifactRootFrom({ ARTIFACT_ROOT: '/tmp/x' }), '/tmp/x');
});

test('two runs with the SAME jobId do not overwrite one another', async () => {
  // The exact race, made deterministic: both stores are fresh, so both jobs are
  // job-0000000001, and both traces run stage 4 with different output.
  const a = await isolatedRun('root-a');
  const b = await isolatedRun('root-b');

  const jobA = await a.jobStore.createJob({ mode: 'prompt', pageName: 'Home' });
  const jobB = await b.jobStore.createJob({ mode: 'prompt', pageName: 'Home' });
  assert.equal(jobA.jobId, jobB.jobId, 'the premise of this test is that the ids collide');

  const ranA = await a.trace.runStage(jobA.jobId, { stage: 4, input: {}, run: async () => ({ who: 'A' }) });
  const ranB = await b.trace.runStage(jobB.jobId, { stage: 4, input: {}, run: async () => ({ who: 'B' }) });

  assert.notEqual(ranA.record.outputRef, ranB.record.outputRef, 'both runs derived the same artifact path');

  const readA = JSON.parse(await fs.readFile(ranA.record.outputRef, 'utf8'));
  const readB = JSON.parse(await fs.readFile(ranB.record.outputRef, 'utf8'));
  assert.equal(readA.who, 'A', "run A's artifact was overwritten by run B");
  assert.equal(readB.who, 'B');
});

test('the record points at a file that exists under the run’s own root', async () => {
  // §11 rule 2: a stage persists its input and output, referenced by path. A ref the
  // reader cannot resolve satisfies the letter and none of the point.
  const run = await isolatedRun('root-resolvable');
  const job = await run.jobStore.createJob({ mode: 'prompt', pageName: 'Home' });
  const { record } = await run.trace.runStage(job.jobId, { stage: 3, input: { in: 1 }, run: async () => ({ out: 2 }) });

  for (const ref of [record.inputRef, record.outputRef]) {
    const resolved = path.resolve(ref);
    assert.ok(resolved.startsWith(path.resolve(run.artifactRoot)), `${ref} escaped the run's root`);
    await fs.access(resolved); // throws if the trace wrote somewhere else
  }
});

test('the trace hands back its OWN ref builder, not the module-level one', async () => {
  // A caller that predicted a path with the exported `artifactRef` would be right only
  // while the root is the default — which is the bug, one layer up.
  const run = await isolatedRun('root-builder');
  const mine = run.trace.artifactRef('job-0000000001', 4, 'output');

  assert.notEqual(mine, artifactRef('job-0000000001', 4, 'output'));
  assert.ok(mine.startsWith(run.artifactRoot.split(path.sep).join('/')), `${mine} is not under ${run.artifactRoot}`);
  assert.equal(run.trace.artifactRoot, run.artifactRoot);
});

test('a retry still appends rather than overwriting, inside an isolated root', async () => {
  // §11 rule 1 is the property the attempt discriminator exists for, and a change to
  // path construction is exactly when that quietly stops working.
  const run = await isolatedRun('root-retry');
  const job = await run.jobStore.createJob({ mode: 'prompt', pageName: 'Home' });

  const one = await run.trace.runStage(job.jobId, { stage: 3, input: {}, run: async () => ({ attempt: 1 }) });
  const two = await run.trace.runStage(job.jobId, { stage: 3, input: {}, run: async () => ({ attempt: 2 }) });

  assert.equal(one.record.attempt, 1);
  assert.equal(two.record.attempt, 2);
  assert.notEqual(one.record.outputRef, two.record.outputRef);
  assert.equal(JSON.parse(await fs.readFile(one.record.outputRef, 'utf8')).attempt, 1);
  assert.equal(JSON.parse(await fs.readFile(two.record.outputRef, 'utf8')).attempt, 2);
});

test('an absolute Windows root does not produce a mixed-separator path', async () => {
  // path.join, not template interpolation. fs tolerates a mixed-separator path; a
  // test comparing strings does not, and neither does anyone reading a timeline.
  const run = await isolatedRun('root-sep');
  const ref = run.trace.artifactRef('job-0000000001', 2, 'normalised', 'jpg');

  assert.equal(ref.includes(String.fromCharCode(92)), false, `the ref carries a backslash: ${ref}`);
  assert.match(ref, /\/job-0000000001\/s2-normalised\.jpg$/);
});
