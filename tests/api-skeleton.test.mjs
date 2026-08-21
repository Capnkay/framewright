// tests/api-skeleton.test.mjs — T-002's verification.
//
// Asserts the shape of the API skeleton: that every path in CONTRACT.md §13's
// table exists, that §13.4's envelope convention is obeyed per route kind, that
// the validation rules the contract states are enforced, and that /api/health
// returns the §13.4 body.
//
// IMPORTS NOTHING FROM EXPRESS, on purpose. The route table and its handlers are
// dependency-free, so this file runs on a fresh clone with no `npm install` —
// the property the whole repo is built around (see README, SETUP.md step 5).
// The Express layer in server/src/app.js is a thin map over this table; if it
// ever grows contract logic of its own, that logic escapes this test, which is
// exactly why app.js is written the way it is.

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';


// A unique temp path per call, so no suite inherits another's leftovers and
// nothing is written into the repo. Built-ins only: this file must keep
// running on a fresh clone with no npm install.
// Every handler call in this file gets ISOLATED stores. node:test runs test
// FILES in separate processes, and jsonStore's single-writer queue only
// serialises writes within one process — so two files touching the default
// server/data/store.json raced and left it half-written, which surfaced as
// "Unexpected non-whitespace character after JSON" in whichever suite read it
// next. Isolation, not retries, is the fix.
function isolatedEnv(label) {
  return {
    STORE_TYPE: 'json',
    STORE_PATH: tempPath(`${label}-store`),
    JOB_STORE_PATH: tempPath(`${label}-jobs`),
  };
}

function tempPath(label) {
  return path.join(os.tmpdir(), `framewright-${label}-${process.pid}-${process.hrtime.bigint()}.json`);
}

import routes, {
  SECTION_13_TABLE,
  getHealth,
  getElements,
  patchElement,
  getSection,
  postGenerate,
  postReplay,
  postAnswers,
} from '../server/src/routes/index.js';

import {
  STATUS,
  NOT_IMPLEMENTED,
  ERROR_CODE,
  isErrorEnvelope,
} from '../server/src/http/envelope.js';

const KINDS = new Set(['action', 'collection', 'document', 'raw']);
const key = (r) => `${r.method} ${r.path}`;

// --- the table itself ------------------------------------------------------

test('every path in §13’s table is present in the route table', () => {
  const present = new Set(routes.map(key));
  for (const row of SECTION_13_TABLE) {
    assert.ok(present.has(row), `§13 names "${row}" and the route table does not have it`);
  }
});

test('every route declares a known envelope kind and a contract section', () => {
  for (const route of routes) {
    assert.ok(KINDS.has(route.kind), `${key(route)} has unknown kind "${route.kind}"`);
    assert.match(route.contract, /^§/, `${key(route)} does not name a contract section`);
    assert.equal(typeof route.handler, 'function', `${key(route)} has no handler`);
  }
});

test('no two routes share a method and path', () => {
  const seen = new Set();
  for (const route of routes) {
    assert.ok(!seen.has(key(route)), `${key(route)} is declared twice`);
    seen.add(key(route));
  }
});

// --- §13.4's envelope convention, asserted mechanically --------------------

test('a collection read returns a bare array, never a wrapper object', async () => {
  // §9 names `{ data: [...] }` where the reducer expects `[...]` as a cause of
  // total store death. This is the assertion that stops it being introduced.
  const collections = routes.filter((r) => r.kind === 'collection');
  assert.ok(collections.length > 0, 'expected at least one collection route');

  for (const route of collections) {
    const ctx = { params: { jobId: 'job-0000000001' }, query: { pageName: 'Home' } };
    const { status, body } = await route.handler(ctx);
    assert.equal(status, STATUS.OK, `${key(route)} should read successfully`);
    assert.ok(Array.isArray(body), `${key(route)} must return a bare array, got ${typeof body}`);
  }
});

test('a document read returns 404 with the error envelope when absent', async () => {
  const documents = routes.filter((r) => r.kind === 'document');
  assert.ok(documents.length > 0, 'expected at least one document route');

  for (const route of documents) {
    const ctx = {
      params: { sectionId: '1000000099', jobId: 'job-0000000099' },
      // Isolated stores: 'absent' must mean absent. Against the shared default
      // stores, an id this suite treats as missing was eventually created by
      // another suite, and this assertion started failing on a clean checkout.
      env: {
        STORE_TYPE: 'json',
        STORE_PATH: tempPath('absent-doc-store'),
        JOB_STORE_PATH: tempPath('absent-doc-jobs'),
      },
    };
    const { status, body } = await route.handler(ctx);
    assert.equal(status, STATUS.NOT_FOUND, `${key(route)} should 404 on an absent document`);
    assert.ok(isErrorEnvelope(body), `${key(route)}'s 404 must carry the error envelope`);
  }
});

test('an acting endpoint’s success body carries ok:true, flat, never nested under data', () => {
  const { status, body } = getHealth({ env: {} });
  assert.equal(status, STATUS.OK);
  assert.equal(body.ok, true);
  assert.ok(!('data' in body), 'the envelope is flat — there is no data key anywhere in it');
});

// --- /api/health, §13.4 ----------------------------------------------------

test('GET /api/health returns the §13.4 shape and never fabricates perception uptime', () => {
  const json = getHealth({ env: {} });
  assert.equal(json.status, STATUS.OK);
  assert.deepEqual(Object.keys(json.body).sort(), ['ok', 'perception', 'store']);
  assert.equal(json.body.ok, true);
  assert.equal(json.body.store, 'json', 'no MONGODB_URI means the JSON store');
  assert.ok(
    ['up', 'down'].includes(json.body.perception),
    'perception is a closed set of up|down (§13.4)',
  );
  // §12: perception being absent is a supported state, so health reports it
  // rather than failing. And until T-058 wires a real probe, "down" is the only
  // honest answer — reporting "up" would be a fabricated number.
  assert.equal(json.body.perception, 'down');

  const withMongo = getHealth({ env: { MONGODB_URI: 'mongodb://localhost:27017/framewright_dev' } });
  assert.equal(withMongo.body.store, 'mongo');
});

// --- validation the contract states explicitly -----------------------------

test('GET /api/elements 400s when unfiltered, per §13.4', async () => {
  const unfiltered = await getElements({ query: {} });
  assert.equal(unfiltered.status, STATUS.BAD_REQUEST);
  assert.equal(unfiltered.body.error.code, ERROR_CODE.INVALID_INPUT);

  for (const query of [{ pageName: 'Home' }, { sectionId: '1000000001' }, { fieldIds: '2000000003' }]) {
    const res = await getElements({ query });
    assert.equal(res.status, STATUS.OK, `${JSON.stringify(query)} is a valid filter`);
    assert.ok(Array.isArray(res.body));
  }
});

test('PATCH /api/elements/:fieldId requires at least one of content, css or loop (§13.2)', async () => {
  const empty = await patchElement({ params: { fieldId: '2000000003' }, body: {} });
  assert.equal(empty.status, STATUS.BAD_REQUEST);

  for (const body of [{ content: 'TRAIN WITHOUT LIMITS' }, { css: 'font-weight: bold;' }, { loop: [] }]) {
    const res = await patchElement({ params: { fieldId: '2000000003' }, body });
    assert.notEqual(res.status, STATUS.BAD_REQUEST, `${JSON.stringify(body)} is a valid patch`);
  }
});

test('PATCH accepts a nested card field id in the 3… range — §13.2 says it must', async () => {
  // "An implementation that rejects nested IDs here makes card fields
  // uneditable and quietly fails the store-liveness gate's most important
  // step." That step is §9's step 5, and this is the assertion that guards it.
  const nested = await patchElement({ params: { fieldId: '3000000001' }, body: { content: '2000+' } });
  assert.notEqual(
    nested.status,
    STATUS.BAD_REQUEST,
    'a 3… range nested card field id must be accepted, not rejected',
  );
  assert.notEqual(nested.status, STATUS.NOT_FOUND, '§13.2: "It does not 404."');
});

test('id-shaped params are range-checked per §1', async () => {
  assert.equal((await getSection({ params: { sectionId: '2000000001' } })).status, STATUS.BAD_REQUEST);
  assert.equal((await getSection({ params: { sectionId: '123' } })).status, STATUS.BAD_REQUEST);
  assert.equal((await patchElement({ params: { fieldId: '1000000001' }, body: { content: 'x' } })).status, STATUS.BAD_REQUEST);
  // Date.now() is 13 digits and uuid is not numeric — both must fail (§1 rule 3).
  assert.equal((await patchElement({ params: { fieldId: String(Date.now()) }, body: { content: 'x' } })).status, STATUS.BAD_REQUEST);
  assert.equal((await patchElement({ params: { fieldId: '00000000-0000-0000-0000-000000000000' }, body: { content: 'x' } })).status, STATUS.BAD_REQUEST);
});

test('POST /api/generate 400s with §13’s own message when no input is supplied', async () => {
  const noMode = await postGenerate({ body: {}, env: isolatedEnv('gen-nomode') });
  assert.equal(noMode.status, STATUS.BAD_REQUEST);

  const noInput = await postGenerate({ body: { mode: 'prompt' }, files: {}, env: isolatedEnv('gen-noinput') });
  assert.equal(noInput.status, STATUS.BAD_REQUEST);
  assert.equal(
    noInput.body.error.message,
    'At least one of wireframe, code, or prompt is required.',
    "§13's error example is quoted verbatim so the wire shape matches the contract",
  );

  const badMode = await postGenerate({ body: { mode: 'sketch', prompt: 'x' }, env: isolatedEnv('gen-badmode') });
  assert.equal(badMode.status, STATUS.BAD_REQUEST, 'mode is a closed set of four values');
});

test('POST /api/jobs/:jobId/replay 422s below stage 5 while perception is down (§11.0)', async () => {
  const params = { jobId: 'job-0000000001' };

  for (const fromStage of [2, 3, 4]) {
    const res = await postReplay({ params, body: { fromStage }, env: isolatedEnv('replay') });
    assert.equal(
      res.status,
      STATUS.UNPROCESSABLE,
      `stage ${fromStage} needs the perception machine — 422 rather than hanging`,
    );
    assert.ok(isErrorEnvelope(res.body));
  }

  for (const fromStage of [5, 6, 7]) {
    const res = await postReplay({ params, body: { fromStage }, env: isolatedEnv('replay') });
    assert.notEqual(
      res.status,
      STATUS.UNPROCESSABLE,
      `stage ${fromStage} replays without the GPU machine — the demo depends on it`,
    );
  }

  assert.equal((await postReplay({ params, body: {}, env: isolatedEnv('replay') })).status, STATUS.BAD_REQUEST);
  assert.equal((await postReplay({ params, body: { fromStage: 9 }, env: isolatedEnv('replay') })).status, STATUS.BAD_REQUEST);
});

test('POST /api/jobs/:jobId/answers requires a non-empty answers array (§11.3)', async () => {
  const params = { jobId: 'job-0000000001' };
  // AWAITED. postAnswers became async when T-065 implemented it; unawaited, its
  // .status is undefined and both assertions silently pass against a Promise.
  assert.equal((await postAnswers({ params, body: {}, env: isolatedEnv('answers-empty') })).status, STATUS.BAD_REQUEST);
  assert.equal((await postAnswers({ params, body: { answers: [] }, env: isolatedEnv('answers-blank') })).status, STATUS.BAD_REQUEST);
});

// --- errors always carry the envelope, whatever the endpoint ---------------

test('every error response carries the §13 error envelope', async () => {
  const probes = [
    await getElements({ query: {} }),
    await patchElement({ params: { fieldId: 'nope' }, body: { content: 'x' } }),
    await getSection({ params: { sectionId: 'nope' } }),
    await postGenerate({ body: {}, env: isolatedEnv('envelope-gen') }),
    await postReplay({ params: { jobId: 'nope' }, body: { fromStage: 5 }, env: isolatedEnv('envelope-replay') }),
  ];
  for (const probe of probes) {
    assert.ok(probe.status >= 400, 'this probe should be an error');
    assert.ok(isErrorEnvelope(probe.body), `body is not an error envelope: ${JSON.stringify(probe.body)}`);
  }
});

// --- the scaffold must shrink, not grow ------------------------------------

test('501 stubs are counted, so the scaffold cannot quietly grow', async () => {
  // 501 is NOT a contract status code — it exists only while this is a skeleton,
  // to keep an unimplemented route loudly distinguishable from an implemented
  // one returning nothing. This count is a ratchet: it must fall to zero as
  // Phase 2 lands, and it can never rise without this assertion failing.
  // Lowered 5 -> 2 when GET/PATCH /api/elements and the two §11.2 artifact
  // endpoints stopped being shadowed by stubs in routes/index.js and were
  // bound to their real implementations (T-015, T-016, T-037). Lowered 2 -> 1
  // when GET /api/metrics was likewise unshadowed and bound to metrics.js (T-087).
  // Lowered 1 -> 0 when T-065 implemented POST /api/jobs/:jobId/answers, the last
  // 501 in the table. The scaffold is now fully built out; this assertion holds
  // it at zero so a regression to a stub fails here.
  const EXPECTED_STUBS = 0;

  const ctx = {
    params: { sectionId: '1000000001', fieldId: '2000000003', jobId: 'job-0000000001', name: 's3-regions.json' },
    query: { pageName: 'Home' },
    body: { mode: 'prompt', prompt: 'a fitness hero', fromStage: 5, content: 'x', answers: [{ questionId: 'q1', choice: 'Button' }] },
    files: {},
    // An ISOLATED store, not the default one. Now that these handlers are
    // awaited they really run, and several read or write the store. Left on
    // the default path they raced the other test files against the same
    // server/data/store.json and failed intermittently with EBUSY on Windows.
    // A per-run temp path also keeps this file from leaving state behind for
    // the next suite, which is how "absent" ids stopped being absent before.
    env: {
      STORE_TYPE: 'json',
      STORE_PATH: tempPath('stub-ratchet-store'),
      // The job store is a SEPARATE file from the element store and needs its
      // own isolation. Left on the default server/data/jobs.json, accumulated
      // job records from earlier runs made the "absent" ids these assertions
      // rely on stop being absent, so a passing suite slowly turned into a
      // failing one with no code change.
      JOB_STORE_PATH: tempPath('stub-ratchet-jobs'),
    },
  };

  // AWAITED. Several handlers are async now; calling them without await gives
  // a Promise whose .status is undefined, which silently counts every async
  // handler as "implemented" and leaves an unhandled rejection behind that
  // fails this file at random. Resolve first, then classify.
  const settled = [];
  for (const route of routes) settled.push([route, await route.handler(ctx)]);

  const stubbed = settled
    .filter(([, res]) => res.status === NOT_IMPLEMENTED)
    .map(([route]) => key(route));

  assert.equal(
    stubbed.length,
    EXPECTED_STUBS,
    `expected ${EXPECTED_STUBS} unimplemented routes, found ${stubbed.length}:\n  ${stubbed.join('\n  ')}\n` +
      'If you implemented one, lower EXPECTED_STUBS. If this went UP, a route regressed.',
  );

  for (const [route, res] of settled) {
    if (res.status !== NOT_IMPLEMENTED) continue;
    assert.match(
      res.body.error.message,
      /T-\d{3}/,
      `${key(route)}'s stub must name the task that implements it`,
    );
  }
});

