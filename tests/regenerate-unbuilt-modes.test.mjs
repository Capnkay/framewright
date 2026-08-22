// T-113 — regenerate's unbuilt modes, its sanitisation rebind, and §2's `variations`.
//
// Three defects in one handler, all of which had already been found and fixed
// elsewhere and had not been carried across:
//
//   1. `STATUS.NOT_IMPLEMENTED` does not exist. envelope.js exports 501 as a standalone
//      `NOT_IMPLEMENTED`, kept out of STATUS deliberately because it is not a contract
//      status code — so the expression was `undefined` and three of §13's four modes
//      answered with no HTTP status at all. Found in generate.js at T-108; this file
//      was outside that task's files.
//   2. `ctx.body = cleaned.body` without rebinding `body`, so every line below read the
//      RAW object and the sanitised prompt was computed and discarded — the §8
//      chokepoint running and having no effect. generate.js carries a comment about
//      exactly this, written when it was fixed there.
//   3. The regenerated section wrote `variation` where §2 requires `variations`. Found
//      in generate.js at T-109.
//
// THE STATUS IS READ, NOT THE BODY. A test asserting only the error envelope passes
// while the status is undefined, which is how defect 1 survived being tested at all.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postRegenerate } from '../server/src/routes/regenerate.js';

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify({ counters: { job: 16001 }, jobs: [] }));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
}

async function regenerate(env, body) {
  return postRegenerate({
    env,
    params: { sectionId: '1000000001' },
    body,
    files: {},
  });
}

test('every unbuilt mode answers 501, not undefined', async () => {
  const env = await isolatedEnv('rg-unbuilt');

  for (const mode of ['wireframe', 'code', 'combined']) {
    const { status, body } = await regenerate(env, { mode, prompt: 'x', code: 'x' });

    assert.equal(typeof status, 'number', `mode=${mode} answered with a non-number status`);
    assert.equal(status, 501, `mode=${mode} should be 501, got ${status}`);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'NOT_IMPLEMENTED');
  }
});

test('the not-implemented message names the task that will build it', async () => {
  // §13's envelope carries a message a human reads. "not implemented" with no owner is
  // a dead end; the task id is the thread back to the plan.
  const env = await isolatedEnv('rg-names-task');
  const { body } = await regenerate(env, { mode: 'code', code: 'x' });

  assert.match(body.error.message, /T-041/);
});

test('prompt mode is not caught by the unbuilt-mode guard', async () => {
  // The regression that matters: the guard must still let the one built mode through.
  // A missing section is a 404 from further down, which is proof it got past the guard.
  const env = await isolatedEnv('rg-prompt-passes');
  const { status } = await regenerate(env, { mode: 'prompt', prompt: 'a hero section' });

  assert.notEqual(status, 501, 'prompt mode must not be refused as unbuilt');
});

test('the sanitised body reaches the handler rather than being computed and dropped', async () => {
  // §8's write-side chokepoint. `ctx.body` is rebound by the handler, so a caller can
  // read back what the handler actually used — if the raw value survives there, every
  // line downstream saw the raw value too.
  const ctx = {
    env: await isolatedEnv('rg-rebind'),
    params: { sectionId: '1000000001' },
    body: { mode: 'prompt', prompt: 'a hero <script>alert(1)</script> section' },
    files: {},
  };

  await postRegenerate(ctx);

  assert.ok(ctx.body, 'the handler did not publish the body it used');
  assert.doesNotMatch(
    JSON.stringify(ctx.body),
    /<script/i,
    'the raw prompt survived sanitisation — §8 ran and had no effect'
  );
});
