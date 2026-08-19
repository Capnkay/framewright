// client/src/redux/fetchElementsByIds.js
//
// fetchElementsByIds({ elementIds, pageName }) — the mount-time hydration
// thunk, CONTRACT.md §5.1. The reference component in the source brief
// imports this from a path that does not exist in this repo; it is ours to
// implement.
//
// - Issues exactly ONE request: GET /api/elements?pageName=<pageName>. It
//   does NOT fetch per ID.
// - Reduces the WHOLE response into allSections[pageName] and
//   allSectionsCss[pageName] via cmsSlice's hydrateElements.
// - `elementIds` is NOT a server-side filter — the server never sees it. It
//   is the calling component's declaration of which keys it depends on
//   (including every nested card fieldIdN), used for exactly one thing:
//   after the reduce, this thunk asserts that every ID in `elementIds` is
//   present in the hydrated store, and records any absentees at
//   state.cms.missing[pageName].
//
// This is deliberate and load-bearing (§9): it is what turns a dead or
// partially-hydrated store from a silent failure into an observable one.
// The automated store-liveness assertion reads state.cms.missing directly.
// DO NOT remove the `elementIds` parameter as "unused" — that removal
// deletes the only thing that makes a partial hydration visible.

import { cmsSlice, computeMissing } from './cmsSlice.js';

// This repo's own .env.example value; overridden by VITE_API_URL when the
// Vite build injects import.meta.env (Phase 1) or when a test supplies one
// via the thunk's extraArgument.
const DEFAULT_API_URL = 'http://localhost:5000/api';

function apiBaseUrl(extraArgument) {
  if (extraArgument && extraArgument.apiUrl) {
    return extraArgument.apiUrl;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return DEFAULT_API_URL;
}

export function fetchElementsByIds({ elementIds = [], pageName = 'Home' } = {}) {
  return async function thunk(dispatch, getState, extraArgument = {}) {
    const fetchImpl =
      extraArgument.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (typeof fetchImpl !== 'function') {
      throw new Error('fetchElementsByIds: no fetch implementation available');
    }

    dispatch(cmsSlice.actions.statusSet('loading'));

    const url = `${apiBaseUrl(extraArgument)}/elements?pageName=${encodeURIComponent(pageName)}`;

    let response;
    try {
      response = await fetchImpl(url);
    } catch (err) {
      dispatch(cmsSlice.actions.errorSet(err && err.message ? err.message : String(err)));
      throw err;
    }

    if (!response.ok) {
      const message = `fetchElementsByIds: GET /api/elements failed with status ${response.status}`;
      dispatch(cmsSlice.actions.errorSet(message));
      throw new Error(message);
    }

    const elements = await response.json();
    dispatch(cmsSlice.actions.elementsHydrated(elements, pageName));

    const state = typeof getState === 'function' ? getState() : null;
    const sectionsForPage = state && state.cms ? state.cms.allSections[pageName] : undefined;
    const missing = computeMissing(elementIds, sectionsForPage);
    dispatch(cmsSlice.actions.missingSet(pageName, missing));

    dispatch(cmsSlice.actions.statusSet('succeeded'));

    return { elements, missing };
  };
}
