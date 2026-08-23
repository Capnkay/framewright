// Two or more generated sections on the same page render on top of/beside
// each other instead of stacking. §7 R11 requires "two columns on desktop,
// stacked on mobile" for a SINGLE section's own media/content split — and
// that promise silently breaks one level up, across MULTIPLE sections, when
// the page that hosts them is itself a flex row.
//
// THE DEFECT, found by re-testing real wireframes through the Studio UI and
// screenshotting the actual `/preview/:pageName` route (not just reading the
// emitted JSX). Generating more than one section for the same page — the
// ordinary "iterate on a design" workflow client/src/pages/Studio.jsx's own
// `generate()` supports, since it never clears prior sections for a pageName
// before adding another — puts multiple full-width `<section className="...
// flex flex-col md:flex-row ...">` block elements inside
// `client/src/pages/Preview.jsx`'s `custom-preview-frame` container.
//
// `client/src/studio.css`'s `.custom-preview-frame` rule sets `display:flex`
// (with `justify-content:center; align-items:flex-start`) — a leftover from
// when this container centered a single `<iframe>` (see the adjacent, now
// dead, `.custom-preview-frame iframe{...}` rule). With real section
// components as children instead of one iframe, `display:flex`'s default
// `flex-direction:row` and default `flex-shrink:1` mean:
//   - every section is squeezed into a narrow column instead of the page's
//     full width (measured: a `grid-cols-3` stat-card row's own columns
//     dropped from ~229px to 36px wide on a 1440px viewport), and
//   - sections that should stack one below another lay out side by side.
//
// The stat cards inside that 36px column then wrap so tightly the rendered
// text visually smears into its neighbour — "1000+" and "40+" occupying the
// same few pixels — which is exactly the "overlapping elements" symptom a
// human QA pass reported. The grid itself is not broken (verified directly:
// `getComputedStyle` on the stat-badges container reports
// `display:grid` and three DISTINCT, non-overlapping `grid-template-columns`
// the whole time) — the container everything sits inside is just too narrow
// to hold it, because it was never supposed to hold more than one iframe.
//
// FIX IS IN studio.css, NOT IN THE GENERATED COMPONENT. AGENTS.md rule 3's
// protected surface (dangerouslySetInnerHTML, dynamicStyle, the ids map, CSS
// via getElementById) is untouched — this is Studio chrome CSS, not anything
// CONTRACT.md §6-§8 freezes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO_CSS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/src/studio.css',
);

function customPreviewFrameRule(css) {
  const match = css.match(/\.custom-preview-frame\s*\{([^}]*)\}/);
  assert.ok(match, '.custom-preview-frame rule is gone from studio.css — update this test to wherever it moved');
  return match[1];
}

test('.custom-preview-frame does not force a flex ROW onto the sections it hosts', async () => {
  const css = await fs.readFile(STUDIO_CSS, 'utf8');
  const rule = customPreviewFrameRule(css);

  // The rule may legitimately not declare `display` at all (block is the
  // default for a <div>) or declare `display:block` explicitly. What it must
  // never do again is `display:flex` with no `flex-direction:column` beside
  // it — that combination is what puts multiple full-width <section> block
  // children side by side instead of stacked.
  const displayMatch = rule.match(/display\s*:\s*([a-z-]+)/i);
  if (displayMatch && /^flex$/i.test(displayMatch[1])) {
    assert.match(
      rule,
      /flex-direction\s*:\s*column/i,
      '.custom-preview-frame is display:flex with no flex-direction:column — ' +
      'multiple sections on one page will lay out side by side and get ' +
      'squeezed narrow enough for their own text to visually overlap',
    );
  }
});

test('.custom-preview-frame does not center its children on the main axis either', async () => {
  // `justify-content:center` is only meaningful alongside `display:flex`/
  // `display:grid`; it is harmless on its own but its presence beside a flex
  // display is the same defect from a second angle — a single-iframe
  // centering rule left on a container that now holds real, full-width
  // section content. Asserted separately so a fix that changes `display` but
  // forgets this sibling declaration still gets caught.
  const css = await fs.readFile(STUDIO_CSS, 'utf8');
  const rule = customPreviewFrameRule(css);
  const displayMatch = rule.match(/display\s*:\s*([a-z-]+)/i);

  if (displayMatch && /^(flex|grid)$/i.test(displayMatch[1])) {
    assert.doesNotMatch(
      rule,
      /justify-content\s*:\s*center/i,
      '.custom-preview-frame centers on the main axis while also being a flex/grid container — ' +
      'this is the single-iframe-centering rule, still applied to a container that now holds real sections',
    );
  }
});
