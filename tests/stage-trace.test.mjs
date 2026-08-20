import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { createStageTrace, StageDegraded, artifactRef, ARTIFACT_ROOT } from '../server/src/jobs/stageTrace.js';
import { createJobStore, STAGE_NAMES } from '../server/src/jobs/jobStore.js';
import { createOrchestrator } from '../server/src/models/orchestrator.js';

/** A job store on a scratch file, plus an in-memory artifact sink. */
async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'framewright-trace-'));
  const filePath = path.join(dir, 'jobs.json');
  const jobStore = createJobStore({ filePath });

  const artifacts = new Map();
  let tick = 0;

  const trace = createStageTrace({
    jobStore,
    writeArtifact: async ({ ref, data }) => {
      artifacts.set(ref, data);
      return ref;
    },
    // Deterministic timings: every now() advances 10ms.
    now: () => (tick += 10),
    clock: () => '2026-08-20T12:00:00.000Z',
  });

  const job = await jobStore.createJob({ mode: 'prompt', pageName: 'Home' });
  return { trace, jobStore, artifacts, jobId: job.jobId, cleanup: () => fs.rm(dir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------
// doneWhen 1 — a retried stage APPENDS, never overwrites.
// ---------------------------------------------------------------------

test('doneWhen — a retried stage appends a new record rather than overwriting the old one', async () => {
  const h = await harness();
  try {
    // First attempt fails.
    await h.trace.runStage(h.jobId, {
      stage: 3,
      input: { attempt: 1 },
      run: () => {
        throw new Error('perception exploded');
      },
    });
    // Retry succeeds.
    await h.trace.runStage(h.jobId, {
      stage: 3,
      input: { attempt: 2 },
      run: async () => ({ regions: 4 }),
    });

    const job = await h.jobStore.getJob(h.jobId);
    const attempts = h.trace.attemptsFor(job, 3);

    assert.equal(attempts.length, 2, 'two stage-3 records must exist');
    assert.equal(attempts[0].status, 'failed', 'the first record is untouched');
    assert.equal(attempts[1].status, 'ok');
    assert.ok(attempts[0].warnings.some((w) => /perception exploded/.test(w)));
    // The earlier record's artifacts still point at the first attempt's data.
    assert.notEqual(attempts[0].inputRef, undefined);
    assert.deepEqual(h.artifacts.get(attempts[0].outputRef), null);
    assert.deepEqual(h.artifacts.get(attempts[1].outputRef), { regions: 4 });
  } finally {
    await h.cleanup();
  }
});

test('three attempts at the same stage produce three records, in order', async () => {
  const h = await harness();
  try {
    for (let i = 1; i <= 3; i += 1) {
      await h.trace.runStage(h.jobId, { stage: 5, input: { i }, run: async () => ({ i }) });
    }
    const job = await h.jobStore.getJob(h.jobId);
    const attempts = h.trace.attemptsFor(job, 5);
    assert.equal(attempts.length, 3);
    assert.deepEqual(attempts.map((a) => h.artifacts.get(a.inputRef)), [{ i: 1 }, { i: 2 }, { i: 3 }]);
  } finally {
    await h.cleanup();
  }
});

test('appending a later stage never disturbs an earlier one', async () => {
  const h = await harness();
  try {
    await h.trace.runStage(h.jobId, { stage: 1, input: { a: 1 }, run: async () => ({ ok: 1 }) });
    const afterFirst = await h.jobStore.getJob(h.jobId);
    const snapshot = structuredClone(afterFirst.stages[0]);

    await h.trace.runStage(h.jobId, { stage: 2, input: { b: 2 }, run: async () => ({ ok: 2 }) });
    const afterSecond = await h.jobStore.getJob(h.jobId);

    assert.deepEqual(afterSecond.stages[0], snapshot, 'the stage-1 record is byte-identical afterwards');
    assert.equal(afterSecond.stages.length, 2);
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// doneWhen 2 — every record carries inputRef and outputRef.
// ---------------------------------------------------------------------

test('doneWhen — every record carries inputRef and outputRef, for every status', async () => {
  const h = await harness();
  try {
    await h.trace.runStage(h.jobId, { stage: 1, input: { x: 1 }, run: async () => ({ y: 1 }) }); // ok
    await h.trace.runStage(h.jobId, { stage: 2, input: { x: 2 }, run: () => { throw new Error('boom'); } }); // failed
    await h.trace.runStage(h.jobId, {
      stage: 3,
      input: { x: 3 },
      run: () => { throw new StageDegraded('perception unreachable', { fallback: true }); },
    }); // degraded
    await h.trace.skipStage(h.jobId, { stage: 4, reason: 'no wireframe supplied' }); // skipped

    const job = await h.jobStore.getJob(h.jobId);
    assert.equal(job.stages.length, 4);

    for (const record of job.stages) {
      assert.equal(typeof record.inputRef, 'string', `stage ${record.stage} must carry inputRef`);
      assert.equal(typeof record.outputRef, 'string', `stage ${record.stage} must carry outputRef`);
      assert.ok(record.inputRef.length > 0);
      assert.ok(record.outputRef.length > 0);
      assert.ok(h.artifacts.has(record.inputRef), 'the input artifact must actually have been written');
      assert.ok(h.artifacts.has(record.outputRef), 'the output artifact must actually have been written');
    }

    assert.deepEqual(job.stages.map((s) => s.status), ['ok', 'failed', 'degraded', 'skipped']);
  } finally {
    await h.cleanup();
  }
});

test('the input artifact is persisted even when the stage throws — a failure stays replayable', async () => {
  const h = await harness();
  try {
    const { record } = await h.trace.runStage(h.jobId, {
      stage: 5,
      input: { theIrThatBrokeIt: true },
      run: () => { throw new Error('emitter crashed'); },
    });
    assert.equal(record.status, 'failed');
    assert.deepEqual(h.artifacts.get(record.inputRef), { theIrThatBrokeIt: true });
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// §11.2 — the artifact path shape.
// ---------------------------------------------------------------------

test('artifact refs follow §11.2 — artifacts/<jobId>/s<stage>-<name>.<ext>', () => {
  assert.equal(artifactRef('job-0000000001', 3, 'regions'), 'artifacts/job-0000000001/s3-regions.json');
  assert.equal(artifactRef('job-0000000001', 2, 'normalised', 'png'), 'artifacts/job-0000000001/s2-normalised.png');
  assert.equal(ARTIFACT_ROOT, 'artifacts');
});

test('a retry gets its own artifact paths — otherwise the first record points at the second attempt data', async () => {
  const h = await harness();
  try {
    const first = await h.trace.runStage(h.jobId, { stage: 3, input: { try: 1 }, run: async () => ({ out: 1 }) });
    const second = await h.trace.runStage(h.jobId, { stage: 3, input: { try: 2 }, run: async () => ({ out: 2 }) });

    assert.equal(first.record.attempt, 1);
    assert.equal(second.record.attempt, 2);
    // Attempt 1 keeps §11.2's documented shape exactly; only the retry differs.
    assert.equal(first.record.inputRef, `artifacts/${h.jobId}/s3-input.json`);
    assert.equal(second.record.inputRef, `artifacts/${h.jobId}/s3a2-input.json`);

    // The point of all of it: attempt 1's artifacts still hold attempt 1's data.
    assert.deepEqual(h.artifacts.get(first.record.inputRef), { try: 1 });
    assert.deepEqual(h.artifacts.get(first.record.outputRef), { out: 1 });
    assert.deepEqual(h.artifacts.get(second.record.inputRef), { try: 2 });
    assert.deepEqual(h.artifacts.get(second.record.outputRef), { out: 2 });
  } finally {
    await h.cleanup();
  }
});

test('attempt numbering is read from the trace, so it survives a restart', async () => {
  const h = await harness();
  try {
    await h.trace.runStage(h.jobId, { stage: 5, input: {}, run: async () => ({}) });

    // A second writer over the same store — a different process, or after a
    // restart. It must not begin numbering at 1 again and clobber the first.
    const other = createStageTrace({
      jobStore: h.jobStore,
      writeArtifact: async ({ ref, data }) => {
        h.artifacts.set(ref, data);
        return ref;
      },
    });
    const { record } = await other.runStage(h.jobId, { stage: 5, input: { late: true }, run: async () => ({}) });

    assert.equal(record.attempt, 2);
    assert.equal(record.inputRef, `artifacts/${h.jobId}/s5a2-input.json`);
  } finally {
    await h.cleanup();
  }
});

test('refs are scoped per job, so two jobs never collide', async () => {
  const h = await harness();
  try {
    const second = await h.jobStore.createJob({ mode: 'prompt' });
    const a = await h.trace.runStage(h.jobId, { stage: 1, input: { j: 'a' }, run: async () => 1 });
    const b = await h.trace.runStage(second.jobId, { stage: 1, input: { j: 'b' }, run: async () => 2 });

    assert.notEqual(a.record.inputRef, b.record.inputRef);
    assert.ok(a.record.inputRef.includes(h.jobId));
    assert.ok(b.record.inputRef.includes(second.jobId));
  } finally {
    await h.cleanup();
  }
});

test('a non-json artifact is written verbatim, not JSON-wrapped', async () => {
  const h = await harness();
  try {
    const jsx = 'export default function Hero() { return null; }';
    const { record } = await h.trace.runStage(h.jobId, {
      stage: 5,
      input: {},
      run: async () => jsx,
      outputName: 'component',
      outputExt: 'jsx',
    });
    assert.equal(record.outputRef, `artifacts/${h.jobId}/s5-component.jsx`);
    assert.equal(h.artifacts.get(record.outputRef), jsx);
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// §11.0 — the stage/name pairing, and §11.1's closed status set.
// ---------------------------------------------------------------------

test('the stage name is derived from §11.0 and never supplied by the caller', async () => {
  const h = await harness();
  try {
    for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
      const { record } = await h.trace.runStage(h.jobId, { stage, input: {}, run: async () => ({}) });
      assert.equal(record.name, STAGE_NAMES[stage], `stage ${stage} must be named per §11.0`);
    }
  } finally {
    await h.cleanup();
  }
});

test('an out-of-range stage number is rejected outright', async () => {
  const h = await harness();
  try {
    for (const bad of [0, 8, -1, 3.5, '3', null, undefined]) {
      await assert.rejects(
        () => h.trace.runStage(h.jobId, { stage: bad, input: {}, run: async () => ({}) }),
        /stage must be an integer 1-7/,
      );
    }
  } finally {
    await h.cleanup();
  }
});

test('a missing run function is rejected rather than silently recorded as ok', async () => {
  const h = await harness();
  try {
    await assert.rejects(() => h.trace.runStage(h.jobId, { stage: 1, input: {} }), /`run` must be a function/);
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// §11.1 — degraded is a success for the job, a warning for the stage.
// ---------------------------------------------------------------------

test('StageDegraded records degraded, keeps the fallback output, and warns', async () => {
  const h = await harness();
  try {
    const { status, output, record } = await h.trace.runStage(h.jobId, {
      stage: 3,
      input: { image: 'x' },
      run: () => { throw new StageDegraded('perception service unreachable', { regions: [] }); },
    });

    assert.equal(status, 'degraded');
    assert.deepEqual(output, { regions: [] }, 'the pipeline continues with the fallback');
    assert.ok(record.warnings.includes('perception service unreachable'));
    assert.deepEqual(h.artifacts.get(record.outputRef), { regions: [] });
  } finally {
    await h.cleanup();
  }
});

test('a stage failure is recorded, not thrown — the caller decides what to do', async () => {
  const h = await harness();
  try {
    const result = await h.trace.runStage(h.jobId, {
      stage: 6,
      input: {},
      run: () => { throw new Error('lint failed'); },
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.output, null);
    assert.ok(result.record.warnings.some((w) => /lint failed/.test(w)));
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// §11 rule 3 — a stage is a pure function from persisted input to output.
// ---------------------------------------------------------------------

test('the stage function receives the input and a context, and no handle on the job or store', async () => {
  const h = await harness();
  try {
    let seenInput;
    let seenCtxKeys;
    await h.trace.runStage(h.jobId, {
      stage: 4,
      input: { ir: 'v1' },
      run: async (input, ctx) => {
        seenInput = input;
        seenCtxKeys = Object.keys(ctx).sort();
        return {};
      },
    });

    assert.deepEqual(seenInput, { ir: 'v1' });
    assert.deepEqual(seenCtxKeys, ['addWarning', 'appendModelTrace']);
  } finally {
    await h.cleanup();
  }
});

test('a stage can add its own warnings through the context', async () => {
  const h = await harness();
  try {
    const { record } = await h.trace.runStage(h.jobId, {
      stage: 4,
      input: {},
      run: async (_input, ctx) => {
        ctx.addWarning('accent overridden by prompt');
        return {};
      },
    });
    assert.deepEqual(record.warnings, ['accent overridden by prompt']);
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// The §16.2 seam — model calls fold into the stage record.
// ---------------------------------------------------------------------

test('§16.2 model-call traces are folded into the stage record as modelCalls', async () => {
  const h = await harness();
  try {
    const { record } = await h.trace.runStage(h.jobId, {
      stage: 5,
      input: { ir: {} },
      model: 'test-model',
      run: async (_input, ctx) => {
        // The real wiring: the orchestrator's appendTrace is the stage's collector.
        const { callModel } = createOrchestrator({
          env: { LLM_API_KEY: 'k', LLM_MODEL: 'test-model' },
          appendTrace: ctx.appendModelTrace,
          transport: async () => ({ name: 'ok' }),
        });
        await callModel({ purpose: 'prompt-to-ir', input: 'p', schema: { type: 'object' } });
        return { emitted: true };
      },
    });

    assert.equal(record.model, 'test-model');
    assert.equal(record.modelCalls.length, 1);
    assert.deepEqual(Object.keys(record.modelCalls[0]).sort(), ['attempts', 'model', 'ms', 'ok', 'purpose']);
    assert.equal(record.modelCalls[0].purpose, 'prompt-to-ir');
    assert.equal(record.modelCalls[0].ok, true);
  } finally {
    await h.cleanup();
  }
});

test('a keyless model call still traces, with ok:false and zero attempts', async () => {
  const h = await harness();
  try {
    const { record } = await h.trace.runStage(h.jobId, {
      stage: 5,
      input: {},
      run: async (_input, ctx) => {
        const { callModel } = createOrchestrator({ env: {}, appendTrace: ctx.appendModelTrace });
        await callModel({ purpose: 'prompt-to-ir', input: 'p' });
        return {};
      },
    });
    assert.equal(record.modelCalls[0].ok, false);
    assert.equal(record.modelCalls[0].attempts, 0);
  } finally {
    await h.cleanup();
  }
});

test('a recorded model call cannot be rewritten by mutating the object afterwards', async () => {
  const h = await harness();
  try {
    const mutable = { purpose: 'p', model: 'm', ms: 1, attempts: 1, ok: true };
    const { record } = await h.trace.runStage(h.jobId, {
      stage: 5,
      input: {},
      run: async (_input, ctx) => {
        ctx.appendModelTrace(mutable);
        mutable.ok = false;
        mutable.attempts = 99;
        return {};
      },
    });
    assert.equal(record.modelCalls[0].ok, true, '§11 append-only: a written record is not editable later');
    assert.equal(record.modelCalls[0].attempts, 1);
  } finally {
    await h.cleanup();
  }
});

test('a stage that makes no model call carries no modelCalls key', async () => {
  const h = await harness();
  try {
    const { record } = await h.trace.runStage(h.jobId, { stage: 1, input: {}, run: async () => ({}) });
    assert.equal('modelCalls' in record, false);
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// Timing and §10's honesty rule about confidence.
// ---------------------------------------------------------------------

test('ms is a non-negative integer and startedAt is an ISO string', async () => {
  const h = await harness();
  try {
    const { record } = await h.trace.runStage(h.jobId, { stage: 1, input: {}, run: async () => ({}) });
    assert.ok(Number.isInteger(record.ms) && record.ms >= 0);
    assert.ok(!Number.isNaN(Date.parse(record.startedAt)));
  } finally {
    await h.cleanup();
  }
});

test('confidence is recorded only when supplied, and null is allowed — §10', async () => {
  const h = await harness();
  try {
    const without = await h.trace.runStage(h.jobId, { stage: 1, input: {}, run: async () => ({}) });
    assert.equal('confidence' in without.record, false);

    const nulled = await h.trace.runStage(h.jobId, { stage: 3, input: {}, run: async () => ({}), confidence: null });
    assert.equal(nulled.record.confidence, null);

    const scored = await h.trace.runStage(h.jobId, { stage: 3, input: {}, run: async () => ({}), confidence: 0.88 });
    assert.equal(scored.record.confidence, 0.88);
  } finally {
    await h.cleanup();
  }
});

test('an out-of-band confidence is rejected by the store rather than recorded', async () => {
  const h = await harness();
  try {
    await assert.rejects(
      () => h.trace.runStage(h.jobId, { stage: 3, input: {}, run: async () => ({}), confidence: 1.5 }),
      /confidence/,
    );
  } finally {
    await h.cleanup();
  }
});

// ---------------------------------------------------------------------
// Construction.
// ---------------------------------------------------------------------

test('createStageTrace requires a job store with appendStage', () => {
  assert.throws(() => createStageTrace(), /jobStore with appendStage is required/);
  assert.throws(() => createStageTrace({ jobStore: {} }), /jobStore with appendStage is required/);
});

test('runStage against an unknown job returns a null job rather than throwing', async () => {
  const h = await harness();
  try {
    const { job, record } = await h.trace.runStage('job-0000009999', { stage: 1, input: {}, run: async () => ({}) });
    assert.equal(job, null);
    assert.equal(record.stage, 1, 'the record is still built, so the caller can see what was attempted');
  } finally {
    await h.cleanup();
  }
});
