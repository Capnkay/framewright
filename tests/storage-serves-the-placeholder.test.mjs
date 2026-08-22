// T-129 — §7 R7's placeholder image must actually be fetchable.
//
// THE DEFECT. `getImage(image)` with no image returns
// `VITE_STORAGE_URL + 'default/images/hero-placeholder.jpg'`, defaulting to
// `http://localhost:5000/storage/`. That URL returned 404, and there was no
// `express.static` anywhere in `server/src`. So the hero image — the largest
// element in the reference section — has rendered as a broken-image icon with
// alt text in every preview this project has ever produced.
//
// NOTHING FAILED, and that is the shape of it. R7's fallback chain exists for a
// MISSING VALUE, and the value was present and correct the whole time. It was
// the destination that did not exist, and no test asked whether it did.
//
// SO THESE TESTS ASK getImage FOR THE URL AND THEN FETCH THAT EXACT URL.
// Asserting "a file exists at server/storage/..." would pass while the server
// served nothing, which is precisely the state this fixes.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../server/src/app.js';
import { getImage } from '../client/src/utils/image.js';

/** Start the real app on an ephemeral port. */
async function serve() {
  const app = createApp({ env: { MONGODB_URI: '' } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * The path getImage asks for, with its host stripped.
 *
 * Taking the path FROM getImage rather than writing it out again is the point:
 * if the helper's placeholder ever moves, this test follows it instead of
 * quietly checking a stale location.
 */
function placeholderPath() {
  return new URL(getImage('')).pathname;
}

test('the placeholder getImage asks for is actually served', async () => {
  const app = await serve();
  try {
    const path = placeholderPath();
    assert.match(path, /^\/storage\//, `getImage no longer points at /storage: ${path}`);

    const res = await fetch(`http://127.0.0.1:${app.port}${path}`);

    assert.equal(res.status, 200, `${path} is not served — this is the T-129 defect`);
    assert.match(res.headers.get('content-type') || '', /^image\//, 'it is served but not as an image');

    const bytes = Buffer.from(await res.arrayBuffer());
    assert.ok(bytes.length > 1000, `the placeholder is ${bytes.length} bytes — that is not an image`);
    // JPEG's magic number. A 200 that returns an HTML error page would pass a
    // length check and fail here.
    assert.equal(bytes[0], 0xff, 'the bytes are not a JPEG');
    assert.equal(bytes[1], 0xd8, 'the bytes are not a JPEG');
  } finally {
    await app.close();
  }
});

test('a missing asset under /storage is a 404, not a fall-through into the API', async () => {
  // `fallthrough: false`. Without it a missing image continues into the route
  // table and comes back as whatever that produces, which sends the reader
  // looking for a bug in the API.
  const app = await serve();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/storage/default/images/no-such-file.jpg`);
    assert.equal(res.status, 404);
  } finally {
    await app.close();
  }
});

test('the static mount cannot be walked out of', async () => {
  // express.static resolves traversal itself; asserted because this is the first
  // filesystem path this server exposes to the network at all.
  const app = await serve();
  try {
    for (const attempt of ['/storage/../package.json', '/storage/%2e%2e/package.json']) {
      const res = await fetch(`http://127.0.0.1:${app.port}${attempt}`);
      assert.notEqual(res.status, 200, `${attempt} escaped the storage directory`);
    }
  } finally {
    await app.close();
  }
});

test('the API still answers with the static mount in front of it', async () => {
  // A mount added at the top of the middleware chain is a good way to shadow
  // every route below it.
  const app = await serve();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/elements?pageName=Home`);
    assert.notEqual(res.status, 404, 'the storage mount is shadowing the API');
  } finally {
    await app.close();
  }
});
