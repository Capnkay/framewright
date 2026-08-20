import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getImage, errorImage } from '../client/src/utils/image.js';

test('getImage handles empty, blob:, and normal paths', () => {
  const empty = getImage('');
  assert.ok(empty.includes('default/images/hero-placeholder.jpg'));
  assert.ok(!empty.startsWith('blob:'));

  const missing = getImage(undefined);
  assert.ok(missing.includes('default/images/hero-placeholder.jpg'));

  const blobUrl = 'blob:http://localhost/11111111-2222-3333-4444-555555555555';
  assert.equal(getImage(blobUrl), blobUrl, 'a blob: URL must pass through untouched');

  const normal = getImage('uploads/job-0000000001.png');
  assert.notEqual(normal, 'uploads/job-0000000001.png', 'a normal path must be prefixed');
  assert.ok(normal.includes('uploads/job-0000000001.png'));
});

test('errorImage swaps the broken image for the placeholder', () => {
  let currentSrc = 'http://localhost:5000/storage/uploads/broken.png';
  let onerrorClearedTo = 'not-cleared';
  const fakeEvent = {
    target: {
      get src() {
        return currentSrc;
      },
      set src(value) {
        currentSrc = value;
      },
      set onerror(value) {
        onerrorClearedTo = value;
      },
    },
  };

  errorImage(fakeEvent);

  assert.ok(currentSrc.includes('default/images/hero-placeholder.jpg'));
  assert.equal(onerrorClearedTo, null, 'onerror must be cleared to avoid an infinite loop');
});
