// client/src/redux/cmsSlice.js
//
// The `cms` slice — state shape per CONTRACT.md §5.2 — and the hydration
// reducer that implements THE FLATTENING RULE, §5.0.
//
// Everything here is written as plain, dependency-free functions first
// (initialCmsState, hydrateElements, computeMissing, setMissing, ...), so the
// reducer is unit-testable with a bare `node --test` run before
// @reduxjs/toolkit is installed (that install happens in Phase 1). `cmsSlice`
// below is a thin wrapper around those plain functions, shaped like an
// @reduxjs/toolkit slice (a `reducer` function plus an `actions` map of
// action creators) so calling code — the thunk in fetchElementsByIds.js, and
// eventually a real store — can use it exactly the way it would use a real
// `createSlice(...)` result. Swapping this wrapper for real `createSlice`
// once the dependency is installed should not require touching the plain
// functions or any calling code, only this file's bottom section.

export function initialCmsState() {
  return {
    allSections: {},
    allSectionsCss: {},
    sectionNames: {},
    status: 'idle',
    error: null,
    missing: {},
  };
}

// Pulls every fieldIdN out of a single Cards loop item and writes each one's
// value onto `sections` as its own top-level key. This is step 2 of THE
// FLATTENING RULE (§5.0) — the single most important behaviour in this file.
function flattenLoopItemFields(item, sections) {
  if (!item || typeof item !== 'object') return;
  for (const key of Object.keys(item)) {
    const match = /^fieldId(\d+)$/.exec(key);
    if (!match) continue;
    const fieldId = item[key];
    if (!fieldId) continue;
    const valueKey = `field${match[1]}`;
    sections[fieldId] = item[valueKey];
  }
}

/**
 * hydrateElements(state, elements, pageName)
 *
 * Pure reducer step. `elements` is the full array of element documents for
 * one pageName, as returned by GET /api/elements?pageName=<pageName>
 * (§5.1). Returns a NEW cms state with allSections[pageName] and
 * allSectionsCss[pageName] populated.
 *
 * THE FLATTENING RULE (§5.0): a Cards element writes TWO kinds of key —
 *   1. its own fieldId gets the whole loop array, so the component can map
 *      over it, and
 *   2. every nested fieldIdN inside every loop item gets its own top-level
 *      key holding that field's string value.
 * Every other contentType writes exactly one key: its fieldId -> its
 * content string. Missing step 2 is the most common way to ship a build
 * that looks finished and silently is not.
 */
export function hydrateElements(state, elements, pageName) {
  const sections = { ...(state.allSections[pageName] || {}) };
  const css = { ...(state.allSectionsCss[pageName] || {}) };

  for (const el of elements || []) {
    if (!el || el.pageName !== pageName) continue;

    if (el.contentType === 'Cards') {
      const loop = Array.isArray(el.loop) ? el.loop : [];
      sections[el.fieldId] = loop;
      for (const item of loop) {
        flattenLoopItemFields(item, sections);
      }
    } else {
      sections[el.fieldId] = el.content;
    }

    if (el.css !== undefined && el.css !== null) {
      css[el.fieldId] = el.css;
    }
  }

  return {
    ...state,
    allSections: { ...state.allSections, [pageName]: sections },
    allSectionsCss: { ...state.allSectionsCss, [pageName]: css },
  };
}

/**
 * computeMissing(elementIds, sectionsForPage)
 *
 * §5.1: elementIds is the caller's declaration of what it needs, not a
 * server filter. After a hydrate, this diffs elementIds against what
 * actually landed in allSections[pageName] and returns the ones absent.
 */
export function computeMissing(elementIds, sectionsForPage) {
  if (!Array.isArray(elementIds)) return [];
  const present = sectionsForPage || {};
  return elementIds.filter((id) => !(id in present));
}

export function setMissing(state, pageName, missingIds) {
  return { ...state, missing: { ...state.missing, [pageName]: missingIds } };
}

export function setStatus(state, status) {
  return { ...state, status };
}

export function setError(state, error) {
  return { ...state, status: 'failed', error };
}

// --- Action creators (plain objects, the shape dispatch expects) ---------

export const cmsActions = {
  elementsHydrated: (elements, pageName) => ({
    type: 'cms/elementsHydrated',
    payload: { elements, pageName },
  }),
  missingSet: (pageName, missing) => ({
    type: 'cms/missingSet',
    payload: { pageName, missing },
  }),
  statusSet: (status) => ({ type: 'cms/statusSet', payload: status }),
  errorSet: (error) => ({ type: 'cms/errorSet', payload: error }),
};

// --- The reducer (what a store would mount at state.cms) -----------------

export function cmsReducer(state = initialCmsState(), action = {}) {
  switch (action.type) {
    case 'cms/elementsHydrated':
      return hydrateElements(state, action.payload.elements, action.payload.pageName);
    case 'cms/missingSet':
      return setMissing(state, action.payload.pageName, action.payload.missing);
    case 'cms/statusSet':
      return setStatus(state, action.payload);
    case 'cms/errorSet':
      return setError(state, action.payload);
    default:
      return state;
  }
}

// The thin slice wrapper, shaped like an @reduxjs/toolkit `createSlice(...)`
// result (`{ name, reducer, actions }`). Built by hand so this file never
// depends on @reduxjs/toolkit being installed.
export const cmsSlice = {
  name: 'cms',
  reducer: cmsReducer,
  actions: cmsActions,
};

export default cmsReducer;
