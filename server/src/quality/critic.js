// server/src/quality/critic.js
//
// The visual critic — compares a wireframe against a screenshot of what the
// pipeline actually rendered, and returns a corrected IR.
//
// WHY THIS WAS REWRITTEN RATHER THAN PATCHED. The previous version of this file
// could not run and was failing the build:
//
//   1. It imported `defaultTransport` from ../models/orchestrator.js, which
//      does not export it. That is a link-time error, so the module could not
//      be loaded at all — which is the only reason it went unnoticed, since
//      nothing imported it.
//   2. It read LLM_API_KEY and LLM_BASE_URL directly, which §16.2 permits
//      exactly one module to do. tests/model-orchestrator.test.mjs greps the
//      tree for that and was failing with this file as its sole offender.
//   3. Reaching the transport directly would have bypassed the single-retry
//      budget, the schema check and the stage trace — the three things §16.2
//      exists to centralise.
//   4. It stripped a markdown fence off `response.content` and JSON.parsed it,
//      but the transport already returns parsed JSON and has no `.content`.
//      Fence handling now lives in providers.js, where it applies to every
//      caller instead of one.
//
// So this module now calls `callModel` like every other model-using module,
// and holds no credentials.
//
// WHAT THE CRITIC IS FOR. The generated component is `data?.[id] || "DEFAULT"`
// throughout, and the DEFAULT is the copy the model read off the wireframe. A
// model that hallucinates plausible marketing copy in place of the handwritten
// text produces a component that compiles, lints, validates, hydrates, and is
// wrong — none of the §18 gates can see it, because every one of them measures
// the artifact rather than its fidelity to the drawing. Comparing a render
// against the original image is the only check in the system that can.
//
// IT RETURNS AN IR, NOT A VERDICT. §18's rule is that gates inform and §9
// decides, and a critic that could fail a job would be a gate with teeth. This
// returns a corrected IR or the one it was given; it has no way to express
// "reject". A failed critic call is a no-op, which is the same outcome as a
// critic that found nothing to fix.
//
// FIELD IDS ARE NOT THE MODEL'S TO ISSUE. §6 and AGENTS.md rule 4: IDs come
// from the API, always. The system prompt says so and `preserveFieldIds` below
// enforces it, because a prompt is a request and this is a requirement.

import { callModel } from '../models/orchestrator.js';

export const PURPOSE = 'visual-critic';

const SYSTEM_PROMPT = [
  'You are a UI QA engineer comparing a wireframe against a screenshot of the UI generated from it.',
  '',
  'You will be given, in order: the original wireframe image, a screenshot of the rendered',
  'React component, and the Intermediate Representation (IR) JSON the component was generated from.',
  '',
  'Return the CORRECTED IR JSON. Correct only what the two images disagree about:',
  '',
  '1. TEXT. Every string the wireframe shows must appear in the IR verbatim. If the IR carries',
  '   invented copy — generic marketing lines, lorem ipsum, a plausible-sounding heading that is',
  '   not the one in the drawing — replace it with what the wireframe actually says. This is the',
  '   most common and most damaging mismatch. Read the handwriting; do not improve on it.',
  '2. STRUCTURE. An element present in the wireframe and absent from the render must be added.',
  '   An element in the render with no counterpart in the wireframe must be removed.',
  '3. ORDER. Elements must appear in the order the wireframe places them.',
  '',
  'Do NOT change: any fieldId, sectionId, elementId or id — they are allocated by the API and',
  'anything you supply is discarded. Do not restyle, do not rewrite working copy to read better,',
  'and do not add anything the wireframe does not show. A wireframe is a specification, not a brief.',
  '',
  'If the render already matches the wireframe, return the IR exactly as given.',
].join('\n');

/**
 * §16.2 requires the response to be validated against a schema before it is
 * returned, and this caller's schema is "an object" — the IR's real schema is
 * enforced downstream by the same validator stage 4 already runs, so asserting
 * it twice here would give two schemas that drift. What this rules out is the
 * failure the loose check actually catches: a provider on the JSON_OBJECT rung
 * answering with an array or a bare string.
 */
const REPLY_SCHEMA = { type: 'object' };

function dataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
}

/**
 * Restore every id-shaped key from the original IR onto the model's reply.
 *
 * WHY THIS IS NOT A REJECTION. The alternative — discarding a reply that
 * touched an ID — throws away correct text fixes over a field the model was
 * never going to get right and that we can simply overwrite. §6 requires that
 * no model-supplied ID survives, not that a reply containing one is worthless.
 *
 * Walks the reply in step with the original: at each object, any id-shaped key
 * present in the original is forced back to the original's value, and any
 * id-shaped key the model INVENTED (absent from the original) is deleted.
 */
function preserveFieldIds(corrected, original) {
  const ID_KEY = /^(fieldId\d*|sectionId|elementId|id)$/;

  if (Array.isArray(corrected)) {
    if (!Array.isArray(original)) return corrected;
    return corrected.map((item, i) => preserveFieldIds(item, original[i]));
  }

  if (!corrected || typeof corrected !== 'object') return corrected;

  const out = { ...corrected };
  const src = original && typeof original === 'object' ? original : {};

  for (const key of Object.keys(out)) {
    if (ID_KEY.test(key)) {
      if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = src[key];
      else delete out[key];
      continue;
    }
    out[key] = preserveFieldIds(out[key], src[key]);
  }

  // An ID the model dropped is restored — losing one breaks the store binding
  // just as thoroughly as inventing one.
  for (const key of Object.keys(src)) {
    if (ID_KEY.test(key) && !Object.prototype.hasOwnProperty.call(out, key)) out[key] = src[key];
  }

  return out;
}

/**
 * runCritic({ wireframe, screenshot, ir, timeoutMs, callModel? })
 *   -> { ir, changed, ok, reason, meta }
 *
 * `ir` is always usable: the corrected IR when the call succeeded, the input IR
 * otherwise. `reason` names why the input was returned unchanged, and is null
 * on success — a silent no-op is exactly the degradation §9's Glass Box exists
 * to make visible.
 *
 * NEVER THROWS. §16.2's posture, inherited: a model failure falls back, it does
 * not propagate to the user as a crash. The orchestrator already returns
 * { ok: false } rather than throwing; the try/catch covers the injected-callModel
 * case and anything unparseable in a reply that got past the schema check.
 */
export async function runCritic({
  wireframe,
  screenshot,
  ir,
  timeoutMs,
  callModel: injectedCallModel = callModel,
} = {}) {
  if (!ir || typeof ir !== 'object') {
    return { ir, changed: false, ok: false, reason: 'no IR to critique', meta: null };
  }
  if (!wireframe) {
    return { ir, changed: false, ok: false, reason: 'no wireframe to compare against', meta: null };
  }
  if (!screenshot) {
    return { ir, changed: false, ok: false, reason: 'no screenshot to compare against', meta: null };
  }

  const input = [
    { type: 'text', text: 'The original wireframe:' },
    { type: 'image_url', image_url: { url: dataUrl(wireframe) } },
    { type: 'text', text: 'A screenshot of the UI generated from it:' },
    { type: 'image_url', image_url: { url: dataUrl(screenshot) } },
    { type: 'text', text: `The IR the component was generated from:\n${JSON.stringify(ir)}` },
    { type: 'text', text: 'Return the corrected IR JSON.' },
  ];

  let result;
  try {
    result = await injectedCallModel({
      purpose: PURPOSE,
      input,
      schema: REPLY_SCHEMA,
      system: SYSTEM_PROMPT,
      timeoutMs,
    });
  } catch (err) {
    // The real orchestrator never throws. An injected one might.
    return {
      ir,
      changed: false,
      ok: false,
      reason: `critic call threw: ${err && err.message ? err.message : String(err)}`,
      meta: null,
    };
  }

  if (!result || !result.ok) {
    return {
      ir,
      changed: false,
      ok: false,
      reason: result?.error || 'critic call failed',
      meta: result?.meta || null,
    };
  }

  const corrected = preserveFieldIds(result.value, ir);
  const changed = JSON.stringify(corrected) !== JSON.stringify(ir);

  return { ir: corrected, changed, ok: true, reason: null, meta: result.meta || null };
}

export default runCritic;
