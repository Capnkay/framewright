// tests/golden.test.mjs
//
// Zero-dependency Node test for deliverable 0.6 — runs via `node --test
// tests/`. No server, no database, no Vite dev server: the store here is a
// hand-rolled mock (cmsReducer + a fake dispatch/getState), and the
// component under test is exercised through its extracted pure logic
// (client/src/sections/generated/HeroSection.logic.js), never through JSX,
// so nothing in this file requires react, react-redux, @reduxjs/toolkit or
// primereact to be installed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  cmsSlice,
  hydrateElements,
  computeMissing,
  initialCmsState,
} from '../client/src/redux/cmsSlice.js';
import { fetchElementsByIds } from '../client/src/redux/fetchElementsByIds.js';
import { getHtml } from '../client/src/utils/getHtml.js';
import { getImage, errorImage } from '../client/src/utils/image.js';
import { isSafeCssText } from '../client/src/utils/css.js';
import { getSectionTextContrastClass } from '../client/src/utils/sectionContrast.js';
import {
  ids,
  getStatItems,
  getTextValue,
  getCardFieldValue,
  getAllMountFieldIds,
} from '../client/src/sections/generated/HeroSection.logic.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const elements = JSON.parse(readFileSync(path.join(__dirname, '../server/data/seed/elements.json'), 'utf8'));
const section = JSON.parse(readFileSync(path.join(__dirname, '../server/data/seed/sections.json'), 'utf8'))[0];
const PAGE_NAME = section.pageName; // "Home"
const CARDS_ELEMENT = elements.find((el) => el.contentType === 'Cards');

// A minimal mock store: dispatch either runs a plain action through
// cmsSlice.reducer, or — if it's a thunk function — calls it with
// (dispatch, getState, extraArgument), exactly like real thunk middleware.
function makeMockStore() {
  let state = initialCmsState();
  const store = {
    getState: () => ({ cms: state }),
    dispatch: (action, extraArgument = {}) => {
      if (typeof action === 'function') {
        return action(store.dispatch, store.getState, extraArgument);
      }
      state = cmsSlice.reducer(state, action);
      return action;
    },
  };
  return store;
}

// ---------------------------------------------------------------------
// 1. The reducer hydrates every top-level fieldId from seed/elements.json.
// ---------------------------------------------------------------------
test('reducer hydrates every top-level fieldId from seed/elements.json', () => {
  const state = hydrateElements(initialCmsState(), elements, PAGE_NAME);
  const sectionsForPage = state.allSections[PAGE_NAME];
  for (const el of elements) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(sectionsForPage, el.fieldId),
      `expected allSections.${PAGE_NAME} to have a key for ${el.elementName} (${el.fieldId})`,
    );
  }
});

// ---------------------------------------------------------------------
// 2. Every nested card field ID gets its own top-level store key (§5.0).
// ---------------------------------------------------------------------
test('every nested card field ID gets its own top-level store key (THE FLATTENING RULE, §5.0)', () => {
  const state = hydrateElements(initialCmsState(), elements, PAGE_NAME);
  const sectionsForPage = state.allSections[PAGE_NAME];
  for (const item of CARDS_ELEMENT.loop) {
    assert.equal(sectionsForPage[item.fieldId1], item.field1);
    assert.equal(sectionsForPage[item.fieldId2], item.field2);
  }
});

// ---------------------------------------------------------------------
// 3. missing is empty when all requested IDs arrive, populated when one
//    does not.
// ---------------------------------------------------------------------
test('missing is empty when every requested ID arrives, and populated when one does not', () => {
  const state = hydrateElements(initialCmsState(), elements, PAGE_NAME);
  const sectionsForPage = state.allSections[PAGE_NAME];
  const allIds = elements.map((el) => el.fieldId);

  assert.deepEqual(computeMissing(allIds, sectionsForPage), []);

  const withGhostId = [...allIds, '2000099999'];
  assert.deepEqual(computeMissing(withGhostId, sectionsForPage), ['2000099999']);
});

// ---------------------------------------------------------------------
// 4. The component's ids map contains exactly the seven reference elements.
// ---------------------------------------------------------------------
test("the component's ids map contains exactly the seven reference elements", () => {
  const expectedNames = elements.map((el) => el.elementName).sort();
  const actualNames = Object.keys(ids).sort();
  assert.deepEqual(actualNames, expectedNames);

  const expectedFieldIds = elements.map((el) => el.fieldId).sort();
  const actualFieldIds = Object.values(ids).sort();
  assert.deepEqual(actualFieldIds, expectedFieldIds);
});

// ---------------------------------------------------------------------
// 5. Changing a top-level element's value changes what the component
//    would render.
// ---------------------------------------------------------------------
test("changing a top-level element's value changes what the component would render", () => {
  const state = hydrateElements(initialCmsState(), elements, PAGE_NAME);
  const data = state.allSections[PAGE_NAME];

  const before = getTextValue(data, ids.headlineMain, 'DEFAULT');
  const patchedData = { ...data, [ids.headlineMain]: 'TRAIN WITHOUT LIMITS' };
  const after = getTextValue(patchedData, ids.headlineMain, 'DEFAULT');

  assert.notEqual(before, after);
  assert.equal(after, 'TRAIN WITHOUT LIMITS');
});

// ---------------------------------------------------------------------
// 6. Changing a NESTED CARD FIELD's value changes what the component
//    would render (§9 step 5).
// ---------------------------------------------------------------------
test('changing a nested card field value changes what the component would render (§9 step 5)', () => {
  const state = hydrateElements(initialCmsState(), elements, PAGE_NAME);
  const data = state.allSections[PAGE_NAME];
  const items = getStatItems(data);
  const firstItem = items[0];

  const before = getCardFieldValue(data, firstItem, 'fieldId1', 'field1');
  const patchedData = { ...data, [firstItem.fieldId1]: '2000+' };
  const after = getCardFieldValue(patchedData, firstItem, 'fieldId1', 'field1');

  assert.notEqual(before, after);
  assert.equal(after, '2000+');
});

// ---------------------------------------------------------------------
// 7. A four-item card array renders four cards, not three (the R9 length
//    trap).
// ---------------------------------------------------------------------
test('a four-item card array renders four cards, not three (R9 length trap)', () => {
  const state = hydrateElements(initialCmsState(), elements, PAGE_NAME);
  const data = state.allSections[PAGE_NAME];

  const fourItems = [
    ...CARDS_ELEMENT.loop,
    {
      field1: '500+',
      fieldType1: 'Text',
      fieldId1: '3000000007',
      field2: 'New<br />Members',
      fieldType2: 'Text',
      fieldId2: '3000000008',
    },
  ];
  const patchedData = { ...data, [ids.statBadges]: fourItems };

  const items = getStatItems(patchedData);
  assert.equal(items.length, 4, 'a four-item CMS array must render four cards');

  // A wrong `=== 3` guard would silently fall back to the three defaults —
  // assert we did not do that.
  assert.notDeepEqual(items, getStatItems(data));
});

// ---------------------------------------------------------------------
// 8. getHtml strips a script tag, strips all attributes, keeps the allowed
//    tags, and returns the fallback for empty input.
// ---------------------------------------------------------------------
test('getHtml strips scripts, strips attributes, keeps allowed tags, falls back on empty input', () => {
  assert.equal(getHtml('', 'FALLBACK'), 'FALLBACK');
  assert.equal(getHtml(null, 'FALLBACK'), 'FALLBACK');
  assert.equal(getHtml(undefined, 'FALLBACK'), 'FALLBACK');

  const dirty =
    '<script>alert(1)</script><b onclick="evil()">bold</b><i class="x">italic</i><br/>keep<span style="color:red">span</span><strong data-x="1">s</strong><em aria-hidden="true">e</em>';
  const clean = getHtml(dirty, 'FALLBACK');

  assert.ok(!clean.includes('<script'), 'script tag must be stripped');
  assert.ok(!clean.includes('alert(1)'), 'script content must be stripped');
  assert.ok(!clean.includes('onclick'), 'no attributes may survive');
  assert.ok(!clean.includes('class='), 'no attributes may survive');
  assert.ok(!clean.includes('style='), 'no attributes may survive');
  assert.ok(!clean.includes('data-'), 'no data attributes may survive');
  assert.ok(!clean.includes('aria-'), 'no aria attributes may survive');
  assert.ok(clean.includes('<b>bold</b>'), 'allowed tag b must survive, attribute-free');
  assert.ok(clean.includes('<i>italic</i>'), 'allowed tag i must survive, attribute-free');
  assert.ok(clean.includes('<br />'), 'allowed tag br must survive');
  assert.ok(clean.includes('<span>span</span>'), 'allowed tag span must survive, attribute-free');
  assert.ok(clean.includes('<strong>s</strong>'), 'allowed tag strong must survive, attribute-free');
  assert.ok(clean.includes('<em>e</em>'), 'allowed tag em must survive, attribute-free');
  assert.ok(clean.includes('keep'), 'plain text must survive');

  const forbidden =
    '<a href="https://evil.example">link</a><svg onload="x()"><circle/></svg><iframe src="evil"></iframe><!-- comment -->';
  const cleanForbidden = getHtml(forbidden, 'FALLBACK');
  assert.ok(!cleanForbidden.includes('<a '), 'forbidden tag a must not appear');
  assert.ok(!cleanForbidden.includes('<a>'), 'forbidden tag a must not appear');
  assert.ok(!cleanForbidden.includes('<svg'), 'forbidden tag svg must not appear');
  assert.ok(!cleanForbidden.includes('<iframe'), 'forbidden tag iframe must not appear');
  assert.ok(!cleanForbidden.includes('<!--'), 'HTML comments must be stripped');

  // The reference field2 value from seed data must survive unchanged.
  const cardValue = 'Community<br />Members';
  assert.equal(getHtml(cardValue, 'FALLBACK'), cardValue);
});

// ---------------------------------------------------------------------
// 9. getImage handles empty, blob:, and normal paths.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// 10. isSafeCssText accepts the reference css value and rejects url( and
//     expression(.
// ---------------------------------------------------------------------
test('isSafeCssText accepts the reference css value and rejects injection patterns', () => {
  const headlineMain = elements.find((el) => el.elementName === 'headlineMain');
  assert.equal(isSafeCssText(headlineMain.css), true);

  assert.equal(isSafeCssText('background: url(javascript:alert(1));'), false);
  assert.equal(isSafeCssText('width: expression(alert(1));'), false);
  assert.equal(isSafeCssText('behavior: url(xss.htc);'), false);
  assert.equal(isSafeCssText("@import url('evil.css');"), false);
  assert.equal(isSafeCssText('-moz-binding: url(evil.xml);'), false);
});

// ---------------------------------------------------------------------
// Bonus: getSectionTextContrastClass is sane on the reference section doc.
// ---------------------------------------------------------------------
test('getSectionTextContrastClass returns a real Tailwind class for the reference section', () => {
  const cls = getSectionTextContrastClass(section);
  assert.equal(typeof cls, 'string');
  assert.ok(cls.startsWith('text-'));

  assert.equal(getSectionTextContrastClass({ sectionTextMode: 'dark' }), 'text-white');
  assert.equal(getSectionTextContrastClass({ sectionTextMode: 'light' }), 'text-gray-800');
});

// ---------------------------------------------------------------------
// The §9 store-liveness assertion, run against the mocked store — the gate
// this whole deliverable exists to meet.
// ---------------------------------------------------------------------
test('§9 store-liveness assertion runs green against a mocked store', async () => {
  const store = makeMockStore();
  const fakeFetch = async (url) => {
    assert.ok(url.includes(`pageName=${PAGE_NAME}`), 'must request the right pageName');
    return {
      ok: true,
      status: 200,
      json: async () => elements,
    };
  };

  const elementIds = getAllMountFieldIds();
  await store.dispatch(fetchElementsByIds({ elementIds, pageName: PAGE_NAME }), {
    fetchImpl: fakeFetch,
  });

  // Step 2 — allSections.Home is non-empty AND missing.Home is empty.
  const stateAfterMount = store.getState();
  assert.ok(Object.keys(stateAfterMount.cms.allSections[PAGE_NAME]).length > 0);
  assert.deepEqual(stateAfterMount.cms.missing[PAGE_NAME], []);

  // Step 3 — every field ID in `ids`, and every nested card field ID, has
  // its own top-level key in allSections.Home.
  const sectionsForPage = stateAfterMount.cms.allSections[PAGE_NAME];
  for (const fieldId of Object.values(ids)) {
    assert.ok(fieldId in sectionsForPage, `${fieldId} must be present`);
  }
  for (const item of CARDS_ELEMENT.loop) {
    assert.ok(item.fieldId1 in sectionsForPage, `${item.fieldId1} must be present`);
    assert.ok(item.fieldId2 in sectionsForPage, `${item.fieldId2} must be present`);
  }

  // Step 4 — PATCH a top-level element's content; assert the rendered text
  // changed.
  const beforeHeadline = getTextValue(sectionsForPage, ids.headlineMain, 'DEFAULT');
  const patchedTopLevel = elements.map((el) =>
    el.fieldId === ids.headlineMain ? { ...el, content: 'TRAIN WITHOUT LIMITS' } : el,
  );
  store.dispatch(cmsSlice.actions.elementsHydrated(patchedTopLevel, PAGE_NAME));
  const stateAfterTopPatch = store.getState();
  const afterHeadline = getTextValue(
    stateAfterTopPatch.cms.allSections[PAGE_NAME],
    ids.headlineMain,
    'DEFAULT',
  );
  assert.notEqual(beforeHeadline, afterHeadline);
  assert.equal(afterHeadline, 'TRAIN WITHOUT LIMITS');

  // Step 5 — PATCH a NESTED CARD FIELD; assert that rendered text changed
  // too. Not optional, not a duplicate of step 4 (§9).
  const firstItem = CARDS_ELEMENT.loop[0];
  const beforeCard = getCardFieldValue(
    stateAfterTopPatch.cms.allSections[PAGE_NAME],
    firstItem,
    'fieldId1',
    'field1',
  );
  const patchedCards = elements.map((el) => {
    if (el.contentType !== 'Cards') return el;
    return {
      ...el,
      loop: el.loop.map((item) =>
        item.fieldId1 === firstItem.fieldId1 ? { ...item, field1: '2000+' } : item,
      ),
    };
  });
  store.dispatch(cmsSlice.actions.elementsHydrated(patchedCards, PAGE_NAME));
  const stateAfterCardPatch = store.getState();
  const afterCard = getCardFieldValue(
    stateAfterCardPatch.cms.allSections[PAGE_NAME],
    firstItem,
    'fieldId1',
    'field1',
  );
  assert.notEqual(beforeCard, afterCard);
  assert.equal(afterCard, '2000+');
});
