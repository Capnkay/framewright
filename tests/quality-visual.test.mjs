// tests/quality-visual.test.mjs
//
// T-089 — CONTRACT.md §18 and §18.1.
//
// doneWhen: "Similarity is scored against the NORMALISED wireframe using stage 2's
// recorded transform, and is null in prompt mode. A low score appends a warning and
// never fails the generation."
//
// The last clause is the one worth defending hardest. §18 says it twice — "No gate
// below fails a generation" — and it is the easiest thing to get wrong later, because
// a gate that returns a number looks like a gate that should be branched on. So there
// are tests here asserting that catastrophically bad input still returns rather than
// throws, which read as paranoid until someone adds a `throw` for an unreadable image.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compare,
  resample,
  scoreVisual,
  toNormalisedSpace,
  visualScoreContribution,
  DEFAULT_THRESHOLD,
  LOW_SIMILARITY,
} from '../server/src/quality/visual.js';

/** A solid raster of one colour. */
function solid(width, height, [r, g, b, a = 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

/** White with a filled black rectangle — a wireframe box, essentially. */
function withBox(width, height, [bx, by, bw, bh]) {
  const img = solid(width, height, [255, 255, 255]);
  for (let y = by; y < by + bh; y += 1) {
    for (let x = bx; x < bx + bw; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = (y * width + x) * 4;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
    }
  }
  return img;
}

const TRANSFORM = { scale: 0.5, offsetX: 0, offsetY: 12, width: 64, height: 64 };

// ---------------------------------------------------------------------
// doneWhen — null in prompt mode
// ---------------------------------------------------------------------

test('doneWhen — similarity is null in prompt mode', () => {
  const result = scoreVisual({ mode: 'prompt', preview: solid(8, 8, [0, 0, 0]) });

  assert.equal(result.similarity, null);
  assert.notEqual(result.similarity, 0, '§18.1: null is not zero — prompt mode is not penalised');
});

test('doneWhen — prompt mode produces no warning either', () => {
  // A warning on every prompt-mode generation trains everyone to ignore warnings.
  const result = scoreVisual({ mode: 'prompt' });
  assert.deepEqual(result.warnings, []);
});

test('code mode is null too — it has no image to compare against', () => {
  assert.equal(scoreVisual({ mode: 'code' }).similarity, null);
});

test('wireframe mode with no wireframe supplied is null, not zero', () => {
  const result = scoreVisual({ mode: 'wireframe', preview: solid(8, 8, [0, 0, 0]) });
  assert.equal(result.similarity, null);
});

test('§18.1 — a null similarity contributes the full 15 points', () => {
  assert.equal(visualScoreContribution(null), 15);
  assert.equal(visualScoreContribution(undefined), 15);
  assert.equal(visualScoreContribution(1.0), 15);
  assert.equal(visualScoreContribution(0.0), 0);
  assert.equal(visualScoreContribution(0.5), 7.5);
});

// ---------------------------------------------------------------------
// doneWhen — scored against the wireframe, and the numbers mean something
// ---------------------------------------------------------------------

test('doneWhen — an identical preview scores 1.0', () => {
  const wireframe = withBox(64, 64, [8, 8, 20, 20]);
  const result = scoreVisual({ wireframe, preview: wireframe, transform: TRANSFORM });

  assert.equal(result.similarity, 1);
  assert.equal(result.differing, 0);
  assert.equal(result.comparable, true);
});

test('doneWhen — a completely different preview scores 0.0', () => {
  const result = scoreVisual({
    wireframe: solid(32, 32, [255, 255, 255]),
    preview: solid(32, 32, [0, 0, 0]),
    transform: { ...TRANSFORM, width: 32, height: 32 },
  });

  assert.equal(result.similarity, 0);
});

test('similarity tracks the amount of difference, it is not a constant', () => {
  const wireframe = solid(20, 20, [255, 255, 255]);
  const scores = [2, 6, 12].map((side) => scoreVisual({
    wireframe,
    preview: withBox(20, 20, [0, 0, side, side]),
    transform: { ...TRANSFORM, width: 20, height: 20 },
  }).similarity);

  assert.ok(scores[0] > scores[1] && scores[1] > scores[2], `not monotonic: ${scores}`);
  assert.equal(new Set(scores).size, 3);
});

test('a misplaced box is detected rather than blurred away', () => {
  // Nearest-neighbour resampling exists for exactly this: a bilinear resize softens
  // edges and raises the score of two images that disagree about where a box is.
  const wireframe = withBox(40, 40, [4, 4, 12, 12]);
  const moved = withBox(40, 40, [24, 24, 12, 12]);

  const result = scoreVisual({
    wireframe, preview: moved, transform: { ...TRANSFORM, width: 40, height: 40 },
  });

  assert.ok(result.similarity < 0.95, `a moved box must show up: ${result.similarity}`);
});

// ---------------------------------------------------------------------
// doneWhen — stage 2's recorded transform decides the comparison space
// ---------------------------------------------------------------------

test("doneWhen — the preview is resampled into the transform's canvas", () => {
  const preview = solid(200, 150, [0, 0, 0]);
  const placed = toNormalisedSpace(preview, TRANSFORM);

  assert.equal(placed.width, TRANSFORM.width);
  assert.equal(placed.height, TRANSFORM.height);
});

test('doneWhen — a preview at a different size still scores against the wireframe', () => {
  const wireframe = withBox(64, 64, [8, 8, 20, 20]);
  // The same picture, rendered at 4x. It should score very high, not near zero.
  const preview = resample(wireframe, 256, 256);

  const result = scoreVisual({ wireframe, preview, transform: TRANSFORM });

  assert.ok(result.similarity > 0.95, `scale alone must not tank the score: ${result.similarity}`);
});

test('a missing transform canvas warns but still scores', () => {
  const wireframe = withBox(32, 32, [4, 4, 8, 8]);
  const result = scoreVisual({
    wireframe,
    preview: wireframe,
    transform: { scale: 1, offsetX: 0, offsetY: 0, width: null, height: null },
  });

  assert.equal(result.similarity, 1, 'it must still produce a number');
  assert.ok(result.warnings.some((w) => w.includes('no normalisation canvas')));
});

// ---------------------------------------------------------------------
// doneWhen — a low score warns and NEVER fails
// ---------------------------------------------------------------------

test('doneWhen — a low score appends a warning', () => {
  const result = scoreVisual({
    wireframe: solid(16, 16, [255, 255, 255]),
    preview: solid(16, 16, [0, 0, 0]),
    transform: { ...TRANSFORM, width: 16, height: 16 },
  });

  assert.ok(result.similarity < LOW_SIMILARITY);
  assert.ok(result.warnings.some((w) => w.includes('below')));
  assert.ok(result.warnings.some((w) => w.includes('not blocked')));
});

test('doneWhen — a high score appends no warning', () => {
  const wireframe = withBox(32, 32, [4, 4, 10, 10]);
  const result = scoreVisual({ wireframe, preview: wireframe, transform: { ...TRANSFORM, width: 32, height: 32 } });

  assert.deepEqual(result.warnings, []);
});

test('§18 — nothing here throws, whatever it is handed', () => {
  // §18: "No gate below fails a generation." A throw IS a failed generation once this
  // runs inside stage 6, so every one of these must return.
  const garbage = [
    { wireframe: {}, preview: {} },
    { wireframe: { width: 4, height: 4 }, preview: solid(4, 4, [0, 0, 0]) },
    { wireframe: solid(4, 4, [0, 0, 0]), preview: { width: -1, height: 0, data: [] } },
    { wireframe: solid(4, 4, [0, 0, 0]), preview: solid(4, 4, [0, 0, 0]), transform: null },
    { wireframe: null, preview: null, mode: 'wireframe' },
    {},
  ];

  for (const input of garbage) {
    const result = scoreVisual(input);
    assert.ok('similarity' in result, `no result for ${JSON.stringify(Object.keys(input))}`);
    assert.ok(Array.isArray(result.warnings));
  }
});

test('an unreadable raster scores null and says so', () => {
  const result = scoreVisual({
    wireframe: solid(8, 8, [0, 0, 0]),
    preview: { width: 8, height: 8, data: new Uint8ClampedArray(4) }, // too short
    transform: { ...TRANSFORM, width: 8, height: 8 },
  });

  assert.equal(result.similarity, null);
  assert.ok(result.warnings.some((w) => w.includes('unreadable')));
});

// ---------------------------------------------------------------------
// The pixelmatch algorithm itself
// ---------------------------------------------------------------------

test('the threshold is pixelmatch upstream default, not a local invention', () => {
  assert.equal(DEFAULT_THRESHOLD, 0.1);
});

test('a sub-threshold colour shift counts as identical', () => {
  const a = solid(8, 8, [100, 100, 100]);
  const b = solid(8, 8, [101, 100, 100]);

  assert.equal(compare(a, b).similarity, 1, 'imperceptible difference must not register');
});

test('a supra-threshold colour shift counts as different', () => {
  const a = solid(8, 8, [0, 0, 0]);
  const b = solid(8, 8, [255, 255, 255]);

  assert.equal(compare(a, b).similarity, 0);
});

test('a raised threshold tolerates more difference', () => {
  const a = solid(8, 8, [120, 120, 120]);
  const b = solid(8, 8, [160, 160, 160]);

  assert.ok(compare(a, b, { threshold: 0.05 }).similarity < 1);
  assert.equal(compare(a, b, { threshold: 0.9 }).similarity, 1);
});

test('luminance difference matters more than hue — the YIQ metric', () => {
  const base = solid(8, 8, [128, 128, 128]);
  // Equal-ish luminance, different hue.
  const hue = compare(base, solid(8, 8, [140, 125, 118]), { threshold: 0.12 }).similarity;
  // Same hue, very different luminance.
  const luma = compare(base, solid(8, 8, [40, 40, 40]), { threshold: 0.12 }).similarity;

  assert.ok(luma < hue, 'a brightness change must register more strongly than a hue change');
});

test('compare is symmetric in similarity for same-size images', () => {
  const a = withBox(16, 16, [2, 2, 6, 6]);
  const b = withBox(16, 16, [8, 8, 6, 6]);

  assert.equal(compare(a, b).similarity, compare(b, a).similarity);
});

test('compare is deterministic', () => {
  const a = withBox(24, 24, [2, 2, 9, 9]);
  const b = withBox(24, 24, [5, 5, 9, 9]);

  assert.deepEqual(compare(a, b), compare(a, b));
});

test('resample preserves a solid colour exactly', () => {
  const out = resample(solid(10, 10, [17, 34, 51]), 25, 7);

  assert.equal(out.width, 25);
  assert.equal(out.height, 7);
  assert.equal(out.data[0], 17);
  assert.equal(out.data[1], 34);
  assert.equal(out.data[2], 51);
});

test('toNormalisedSpace is a no-op when the sizes already match', () => {
  const preview = solid(64, 64, [1, 2, 3]);
  assert.equal(toNormalisedSpace(preview, TRANSFORM), preview, 'no needless copy');
});
