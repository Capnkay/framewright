// tests/route-binding.test.mjs
//
// Asserts that the Express route table binds the REAL handlers, over real HTTP,
// against a real store.
//
// This file exists because of a defect it would have caught. routes/index.js
// held a local `getElements` that returned 200 [] unconditionally, while the
// real implementation sat unused in routes/elements.js. The route table bound
// the stub, so GET /api/elements — the endpoint the whole preview hydrates
// through — answered with an empty array no matter what the store held. Three
// endpoints alongside it were shadowed the same way.
//
// Every existing test missed it for the same two reasons, and this file is
// written to be immune to both:
//
//   1. They imported the handler from its sibling module directly, so they
//      exercised code Express never called. This file goes over HTTP.
//   2. They mocked the store to {"elements":[]} and asserted Array.isArray,
//      which a permanently-empty endpoint satisfies perfectly. This file seeds
//      real rows and asserts on CONTENT.
//
// Unlike tests/api-skeleton.test.mjs — which is deliberately Express-free so it
// runs on a fresh clone — this file needs the server dependencies installed.

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';

import { createApp } from '../server/src/app.js';
import { createStore } from '../server/src/store/index.js';
import { seedStore } from '../server/src/store/seed.js';
import routes from '../server/src/routes/index.js';

function tempStorePath(label) {
  return path.join(
    os.tmpdir(),
    `framewright-${label}-${process.pid}-${process.hrtime.bigint()}.json`,
  );
}

async function withServer(run) {
  const storePath = tempStorePath('route-binding');
  const env = { STORE_TYPE: 'json', STORE_PATH: storePath };
  await seedStore(createStore(env));

  const server = createApp({ env }).listen(0);
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    await run(`http://localhost:${server.address().port}`, env);
  } finally {
    server.close();
    await fsp.rm(storePath, { force: true });
  }
}

test('GET /api/elements serves real store rows through the app (§9, §13.4)', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/elements?pageName=Home`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body), 'response must be a bare array (§13.4)');
    assert.ok(
      body.length > 0,
      'the seeded store holds Home elements, so the wired route must return them. ' +
        'An empty array here means the route table is bound to a stub again.',
    );
    assert.ok(
      body.every((el) => el.pageName === 'Home'),
      'every returned element must belong to the requested page',
    );

    // §13.4's unfiltered rule must survive in the real handler too.
    assert.equal((await fetch(`${base}/api/elements`)).status, 400);
  });
});

test('no route handler is a stub shadowing a real implementation', async () => {
  // A structural guard, so a future re-shadowing fails here even if nobody
  // thinks to add an HTTP test for the endpoint they just implemented.
  const NOT_IMPLEMENTED = 501;
  const ctx = {
    params: {
      sectionId: '1000000001',
      fieldId: '2000000003',
      jobId: 'job-0000000001',
      name: 's3-regions.json',
    },
    query: { pageName: 'Home' },
    body: { mode: 'prompt', prompt: 'a fitness hero', fromStage: 5, content: 'x' },
    files: {},
    env: { STORE_TYPE: 'json', STORE_PATH: tempStorePath('shadow-probe') },
  };

  for (const route of routes) {
    const res = await route.handler(ctx);
    if (res.status !== NOT_IMPLEMENTED) continue;
    assert.match(
      res.body.error.message,
      /T-\d{3}/,
      `${route.method} ${route.path} returns 501 but does not name the task that implements it`,
    );
  }
});
