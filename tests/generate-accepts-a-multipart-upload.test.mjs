// T-116 — the HTTP layer must actually receive a wireframe. §13, §13.1.
//
// THE DEFECT, measured against the running system rather than against a ctx object.
// With the perception service and the Node API both up:
//
//   curl -X POST /api/generate -F mode=wireframe -F wireframe=@gpu-test/wireframe.png
//   -> 400 "mode is required and must be one of: wireframe, code, prompt, combined."
//
// The MODE did not arrive, let alone the file. app.js mounted `express.json()` and
// nothing else, so every multipart request reached the handler with an empty body and
// empty files. T-108 made the handler work and nothing could feed it. Meanwhile
// pipeline/stage1InputAcquisition.js carried a multer configuration with zero callers,
// and its field name is `image` while §13.1, the client and routes/generate.js all say
// `wireframe`.
//
// WHY THESE TESTS GO THROUGH createApp. Every other test in this suite injects a ctx
// straight into the handler, which is faster and, for this defect, useless: the handler
// was correct throughout. The bug lived in the layer those tests skip.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { createApp } from '../server/src/app.js';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64'
);

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  await fs.writeFile(path.join(dir, 'jobs.json'), JSON.stringify({ counters: { job: 10001 }, jobs: [] }));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
    // No perception service in a test run. §12 makes its absence a supported state, so
    // the wireframe path degrades and the job still completes — which is exactly what
    // must be true for this test to be about the upload rather than about perception.
    PERCEPTION_URL: 'http://127.0.0.1:1',
  };
}

/** Start the real app on an ephemeral port and hand back a base URL. */
async function serve(env) {
  const app = createApp({ env });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function form(fields = {}, file = { name: 'wireframe', bytes: PNG_1PX, type: 'image/png', filename: 'w.png' }) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  if (file) body.append(file.name, new Blob([file.bytes], { type: file.type }), file.filename);
  return body;
}

async function post(url, body) {
  const res = await fetch(`${url}/api/generate`, { method: 'POST', body });
  return { status: res.status, body: await res.json() };
}

test('a multipart POST reaches the handler with its fields intact', async () => {
  // The exact failure: `mode` did not arrive, so the request never got as far as the
  // file. Asserting the mode error is gone is asserting the parser exists at all.
  const app = await serve(await isolatedEnv('mp-fields'));
  try {
    const { status, body } = await post(
      app.url,
      form({ mode: 'wireframe', pageName: 'Home', sectionName: 'Uploaded' })
    );

    assert.notEqual(status, 400, `the form fields still do not arrive: ${JSON.stringify(body)}`);
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.job.mode, 'wireframe');
  } finally {
    await app.close();
  }
});

test('the uploaded bytes reach stage 1 and are persisted', async () => {
  const app = await serve(await isolatedEnv('mp-bytes'));
  try {
    const { body } = await post(app.url, form({ mode: 'wireframe', pageName: 'Home', sectionName: 'Uploaded' }));
    const stage1 = body.job.stages.find((s) => s.stage === 1);

    assert.ok(stage1, 'stage 1 has no record — the upload never arrived');
    assert.equal(stage1.status, 'ok');
    assert.ok(stage1.outputRef, 'the upload was not persisted');

    const written = await fs.readFile(stage1.outputRef);
    assert.deepEqual(written, PNG_1PX, 'the persisted bytes are not the bytes that were posted');
  } finally {
    await app.close();
  }
});

test('the field may be named `image`, as stage1InputAcquisition names it', async () => {
  // §13.1, the client and the handler all say `wireframe`; the orphaned multer config
  // says `image`. Accepting both removes a class of silent "no wireframe supplied"
  // that sends the reader to the client when the fault is in the field name.
  const app = await serve(await isolatedEnv('mp-alias'));
  try {
    const { status } = await post(
      app.url,
      form({ mode: 'wireframe', pageName: 'Home', sectionName: 'Uploaded' },
        { name: 'image', bytes: PNG_1PX, type: 'image/png', filename: 'w.png' })
    );

    assert.equal(status, 200);
  } finally {
    await app.close();
  }
});

test('an unsupported image type is §13’s 400 envelope, not multer’s error', async () => {
  const app = await serve(await isolatedEnv('mp-type'));
  try {
    const { status, body } = await post(
      app.url,
      form({ mode: 'wireframe', pageName: 'Home', sectionName: 'Uploaded' },
        { name: 'wireframe', bytes: PNG_1PX, type: 'image/gif', filename: 'w.gif' })
    );

    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.match(body.error.message, /image\/gif|Unsupported/);
  } finally {
    await app.close();
  }
});

test('an oversized image is 413 with an envelope, not a 500', async () => {
  // Left to the generic handler this becomes "An unexpected error occurred", which is
  // the right default for a bug and the wrong answer for a caller who can fix it.
  const app = await serve(await isolatedEnv('mp-size'));
  try {
    const tooBig = Buffer.alloc(9 * 1024 * 1024, 0x41);
    const { status, body } = await post(
      app.url,
      form({ mode: 'wireframe', pageName: 'Home', sectionName: 'Uploaded' },
        { name: 'wireframe', bytes: tooBig, type: 'image/png', filename: 'big.png' })
    );

    assert.equal(status, 413, JSON.stringify(body));
    assert.equal(body.ok, false);
  } finally {
    await app.close();
  }
});

test('a JSON POST is untouched by the upload parser', async () => {
  // The regression that would matter most: multer is mounted on every POST, and prompt
  // mode is the path the whole demo falls back to.
  const app = await serve(await isolatedEnv('mp-json'));
  try {
    const res = await fetch(`${app.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'prompt', pageName: 'Home', sectionName: 'Json', prompt: 'a hero with stats' }),
    });
    const body = await res.json();

    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.job.mode, 'prompt');
  } finally {
    await app.close();
  }
});

test('mode=wireframe with no file is a 400 that names what is missing', async () => {
  const app = await serve(await isolatedEnv('mp-nofile'));
  try {
    const { status, body } = await post(
      app.url,
      form({ mode: 'wireframe', pageName: 'Home', sectionName: 'Uploaded' }, null)
    );

    assert.equal(status, 400);
    assert.match(body.error.message, /wireframe/i);
  } finally {
    await app.close();
  }
});
