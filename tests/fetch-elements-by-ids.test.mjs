// tests/fetch-elements-by-ids.test.mjs — T-009, CONTRACT.md §5.0 and §5.1.
//
// The dedicated suite for the mount-time hydration thunk. Three other files
// touch this territory and none of them pins it: tests/cms-slice.test.mjs
// (T-008) covers the §5.2 slice shape and calls `hydrateElements` and
// `computeMissing` DIRECTLY, never through the thunk; tests/golden.test.mjs
// drives the thunk exactly once, inside the §9 store-liveness assertion,
// against the checked-in seed data only; tests/app-shell.test.mjs only checks
// the namespace is mounted.
//
// So what this file pins that no other suite does:
//
//   - the §5.1 wire behaviour — EXACTLY ONE request, its URL, and the fact
//     that `elementIds` never appears in it. Nothing else counts the calls,
//     and "one request per ID" is the natural way to write this thunk wrong.
//   - the §5.0 flattening AS OBSERVED THROUGH THE THUNK, on fixtures the seed
//     data does not contain: a loop of 2 items, a loop of 4, and a
//     `fieldsPerItem` of 3. golden.test.mjs uses seed/elements.json, whose
//     only Cards element is a loop of exactly 3 with 2 fields per item — so it
//     cannot distinguish correct code from code that assumes either number
//     (§4 rule 3, §4 rule 4).
//   - the §5.2 transitions the thunk itself owns: loading -> succeeded, and
//     both failure routes (non-ok response, throwing fetch) landing on
//     `failed` with a non-null error AND rejecting.
//
// WHY THIS FILE TAKES NO node_modules DEPENDENCY. `npm test` must run on a
// fresh clone with no `npm install` — SETUP.md step 5, README's run table and
// docs/html/ONBOARDING.html all state that as fact, and _build/findings/F-005.md
// records the BLOCKER that happened the one time it stopped being true: a
// static `mongodb` import on a path that was supposed to work without it turned
// the whole suite red on a clean checkout. So: no @reduxjs/toolkit, no
// `configureStore`, no real store. The thunk contract is
// `fn(dispatch, getState, extraArgument)` and that is reproducible in twelve
// lines. The harness below is the same shape and naming as `makeMockStore()` in
// tests/golden.test.mjs, deliberately duplicated rather than imported so
// neither file becomes the other's dependency.
//
// Fixture IDs are hardcoded literals in §1's sanctioned ranges — 1000000001+
// for sections, 2000000001+ for elements, 3000000001+ for card fields. Never
// Math.random, Date.now, uuid or nanoid (§1 rule 3), not even in a test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cmsSlice, initialCmsState } from '../client/src/redux/cmsSlice.js';
import { fetchElementsByIds } from '../client/src/redux/fetchElementsByIds.js';

const PAGE_NAME = 'Home';
// localhost, not a made-up test domain: the §14 pre-push gate scans full git
// history for non-local hostnames and `.test` is not in its allow-list, even
// though RFC 6761 reserves it. Nothing here reaches the network — every test
// passes a fetch stub — so the host only ever has to be a legible string.
const API_URL = 'http://localhost:5000/api';

// ---- The harness -------------------------------------------------------
// Same shape as makeMockStore() in tests/golden.test.mjs: getState() returns
// { cms }, and dispatch() calls a function action as a thunk and reduces a
// plain action through cmsSlice.reducer.

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

/** A fetch stand-in that records every call, so "exactly one" is assertable. */
function makeFetchRecorder(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return { calls, fetchImpl };
}

/** The happy-path responder: a 200 carrying `elements` as JSON. */
const okWith = (elements) => async () => ({
  ok: true,
  status: 200,
  json: async () => elements,
});

// ---- Fixtures ----------------------------------------------------------
// Element documents per §3; loop items per §4. Every element carries
// pageName, because hydrateElements ignores elements whose pageName differs
// from the hydration target.

const TEXT_ELEMENT = {
  sectionId: '1000000001',
  elementName: 'headlineMain',
  fieldId: '2000000003',
  content: 'CHALLENGE YOUR LIMITS',
  contentType: 'Text',
  css: 'font-weight: bold; text-align: left;',
  loop: null,
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

const IMAGE_ELEMENT = {
  sectionId: '1000000001',
  elementName: 'heroImage',
  fieldId: '2000000001',
  content: 'default/images/hero-placeholder.jpg',
  contentType: 'Image',
  css: null,
  loop: null,
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

const TEXTFIELD_ELEMENT = {
  sectionId: '1000000001',
  elementName: 'description',
  fieldId: '2000000004',
  content: 'Join trainer-led workout sessions.',
  contentType: 'Textfield',
  css: null,
  loop: null,
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

const BUTTON_ELEMENT = {
  sectionId: '1000000001',
  elementName: 'ctaButton',
  fieldId: '2000000007',
  content: 'FIND A WORKOUT',
  contentType: 'Button',
  css: null,
  loop: null,
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

/** A Cards element with TWO items — §4 rule 4, card count is not fixed at 3. */
const CARDS_TWO = {
  sectionId: '1000000001',
  elementName: 'statBadges',
  fieldId: '2000000006',
  content: null,
  contentType: 'Cards',
  css: null,
  loop: [
    {
      field1: '1000+',
      fieldType1: 'Text',
      fieldId1: '3000000001',
      field2: 'Community<br />Members',
      fieldType2: 'Text',
      fieldId2: '3000000002',
    },
    {
      field1: '40+',
      fieldType1: 'Text',
      fieldId1: '3000000003',
      field2: 'Fitness<br />Programmes',
      fieldType2: 'Text',
      fieldId2: '3000000004',
    },
  ],
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

/** A Cards element with FOUR items — the other side of "not fixed at 3". */
const CARDS_FOUR = {
  sectionId: '1000000001',
  elementName: 'statBadges',
  fieldId: '2000000008',
  content: null,
  contentType: 'Cards',
  css: null,
  loop: [
    {
      field1: '1000+',
      fieldType1: 'Text',
      fieldId1: '3000000011',
      field2: 'Members',
      fieldType2: 'Text',
      fieldId2: '3000000012',
    },
    {
      field1: '40+',
      fieldType1: 'Text',
      fieldId1: '3000000013',
      field2: 'Programmes',
      fieldType2: 'Text',
      fieldId2: '3000000014',
    },
    {
      field1: '150+',
      fieldType1: 'Text',
      fieldId1: '3000000015',
      field2: 'Channels',
      fieldType2: 'Text',
      fieldId2: '3000000016',
    },
    {
      field1: '12',
      fieldType1: 'Text',
      fieldId1: '3000000017',
      field2: 'Studios',
      fieldType2: 'Text',
      fieldId2: '3000000018',
    },
  ],
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

/** fieldsPerItem 3 — §4 rule 3 permits a third field when the wireframe shows an icon. */
const CARDS_THREE_FIELDS = {
  sectionId: '1000000001',
  elementName: 'featureCards',
  fieldId: '2000000009',
  content: null,
  contentType: 'Cards',
  css: null,
  loop: [
    {
      field1: 'Strength',
      fieldType1: 'Text',
      fieldId1: '3000000021',
      field2: 'Build power under coaching.',
      fieldType2: 'Text',
      fieldId2: '3000000022',
      field3: 'default/icons/dumbbell.svg',
      fieldType3: 'Image',
      fieldId3: '3000000023',
    },
    {
      field1: 'Mobility',
      fieldType1: 'Text',
      fieldId1: '3000000024',
      field2: 'Move without restriction.',
      fieldType2: 'Text',
      fieldId2: '3000000025',
      field3: 'default/icons/stretch.svg',
      fieldType3: 'Image',
      fieldId3: '3000000026',
    },
  ],
  projectName: 'sample-brand',
  pageName: PAGE_NAME,
};

/** Every nested fieldIdN in a Cards element, flattened, in document order. */
function nestedIdsOf(cardsElement) {
  const ids = [];
  for (const item of cardsElement.loop) {
    for (const key of Object.keys(item)) {
      const match = /^fieldId(\d+)$/.exec(key);
      if (match) ids.push(item[key]);
    }
  }
  return ids;
}

/** The value each nested fieldIdN must hold after the flattening (§5.0 step 2). */
function nestedPairsOf(cardsElement) {
  const pairs = [];
  for (const item of cardsElement.loop) {
    for (const key of Object.keys(item)) {
      const match = /^fieldId(\d+)$/.exec(key);
      if (match) pairs.push([item[key], item[`field${match[1]}`]]);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------
// 1. §5.1 — the exact signature, and EXACTLY ONE request for the page.
// ---------------------------------------------------------------------

test('fetchElementsByIds({ elementIds, pageName }) returns a thunk (§5.1)', () => {
  const thunk = fetchElementsByIds({ elementIds: ['2000000003'], pageName: PAGE_NAME });
  assert.equal(typeof thunk, 'function', '§5.1 declares a thunk action creator');
});

test('the thunk issues EXACTLY ONE request, not one per ID (§5.1)', async () => {
  const store = makeMockStore();
  const { calls, fetchImpl } = makeFetchRecorder(
    okWith([IMAGE_ELEMENT, TEXT_ELEMENT, TEXTFIELD_ELEMENT, BUTTON_ELEMENT, CARDS_TWO]),
  );

  // Five element IDs plus four nested card IDs. A per-ID implementation would
  // make nine calls here and every other assertion in this file would still
  // pass — this count is the only thing that catches it.
  const elementIds = [
    IMAGE_ELEMENT.fieldId,
    TEXT_ELEMENT.fieldId,
    TEXTFIELD_ELEMENT.fieldId,
    BUTTON_ELEMENT.fieldId,
    CARDS_TWO.fieldId,
    ...nestedIdsOf(CARDS_TWO),
  ];
  assert.equal(elementIds.length, 9, 'the fixture must declare more than one ID for this to mean anything');

  await store.dispatch(fetchElementsByIds({ elementIds, pageName: PAGE_NAME }), {
    fetchImpl,
    apiUrl: API_URL,
  });

  assert.equal(calls.length, 1, '§5.1: "Issues one request. It does not fetch per ID."');
});

test('the request is GET /api/elements?pageName=<pageName>, and pageName is the only query parameter (§5.1)', async () => {
  const store = makeMockStore();
  const { calls, fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT]));

  await store.dispatch(
    fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  assert.equal(calls[0].url, `${API_URL}/elements?pageName=${PAGE_NAME}`);

  const parsed = new URL(calls[0].url);
  assert.equal(parsed.pathname, '/api/elements');
  assert.deepEqual([...parsed.searchParams.keys()], ['pageName'], 'pageName is the whole query');
  assert.equal(parsed.searchParams.get('pageName'), PAGE_NAME);
});

test('the request path is /api/elements even with no apiUrl supplied (§5.1)', async () => {
  const store = makeMockStore();
  const { calls, fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT]));

  await store.dispatch(
    fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
    { fetchImpl },
  );

  assert.ok(
    calls[0].url.endsWith(`/elements?pageName=${PAGE_NAME}`),
    `the default base must still produce the §5.1 path, got ${calls[0].url}`,
  );
});

test('the request carries the pageName it was given, case-sensitively (§1, §5.1)', async () => {
  // §1: pageName is case-sensitive, and mixing Home with home is named there
  // as the most common way to get a preview that renders from defaults while
  // the store is empty. The thunk must not normalise it.
  for (const pageName of ['Home', 'home', 'Landing']) {
    const store = makeMockStore();
    const element = { ...TEXT_ELEMENT, pageName };
    const { calls, fetchImpl } = makeFetchRecorder(okWith([element]));

    await store.dispatch(fetchElementsByIds({ elementIds: [element.fieldId], pageName }), {
      fetchImpl,
      apiUrl: API_URL,
    });

    assert.equal(new URL(calls[0].url).searchParams.get('pageName'), pageName);
    assert.equal(
      store.getState().cms.allSections[pageName][element.fieldId],
      element.content,
      `the reduce must land under allSections.${pageName}`,
    );
  }
});

test('the thunk defaults pageName to Home and elementIds to empty when called with no argument (§5.1)', async () => {
  const store = makeMockStore();
  const { calls, fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT]));

  const result = await store.dispatch(fetchElementsByIds(), { fetchImpl, apiUrl: API_URL });

  assert.equal(new URL(calls[0].url).searchParams.get('pageName'), 'Home', '§1: pageName defaults to Home');
  assert.deepEqual(store.getState().cms.missing.Home, [], 'no declared IDs means nothing can be missing');
  assert.deepEqual(result.missing, []);
});

test('an empty elementIds array still hydrates the whole response and reports no missing IDs (§5.1)', async () => {
  const store = makeMockStore();
  const { fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT, CARDS_TWO]));

  await store.dispatch(fetchElementsByIds({ elementIds: [], pageName: PAGE_NAME }), {
    fetchImpl,
    apiUrl: API_URL,
  });

  const state = store.getState().cms;
  assert.deepEqual(state.missing[PAGE_NAME], []);
  assert.ok(
    Object.keys(state.allSections[PAGE_NAME]).length > 0,
    'elementIds is a declaration, not a filter — an empty one must not empty the store',
  );
});

// ---------------------------------------------------------------------
// 2. §5.1 — elementIds is NOT a server-side filter.
// ---------------------------------------------------------------------

test('no element ID appears anywhere in the request URL (§5.1)', async () => {
  const store = makeMockStore();
  const { calls, fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT, CARDS_TWO]));

  const elementIds = [TEXT_ELEMENT.fieldId, CARDS_TWO.fieldId, ...nestedIdsOf(CARDS_TWO)];
  await store.dispatch(fetchElementsByIds({ elementIds, pageName: PAGE_NAME }), {
    fetchImpl,
    apiUrl: API_URL,
  });

  for (const id of elementIds) {
    assert.ok(
      !calls[0].url.includes(id),
      `§5.1: elementIds is not a server-side filter — ${id} must not reach the server`,
    );
  }
});

test('elements the caller never declared are still reduced into the store (§5.1)', async () => {
  // "Reduces the WHOLE response into allSections[pageName]." A thunk that
  // filtered the response by elementIds would look correct on every screen and
  // quietly break the moment a second component mounted against the same page.
  const store = makeMockStore();
  const { fetchImpl } = makeFetchRecorder(
    okWith([TEXT_ELEMENT, IMAGE_ELEMENT, BUTTON_ELEMENT, CARDS_TWO]),
  );

  await store.dispatch(
    fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  const sections = store.getState().cms.allSections[PAGE_NAME];
  assert.equal(sections[IMAGE_ELEMENT.fieldId], IMAGE_ELEMENT.content, 'undeclared, still hydrated');
  assert.equal(sections[BUTTON_ELEMENT.fieldId], BUTTON_ELEMENT.content);
  assert.ok(Array.isArray(sections[CARDS_TWO.fieldId]), 'an undeclared Cards element hydrates too');
  assert.equal(sections['3000000001'], '1000+', 'and so do its nested fields');
});

// ---------------------------------------------------------------------
// 3. §5.0 — THE FLATTENING RULE, through the thunk. Both kinds of key.
// ---------------------------------------------------------------------

test('a Cards element writes BOTH kinds of key — the loop array under its own fieldId, and every nested fieldIdN (§5.0)', async () => {
  const store = makeMockStore();
  const { fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT, CARDS_TWO]));

  await store.dispatch(
    fetchElementsByIds({
      elementIds: [TEXT_ELEMENT.fieldId, CARDS_TWO.fieldId, ...nestedIdsOf(CARDS_TWO)],
      pageName: PAGE_NAME,
    }),
    { fetchImpl, apiUrl: API_URL },
  );

  const sections = store.getState().cms.allSections[PAGE_NAME];

  // Kind 1 — the element's own fieldId holds the WHOLE loop array.
  const loop = sections[CARDS_TWO.fieldId];
  assert.ok(Array.isArray(loop), '§5.0 step 1: the element fieldId holds the loop array');
  assert.ok(loop.length > 0, 'a Cards element with items must not hydrate an empty loop');
  assert.deepEqual(loop, CARDS_TWO.loop, 'the whole array, unmodified, so the component can map over it');

  // Kind 2 — every nested fieldIdN gets its OWN top-level key. Asserted by
  // exact value, not by mere presence: this is the step that goes missing, and
  // a build without it looks pixel-identical, because the reference component
  // renders `data?.[item.fieldId1] || item.field1`.
  assert.equal(sections['3000000001'], '1000+');
  assert.equal(sections['3000000002'], 'Community<br />Members');
  assert.equal(sections['3000000003'], '40+');
  assert.equal(sections['3000000004'], 'Fitness<br />Programmes');
});

test('every nested fieldIdN is a top-level key holding its own fieldN string — the negative proof (§5.0 step 2)', async () => {
  // The regression this guards against drops step 2 and fails NOTHING else:
  // the loop array is still there, the section still renders, every card just
  // shows its baked-in default forever. So each nested id is asserted to be
  // present AND to hold its exact expected value, across all three fixtures,
  // so the omission is loud instead of silent.
  for (const cards of [CARDS_TWO, CARDS_FOUR, CARDS_THREE_FIELDS]) {
    const store = makeMockStore();
    const { fetchImpl } = makeFetchRecorder(okWith([cards]));

    await store.dispatch(
      fetchElementsByIds({ elementIds: nestedIdsOf(cards), pageName: PAGE_NAME }),
      { fetchImpl, apiUrl: API_URL },
    );

    const sections = store.getState().cms.allSections[PAGE_NAME];
    for (const [nestedId, expected] of nestedPairsOf(cards)) {
      assert.ok(nestedId in sections, `${cards.elementName}: ${nestedId} must have its own top-level key`);
      assert.equal(sections[nestedId], expected, `${cards.elementName}: ${nestedId} must hold its fieldN value`);
    }
  }
});

test('a fieldsPerItem of 3 flattens all three nested fields per item (§4 rule 3, §5.0)', async () => {
  const store = makeMockStore();
  const { fetchImpl } = makeFetchRecorder(okWith([CARDS_THREE_FIELDS]));

  await store.dispatch(
    fetchElementsByIds({ elementIds: nestedIdsOf(CARDS_THREE_FIELDS), pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  const sections = store.getState().cms.allSections[PAGE_NAME];

  // fieldId1 -> field1, fieldId2 -> field2, fieldId3 -> field3. The third is
  // the one a hard-coded two-field implementation drops.
  assert.equal(sections['3000000021'], 'Strength');
  assert.equal(sections['3000000022'], 'Build power under coaching.');
  assert.equal(sections['3000000023'], 'default/icons/dumbbell.svg');
  assert.equal(sections['3000000024'], 'Mobility');
  assert.equal(sections['3000000025'], 'Move without restriction.');
  assert.equal(sections['3000000026'], 'default/icons/stretch.svg');

  assert.deepEqual(
    store.getState().cms.missing[PAGE_NAME],
    [],
    'all three fields per item satisfy the declaration',
  );
});

test('every NON-Cards contentType writes exactly one key: its fieldId -> its content string (§5.0)', async () => {
  const store = makeMockStore();
  const plain = [IMAGE_ELEMENT, TEXT_ELEMENT, TEXTFIELD_ELEMENT, BUTTON_ELEMENT];
  const { fetchImpl } = makeFetchRecorder(okWith(plain));

  await store.dispatch(
    fetchElementsByIds({ elementIds: plain.map((el) => el.fieldId), pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  const sections = store.getState().cms.allSections[PAGE_NAME];

  // Exactly one key each — four elements, four keys, nothing extra invented.
  assert.equal(Object.keys(sections).length, plain.length, 'one key per non-Cards element, and no more');
  for (const el of plain) {
    assert.equal(typeof sections[el.fieldId], 'string', `${el.contentType} hydrates a string`);
    assert.equal(sections[el.fieldId], el.content);
  }
});

// ---------------------------------------------------------------------
// 4. §4 rule 4 — card count is NOT fixed at 3.
// ---------------------------------------------------------------------

test('a loop of two and a loop of four both hydrate in full — card count is not fixed at 3 (§4 rule 4)', async () => {
  // seed/elements.json carries exactly one Cards element, a loop of 3, so
  // golden.test.mjs cannot distinguish correct code from code that assumes
  // three. Asserted via Array.isArray and length > 0, never === 3.
  for (const cards of [CARDS_TWO, CARDS_FOUR]) {
    const store = makeMockStore();
    const { fetchImpl } = makeFetchRecorder(okWith([cards]));

    await store.dispatch(
      fetchElementsByIds({ elementIds: [cards.fieldId, ...nestedIdsOf(cards)], pageName: PAGE_NAME }),
      { fetchImpl, apiUrl: API_URL },
    );

    const sections = store.getState().cms.allSections[PAGE_NAME];
    const loop = sections[cards.fieldId];

    assert.ok(Array.isArray(loop), 'the loop key is an array whatever the count');
    assert.ok(loop.length > 0, 'and it is not empty');
    assert.equal(loop.length, cards.loop.length, 'n items in, n items out');
    assert.notEqual(loop.length, 3, 'this fixture is deliberately not three');

    // Two fields per item across the whole loop, all flattened.
    assert.equal(nestedIdsOf(cards).length, cards.loop.length * 2);
    for (const nestedId of nestedIdsOf(cards)) {
      assert.ok(nestedId in sections, `${nestedId} must be flattened regardless of card count`);
    }
    assert.deepEqual(store.getState().cms.missing[PAGE_NAME], []);
  }
});

// ---------------------------------------------------------------------
// 5. §5.0's closing paragraph and §7 R10 — allSectionsCss.
// ---------------------------------------------------------------------

test('allSectionsCss[pageName] is keyed by fieldId, and a null css writes no key (§5.1, §5.2)', async () => {
  const store = makeMockStore();
  const { fetchImpl } = makeFetchRecorder(okWith([TEXT_ELEMENT, IMAGE_ELEMENT, CARDS_TWO]));

  await store.dispatch(
    fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  const css = store.getState().cms.allSectionsCss[PAGE_NAME];
  assert.equal(css[TEXT_ELEMENT.fieldId], 'font-weight: bold; text-align: left;');
  assert.ok(!(IMAGE_ELEMENT.fieldId in css), 'a null css must not create a key');
  assert.ok(!(CARDS_TWO.fieldId in css), 'a null css on a Cards element must not create a key either');
});

test('no nested card ID gets a css key today, because §4 gives its css nowhere to live (F-003)', async () => {
  // §5.0's closing paragraph requires allSectionsCss[pageName] to be keyed by
  // nested field ID too, "so per-card styling is possible", and §7 R10 applies
  // that map onto matching DOM ids. It is NOT possible today: §4's loop item
  // shape defines fieldN, fieldTypeN and fieldIdN and no css slot of any kind,
  // so hydrateElements has no nested value to write and writes none.
  //
  // _build/findings/F-003.md is OPEN on exactly this and proposes an additive
  // `cssN` on the loop item. That is a contract change and the team lead's
  // call, not this suite's, so this test pins the CURRENT behaviour rather
  // than asserting the one the contract wants — the same convention
  // cms-slice.test.mjs uses for F-004's unwritten sectionNames. When cssN
  // lands and the reducer flattens it, this test fails and points whoever
  // changed it at the finding.
  const store = makeMockStore();
  const styledCards = {
    ...CARDS_TWO,
    css: 'text-align: center;',
    loop: CARDS_TWO.loop.map((item) => ({ ...item, css1: 'font-weight: bold;' })),
  };
  const { fetchImpl } = makeFetchRecorder(okWith([styledCards]));

  await store.dispatch(
    fetchElementsByIds({ elementIds: nestedIdsOf(styledCards), pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  const state = store.getState().cms;

  // The element's own css does hydrate, keyed by its own fieldId.
  assert.equal(state.allSectionsCss[PAGE_NAME][styledCards.fieldId], 'text-align: center;');

  // The nested ids hydrate their CONTENT — the flattening works — but carry no
  // css key. See _build/findings/F-003.md.
  for (const nestedId of nestedIdsOf(styledCards)) {
    assert.ok(nestedId in state.allSections[PAGE_NAME], `${nestedId} content is flattened`);
    assert.ok(
      !(nestedId in state.allSectionsCss[PAGE_NAME]),
      `${nestedId} has no css key — see _build/findings/F-003.md`,
    );
  }
  assert.deepEqual(Object.keys(state.allSectionsCss[PAGE_NAME]), [styledCards.fieldId]);
});

// ---------------------------------------------------------------------
// 6. §5.1 — missing[pageName], the safety net the §9 assertion reads.
// ---------------------------------------------------------------------

test('every declared ID present means missing[pageName] is [] (§5.1)', async () => {
  const store = makeMockStore();
  const elements = [IMAGE_ELEMENT, TEXT_ELEMENT, TEXTFIELD_ELEMENT, BUTTON_ELEMENT, CARDS_TWO];
  const { fetchImpl } = makeFetchRecorder(okWith(elements));

  const elementIds = [...elements.map((el) => el.fieldId), ...nestedIdsOf(CARDS_TWO)];
  const result = await store.dispatch(fetchElementsByIds({ elementIds, pageName: PAGE_NAME }), {
    fetchImpl,
    apiUrl: API_URL,
  });

  assert.deepEqual(store.getState().cms.missing[PAGE_NAME], []);
  assert.deepEqual(result.missing, [], 'and the thunk returns the same verdict to its caller');
});

test('missing[pageName] records exactly the declared IDs that never arrived, and only those (§5.1)', async () => {
  const store = makeMockStore();
  // The response omits the Textfield and Button elements entirely.
  const { fetchImpl } = makeFetchRecorder(okWith([IMAGE_ELEMENT, TEXT_ELEMENT, CARDS_TWO]));

  const elementIds = [
    IMAGE_ELEMENT.fieldId,
    TEXT_ELEMENT.fieldId,
    TEXTFIELD_ELEMENT.fieldId,
    BUTTON_ELEMENT.fieldId,
    CARDS_TWO.fieldId,
  ];

  await store.dispatch(fetchElementsByIds({ elementIds, pageName: PAGE_NAME }), {
    fetchImpl,
    apiUrl: API_URL,
  });

  assert.deepEqual(
    store.getState().cms.missing[PAGE_NAME],
    [TEXTFIELD_ELEMENT.fieldId, BUTTON_ELEMENT.fieldId],
    'exactly the absentees, in declaration order, and nothing that did arrive',
  );
});

test('a nested card field ID declared in elementIds is satisfied by the flattening, not reported missing (§5.0, §5.1)', async () => {
  // This is the pairing that makes §5.0 observable. If step 2 of the
  // flattening were dropped, every one of these ids would show up here — which
  // is why §4 rule 2 says nested field IDs must be included in the mount-time
  // fetch.
  const store = makeMockStore();
  const { fetchImpl } = makeFetchRecorder(okWith([CARDS_FOUR]));

  await store.dispatch(
    fetchElementsByIds({
      elementIds: [CARDS_FOUR.fieldId, ...nestedIdsOf(CARDS_FOUR)],
      pageName: PAGE_NAME,
    }),
    { fetchImpl, apiUrl: API_URL },
  );

  assert.deepEqual(store.getState().cms.missing[PAGE_NAME], []);
});

test('a nested ID belonging to an item the response never sent IS reported missing (§5.1)', async () => {
  // The half-hydrated Cards case: the element arrives, but with fewer items
  // than the component declared. The absent nested ids must surface.
  const store = makeMockStore();
  const shortened = { ...CARDS_FOUR, loop: CARDS_FOUR.loop.slice(0, 2) };
  const { fetchImpl } = makeFetchRecorder(okWith([shortened]));

  await store.dispatch(
    fetchElementsByIds({
      elementIds: [CARDS_FOUR.fieldId, ...nestedIdsOf(CARDS_FOUR)],
      pageName: PAGE_NAME,
    }),
    { fetchImpl, apiUrl: API_URL },
  );

  assert.deepEqual(
    store.getState().cms.missing[PAGE_NAME],
    ['3000000015', '3000000016', '3000000017', '3000000018'],
    'the nested ids of the two items that never arrived',
  );
});

test('missing is keyed per pageName, so one page does not overwrite another (§5.2)', async () => {
  const store = makeMockStore();

  const homeEl = { ...TEXT_ELEMENT, pageName: 'Home' };
  await store.dispatch(fetchElementsByIds({ elementIds: [homeEl.fieldId], pageName: 'Home' }), {
    fetchImpl: makeFetchRecorder(okWith([homeEl])).fetchImpl,
    apiUrl: API_URL,
  });

  const landingEl = { ...TEXT_ELEMENT, fieldId: '2000000010', pageName: 'Landing' };
  await store.dispatch(
    fetchElementsByIds({ elementIds: [landingEl.fieldId, '2000000099'], pageName: 'Landing' }),
    { fetchImpl: makeFetchRecorder(okWith([landingEl])).fetchImpl, apiUrl: API_URL },
  );

  const { missing } = store.getState().cms;
  assert.deepEqual(missing.Home, [], 'the earlier page keeps its verdict');
  assert.deepEqual(missing.Landing, ['2000000099']);
});

// ---------------------------------------------------------------------
// 7. §5.2 — the status transitions the thunk owns.
// ---------------------------------------------------------------------

test('status goes loading, then succeeded, on the happy path (§5.2)', async () => {
  const store = makeMockStore();
  const observed = [];

  const fetchImpl = async () => {
    // Sampled while the request is in flight — the only point at which
    // 'loading' is observable.
    observed.push(store.getState().cms.status);
    return { ok: true, status: 200, json: async () => [TEXT_ELEMENT] };
  };

  assert.equal(store.getState().cms.status, 'idle');
  await store.dispatch(
    fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
    { fetchImpl, apiUrl: API_URL },
  );

  assert.deepEqual(observed, ['loading'], 'loading is set before the request goes out');
  assert.equal(store.getState().cms.status, 'succeeded');
  assert.equal(store.getState().cms.error, null, 'a success leaves error null');
});

test('a non-ok HTTP response sets status failed with a non-null error, and the thunk rejects (§5.2)', async () => {
  const store = makeMockStore();
  const { calls, fetchImpl } = makeFetchRecorder(async () => ({
    ok: false,
    status: 500,
    json: async () => ({}),
  }));

  await assert.rejects(
    () =>
      store.dispatch(
        fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
        { fetchImpl, apiUrl: API_URL },
      ),
    /500/,
    'the caller must see the failure, not a silent resolve',
  );

  const state = store.getState().cms;
  assert.equal(state.status, 'failed');
  assert.notEqual(state.error, null, '§5.2: error exists so a failed hydration is visible in the UI');
  assert.equal(typeof state.error, 'string');
  assert.equal(calls.length, 1, 'a failure is not silently retried');
});

test('a throwing fetch implementation sets status failed with a non-null error, and the thunk rejects (§5.2)', async () => {
  const store = makeMockStore();
  const fetchImpl = async () => {
    throw new Error('network unreachable');
  };

  await assert.rejects(
    () =>
      store.dispatch(
        fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }),
        { fetchImpl, apiUrl: API_URL },
      ),
    /network unreachable/,
  );

  const state = store.getState().cms;
  assert.equal(state.status, 'failed');
  assert.equal(state.error, 'network unreachable');
});

test('a failed hydration leaves the store empty rather than half-written (§5.2, §9)', async () => {
  const store = makeMockStore();
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) });

  await assert.rejects(() =>
    store.dispatch(fetchElementsByIds({ elementIds: [TEXT_ELEMENT.fieldId], pageName: PAGE_NAME }), {
      fetchImpl,
      apiUrl: API_URL,
    }),
  );

  const state = store.getState().cms;
  assert.equal(state.allSections[PAGE_NAME], undefined, 'nothing hydrated');
  assert.equal(state.missing[PAGE_NAME], undefined, 'and no missing verdict was recorded');
  assert.notEqual(state.status, 'succeeded', 'a failure must never read as succeeded');
});

test('the thunk refuses to proceed when no fetch implementation is available (§5.1)', async () => {
  // Node 20 has a global fetch, so this exercises the guard through the
  // documented seam: an explicitly non-function fetchImpl must throw rather
  // than fall through to the network.
  const store = makeMockStore();
  await assert.rejects(
    () =>
      store.dispatch(fetchElementsByIds({ elementIds: [], pageName: PAGE_NAME }), {
        fetchImpl: 'not a function',
        apiUrl: API_URL,
      }),
    /no fetch implementation available/,
  );
});

// ---------------------------------------------------------------------
// 8. The no-install guarantee — F-005, asserted so it cannot rot.
// ---------------------------------------------------------------------

test('fetchElementsByIds.js imports nothing from node_modules (F-005)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../client/src/redux/fetchElementsByIds.js', import.meta.url),
    'utf8',
  );
  const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(imports.length > 0, 'the regex must actually be matching something');
  for (const specifier of imports) {
    assert.ok(
      specifier.startsWith('.') || specifier.startsWith('node:'),
      `fetchElementsByIds.js must not import "${specifier}" — a node_modules dependency here ` +
        'makes npm test require npm install, which is the F-005 regression',
    );
  }
});

test('this suite itself imports nothing from node_modules (F-005)', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL(import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  for (const specifier of imports) {
    assert.ok(
      specifier.startsWith('.') || specifier.startsWith('node:'),
      `this test file must not import "${specifier}" — no @reduxjs/toolkit, no real store (F-005)`,
    );
  }
});
