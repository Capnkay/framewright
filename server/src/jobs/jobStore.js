// server/src/jobs/jobStore.js
//
// The Glass Box's foundation — CONTRACT.md §11 and §11.1.
//
// Every generation is a job, and every stage appends one immutable trace
// record. This module owns the job record's lifecycle and enforces the two
// things §11 will not bend on:
//
//   1. The closed status sets (§11.1). Both the studio progress UI and the
//      timeline switch on them, so a sixth job status invented here silently
//      becomes a blank cell in someone else's `switch`.
//   2. Append-only stage records (§11 rule 1). A retried stage appends a
//      SECOND record for the same stage number. It never overwrites the first
//      — that history is what makes replay auditable and what lets a judge see
//      a stage fail and then recover.
//
// Zero dependencies, on the same reasoning as the rest of the server: the
// route table, the store and this module import nothing, so `npm test` runs on
// a fresh clone with no `npm install`. The Ajv validator for
// ../schemas/job.schema.json arrives with the §2/§3/§6 schema tasks; the checks
// here are hand-written so the verification does not wait on that.
//
// jobId is NOT a §1 identifier. §1 governs sectionId, fieldId and fieldIdN. Job
// ids come from their own persisted counter, formatted `job-0000000001` — the
// prefix also keeps them clear of the §14 gate's quoted-10-digit range check.
// It is a persisted counter, never a random or clock-derived value, for the same
// reason §1 gives: two concurrent jobs must never receive the same value. The
// test suite greps this file to prove it, so do not reintroduce those calls even
// inside a comment.

import fs from 'node:fs/promises';

// --- the closed sets (§11.1, §11.0, §13) ---------------------------------

export const JOB_STATUSES = ['queued', 'running', 'awaiting-input', 'succeeded', 'failed'];

export const STAGE_STATUSES = ['pending', 'running', 'ok', 'degraded', 'failed', 'skipped'];

export const MODES = ['wireframe', 'code', 'prompt', 'combined'];

// §11.0's canonical numbering. This map is the single place the pairing lives;
// the contract states it exists precisely because "two people will number these
// differently unless the numbering lives here."
export const STAGE_NAMES = Object.freeze({
  1: 'input-acquisition',
  2: 'preprocessing-normalization',
  3: 'multimodal-understanding',
  4: 'semantic-planning-ir',
  5: 'code-generation-assembly',
  6: 'validation-qa',
  7: 'output-delivery',
});

// Stages 5, 6 and 7 replay without the perception machine; 2, 3 and 4 require
// it (§11.0). Exported because the replay endpoint (T-040) must return 422
// rather than hang for the second group, and it should not re-derive the split.
export const STAGES_REQUIRING_PERCEPTION = Object.freeze([2, 3, 4]);

export function formatJobId(counter) {
  return `job-${String(counter).padStart(10, '0')}`;
}

// --- validation -----------------------------------------------------------

function isIsoDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * validateStageRecord(record) -> string[] of errors, empty when valid.
 * Enforces the closed status set and the §11.0 stage/name pairing.
 */
export function validateStageRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['stage record must be an object'];
  }

  if (!Number.isInteger(record.stage) || record.stage < 1 || record.stage > 7) {
    errors.push(`stage must be an integer 1-7 (§11.0), got ${JSON.stringify(record.stage)}`);
  } else if (record.name !== STAGE_NAMES[record.stage]) {
    // The pairing is the point of §11.0 existing at all.
    errors.push(
      `stage ${record.stage} must be named "${STAGE_NAMES[record.stage]}" (§11.0), got ${JSON.stringify(record.name)}`,
    );
  }

  if (!STAGE_STATUSES.includes(record.status)) {
    errors.push(
      `stage status must be one of ${STAGE_STATUSES.join(' | ')} (§11.1), got ${JSON.stringify(record.status)}`,
    );
  }

  if (record.startedAt !== undefined && !isIsoDateString(record.startedAt)) {
    errors.push('startedAt must be an ISO date-time string');
  }
  if (record.ms !== undefined && (!Number.isInteger(record.ms) || record.ms < 0)) {
    errors.push('ms must be a non-negative integer');
  }
  if (
    record.confidence !== undefined &&
    record.confidence !== null &&
    (typeof record.confidence !== 'number' || record.confidence < 0 || record.confidence > 1)
  ) {
    // §10: null is the honest value for a stage that scored nothing. A
    // fabricated number is explicitly forbidden.
    errors.push('confidence must be null or a number between 0 and 1 (§10)');
  }
  if (record.warnings !== undefined && !Array.isArray(record.warnings)) {
    errors.push('warnings must be an array');
  }

  return errors;
}

/**
 * validateJob(doc) -> { ok, errors }
 * The hand-written stand-in for Ajv against ../schemas/job.schema.json.
 */
export function validateJob(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: ['job must be an object'] };
  }

  if (typeof doc.jobId !== 'string' || !/^job-[0-9]{10}$/.test(doc.jobId)) {
    errors.push(`jobId must match ^job-[0-9]{10}$, got ${JSON.stringify(doc.jobId)}`);
  }
  if (!JOB_STATUSES.includes(doc.status)) {
    errors.push(
      `status must be one of ${JOB_STATUSES.join(' | ')} (§11.1), got ${JSON.stringify(doc.status)}`,
    );
  }
  if (!MODES.includes(doc.mode)) {
    errors.push(`mode must be one of ${MODES.join(' | ')} (§13), got ${JSON.stringify(doc.mode)}`);
  }
  if (typeof doc.pageName !== 'string' || doc.pageName.length === 0) {
    errors.push('pageName must be a non-empty string');
  }
  // §11.1: sectionId defaults to null until assigned. Absent is NOT the same as
  // null — the key must be present so a reader can tell "not yet assigned" from
  // "this record predates the field".
  if (!('sectionId' in doc)) {
    errors.push('sectionId must be present, defaulting to null until assigned (§11.1)');
  } else if (doc.sectionId !== null && !/^1[0-9]{9}$/.test(String(doc.sectionId))) {
    errors.push(
      `sectionId must be null or a section-range id (§1), got ${JSON.stringify(doc.sectionId)}`,
    );
  }
  if (!isIsoDateString(doc.createdAt)) {
    errors.push('createdAt must be an ISO date-time string');
  }
  if (!Array.isArray(doc.stages)) {
    errors.push('stages must be an array');
  } else {
    doc.stages.forEach((record, index) => {
      for (const error of validateStageRecord(record)) {
        errors.push(`stages[${index}]: ${error}`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

// --- the store ------------------------------------------------------------

const EMPTY = { counters: { job: 1 }, jobs: [] };

/**
 * createJobStore({ filePath, now })
 *
 * File-backed, with the same single-writer queue the JSON store uses (§2.1's
 * atomicity reasoning applies to the job counter for the same reason it applies
 * to allocateId: a read-modify-write counter issues duplicates that look
 * perfectly valid).
 *
 * `now` is injectable so a test can pin timestamps. It is used ONLY for
 * createdAt/startedAt, never to derive an id.
 */
export function createJobStore({
  filePath = './server/data/jobs.json',
  now = () => new Date().toISOString(),
} = {}) {
  let queue = Promise.resolve();

  function enqueue(task) {
    const result = queue.then(task);
    // Never let one rejection wedge the queue for every later caller.
    queue = result.catch(() => {});
    return result;
  }

  async function readData() {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);
      return {
        counters: { job: parsed?.counters?.job ?? 1 },
        jobs: Array.isArray(parsed?.jobs) ? parsed.jobs : [],
      };
    } catch (err) {
      if (err.code === 'ENOENT') return structuredClone(EMPTY);
      throw err;
    }
  }

  async function writeData(data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  function findJob(data, jobId) {
    return data.jobs.find((job) => job.jobId === String(jobId)) || null;
  }

  return {
    /**
     * createJob({ mode, pageName, sectionId }) -> JobDoc
     * status starts at "queued" and sectionId at null (§11.1).
     */
    createJob({ mode, pageName = 'Home', sectionId = null } = {}) {
      return enqueue(async () => {
        if (!MODES.includes(mode)) {
          throw new Error(`createJob: mode must be one of ${MODES.join(' | ')} (§13), got ${JSON.stringify(mode)}`);
        }
        const data = await readData();
        const counter = data.counters.job;
        data.counters.job = counter + 1;

        const job = {
          jobId: formatJobId(counter),
          status: 'queued',
          mode,
          pageName,
          sectionId,
          createdAt: now(),
          stages: [],
        };

        const { ok, errors } = validateJob(job);
        if (!ok) throw new Error(`createJob produced an invalid job record: ${errors.join('; ')}`);

        data.jobs.push(job);
        await writeData(data);
        return structuredClone(job);
      });
    },

    /** getJob(jobId) -> JobDoc | null. Bare doc or null, per §13.4. */
    async getJob(jobId) {
      const data = await readData();
      const job = findJob(data, jobId);
      return job ? structuredClone(job) : null;
    },

    /** listJobs({ limit }) -> JobDoc[], newest first. Backs FR-G08's job history. */
    async listJobs({ limit } = {}) {
      const data = await readData();
      const newestFirst = [...data.jobs].reverse();
      const sliced = typeof limit === 'number' ? newestFirst.slice(0, limit) : newestFirst;
      return structuredClone(sliced);
    },

    /** setStatus(jobId, status) -> JobDoc | null. Rejects anything outside §11.1. */
    setStatus(jobId, status) {
      return enqueue(async () => {
        if (!JOB_STATUSES.includes(status)) {
          throw new Error(
            `setStatus: status must be one of ${JOB_STATUSES.join(' | ')} (§11.1), got ${JSON.stringify(status)}`,
          );
        }
        const data = await readData();
        const job = findJob(data, jobId);
        if (!job) return null;
        job.status = status;
        await writeData(data);
        return structuredClone(job);
      });
    },

    /** assignSection(jobId, sectionId) -> JobDoc | null. */
    assignSection(jobId, sectionId) {
      return enqueue(async () => {
        if (sectionId !== null && !/^1[0-9]{9}$/.test(String(sectionId))) {
          throw new Error(
            `assignSection: sectionId must be null or a section-range id (§1), got ${JSON.stringify(sectionId)}`,
          );
        }
        const data = await readData();
        const job = findJob(data, jobId);
        if (!job) return null;
        job.sectionId = sectionId === null ? null : String(sectionId);
        await writeData(data);
        return structuredClone(job);
      });
    },

    /**
     * setComponentFile(jobId, filePath) -> JobDoc | null.
     *
     * The path stage 7 actually wrote. `routes/artifacts.js` serves the emitted
     * source from this field, and it was never being set — the file was written,
     * the job said `componentFile: null`, and GET /api/jobs/:id/component
     * answered "generation not complete" about a job that had completed. §11.2.
     */
    setComponentFile(jobId, filePath) {
      return enqueue(async () => {
        if (typeof filePath !== 'string' || !filePath.trim()) {
          throw new Error(
            `setComponentFile: filePath must be a non-empty string, got ${JSON.stringify(filePath)}`,
          );
        }
        const data = await readData();
        const job = findJob(data, jobId);
        if (!job) return null;
        job.componentFile = filePath;
        await writeData(data);
        return structuredClone(job);
      });
    },

    /**
     * appendStage(jobId, record) -> JobDoc | null
     *
     * APPEND-ONLY (§11 rule 1). Re-running stage 3 pushes a second stage-3
     * record; the earlier one is never edited or removed. `name` is filled from
     * §11.0's map when omitted, and rejected when it contradicts the number.
     */
    appendStage(jobId, record) {
      return enqueue(async () => {
        const candidate = {
          ...record,
          name: record?.name ?? STAGE_NAMES[record?.stage],
          startedAt: record?.startedAt ?? now(),
          warnings: record?.warnings ?? [],
        };

        const errors = validateStageRecord(candidate);
        if (errors.length > 0) {
          throw new Error(`appendStage: invalid stage record: ${errors.join('; ')}`);
        }

        const data = await readData();
        const job = findJob(data, jobId);
        if (!job) return null;
        job.stages.push(candidate);
        await writeData(data);
        return structuredClone(job);
      });
    },
  };
}
