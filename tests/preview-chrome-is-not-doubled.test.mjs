// The preview route renders in two contexts and the chrome belongs to one. §7 R11.
//
// THE DEFECT, seen in a browser rather than in a test. `/preview/:pageName` was
// wrapped in StudioLayout, which renders StudioNav. The Studio frames that same
// route in an iframe — deliberately, because R11's stacking comes from a `md:`
// media query and only a real viewport triggers one, so a narrowed container
// would be a width preview and not a layout preview.
//
// So the app's own navigation appeared a SECOND time inside the preview pane:
// "Framewright · Home · Studio · Preview · Sign in", nested inside the Studio
// that was already showing it.
//
// Checked on the source rather than by rendering, because the thing under test is
// a decision made from `window.self !== window.top` — and standing up two nested
// browsing contexts in jsdom to assert it would test jsdom.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../client/src/App.jsx',
);

// RESOLVED, NOT PINNED. This suite used to read App.jsx and look for a
// `StudioLayout`/`StudioChrome` naming a `StudioNav`. The client rework moved the
// chrome into `<Shell>` in components/Shell.jsx and renamed the nav, at which point
// all three tests failed for the wrong reason — the wrapper's NAME changed, which
// this file's own header says it is not about. The defect was real and concurrent:
// Shell rendered its nav unconditionally, so the doubled nav was back.
//
// So the wrapper is now resolved from the preview route and followed to whichever
// file defines it, and the framed rule is asserted THERE. The property is the same
// one T-145 pinned; only the lookup stopped assuming a name.

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/src');

async function resolvePreviewChrome() {
  const app = await fs.readFile(path.join(CLIENT, 'App.jsx'), 'utf8');

  const route = app.match(/path="\/preview\/:pageName"[\s\S]{0,200}?element=\{/);
  assert.ok(route, 'the preview route is gone from App.jsx');

  // The chrome is whatever wraps the routes the preview route sits among, or
  // wraps the element directly. Both spellings have been used here.
  const wrapperName =
    (app.match(/<([A-Z][A-Za-z0-9]*)>\s*[\s\S]{0,400}?path="\/preview\/:pageName"/) || [])[1] ||
    (app.match(/path="\/preview\/:pageName"\s+element=\{<([A-Z][A-Za-z0-9]*)\b/) || [])[1];
  assert.ok(wrapperName, 'the preview route no longer wraps its page in any chrome at all');

  // Follow the import to the file that defines it; fall back to App.jsx itself.
  // Double backslashes: this is a TEMPLATE LITERAL, where `\s` collapses to `s`
  // and `\b` becomes a backspace character before RegExp ever sees it.
  const imp = app.match(new RegExp(`import\\s*\\{[^}]*\\b${wrapperName}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`));
  let file = path.join(CLIENT, 'App.jsx');
  if (imp) {
    const rel = imp[1].replace(/^\.\//, '');
    file = path.join(CLIENT, rel);
  }
  return { wrapperName, file, source: await fs.readFile(file, 'utf8') };
}

test('the layout decides whether it is framed', async () => {
  const { wrapperName, source } = await resolvePreviewChrome();

  assert.match(source, /window\.self\s*!==\s*window\.top/, `${wrapperName}'s file never detects being framed`);
});

test('the frame check cannot throw the app down', async () => {
  // `window.top` throws on a cross-origin parent, and these routes are also
  // rendered by `renderToString` where there is no `window` at all. Either one
  // throwing during render takes the whole page with it.
  const { wrapperName, source } = await resolvePreviewChrome();

  assert.match(source, /typeof window [!=]== 'undefined'/, `${wrapperName}'s file has no guard for a windowless render`);
  assert.match(source, /catch\s*\{[\s\S]{0,200}return true/, 'a throwing window.top is not handled');
});

test('the preview still has chrome when opened directly', async () => {
  // The nav was added on purpose. This removes it only in the framed case, so a
  // person who opens /preview/Home in a tab still gets a way back.
  const { wrapperName, source } = await resolvePreviewChrome();

  const component = source.match(new RegExp(`function ${wrapperName}\\([\\s\\S]*?\\n\\}`));
  assert.ok(component, `${wrapperName} wraps the preview route but is not defined in the file it is imported from`);

  assert.match(component[0], /const framed = isFramed\(\)/, `${wrapperName} never asks whether it is framed`);
  assert.match(
    component[0],
    /framed\s*\?\s*null\s*:\s*<[A-Z][A-Za-z0-9]*\s*\/>/,
    `${wrapperName} renders its nav unconditionally — the app's nav appears again inside the preview iframe`,
  );
});
