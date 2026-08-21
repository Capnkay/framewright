// server/src/app.js
//
// The Express layer. Deliberately thin: it maps the route table in
// ./routes/index.js onto Express and does nothing else of substance. Every
// decision that the contract cares about — the envelope kind, the status codes,
// the validation — lives in the table's handlers, which import nothing.
//
// That split is not stylistic. It is what lets tests/api-skeleton.test.mjs
// assert every route's shape with a bare `node --test` on a fresh clone, with no
// `npm install`. Moving contract logic up into this file would quietly cost the
// repo that property, and nothing would fail to tell you.
//
// T-002. CONTRACT.md §13, §13.4.

import express from 'express';
import multer from 'multer';
import routes from './routes/index.js';
import { error, ERROR_CODE, STATUS, isErrorEnvelope } from './http/envelope.js';

// §13.1's upload rules, enforced at the door. multer only engages on a
// `multipart/form-data` request and calls next() otherwise, so mounting it on every
// POST leaves JSON requests untouched.
//
// MEMORY STORAGE, NOT DISK. §11.2 makes artifacts Node-owned and written through the
// stage trace: stage 1 persists the upload as `s1-upload.png` with an inputRef the
// timeline can resolve. A second copy dropped into uploads/ by the parser would be a
// file nothing references and nothing cleans up. The handler wants bytes, and
// `readUpload` in routes/generate.js reads `file.buffer`.
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    // Not an exception: the caller sent something §13.1 refuses, and §13 says that is
    // a 400 with an envelope, not a 500 with a stack.
    const err = new Error(`Unsupported image type ${file.mimetype}.`);
    err.code = 'UNSUPPORTED_IMAGE_TYPE';
    return cb(err);
  },
}).fields([
  // `wireframe` is the name §13.1, the client and routes/generate.js all use.
  // `image` is accepted too because pipeline/stage1InputAcquisition.js was written
  // against that name; taking both costs one line and removes a class of silent
  // "no wireframe supplied" that points the reader at the client.
  { name: 'wireframe', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);

/**
 * multer's own errors, translated into §13's envelope.
 *
 * Left to the generic error handler they become a 500 with "An unexpected error
 * occurred" — which is the right default for a bug and the wrong answer for a caller
 * who sent a 9 MB GIF and can fix it if told.
 */
function uploadErrorEnvelope(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return {
      status: STATUS.PAYLOAD_TOO_LARGE,
      body: error(ERROR_CODE.PAYLOAD_TOO_LARGE, `Image exceeds the ${MAX_IMAGE_BYTES} byte limit (§13.1).`),
    };
  }
  if (err && err.code === 'UNSUPPORTED_IMAGE_TYPE') {
    return {
      status: STATUS.BAD_REQUEST,
      body: error(ERROR_CODE.INVALID_INPUT, `${err.message} Accepted: ${ACCEPTED_IMAGE_TYPES.join(', ')} (§13.1).`),
    };
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      status: STATUS.BAD_REQUEST,
      body: error(ERROR_CODE.INVALID_INPUT, `Unexpected file field "${err.field}". §13.1 names the field "wireframe".`),
    };
  }
  return null;
}

/** multer as a promise, so a route handler can stay a plain async function. */
function readMultipart(req, res) {
  return new Promise((resolve) => {
    parseUpload(req, res, (err) => resolve(err || null));
  });
}

function flattenFiles(files) {
  if (!files) return {};
  if (Array.isArray(files)) return {};
  const out = {};
  for (const [field, value] of Object.entries(files)) {
    out[field] = Array.isArray(value) ? value[0] : value;
  }
  // stage1InputAcquisition.js names the field `image`; §13.1 and the client name it
  // `wireframe`. Whichever arrived, the handlers see `wireframe`.
  if (!out.wireframe && out.image) out.wireframe = out.image;
  return out;
}

/** Turn an Express request into the plain `ctx` object handlers expect. */
function toContext(req, env) {
  return {
    params: req.params || {},
    query: req.query || {},
    body: req.body || {},
    // multer gives `{ wireframe: [file] }`; every handler reads `files.wireframe`.
    // Flattening here rather than in each handler keeps the ctx shape one thing.
    files: flattenFiles(req.files),
    env,
  };
}

export function createApp({ env = process.env } = {}) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  for (const route of routes) {
    const method = route.method.toLowerCase();
    app[method](route.path, async (req, res, next) => {
      try {
        if (method === 'post') {
          // No-op on a JSON request: multer inspects the content type and calls back
          // immediately when it is not multipart.
          const uploadError = await readMultipart(req, res);
          if (uploadError) {
            const envelope = uploadErrorEnvelope(uploadError);
            if (envelope) return res.status(envelope.status).json(envelope.body);
            throw uploadError;
          }
        }
        // AWAITED. Handlers were all synchronous when this table was written, and
        // several are now async — POST /api/generate allocates IDs, writes a job and
        // calls a model. Destructuring the returned Promise gave `status` and `body`
        // of undefined, so express answered the demo's main endpoint with an empty
        // 200. `await` is correct for both kinds, so the table can hold either.
        const { status, body } = await route.handler(toContext(req, env));
        res.status(status).json(body);
      } catch (err) {
        next(err);
      }
    });
  }

  // Anything not in the table. Still the error envelope — §13's rule is that
  // errors carry it "whatever the endpoint", and an unknown path is no exception.
  app.use((req, res) => {
    res
      .status(STATUS.NOT_FOUND)
      .json(error(ERROR_CODE.NOT_FOUND, `No such endpoint: ${req.method} ${req.path}`));
  });

  // §13: 500 for unexpected. The message is deliberately generic — a stack trace
  // or a thrown message can carry an absolute local path or a connection string,
  // and §14 forbids both from leaving this process.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res
        .status(STATUS.PAYLOAD_TOO_LARGE)
        .json(error(ERROR_CODE.PAYLOAD_TOO_LARGE, 'Request body is too large.'));
    }
    const body = error(ERROR_CODE.INTERNAL, 'An unexpected error occurred.');
    if (!isErrorEnvelope(body)) throw new Error('unreachable: error() must produce an envelope');
    return res.status(STATUS.SERVER_ERROR).json(body);
  });

  return app;
}

export default createApp;
