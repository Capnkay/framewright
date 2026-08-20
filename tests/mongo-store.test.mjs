// tests/mongo-store.test.mjs — T-005's verification.
//
// mongodb-memory-server is a devDependency of server/, and this file lives in the
// repository root's tests/. Node resolves a bare import UPWARD from the importing
// file — tests/node_modules, then <root>/node_modules — and never sideways into
// server/node_modules. So a STATIC import here cannot resolve on a clean
// checkout, whatever is installed under server/.
//
// Two changes fix that, and both are needed:
//
//   1. Root package.json declares mongodb-memory-server in devDependencies, so an
//      `npm install` AT THE ROOT puts it in <root>/node_modules where this file can
//      see it. `cd server && npm install` does not help — that fills
//      server/node_modules, which is never on this file's resolution path.
//   2. The import below is dynamic and guarded, so that on a clone where nobody
//      has run an install yet, this test SKIPS with an instruction rather than
//      failing — README's zero-install promise covers the golden component's
//      checks, and a red suite on a fresh clone would obscure that.
//
// NOTE on `skip: unavailable || false`. node:test treats ANY non-`false` value as
// a skip — `skip: null` marks the test skipped while still executing its body,
// which masks a real failure behind a green run. The `|| false` is load-bearing.
//
// The skip is deliberately loud, and it is NOT a way to make T-005 pass. A test
// that always skips asserts nothing, which docs/VERIFICATION.md rules out
// explicitly: a verify command must assert behaviour, never presence. Anyone
// closing T-005 must see this test RUN.

import { test } from 'node:test';
import assert from 'node:assert';

// BOTH imports below are dynamic, and the second one is the subtle half.
//
// ../server/src/store/mongoStore.js imports `mongodb` at its top level. A STATIC
// import of it here resolves when this file loads — before the guard below has a
// chance to run — so the guard could never fire and this file failed outright on
// a machine without the driver. The skip was unreachable code.
//
// That is the same defect as F-005's cause 2 in server/src/store/index.js: a
// static import of the Mongo driver sitting on a path that is supposed to work
// without it. Fixing one and not the other would have left the suite red on a
// clean checkout either way.

let MongoMemoryServer = null;
let createMongoStore = null;
let unavailable = null;
try {
  ({ MongoMemoryServer } = await import('mongodb-memory-server'));
  ({ createMongoStore } = await import('../server/src/store/mongoStore.js'));
} catch (err) {
  unavailable =
    'mongodb-memory-server is not installed. Run `npm install` at the REPOSITORY ROOT ' +
    '(root package.json declares it in devDependencies, which is where tests/ can see it; ' +
    '`cd server && npm install` does NOT help, because Node resolves upward, not sideways). ' +
    `Original error: ${err.code || err.message}`;
}

test('mongo-store allocateId is atomic under concurrent calls', { skip: unavailable || false }, async (t) => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  const store = createMongoStore(uri);

  // Fire 50 concurrent requests
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(store.allocateId('element'));
  }

  const results = await Promise.all(promises);

  // Clean up
  await store.close();
  await mongod.stop();

  // Verify unique
  const uniqueSet = new Set(results);
  assert.strictEqual(uniqueSet.size, 50, 'Did not return 50 unique IDs');

  // Verify 10-digit strings
  for (const id of results) {
    assert.strictEqual(typeof id, 'string', 'ID must be a string');
    assert.strictEqual(id.length, 10, 'ID must be exactly 10 digits');
    assert.match(id, /^[0-9]{10}$/, 'ID must contain only digits');
  }
});
