// server/src/http/envelope.js
//
// The envelope convention from CONTRACT.md §13.4, applied without exception.
// Dependency-free on purpose: tests/api-skeleton.test.mjs exercises this and the
// route table directly, so `npm test` keeps working on a fresh clone with no
// `npm install`. Express is a thin layer over these, not the other way round.
//
//   Endpoints that ACT                  -> the { ok, ... } envelope
//   Endpoints that read a COLLECTION    -> a BARE ARRAY ([] if none)
//   Endpoints that read ONE document    -> the BARE DOCUMENT, or 404
//   Errors, whatever the endpoint       -> { ok: false, error: { code, message } }
//
// §9 names the exact failure this convention exists to prevent: an API returning
// `{ data: [...] }` where the reducer expects `[...]` produces a completely dead
// store behind a preview that looks pixel-perfect. So the shape is decided here,
// once, before four people build handlers against it.

/** Contract-defined status codes. §13. */
export const STATUS = {
  OK: 200,
  BAD_REQUEST: 400, // validation
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413, // image over 8 MB
  UNPROCESSABLE: 422, // model or parse failure
  SERVER_ERROR: 500, // unexpected
};

// NOT a contract status code. It exists only while this is a scaffold, so that
// an unimplemented route is loudly distinguishable from an implemented one that
// returns nothing. Every occurrence must be gone by the end of Phase 2 — the
// api-skeleton test counts them, so the number cannot drift upward unnoticed.
export const NOT_IMPLEMENTED = 501;

/** Error codes used by the skeleton. Handlers may add more; none may rename these. */
export const ERROR_CODE = {
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  PARSE_FAILURE: 'PARSE_FAILURE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL: 'INTERNAL',
};

/**
 * An acting endpoint's success body. §13's sample response is
 * `{ ok: true, jobId, sectionId, ... }` — `ok` first, then the payload flat
 * alongside it, never nested under a `data` key.
 */
export function ok(payload = {}) {
  return { ok: true, ...payload };
}

/** The error envelope. §13. Returned by every endpoint kind, including reads. */
export function error(code, message) {
  return { ok: false, error: { code, message } };
}

/** A read of a collection: a bare array, never wrapped. §13.4. */
export function collection(items) {
  return Array.isArray(items) ? items : [];
}

/**
 * A read of one document: the bare document, or a 404 error envelope.
 * Returns a { status, body } pair because "or 404" is part of the shape.
 */
export function document(doc, whatWasNotFound = 'document') {
  if (doc === null || doc === undefined) {
    return {
      status: STATUS.NOT_FOUND,
      body: error(ERROR_CODE.NOT_FOUND, `No such ${whatWasNotFound}.`),
    };
  }
  return { status: STATUS.OK, body: doc };
}

/** A route that exists in the contract but has no implementation yet. */
export function notImplemented(taskId, what) {
  return {
    status: NOT_IMPLEMENTED,
    body: error(
      ERROR_CODE.NOT_IMPLEMENTED,
      `${what} is not implemented yet — scheduled as ${taskId}.`,
    ),
  };
}

/** A validation failure. §13: 400. */
export function badRequest(message) {
  return { status: STATUS.BAD_REQUEST, body: error(ERROR_CODE.INVALID_INPUT, message) };
}

/**
 * True when a response body follows the error envelope. Used by the tests and by
 * the Express error handler, so both agree on what an error looks like.
 */
export function isErrorEnvelope(body) {
  return (
    body !== null &&
    typeof body === 'object' &&
    body.ok === false &&
    body.error !== null &&
    typeof body.error === 'object' &&
    typeof body.error.code === 'string' &&
    typeof body.error.message === 'string'
  );
}
