// server/src/routes/index.js
//
// The route table for every endpoint the contract defines, as shaped stubs.
// CONTRACT.md §13 (the public API table), §13.4 (read endpoints and the envelope
// convention), §11.2 (artifact and component retrieval), §11.3 (human in the
// loop) and §17.2 (metrics).
//
// DEPENDENCY-FREE ON PURPOSE. Nothing here imports Express. A handler is a pure
// function `(ctx) -> { status, body }` where `ctx` is a plain object:
//
//     { params, query, body, files }
//
// server/src/app.js maps this table onto Express and does nothing else of
// substance. That split is what lets tests/api-skeleton.test.mjs exercise every
// route's shape, status code and validation with a bare `node --test` on a fresh
// clone — no `npm install`, which is the property the whole repo is built around.
//
// WHAT IS REAL HERE AND WHAT IS NOT. The envelope kind, the status codes, the
// param and query validation, and the /api/health body are real and final —
// they are the seam four people build against, and getting them wrong is how
// §9's dead store happens. The business logic is not: each handler returns 501
// naming the task that fills it in.

import {
  ok,
  collection,
  document,
  badRequest,
  notImplemented,
  STATUS,
  ERROR_CODE,
  error,
} from '../http/envelope.js';
import { sanitiseGenerateBody } from '../sanitise/sanitiseWrite.js';

// --- validation helpers ----------------------------------------------------

/** §1: exactly 10 digits, as a string. The leading digit is the range marker. */
const TEN_DIGITS = /^\d{10}$/;

/** §11: job ids are `job-` followed by 10 digits, per §11.1's sample record. */
const JOB_ID = /^job-\d{10}$/;

function isSectionId(value) {
  return typeof value === 'string' && TEN_DIGITS.test(value) && value.startsWith('1');
}

/**
 * A field id is either an element id (2…) or a nested card field id (3…).
 * Both are accepted here: §13.2 is explicit that patching a nested card field
 * directly "also works, and must", because the side-editor edits one field at a
 * time and the §9 step-5 assertion depends on it. Rejecting 3… ids here makes
 * card fields uneditable and quietly fails the store-liveness gate's most
 * important step.
 */
function isFieldId(value) {
  return (
    typeof value === 'string' &&
    TEN_DIGITS.test(value) &&
    (value.startsWith('2') || value.startsWith('3'))
  );
}

// --- handlers --------------------------------------------------------------

/**
 * GET /api/health — §13.4.
 * Shape: { ok, store, perception }. Reports perception as "down" rather than
 * failing: its absence is a supported state, not an error (§12).
 *
 * This one is NOT a stub. It is the liveness surface the whole team and the
 * demo rely on, and it can be answered truthfully today.
 */
export function getHealth(ctx = {}) {
  const env = ctx.env || {};
  return {
    status: STATUS.OK,
    body: ok({
      store: env.MONGODB_URI ? 'mongo' : 'json',
      // Wired to a real probe at T-058, when Node first calls /perceive.
      // Until then the honest answer is "down", never a fabricated "up".
      perception: 'down',
    }),
  };
}

/** GET /api/metrics — §17.2. Prometheus text format; no server required. */
export function getMetrics() {
  return notImplemented('T-087', 'GET /api/metrics');
}

import { postGenerate } from './generate.js';
export { postGenerate };

import { getSections, getSection } from './sections.js';
export { getSections, getSection };

/**
 * GET /api/elements — §13.4. Bare array.
 * At least one query parameter is required; an unfiltered request is 400.
 */
export function getElements(ctx = {}) {
  const query = ctx.query || {};
  const filters = ['pageName', 'sectionId', 'fieldIds'].filter((key) => query[key]);

  if (filters.length === 0) {
    return badRequest(
      'At least one of pageName, sectionId, or fieldIds is required (§13.4). ' +
        'An unfiltered request would return the whole store.',
    );
  }

  return { status: STATUS.OK, body: collection([]) };
}

/** PATCH /api/elements/:fieldId — §13.2. */
export function patchElement(ctx = {}) {
  const { fieldId } = ctx.params || {};
  const body = ctx.body || {};

  if (!isFieldId(fieldId)) {
    return badRequest('fieldId must be a 10-digit string in the 2… or 3… range (§1).');
  }

  // §13.2: both content and css are optional, at least one is required. `loop`
  // joins them because a Cards element is patched through its loop, not content.
  const provided = ['content', 'css', 'loop'].filter((key) => key in body);
  if (provided.length === 0) {
    return badRequest('At least one of content, css, or loop is required (§13.2).');
  }

  return notImplemented('T-016', 'PATCH /api/elements/:fieldId');
}

/** POST /api/sections/:sectionId/regenerate — §13.3. */
export function postRegenerate(ctx = {}) {
  const { sectionId } = ctx.params || {};
  if (!isSectionId(sectionId)) {
    return badRequest('sectionId must be a 10-digit string in the 1… range (§1).');
  }
  return notImplemented('T-041', 'POST /api/sections/:sectionId/regenerate');
}

import { getJob } from './jobs.js';
export { getJob };

import { postReplay } from './replay.js';
export { postReplay };

/** GET /api/jobs/:jobId/artifacts/:name — §11.2. */
export function getArtifact(ctx = {}) {
  const { jobId } = ctx.params || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }
  return notImplemented('T-037', 'GET /api/jobs/:jobId/artifacts/:name');
}

/** GET /api/jobs/:jobId/component — §11.2. text/plain, the generated JSX. */
export function getComponentSource(ctx = {}) {
  const { jobId } = ctx.params || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }
  return notImplemented('T-037', 'GET /api/jobs/:jobId/component');
}

/** GET /api/jobs/:jobId/questions — §11.3. Bare array. */
export function getQuestions(ctx = {}) {
  const { jobId } = ctx.params || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }
  return { status: STATUS.OK, body: collection([]) };
}

/** POST /api/jobs/:jobId/answers — §11.3. */
export function postAnswers(ctx = {}) {
  const { jobId } = ctx.params || {};
  const body = ctx.body || {};

  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    return badRequest('jobId must match job-<10 digits> (§11.1).');
  }
  if (!Array.isArray(body.answers) || body.answers.length === 0) {
    return badRequest('answers is required and must be a non-empty array (§11.3).');
  }

  return notImplemented('T-065', 'POST /api/jobs/:jobId/answers');
}

// --- the table -------------------------------------------------------------

/**
 * `kind` records which half of §13.4's envelope convention a route obeys, so the
 * test can assert it mechanically rather than by reading each handler:
 *
 *   action     -> { ok, ... } on success
 *   collection -> a bare array
 *   document   -> a bare document, or 404
 *   raw        -> its own content type (§11.2's artifact and component reads)
 */
export const routes = [
  { method: 'GET', path: '/api/health', kind: 'action', contract: '§13.4', handler: getHealth },
  { method: 'GET', path: '/api/metrics', kind: 'raw', contract: '§17.2', handler: getMetrics },

  { method: 'POST', path: '/api/generate', kind: 'action', contract: '§13.1', handler: postGenerate },

  { method: 'GET', path: '/api/sections', kind: 'collection', contract: '§13.4', handler: getSections },
  { method: 'GET', path: '/api/sections/:sectionId', kind: 'document', contract: '§13.4', handler: getSection },
  { method: 'POST', path: '/api/sections/:sectionId/regenerate', kind: 'action', contract: '§13.3', handler: postRegenerate },

  { method: 'GET', path: '/api/elements', kind: 'collection', contract: '§13.4', handler: getElements },
  { method: 'PATCH', path: '/api/elements/:fieldId', kind: 'action', contract: '§13.2', handler: patchElement },

  { method: 'GET', path: '/api/jobs/:jobId', kind: 'document', contract: '§13.4', handler: getJob },
  { method: 'POST', path: '/api/jobs/:jobId/replay', kind: 'action', contract: '§11', handler: postReplay },
  { method: 'GET', path: '/api/jobs/:jobId/artifacts/:name', kind: 'raw', contract: '§11.2', handler: getArtifact },
  { method: 'GET', path: '/api/jobs/:jobId/component', kind: 'raw', contract: '§11.2', handler: getComponentSource },
  { method: 'GET', path: '/api/jobs/:jobId/questions', kind: 'collection', contract: '§11.3', handler: getQuestions },
  { method: 'POST', path: '/api/jobs/:jobId/answers', kind: 'action', contract: '§11.3', handler: postAnswers },
];

/** The nine rows of §13's public API table, by `METHOD path`. */
export const SECTION_13_TABLE = [
  'POST /api/generate',
  'GET /api/sections',
  'GET /api/sections/:sectionId',
  'GET /api/elements',
  'PATCH /api/elements/:fieldId',
  'POST /api/sections/:sectionId/regenerate',
  'GET /api/jobs/:jobId',
  'POST /api/jobs/:jobId/replay',
  'GET /api/health',
];

export default routes;
