// client/src/redux/reducers.js
//
// The root reducer map — the one thing that says which slice lives under which
// key in the store. CONTRACT.md §5.2 fixes that key as `cms`, because every
// generated component reads `state.cms.allSections[pageName]` (§5, R4) and a
// renamed namespace silently breaks every one of them at once.
//
// WHY THIS IS ITS OWN FILE, separate from where the store is built. `main.jsx`
// calls `configureStore` from @reduxjs/toolkit, so anything importing it needs
// node_modules. This file imports only ./cmsSlice.js, which is dependency-free
// on purpose — so tests/app-shell.test.mjs can assert the §5.2 slice shape on a
// fresh clone with no `npm install`, which is the constraint tools/test.mjs and
// server/package.json already hold the rest of the repo to.
//
// Adding a slice later means adding one line here, and the app-shell test will
// notice that the map changed.

import { cmsReducer } from './cmsSlice.js';

/**
 * The store's reducer map. `cms` is the only namespace §5.2 defines; anything
 * else added here is a new contract surface, not a detail.
 */
export const reducerMap = {
  cms: cmsReducer,
};

/**
 * The seven keys §5.2 declares, in the order the contract lists them. Exported
 * so the test asserts against a single written-down list rather than restating
 * it, and so a future slice change has one obvious place to update.
 *
 * `allSectionsConfidence` joined the list in v1.6 (T-068, §10). It was added to
 * cmsSlice.js without being added here, which is the case this list exists to
 * catch — the slice and its declared shape drifted apart and three suites went
 * red at once.
 */
export const CMS_SLICE_KEYS = Object.freeze([
  'allSections',
  'allSectionsCss',
  'allSectionsConfidence',
  'sectionNames',
  'status',
  'error',
  'missing',
]);
