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

// SAME-ORIGIN BY DEFAULT, AND T-127 IS WHY. This was the absolute
// `http://localhost:5000/api` — .env.example's value, copied here as a default.
// The app is served from :5173, the Node API answers on :5000 and sends no
// `Access-Control-Allow-Origin`, so every browser blocked every read with
// `TypeError: Failed to fetch`. Measured in Chrome on /preview/Home: hydration
// status `failed`, 0 keys in `allSections`, and 48 identical exceptions — one
// per mounted section.
//
// THIS IS §9'S EXACT FAILURE AND RULE 2'S EXACT WARNING. Every text node renders
// `data?.[id] || "DEFAULT"`, so the page was pixel-perfect and the store was
// completely dead. Nothing caught it: `npm run check-store-liveness` drives the
// thunk from Node, where there is no origin to violate, and every unit test
// injects `apiUrl` through `extraArgument`. The bug lived only in a browser, and
// only a browser could find it.
//
// vite.config.js already proxies `/api` to :5000 and its comment says exactly
// this — "without this every fetch from the preview would be a cross-origin
// request needing CORS on the server". The proxy was correct from the start. An
// absolute URL simply walks around it, so it had never once been used by the one
// fetch that hydrates the store. SideEditor's `apiUrl = '/api'` is why writes
// worked while reads did not.
//
// `VITE_API_URL` still wins where it is set, which is how a deployed build
// points at a real API host. The default is relative so that development, which
// is what the demo runs on, goes through the proxy.
const DEFAULT_API_URL = '/api';

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
