import { cmsActions } from '../redux/cmsSlice.js';

export function isNestedFieldId(id) {
  if (typeof id !== 'string') return false;
  return id.startsWith('3');
}

export function buildPatchBody(content, css) {
  const body = {};
  if (content !== undefined && content !== null) {
    body.content = content;
  }
  if (css !== undefined && css !== null && css !== '') {
    body.css = css;
  } else if (css === null || css === '') {
    body.css = null; // Spec: "Setting css to null clears the overlay."
  }
  return body;
}

export function getPatchUrl(apiUrl, fieldId) {
  return `${apiUrl}/elements/${fieldId}`;
}

export async function submitPatch({ apiUrl, fieldId, content, css, fetchImpl = fetch }) {
  const url = getPatchUrl(apiUrl, fieldId);
  const body = buildPatchBody(content, css);
  
  if (Object.keys(body).length === 0) {
    throw new Error('At least one of content or css is required');
  }

  const response = await fetchImpl(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`PATCH failed with status ${response.status}`);
  }
  
  const data = await response.json();
  return data;
}

export function applyPatchResponse(dispatch, patchResponseData, pageName) {
  if (patchResponseData && patchResponseData.element) {
    // Dispatch an array containing the single updated element document.
    // cmsSlice's hydrateElements will merge it into the existing store,
    // handling both the top-level key and any nested card fields per §5.0.
    dispatch(cmsActions.elementsHydrated([patchResponseData.element], pageName));
  }
}
