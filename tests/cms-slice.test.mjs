// tests/cms-slice.test.mjs — T-008, CONTRACT.md §5.2.
//
// The dedicated slice-shape suite. tests/golden.test.mjs already exercises the
// §5.0 flattening through the component's eyes, and tests/app-shell.test.mjs
// checks the namespace is mounted; this file pins §5.2 itself — the seven keys,
// their initial values, the four legal status values, and the reducer
// properties Redux relies on but nothing else asserts.
//
// WHY cmsSlice.js STILL DOES NOT IMPORT @reduxjs/toolkit. The file's own header
// anticipates swapping its hand-built wrapper for a real `createSlice` once the
// dependency is installed, and T-001 has now installed it. That swap is
// deliberately NOT made here: `tests/golden.test.mjs` imports this module, and a
// top-level import of @reduxjs/toolkit would make `npm test` require
// `npm install` — which is exactly the regression F-005 documents, where a
// static `mongodb` import in the store factory turned the whole suite red on a
// fresh clone. The wrapper is shaped like a createSlice result, so
// `configureStore({ reducer: reducerMap })` in main.jsx consumes it unchanged.
// Nothing is gained by taking on the dependency and the no-install guarantee is
// lost by it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cmsSlice,
  cmsReducer,
  cmsActions,
  initialCmsState,
  hydrateElements,
  computeMissing,
} from '../client/src/redux/cmsSlice.js';

const LEGAL_STATUSES = ['idle', 'loading', 'succeeded', 'failed'];

// ---------------------------------------------------------------------
// 1. The seven keys and their initial values (§5.2, amended in v1.6 by T-068).
// ---------------------------------------------------------------------
test('the slice has exactly §5.2 seven keys, with the initial values it implies', () => {
  const state = initialCmsState();

  assert.deepEqual(Object.keys(state).sort(), [
    'allSections',
    'allSectionsConfidence',
    'allSectionsCss',
    'error',
    'missing',
    'sectionNames',
    'status',
  ]);

  assert.deepEqual(state.allSections, {});
  assert.deepEqual(state.allSectionsCss, {});
  assert.deepEqual(state.allSectionsConfidence, {});
  assert.deepEqual(state.sectionNames, {});
  assert.equal(state.status, 'idle');
  assert.equal(state.error, null);
  assert.deepEqual(state.missing, {});
});

test('initialCmsState returns a fresh object each call', () => {
  // A shared mutable default would leak one page's hydration into the next
  // store, which is the kind of fault that only shows up on the second render.
  const a = initialCmsState();
  const b = initialCmsState();
  assert.notEqual(a, b);
  a.allSections.Home = { '2000000003': 'mutated' };
  assert.deepEqual(b.allSections, {});
});

// ---------------------------------------------------------------------
// 2. The reducer behaves like a reducer.
// ---------------------------------------------------------------------
test('the reducer is usable as a real Redux reducer', () => {
  // Shaped like a createSlice result, so configureStore consumes it unchanged.
  assert.equal(cmsSlice.name, 'cms');
  assert.equal(typeof cmsSlice.reducer, 'function');
  assert.equal(cmsSlice.reducer, cmsReducer);

  // Redux calls every reducer with undefined state and a private init action.
  const initial = cmsReducer(undefined, { type: '@@redux/INIT' });
  assert.deepEqual(Object.keys(initial).length, 7);

  // And probes with an action nobody handles; returning undefined throws.
  const same = cmsReducer(initial, { type: 'x/unhandled' });
  assert.equal(same, initial, 'an unhandled action returns the same reference');
});

test('hydrating does not mutate the previous state', () => {
  // Redux requires reducers to be pure. A mutation here would defeat
  // useSelector's reference equality and the preview would stop re-rendering
  // on a PATCH — the §9 symptom, from a different cause.
  const before = initialCmsState();
  const snapshot = JSON.stringify(before);

  const after = hydrateElements(
    before,
    [
      {
        fieldId: '2000000003',
        contentType: 'Text',
        content: 'CHALLENGE YOUR LIMITS',
        css: null,
        pageName: 'Home',
      },
    ],
    'Home',
  );

  assert.equal(JSON.stringify(before), snapshot, 'the input state must be untouched');
  assert.notEqual(after, before);
  assert.equal(after.allSections.Home['2000000003'], 'CHALLENGE YOUR LIMITS');
});

// ---------------------------------------------------------------------
// 3. status and error — the pair that makes a failed hydration visible.
// ---------------------------------------------------------------------
test('status round-trips each of the four §5.2 values, and error is string or null', () => {
  let state = initialCmsState();
  for (const status of LEGAL_STATUSES) {
    state = cmsReducer(state, cmsActions.statusSet(status));
    assert.equal(state.status, status);
  }
  assert.equal(LEGAL_STATUSES.length, 4);

  // §5.2: status and error exist so a failed hydration is visible in the UI
  // instead of hiding behind the component's default fallbacks.
  const failed = cmsReducer(initialCmsState(), cmsActions.errorSet('GET /api/elements failed'));
  assert.equal(failed.status, 'failed', 'setting an error must also mark the status failed');
  assert.equal(failed.error, 'GET /api/elements failed');
});

// ---------------------------------------------------------------------
// 4. pageName is a case-sensitive key (§1) — the §9 trap.
// ---------------------------------------------------------------------
test('Home and home are different keys, and neither leaks into the other (§1)', () => {
  // §1 states this outright, and §9 names a pageName case mismatch as a cause
  // of a preview that renders correctly from defaults while the store is empty.
  const element = (pageName) => ({
    fieldId: '2000000003',
    contentType: 'Text',
    content: pageName === 'Home' ? 'UPPER' : 'lower',
    css: null,
    pageName,
  });

  let state = hydrateElements(initialCmsState(), [element('Home')], 'Home');
  state = hydrateElements(state, [element('home')], 'home');

  assert.equal(state.allSections.Home['2000000003'], 'UPPER');
  assert.equal(state.allSections.home['2000000003'], 'lower');
  assert.deepEqual(Object.keys(state.allSections).sort(), ['Home', 'home']);
});

test('an element whose pageName differs from the hydration target is ignored', () => {
  // Elements written under the wrong page must not silently populate the page
  // being previewed — the other half of the same §9 failure mode.
  const state = hydrateElements(
    initialCmsState(),
    [{ fieldId: '2000000003', contentType: 'Text', content: 'x', css: null, pageName: 'About' }],
    'Home',
  );
  assert.deepEqual(state.allSections.Home, {});
});

// ---------------------------------------------------------------------
// 5. Both value shapes §5.2 allows, and the css map.
// ---------------------------------------------------------------------
test('allSections holds a string for a text element and the array for a Cards element', () => {
  const state = hydrateElements(
    initialCmsState(),
    [
      { fieldId: '2000000003', contentType: 'Text', content: 'HEADLINE', css: 'font-weight: bold;', pageName: 'Home' },
      {
        fieldId: '2000000006',
        contentType: 'Cards',
        content: null,
        css: null,
        pageName: 'Home',
        loop: [{ field1: '1000+', fieldId1: '3000000001', field2: 'Members', fieldId2: '3000000002' }],
      },
    ],
    'Home',
  );

  const sections = state.allSections.Home;
  assert.equal(typeof sections['2000000003'], 'string');
  assert.ok(Array.isArray(sections['2000000006']), 'a Cards element holds its whole loop array');

  // §5.0 step 2 — each nested fieldIdN gets its own top-level key.
  assert.equal(sections['3000000001'], '1000+');
  assert.equal(sections['3000000002'], 'Members');

  // allSectionsCss is keyed by fieldId, and a null css writes no key.
  assert.equal(state.allSectionsCss.Home['2000000003'], 'font-weight: bold;');
  assert.ok(!('2000000006' in state.allSectionsCss.Home), 'a null css must not create a key');
});

// ---------------------------------------------------------------------
// 6. missing — the §5.1 safety net.
// ---------------------------------------------------------------------
test('missing records exactly the requested IDs that never arrived (§5.1)', () => {
  const state = hydrateElements(
    initialCmsState(),
    [{ fieldId: '2000000003', contentType: 'Text', content: 'x', css: null, pageName: 'Home' }],
    'Home',
  );
  const sections = state.allSections.Home;

  assert.deepEqual(computeMissing(['2000000003'], sections), []);
  assert.deepEqual(computeMissing(['2000000003', '2000000004'], sections), ['2000000004']);

  const withMissing = cmsReducer(state, cmsActions.missingSet('Home', ['2000000004']));
  assert.deepEqual(withMissing.missing.Home, ['2000000004']);

  // A nested card ID counts as present only once the flattening has run — this
  // is what turns a half-hydrated Cards element from silent into observable.
  assert.deepEqual(computeMissing(['3000000001'], sections), ['3000000001']);
});

// ---------------------------------------------------------------------
// 7. sectionNames is declared and unwritten — F-004, asserted so it stays known.
// ---------------------------------------------------------------------
test('sectionNames stays empty because no reducer writes it yet (F-004)', () => {
  // §5.2 declares sectionNames as { [sectionId]: sectionName }, and nothing in
  // the repository populates it. T-050 needs it to pick which generated module
  // to mount. Asserted rather than left as folklore: when someone adds the
  // writer, this test fails and points at the finding.
  const state = hydrateElements(
    initialCmsState(),
    [{ fieldId: '2000000003', contentType: 'Text', content: 'x', css: null, pageName: 'Home' }],
    'Home',
  );
  assert.deepEqual(state.sectionNames, {}, 'see _build/findings/F-004.md');
});

// ---------------------------------------------------------------------
// 8. The module stays dependency-free, so npm test needs no npm install.
// ---------------------------------------------------------------------
test('cmsSlice.js imports nothing from node_modules', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../client/src/redux/cmsSlice.js', import.meta.url),
    'utf8',
  );
  const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  for (const specifier of imports) {
    assert.ok(
      specifier.startsWith('.') || specifier.startsWith('node:'),
      `cmsSlice.js must not import "${specifier}" — golden.test.mjs imports this module, and a ` +
        'node_modules dependency here makes npm test require npm install (see F-005)',
    );
  }
});
