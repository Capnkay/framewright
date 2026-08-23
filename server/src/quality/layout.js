// server/src/quality/layout.js
//
// The layout-overlap gate. CONTRACT.md §18's table names five gates; this is
// a sixth, added after a real generation was inspected and showed elements
// overlapping on screen — nothing in §18 as written catches that.
//
// WHY jsdom CANNOT MEASURE THIS. accessibility.js mounts the generated
// component in jsdom and runs axe-core on it, and that works because axe-core
// mostly inspects DOM structure and attributes, not computed geometry. Overlap
// is a geometry question: jsdom has no CSS box model, so every element's
// `getBoundingClientRect()` there is `{0,0,0,0}`. A gate built on jsdom would
// therefore report "no overlap" on every generation, whether or not any
// existed — which is worse than having no gate at all, because a metric that
// always passes reads as a guarantee. docs/BENCHMARK-RESULTS.md B-010 is
// explicit about the same shape of mistake for the accessibility gate:
// "unmeasured must not flatter the score." A gate that cannot tell "clean"
// from "never checked" is exactly that failure, so this one uses a real
// layout engine (Puppeteer/Chromium — see server/src/quality/browser.js's
// `measureLayout`) instead of jsdom, and returns `null` rather than `0` when
// it cannot measure. NULL IS NOT ZERO, the same distinction visual.js and
// accessibility.js already draw: `null` means "not applicable / not
// measured", a number means "measured".
//
// CONTAINMENT IS NOT OVERLAP. A card's own children legitimately sit inside
// the card's box — that is the layout working as designed, not a defect.
// Only two elements that are NOT each other's DOM ancestor/descendant, and
// whose boxes intersect over a real fraction of the smaller box's area, count
// as a violation. Containment is read off the actual DOM tree
// (`browser.js`'s `measureLayout` walks `parentElement` chains), not
// inferred from coordinates, because two unrelated elements can coincide
// geometrically without being nested, and a nested pair can have boxes
// (negative margin, absolutely-positioned children) that geometry alone would
// misclassify.
//
// WHY THIS REUSES `renderComponent` (render.js) RATHER THAN A SECOND BUNDLER.
// The §18 critic loop already bundles the emitted JSX with esbuild and
// server-renders it to an HTML string (render.js), then screenshots that
// string with Puppeteer (browser.js). That HTML string is exactly what this
// gate needs too — it is the same rendered document, just measured instead of
// photographed. Calling `renderComponent` again here does re-run the esbuild
// bundle (renderComponent does not cache its output), but it launches no
// second browser: `browser.js`'s `getBrowser()` is a module-level singleton,
// so the Chromium PROCESS is shared with whatever else in this process asked
// for one first — this gate only ever pays for one more Puppeteer PAGE, which
// measured at ~60-90ms against an already-running browser (see
// browser.js:measureLayout and this repo's manual benchmark in this task's
// report). The two calls were not merged into a single render pass because
// doing so would mean changing `renderComponent`'s and `screenshotHtml`'s
// existing signatures/return shapes, which every other §18 caller
// (criticLoop.js) already depends on — an in-scope but riskier refactor this
// task declined in favour of the additive, lower-blast-radius path.
//
// NEVER THROWS. Same posture as every §18 gate: a render or measurement
// failure returns `overlaps: null` ("not measured"), never `0` ("measured,
// none found"). A crashed browser, an unbundleable component, or a field id
// the render never produced must not silently read as a clean layout.

import { renderComponent } from './render.js';
import { measureLayout } from './browser.js';

/**
 * Below this fraction of the SMALLER element's area, an intersection is
 * treated as incidental (rounded corners, a 1px shadow, anti-aliasing at a
 * shared edge) rather than a real overlap. §18 gives no number for any gate's
 * threshold — visual.js's LOW_SIMILARITY (0.60) and accessibility.js's
 * axeSeriousViolations denominator (5) are both judgement calls written down
 * rather than derived, and this is the same kind of call: 20% of the smaller
 * box is small enough to flag a genuinely misplaced element, and large enough
 * that two elements merely sharing a border do not trip it.
 */
export const OVERLAP_FRACTION_THRESHOLD = 0.2;

function rectArea(rect) {
  if (!rect) return 0;
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

/** Intersection area of two `{x, y, width, height}` rects. 0 when disjoint. */
export function intersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

/**
 * Intersection area as a fraction of the SMALLER rect's own area — not the
 * union, and not the larger rect's area. A tiny badge sitting fully inside a
 * hero image should read as "the badge is 100% covered", which the smaller
 * rect makes true regardless of how enormous the hero is; dividing by the
 * union would dilute that same overlap toward zero as the hero gets bigger.
 */
export function overlapFraction(a, b) {
  const inter = intersectionArea(a, b);
  if (inter <= 0) return 0;
  const smaller = Math.min(rectArea(a), rectArea(b));
  if (smaller <= 0) return 0;
  return inter / smaller;
}

function isContainment(a, b) {
  return (
    (Array.isArray(a.ancestorIds) && a.ancestorIds.includes(b.id))
    || (Array.isArray(b.ancestorIds) && b.ancestorIds.includes(a.id))
  );
}

/**
 * findOverlaps(elements, { threshold }) -> [{ a, b, fraction }]
 *
 * Pure, synchronous, and browser-free — every geometry decision this gate
 * makes lives here so it can be tested directly, the same way visual.js's
 * `compare` is tested without a real pixelmatch run.
 *
 * `elements`: `[{ id, rect: {x,y,width,height}|null, ancestorIds: [id] }]`,
 * the shape `browser.js`'s `measureLayout` returns. Elements with no rect
 * (the id was not found in the rendered DOM) or zero area (`display: none`,
 * an empty inline element) are excluded — there is nothing to overlap with.
 * Ancestor/descendant pairs are skipped entirely: containment is not overlap,
 * by design, regardless of how much of the child's box sits inside the
 * parent's.
 */
export function findOverlaps(elements, { threshold = OVERLAP_FRACTION_THRESHOLD } = {}) {
  const list = Array.isArray(elements)
    ? elements.filter((e) => e && e.rect && rectArea(e.rect) > 0)
    : [];

  const pairs = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      if (isContainment(a, b)) continue;
      const fraction = overlapFraction(a.rect, b.rect);
      if (fraction >= threshold) {
        pairs.push({ a: a.id, b: b.id, fraction: Math.round(fraction * 1000) / 1000 });
      }
    }
  }
  return pairs;
}

/**
 * scoreLayout({ source, ids, ... }) -> { overlaps, pairs, warnings, measured }
 *
 * The gate as a whole: render the emitted `source`, measure the real
 * geometry of `ids` (the field ids the caller already has from the IR — this
 * function never invents one), and report sibling overlaps.
 *
 * `overlaps` is `null` when the gate could not measure (no source, no ids, a
 * render that produced nothing usable, a browser that would not launch) and
 * a NUMBER — 0 included — only when a real render was actually measured.
 * Never throws; every failure is a `warnings` entry plus `overlaps: null`.
 *
 * `render` and `measure` are injected (defaulting to the real
 * `renderComponent` / `measureLayout`) so tests can exercise the geometry and
 * the render-failure path without launching Chromium or esbuild, the same
 * pattern criticLoop.js already uses for `render` and `critic`.
 */
export async function scoreLayout({
  source,
  ids,
  width = 1600,
  height = 1200,
  threshold = OVERLAP_FRACTION_THRESHOLD,
  render = renderComponent,
  measure = measureLayout,
} = {}) {
  const warnings = [];
  const none = (reason) => {
    if (reason) warnings.push(reason);
    return { overlaps: null, pairs: [], warnings, measured: false };
  };

  if (!source || typeof source !== 'string') {
    return none('layout gate skipped: no component source to render');
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return none('layout gate skipped: no field ids supplied to measure');
  }

  let rendered;
  try {
    rendered = await render(source, { width, height });
  } catch (err) {
    return none(`layout gate skipped: render threw: ${err && err.message ? err.message : String(err)}`);
  }
  if (!rendered || !rendered.html) {
    return none(`layout gate skipped: ${(rendered && rendered.reason) || 'no HTML produced'}`);
  }
  if (!rendered.styled) {
    // Same reasoning as criticLoop.js's identical check: an unstyled render
    // stacks every element in document order at browser-default type, which
    // would report "overlap" (or its absence) as an artifact of the missing
    // stylesheet rather than a real property of the generation. Unmeasured is
    // honest here; "measured, unstyled" would flatter or damn the score by an
    // infrastructure accident that has nothing to do with what was generated.
    return none(rendered.reason || 'layout gate skipped: render was unstyled');
  }

  let elements;
  try {
    elements = await measure(rendered.html, ids, { width, height });
  } catch (err) {
    return none(`layout gate skipped: measurement threw: ${err && err.message ? err.message : String(err)}`);
  }
  if (!Array.isArray(elements)) {
    return none('layout gate skipped: geometry unavailable (no browser, or measurement failed)');
  }

  const missing = elements.filter((e) => !e || !e.rect).map((e) => e && e.id);
  if (missing.length) {
    warnings.push(
      `layout gate: ${missing.length} field id(s) were not found in the rendered DOM: ${missing.join(', ')}`,
    );
  }

  const pairs = findOverlaps(elements, { threshold });
  if (pairs.length) {
    warnings.push(
      `layout gate: ${pairs.length} sibling element pair(s) overlap by more than `
      + `${Math.round(threshold * 100)}% of the smaller element's area — `
      + pairs.map((p) => `${p.a}↔${p.b} (${Math.round(p.fraction * 100)}%)`).join(', ')
      + '.',
    );
  }

  return { overlaps: pairs.length, pairs, warnings, measured: true };
}

/**
 * §18.1's formula (score.js) is a closed, versioned sum that already totals
 * 100 across its five named terms and has no documented slot for a sixth
 * gate — unlike visual.js's `visualScoreContribution`, this function is
 * deliberately NOT wired into `computeScore`/`computeJobScore`. See this
 * task's report for why that is a judgement call left for a human rather
 * than something this file should decide by inventing a weight. It is
 * exported anyway so a future §18.1 revision has a ready-made, documented
 * shape to slot in rather than reinventing the null-handling.
 *
 *     contribution = W * (overlaps === null ? 1.0 : (1 - min(1, overlaps / N)))
 *
 * mirrors axeSeriousViolations' shape (penalise on a measured count, treat
 * `null` as "don't penalise" per §18.1's own null-is-not-zero rule) rather
 * than visualSimilarity's (treat `null` as a full free pass) — an unmeasured
 * layout gate is an environment failure, not "no wireframe supplied", so it
 * should not silently flatter the score either. `N` is left to the caller;
 * this file does not guess how many overlaps should zero out the term.
 */
export function layoutScoreContribution(overlaps, { weight = 1, maxOverlaps = 3 } = {}) {
  if (overlaps === null || overlaps === undefined) return weight;
  const penalty = Math.min(1, overlaps / maxOverlaps);
  return weight * (1 - penalty);
}

export default scoreLayout;
