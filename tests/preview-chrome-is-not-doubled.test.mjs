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

test('the layout decides whether it is framed', async () => {
  const source = await fs.readFile(APP, 'utf8');

  assert.match(source, /window\.self\s*!==\s*window\.top/, 'nothing detects being framed');
  // And the nav is conditional on it, not unconditional.
  assert.match(
    source,
    /framed\s*\?\s*null\s*:\s*<StudioNav/,
    'StudioNav is still rendered unconditionally',
  );
});

test('the frame check cannot throw the app down', async () => {
  // `window.top` throws on a cross-origin parent, and these routes are also
  // rendered by `renderToString` where there is no `window` at all. Either one
  // throwing during render takes the whole page with it.
  const source = await fs.readFile(APP, 'utf8');

  assert.match(source, /typeof window !== 'undefined'/, 'no guard for a windowless render');
  assert.match(source, /catch\s*\{[\s\S]{0,200}return true/, 'a throwing window.top is not handled');
});

test('the preview still has chrome when opened directly', async () => {
  // The nav was added on purpose. This removes it only in the framed case, so a
  // person who opens /preview/Home in a tab still gets a way back.
  //
  // NAMED BY WRAPPER RATHER THAN PINNED TO ONE. This asserted `<StudioLayout>`
  // literally, and T-155's dark-theme pass moved the route onto `<StudioChrome>` —
  // at which point the assertion failed for the right reason and the wrong one at
  // once. The right one: StudioChrome rendered StudioNav unconditionally, so the
  // doubled nav was genuinely back. The wrong one: the route is allowed to change
  // which chrome it wears, and this test is not about the name.
  //
  // So it reads the wrapper the route actually uses and then holds THAT wrapper to
  // the framed rule, which is the property T-145 was about.
  const source = await fs.readFile(APP, 'utf8');

  const route = source.match(/path="\/preview\/:pageName"\s+element=\{<([A-Za-z]+)>/);
  assert.ok(route, 'the preview route no longer wraps its page in any chrome at all');

  const wrapper = route[1];
  const component = source.match(new RegExp(`function ${wrapper}\\(\\{[^}]*\\}\\)\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(component, `${wrapper} wraps the preview route but is not defined in App.jsx`);

  assert.match(component[0], /const framed = isFramed\(\)/, `${wrapper} never asks whether it is framed`);
  assert.match(
    component[0],
    /framed\s*\?\s*null\s*:\s*<StudioNav/,
    `${wrapper} renders StudioNav unconditionally — the app's nav appears again inside the preview iframe`,
  );
});
