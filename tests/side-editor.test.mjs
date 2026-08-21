import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNestedFieldId, buildPatchBody, getPatchUrl, submitPatch, applyPatchResponse } from '../client/src/studio/SideEditor.logic.js';
import { cmsActions, cmsReducer } from '../client/src/redux/cmsSlice.js';

test('isNestedFieldId identifies card fields', () => {
  assert.equal(isNestedFieldId('3000000001'), true);
  assert.equal(isNestedFieldId('2000000003'), false);
  assert.equal(isNestedFieldId('1000000001'), false);
});

test('buildPatchBody constructs correct body', () => {
  assert.deepEqual(buildPatchBody('New Content', 'color: red;'), {
    content: 'New Content',
    css: 'color: red;'
  });
  
  // Clear overlay
  assert.deepEqual(buildPatchBody('New Content', null), {
    content: 'New Content',
    css: null
  });
  
  assert.deepEqual(buildPatchBody('New Content', ''), {
    content: 'New Content',
    css: null
  });
});

test('getPatchUrl returns correct API endpoint', () => {
  assert.equal(getPatchUrl('/api', '2000000003'), '/api/elements/2000000003');
});

test('submitPatch sends correct request for top-level element', async () => {
  let fetchCalled = false;
  let requestUrl = '';
  let requestOptions = {};
  
  const mockFetch = async (url, options) => {
    fetchCalled = true;
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({ ok: true, fieldId: '2000000003', element: { fieldId: '2000000003' } })
    };
  };

  const data = await submitPatch({
    apiUrl: '/api',
    fieldId: '2000000003',
    content: 'TRAIN WITHOUT LIMITS',
    css: 'font-weight: bold;',
    fetchImpl: mockFetch
  });

  assert.equal(fetchCalled, true);
  assert.equal(requestUrl, '/api/elements/2000000003');
  assert.equal(requestOptions.method, 'PATCH');
  assert.equal(requestOptions.headers['Content-Type'], 'application/json');
  
  const body = JSON.parse(requestOptions.body);
  assert.equal(body.content, 'TRAIN WITHOUT LIMITS');
  assert.equal(body.css, 'font-weight: bold;');
  assert.equal(data.fieldId, '2000000003');
});

test('submitPatch sends correct request for nested card field', async () => {
  let fetchCalled = false;
  let requestUrl = '';
  let requestOptions = {};
  
  const mockFetch = async (url, options) => {
    fetchCalled = true;
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({ ok: true, fieldId: '2000000006', element: { fieldId: '2000000006' } })
    };
  };

  const data = await submitPatch({
    apiUrl: '/api',
    fieldId: '3000000001',
    content: '2000+',
    fetchImpl: mockFetch
  });

  assert.equal(fetchCalled, true);
  assert.equal(requestUrl, '/api/elements/3000000001');
  assert.equal(requestOptions.method, 'PATCH');
  
  const body = JSON.parse(requestOptions.body);
  assert.equal(body.content, '2000+');
  // CSS not provided, so shouldn't be in payload
  assert.equal(body.css, undefined);
  
  // The API returns the parent's full element doc
  assert.equal(data.fieldId, '2000000006');
});

test('applyPatchResponse dispatches elementsHydrated with the returned element', () => {
  let dispatchedAction = null;
  const dispatch = (action) => {
    dispatchedAction = action;
  };
  
  const patchedElement = {
    fieldId: '2000000006',
    contentType: 'Cards',
    loop: [
      { field1: '2000+', fieldId1: '3000000001' }
    ]
  };
  
  applyPatchResponse(dispatch, { ok: true, fieldId: '2000000006', element: patchedElement }, 'Home');
  
  assert.ok(dispatchedAction, 'Action should be dispatched');
  
  // Should call cmsActions.elementsHydrated internally
  const expectedAction = cmsActions.elementsHydrated([patchedElement], 'Home');
  assert.deepEqual(dispatchedAction, expectedAction);
});

// The assertion §9 step 5 exists for.
//
// Dispatching the action is not the same as the preview moving. When a NESTED
// card field is patched, server/src/routes/elements.js returns the PARENT
// element, not the nested one — so nothing updates the nested field's own key
// unless the response is re-flattened per §5.0. §9 is blunt about why this
// matters: a DOM-presence check passes on a completely dead store because
// DEFAULT_STAT_CARDS puts those ids in the DOM with no data behind them, and
// "only patching a card field and watching it move proves the flattening
// actually happened."
//
// So this runs the REAL reducer and asserts the nested key changed value.
test('patching a nested card field moves that field in the store, not just its parent (§9 step 5)', () => {
  const pageName = 'Home';

  // A Cards element whose loop items carry their own fieldIdN keys (§4).
  const before = cmsReducer(undefined, cmsActions.elementsHydrated([{
    fieldId: '2000000006',
    pageName,
    contentType: 'Cards',
    loop: [
      { fieldId1: '3000000001', field1: '500+', fieldId2: '3000000002', field2: 'Members' },
    ],
  }], pageName));

  assert.equal(before.allSections[pageName]['3000000001'], '500+',
    'the nested card field must get its OWN top-level key per §5.0');

  // What the server actually returns after PATCH /api/elements/3000000001:
  // the parent element, carrying the edited loop.
  const patchResponse = {
    ok: true,
    fieldId: '2000000006',
    element: {
      fieldId: '2000000006',
      pageName,
      contentType: 'Cards',
      loop: [
        { fieldId1: '3000000001', field1: '2000+', fieldId2: '3000000002', field2: 'Members' },
      ],
    },
  };

  let after = before;
  applyPatchResponse((action) => { after = cmsReducer(after, action); }, patchResponse, pageName);

  assert.equal(after.allSections[pageName]['3000000001'], '2000+',
    'the NESTED field id must hold the new value — this is the preview moving');
  assert.equal(after.allSections[pageName]['3000000002'], 'Members',
    'its sibling must survive the merge untouched');
});

// A patch must not wipe the rest of the page: hydrateElements merges, and a
// side-editor that replaced allSections[pageName] would blank every other
// element on screen the moment someone edited one headline.
test('patching one element leaves the rest of the page intact', () => {
  const pageName = 'Home';
  const seeded = cmsReducer(undefined, cmsActions.elementsHydrated([
    { fieldId: '2000000003', pageName, contentType: 'Text', content: 'ORIGINAL HEADLINE' },
    { fieldId: '2000000004', pageName, contentType: 'Text', content: 'Untouched subhead' },
  ], pageName));

  let after = seeded;
  applyPatchResponse(
    (action) => { after = cmsReducer(after, action); },
    { ok: true, fieldId: '2000000003', element: { fieldId: '2000000003', pageName, contentType: 'Text', content: 'TRAIN WITHOUT LIMITS' } },
    pageName,
  );

  assert.equal(after.allSections[pageName]['2000000003'], 'TRAIN WITHOUT LIMITS');
  assert.equal(after.allSections[pageName]['2000000004'], 'Untouched subhead',
    'an unrelated element must not be dropped by the merge');
});
