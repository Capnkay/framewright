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
import routes from './routes/index.js';
import { error, ERROR_CODE, STATUS, isErrorEnvelope } from './http/envelope.js';

/** Turn an Express request into the plain `ctx` object handlers expect. */
function toContext(req, env) {
  return {
    params: req.params || {},
    query: req.query || {},
    body: req.body || {},
    files: req.files || {},
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
