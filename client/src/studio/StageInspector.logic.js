// client/src/studio/StageInspector.logic.js
//
// The pure, dependency-free logic behind StageInspector.jsx, in its own module
// so it is unit-testable with a bare `node --test` run, without React installed —
// the same split as UploadForm.logic.js, CodePromptInputs.logic.js and
// client/src/sections/generated/HeroSection.logic.js.
//
// These functions previously lived in tests/stage-inspector.test.mjs, and the
// component imported them FROM the test file. That is backwards twice over: it
// pulls test code into the production bundle, and it means the suite was
// exercising a definition the component happened to borrow rather than the
// component's own behaviour. Logic belongs here; the test imports it, not the
// other way round.
//
// The URL shape is CONTRACT.md §11.2's and must match what
// server/src/routes/artifacts.js actually serves:
//   GET /api/jobs/:jobId/artifacts/:name
// where :name is the bare filename, not the full `artifacts/<jobId>/...` key.
// The stored outputRef IS that full key (§15.2 rule 2 keeps it stable across
// storage backends), so the basename is taken from it here rather than assumed.

export function buildArtifactUrl(jobId, outputRef) {
  if (!jobId || !outputRef) return null;
  const name = outputRef.split('/').pop();
  return `/api/jobs/${jobId}/artifacts/${name}`;
}

export function extractStageInfo(stageRecord) {
  if (!stageRecord) return { confidence: null, warnings: [] };
  return {
    confidence: stageRecord.confidence ?? null,
    warnings: Array.isArray(stageRecord.warnings) ? stageRecord.warnings : []
  };
}

export async function fetchArtifactContent(jobId, stageRecord) {
  const url = buildArtifactUrl(jobId, stageRecord?.outputRef);
  if (!url) return null;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const json = await res.json();
    return JSON.stringify(json, null, 2);
  } else {
    return await res.text();
  }
}
