// server/src/jobs/stageTrace.js
//
// The append-only stage-trace writer — CONTRACT.md §11.0 and §11's three rules.
//
// jobStore.appendStage already guarantees rule 1 at the storage layer: a push,
// never an edit. This module is the layer above it, and its job is the part
// rule 1 alone does not give you — that a stage *running at all* produces a
// record with its input and its output persisted beside it.
//
// §11's three rules, and what each one costs here:
//
//   1. "Stage records are append-only. A retry appends; it never overwrites."
//      runStage never looks for an existing record of the same stage number.
//      Running stage 3 twice produces two stage-3 records, in order. The
//      timeline reads them as attempts, which is what makes a retry visible
//      instead of merely survivable.
//
//   2. "Every stage persists its input and output as artifacts, referenced by
//      path." This is why runStage owns the call rather than the caller: a
//      stage that writes its own record can forget an artifact, and a missing
//      inputRef is only discovered later, by whoever tries to replay it. Here
//      the write is not optional — the input artifact is persisted BEFORE the
//      stage runs, so a stage that throws still leaves a replayable input.
//
//   3. "Every stage is a pure function from a persisted input to a persisted
//      output. No stage reaches around the trace for state." runStage passes
//      the input in and takes the output back. It gives the stage function no
//      handle on the job, the store, or any other stage's record.
//
// §11.2 owns the path shape: artifacts live under
// `artifacts/<jobId>/<stage>-<name>.<ext>`, on the Node machine, written by
// Node. The Python service never writes artifacts — it returns stage output
// inline and Node persists it — because a relative path written on the
// perception laptop resolves to nothing anywhere else.
//
// The §16.2 seam. A stage may call a hosted model, and §16.2 requires every
// such call to append `{ purpose, model, ms, attempts, ok }` to the stage-5
// record. runStage hands the stage function an `appendModelTrace` collector
// and folds what it gathers into that stage's record as `modelCalls`. Wire it
// with: createOrchestrator({ appendTrace: ctx.appendModelTrace }).

import fs from 'node:fs/promises';
import path from 'node:path';

import { STAGE_NAMES } from './jobStore.js';

export const ARTIFACT_ROOT = 'artifacts';

/**
 * A stage that could not do its real work but did not stop the pipeline.
 * §11.1: "degraded means the stage did not do its real work but the pipeline
 * continued — the perception service being unreachable is the canonical case.
 * It is a success for the job and a warning for the stage."
 *
 * Thrown by a stage function, carrying whatever it wants recorded as output.
 */
export class StageDegraded extends Error {
  constructor(reason, fallback = null) {
    super(reason);
    this.name = 'StageDegraded';
    this.reason = reason;
    this.fallback = fallback;
  }
}

/**
 * §11.2 — artifacts/<jobId>/s<stage>-<name>.<ext>.
 *
 * ATTEMPT DISAMBIGUATION, and why it is not in §11.2. Rule 1 says a retry
 * appends a record; §11.2 gives a path built only from jobId, stage and name.
 * Those two cannot both hold as written: a second attempt at stage 3 derives
 * the same path as the first, overwrites its artifacts, and the preserved
 * first record is left pointing at the second attempt's data. The record
 * survives and quietly describes something that is no longer there — which is
 * worse than losing it, because the timeline still renders.
 *
 * So attempt 1 uses §11.2's shape exactly, matching the contract's own example
 * (`s2-normalised.png`), and only a retry adds a discriminator:
 * `s3a2-regions.json`. Logged in docs/corrections/REGISTER.md.
 */
export function artifactRef(jobId, stage, name, ext = 'json', attempt = 1) {
  if (!/^job-\d{10}$/.test(jobId)) throw new Error('Invalid jobId');
  const suffix = attempt > 1 ? `a${attempt}` : '';
  return `${ARTIFACT_ROOT}/${jobId}/s${stage}${suffix}-${name}.${ext}`;
}

/** JSON unless it is already bytes or text; keeps images and JSX intact. */
function serialise(data, ext) {
  if (data instanceof Uint8Array || Buffer.isBuffer(data)) return data;
  if (ext === 'json') return JSON.stringify(data ?? null, null, 2);
  return typeof data === 'string' ? data : String(data ?? '');
}

/** The default artifact sink: the local disk, per §11.2. */
async function defaultWriteArtifact({ ref, data, ext }) {
  await fs.mkdir(path.dirname(ref), { recursive: true });
  await fs.writeFile(ref, serialise(data, ext));
  return ref;
}

/**
 * createStageTrace({ jobStore, writeArtifact, now })
 *
 * `writeArtifact` is injectable so tests never touch the disk and so T-082's
 * object-storage adapter can replace the sink without this file changing.
 * `now` is injectable so timings are deterministic under test.
 */
export function createStageTrace({
  jobStore,
  writeArtifact = defaultWriteArtifact,
  now = () => Date.now(),
  clock = () => new Date().toISOString(),
} = {}) {
  if (!jobStore || typeof jobStore.appendStage !== 'function') {
    throw new Error('createStageTrace: a jobStore with appendStage is required');
  }

  async function persist(jobId, stage, name, data, ext, attempt) {
    const ref = artifactRef(jobId, stage, name, ext, attempt);
    await writeArtifact({ ref, data, ext, jobId, stage, name, attempt });
    return ref;
  }

  /**
   * Which attempt at this stage is about to run — 1 for the first, 2 for a
   * retry, and so on. Read from the trace itself rather than tracked in
   * memory, so a retry issued by a different process or after a restart still
   * numbers correctly.
   */
  async function nextAttempt(jobId, stage) {
    if (typeof jobStore.getJob !== 'function') return 1;
    const job = await jobStore.getJob(jobId);
    return attemptsFor(job, stage).length + 1;
  }

  /**
   * runStage(jobId, options) -> { status, output, record, job }
   *
   * options:
   *   stage       1-7, per §11.0. `name` is derived from it, never passed.
   *   input       persisted as the input artifact BEFORE `run` is called.
   *   run         async (input, ctx) => output. ctx carries appendModelTrace
   *               and addWarning. It receives no handle on the job or store,
   *               per §11 rule 3.
   *   inputName   artifact basename, default "input".
   *   outputName  artifact basename, default "output".
   *   inputExt    default "json". Use "png" for stage-2 imagery, "jsx" for source.
   *   outputExt   default "json".
   *   model       recorded on the stage record when the stage used one.
   *   confidence  0-1 or null. §10: null is the honest value for a stage that
   *               scored nothing; a fabricated number is forbidden.
   *
   * Never throws for a stage failure — it records `failed` and returns. It
   * throws only if the trace itself cannot be written, because a pipeline that
   * silently loses its trace is worse than one that stops.
   */
  async function runStage(jobId, options = {}) {
    const {
      stage,
      input = null,
      run,
      inputName = 'input',
      outputName = 'output',
      inputExt = 'json',
      outputExt = 'json',
      model,
      confidence,
    } = options;

    if (!Number.isInteger(stage) || !STAGE_NAMES[stage]) {
      throw new Error(`runStage: stage must be an integer 1-7 (§11.0), got ${JSON.stringify(stage)}`);
    }
    if (typeof run !== 'function') {
      throw new Error('runStage: `run` must be a function');
    }

    const attempt = await nextAttempt(jobId, stage);

    // Rule 2, first half — the input is persisted BEFORE the stage runs, so a
    // stage that throws still leaves something replayable behind it.
    const inputRef = await persist(jobId, stage, inputName, input, inputExt, attempt);

    const modelCalls = [];
    const warnings = [];
    const ctx = {
      appendModelTrace: (trace) => {
        // §16.2's shape, copied so a later mutation by the caller cannot
        // rewrite a recorded call. §11's append-only rule in miniature.
        modelCalls.push({ ...trace });
      },
      addWarning: (message) => warnings.push(String(message)),
    };

    const startedAt = clock();
    const started = now();

    let status = 'ok';
    let output = null;

    try {
      output = await run(input, ctx);
    } catch (err) {
      if (err instanceof StageDegraded) {
        status = 'degraded';
        output = err.fallback;
        warnings.push(err.reason);
      } else {
        status = 'failed';
        output = null;
        warnings.push(err && err.message ? err.message : String(err));
      }
    }

    const ms = Math.max(0, now() - started);

    // Rule 2, second half — the output is persisted for every terminal status,
    // `failed` included. A failed stage's output artifact records the null,
    // which is what lets the timeline show that the stage produced nothing
    // rather than that nobody looked.
    const outputRef = await persist(jobId, stage, outputName, output, outputExt, attempt);

    const record = {
      stage,
      name: STAGE_NAMES[stage],
      status,
      startedAt,
      ms,
      attempt,
      inputRef,
      outputRef,
      warnings,
    };
    if (model !== undefined) record.model = model;
    if (confidence !== undefined) record.confidence = confidence;
    if (modelCalls.length > 0) record.modelCalls = modelCalls;

    // Rule 1 — a push. jobStore.appendStage never edits an existing record,
    // so a retry of this stage lands beside its predecessor.
    const job = await jobStore.appendStage(jobId, record);

    return { status, output, record, job };
  }

  /**
   * skipStage(jobId, { stage, reason }) -> { record, job }
   *
   * §11.1's `skipped`. Still carries inputRef and outputRef, because §11 rule 2
   * admits no exception and because a replay needs to know a skipped stage had
   * nothing rather than that its artifacts went missing.
   */
  async function skipStage(jobId, { stage, reason = 'stage skipped' } = {}) {
    if (!Number.isInteger(stage) || !STAGE_NAMES[stage]) {
      throw new Error(`skipStage: stage must be an integer 1-7 (§11.0), got ${JSON.stringify(stage)}`);
    }
    const attempt = await nextAttempt(jobId, stage);
    const inputRef = await persist(jobId, stage, 'input', null, 'json', attempt);
    const outputRef = await persist(jobId, stage, 'output', null, 'json', attempt);

    const record = {
      stage,
      name: STAGE_NAMES[stage],
      status: 'skipped',
      startedAt: clock(),
      ms: 0,
      attempt,
      inputRef,
      outputRef,
      warnings: [String(reason)],
    };

    const job = await jobStore.appendStage(jobId, record);
    return { record, job };
  }

  /**
   * attemptsFor(job, stage) — every record for one stage number, in order.
   * The timeline reads a retry off this: two entries means two attempts.
   */
  function attemptsFor(job, stage) {
    return (job?.stages || []).filter((s) => s.stage === stage);
  }

  return { runStage, skipStage, attemptsFor, artifactRef };
}

export default createStageTrace;
