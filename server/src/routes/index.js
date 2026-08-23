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
export async function getHealth(ctx = {}) {
  const env = ctx.env || {};
  let perception = 'down';
  // §12 and .env.example both make the perception service's location
  // configurable; probing a hardcoded localhost:8000 reports "down" for every
  // deployment that moved it, which is a fabricated answer in the one field
  // §13.4 exists to report honestly.
  const base = String(env.PERCEPTION_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) perception = 'up';
  } catch (e) {
    // down — §12 makes an absent perception service a supported state.
  }
  return {
    status: STATUS.OK,
    body: ok({
      store: env.MONGODB_URI ? 'mongo' : 'json',
      perception,
    }),
  };
}


import { postGenerate } from './generate.js';
export { postGenerate };

import { getSections, getSection, deleteSectionsRoute } from './sections.js';
export { getSections, getSection, deleteSectionsRoute };

// The real handlers live in their own route files. They were previously
// shadowed by local stubs in this file, so the route table below bound the
// stub and GET /api/elements answered 200 [] no matter what the store held —
// the §9 dead-store failure, invisible to tests that import the sibling
// module directly. Re-export, never re-declare.
import { getElements, patchElement } from './elements.js';
export { getElements, patchElement };

import { getArtifact, getComponentSource } from './artifacts.js';
export { getArtifact, getComponentSource };

import { getMetrics } from './metrics.js';
export { getMetrics };



import { postRegenerate } from './regenerate.js';
export { postRegenerate };

import { getJob } from './jobs.js';
export { getJob };

import { postReplay } from './replay.js';
export { postReplay };



import { getQuestions } from './questions.js';
export { getQuestions };

import { postAnswers } from './answers.js';
export { postAnswers };

import { getExportZip } from './exportZip.js';
export { getExportZip };

/**
 * The full route map. `kind` tells the Express adapter how to unwrap the result:
 *   action     -> { ok: true, ... } envelope
 *   collection -> a bare array
 *   document   -> a bare document, or 404
 *   raw        -> its own content type (§11.2's artifact and component reads, ZIP export)
 */
export const routes = [
  { method: 'GET', path: '/api/health', kind: 'action', contract: '§13.4', handler: getHealth },
  { method: 'GET', path: '/api/metrics', kind: 'raw', contract: '§17.2', handler: getMetrics },

  { method: 'POST', path: '/api/generate', kind: 'action', contract: '§13.1', handler: postGenerate },
  { method: 'GET', path: '/api/sections', kind: 'collection', contract: '§13.4', handler: getSections },
  { method: 'GET', path: '/api/sections/:sectionId', kind: 'document', contract: '§13.4', handler: getSection },
  { method: 'DELETE', path: '/api/sections', kind: 'action', contract: '§13.4', handler: deleteSectionsRoute },
  { method: 'POST', path: '/api/sections/:sectionId/regenerate', kind: 'action', contract: '§13.3', handler: postRegenerate },
  { method: 'GET', path: '/api/sections/:sectionId/export', kind: 'raw', contract: '§7', handler: getExportZip },

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
