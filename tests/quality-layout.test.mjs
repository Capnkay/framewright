// tests/quality-layout.test.mjs
//
// The layout-overlap gate (server/src/quality/layout.js), added because a
// judge looked at real generated output and found overlapping elements that
// nothing in §18 catches. See that file's header for why jsdom cannot do
// this (no CSS box model — getBoundingClientRect() is always zeros there)
// and why this gate uses Puppeteer instead.
//
// Most of these tests exercise `findOverlaps` directly (pure, synchronous,
// no browser) and `scoreLayout` with an injected `render`/`measure` (the same
// dependency-injection pattern criticLoop.js already uses for `render` and
// `critic`), so the geometry logic is tested hermetically and fast. One test
// at the bottom launches a real headless Chromium via the real
// `measureLayout`, to prove the claim the rest of the suite takes on faith:
// this gate sees genuine computed geometry, which jsdom never would.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findOverlaps,
  overlapFraction,
  intersectionArea,
  scoreLayout,
  layoutScoreContribution,
  OVERLAP_FRACTION_THRESHOLD,
} from '../server/src/quality/layout.js';

// ---------------------------------------------------------------------------
// Pure geometry
// ---------------------------------------------------------------------------

test('two elements with intersecting coordinates are caught as overlap', () => {
  const elements = [
    { id: 'a', rect: { x: 0, y: 0, width: 200, height: 200 }, ancestorIds: [] },
    // b sits mostly on top of a: 150x150 of overlap out of a 150x150 box —
    // 100% of the smaller rect, unmistakably a real overlap.
    { id: 'b', rect: { x: 50, y: 50, width: 150, height: 150 }, ancestorIds: [] },
  ];

  const pairs = findOverlaps(elements);

  assert.equal(pairs.length, 1, 'the gate did not catch two elements it should have');
  assert.deepEqual([pairs[0].a, pairs[0].b].sort(), ['a', 'b']);
  assert.ok(pairs[0].fraction >= OVERLAP_FRACTION_THRESHOLD);
});

test('properly laid out, non-intersecting elements pass clean', () => {
  const elements = [
    { id: 'a', rect: { x: 0, y: 0, width: 200, height: 100 }, ancestorIds: [] },
    { id: 'b', rect: { x: 0, y: 120, width: 200, height: 100 }, ancestorIds: [] },
    { id: 'c', rect: { x: 220, y: 0, width: 200, height: 220 }, ancestorIds: [] },
  ];

  const pairs = findOverlaps(elements);

  assert.deepEqual(pairs, [], 'stacked/side-by-side elements with no shared pixels must not be flagged');
});

test('a parent/child containment relationship is NOT flagged as overlap', () => {
  // A card and one of its own fields: the field's box sits entirely inside
  // the card's box, and the DOM says so via ancestorIds — this is containment
  // by design, not a layout defect, no matter how much of the child's area
  // the parent covers (in this case, all of it).
  const elements = [
    { id: 'card', rect: { x: 0, y: 0, width: 400, height: 300 }, ancestorIds: [] },
    { id: 'card-title', rect: { x: 20, y: 20, width: 200, height: 40 }, ancestorIds: ['card'] },
  ];

  const pairs = findOverlaps(elements);

  assert.deepEqual(pairs, [], 'a child sitting inside its own parent must not be reported as a violation');
});

test('containment is skipped even when the child pokes slightly outside the parent', () => {
  // Real layouts have negative margins and absolutely-positioned children
  // that spill a few pixels past the parent's edge. The ancestor relationship
  // still wins over the geometry — containment is read off the DOM tree, not
  // inferred from whether the boxes happen to nest exactly.
  const elements = [
    { id: 'card', rect: { x: 0, y: 0, width: 300, height: 200 }, ancestorIds: [] },
    { id: 'badge', rect: { x: 280, y: -10, width: 40, height: 40 }, ancestorIds: ['card'] },
  ];

  assert.deepEqual(findOverlaps(elements), []);
});

test('a sibling pair below the overlap threshold is not flagged', () => {
  // Two elements that share only a sliver — a 1px border, an anti-aliased
  // edge — should not read as a misplaced element.
  const elements = [
    { id: 'a', rect: { x: 0, y: 0, width: 100, height: 100 }, ancestorIds: [] },
    { id: 'b', rect: { x: 98, y: 0, width: 100, height: 100 }, ancestorIds: [] },
  ];

  const fraction = overlapFraction(elements[0].rect, elements[1].rect);
  assert.ok(fraction < OVERLAP_FRACTION_THRESHOLD, `expected a small sliver, got ${fraction}`);
  assert.deepEqual(findOverlaps(elements), []);
});

test('intersectionArea is 0 for disjoint rects and positive for overlapping ones', () => {
  assert.equal(intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 }), 0);
  assert.equal(intersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), 25);
});

test('elements with no rect (id not found in the render) are excluded, not treated as overlap', () => {
  const elements = [
    { id: 'a', rect: { x: 0, y: 0, width: 100, height: 100 }, ancestorIds: [] },
    { id: 'missing', rect: null, ancestorIds: [] },
  ];
  assert.deepEqual(findOverlaps(elements), []);
});

// ---------------------------------------------------------------------------
// scoreLayout — the gate as a whole, with render/measure injected
// ---------------------------------------------------------------------------

test('scoreLayout reports a measured overlap end to end with a fake render+measure', async () => {
  const result = await scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111', '2222222222'],
    render: async () => ({ html: '<div>fake render</div>', styled: true, reason: null }),
    measure: async () => ([
      { id: '1111111111', rect: { x: 0, y: 0, width: 200, height: 200 }, ancestorIds: [] },
      { id: '2222222222', rect: { x: 50, y: 50, width: 150, height: 150 }, ancestorIds: [] },
    ]),
  });

  assert.equal(result.measured, true);
  assert.equal(result.overlaps, 1);
  assert.equal(result.pairs.length, 1);
  assert.ok(result.warnings.some((w) => w.includes('overlap')));
});

test('scoreLayout reports a clean measured pass with no overlaps', async () => {
  const result = await scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111', '2222222222'],
    render: async () => ({ html: '<div>fake render</div>', styled: true, reason: null }),
    measure: async () => ([
      { id: '1111111111', rect: { x: 0, y: 0, width: 100, height: 100 }, ancestorIds: [] },
      { id: '2222222222', rect: { x: 0, y: 120, width: 100, height: 100 }, ancestorIds: [] },
    ]),
  });

  assert.equal(result.measured, true);
  assert.equal(result.overlaps, 0, 'a real, clean layout must score as measured-and-zero, not unmeasured');
  assert.deepEqual(result.pairs, []);
});

test('scoreLayout does not flag a real parent/child pair end to end', async () => {
  const result = await scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['card', 'card-title'],
    render: async () => ({ html: '<div>fake render</div>', styled: true, reason: null }),
    measure: async () => ([
      { id: 'card', rect: { x: 0, y: 0, width: 400, height: 300 }, ancestorIds: [] },
      { id: 'card-title', rect: { x: 20, y: 20, width: 200, height: 40 }, ancestorIds: ['card'] },
    ]),
  });

  assert.equal(result.overlaps, 0);
});

// ---------------------------------------------------------------------------
// Degradation: a render/measurement failure is `null`, never a crash and
// never a false "clean" (0).
// ---------------------------------------------------------------------------

test('scoreLayout degrades to overlaps:null (not a throw, not 0) when render fails', async () => {
  const result = await scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111'],
    render: async () => ({ screenshot: null, html: null, styled: false, reason: 'render failed: boom' }),
  });

  assert.equal(result.overlaps, null, 'an unmeasured layout gate must not read as a clean 0');
  assert.equal(result.measured, false);
  assert.ok(result.warnings.length > 0, 'a gate that could not measure must say why');
});

test('scoreLayout degrades to null when the render throws outright', async () => {
  await assert.doesNotReject(scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111'],
    render: async () => { throw new Error('esbuild exploded'); },
  }));

  const result = await scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111'],
    render: async () => { throw new Error('esbuild exploded'); },
  });
  assert.equal(result.overlaps, null);
  assert.equal(result.measured, false);
});

test('scoreLayout degrades to null when the render succeeds but is unstyled', () => {
  return scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111'],
    render: async () => ({ html: '<div>unstyled</div>', styled: false, reason: 'client stylesheet not built' }),
  }).then((result) => {
    assert.equal(result.overlaps, null, 'an unstyled render must not be scored as a clean layout');
    assert.equal(result.measured, false);
  });
});

test('scoreLayout degrades to null when geometry measurement itself fails', async () => {
  const result = await scoreLayout({
    source: 'export default function Comp() { return null; }',
    ids: ['1111111111'],
    render: async () => ({ html: '<div>fake render</div>', styled: true, reason: null }),
    measure: async () => null, // no Chromium available, etc.
  });

  assert.equal(result.overlaps, null);
  assert.equal(result.measured, false);
});

test('scoreLayout with no source or no ids is unmeasured, not a crash', async () => {
  const noSource = await scoreLayout({ source: null, ids: ['1111111111'] });
  assert.equal(noSource.overlaps, null);

  const noIds = await scoreLayout({ source: 'export default () => null;', ids: [] });
  assert.equal(noIds.overlaps, null);
});

// ---------------------------------------------------------------------------
// The score contribution helper — documented but NOT wired into
// computeScore()/computeJobScore() (see layout.js's header and this task's
// report: §18.1's formula is a closed, versioned sum with no free slot).
// ---------------------------------------------------------------------------

test('layoutScoreContribution treats null as a full pass, like every other §18 gate treats "unmeasured"', () => {
  assert.equal(layoutScoreContribution(null, { weight: 15 }), 15);
});

test('layoutScoreContribution penalises a measured overlap count', () => {
  assert.equal(layoutScoreContribution(0, { weight: 15, maxOverlaps: 3 }), 15);
  assert.ok(layoutScoreContribution(3, { weight: 15, maxOverlaps: 3 }) < layoutScoreContribution(1, { weight: 15, maxOverlaps: 3 }));
  assert.equal(layoutScoreContribution(10, { weight: 15, maxOverlaps: 3 }), 0, 'penalty caps at the full weight');
});

// ---------------------------------------------------------------------------
// Real Chromium, real geometry — the one test that proves the actual claim:
// getBoundingClientRect() here is not jsdom's permanent zero.
// ---------------------------------------------------------------------------

test('measureLayout (real Puppeteer) reads genuine, non-zero geometry that jsdom could never produce', async () => {
  const { measureLayout } = await import('../server/src/quality/browser.js');
  const { closeBrowser } = await import('../server/src/quality/browser.js');

  const html = [
    '<!DOCTYPE html><html><head><style>body{margin:0}</style></head><body>',
    '<div id="1111111111" style="position:absolute;left:0px;top:0px;width:200px;height:200px;background:red;"></div>',
    '<div id="2222222222" style="position:absolute;left:100px;top:100px;width:200px;height:200px;background:blue;"></div>',
    '</body></html>',
  ].join('');

  let elements;
  try {
    elements = await measureLayout(html, ['1111111111', '2222222222']);
  } finally {
    await closeBrowser();
  }

  assert.ok(Array.isArray(elements), 'measureLayout returned null — Chromium likely unavailable in this environment');
  const [a, b] = elements;
  assert.ok(a.rect.width > 0 && a.rect.height > 0, 'jsdom would report zero here; a real browser must not');
  assert.ok(b.rect.width > 0 && b.rect.height > 0);

  const pairs = findOverlaps(elements);
  assert.equal(pairs.length, 1, 'two absolutely-positioned, intersecting boxes must be caught using real geometry');
});
