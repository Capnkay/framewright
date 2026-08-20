// server/src/generate/perceiveAndAssembleIr.js
//
// Node's side of the perception boundary — CONTRACT.md §12 and §6.
//
// Calls POST /perceive on the Python service and assembles the FULL IR from what
// comes back. §12 draws the line and this file is where it is enforced:
//
//   "Node assembles the full IR by taking irVersion, pageName, sectionName, source
//    and idPolicy from the request and everything else from this response."
//
// So the split is not a style choice — it is the contract, and it is testable. The
// five request-owned fields are never read from the response even if the service
// sends them, and the four response-owned sub-objects are never invented here.
//
// THERE IS NO `irFragment`, and §12 says why at length: "A single opaque 'fragment'
// is exactly the field one track emits as a whole IR and the other consumes as a
// partial, and they discover the mismatch at integration." The service returns
// `layout`, `theme`, `cards` and `elements` as named sub-objects and they are copied
// across by name.
//
// THE SERVICE NEVER ALLOCATES A fieldId (§12). This module does not add one either —
// ID allocation happens after the IR is final, in the generate route. Anything
// arriving with a `fieldId` is stripped, because an ID minted on the perception
// machine is an ID no allocator issued.
//
// DEGRADATION IS PART OF THE CONTRACT (§12): "If /perceive is unreachable, times out,
// or returns non-200, the Node API records the stage as degraded, emits a warning, and
// continues down the deterministic path." This module therefore has no throwing path
// for a service failure — it returns `{ ok: false, reason }` and the caller falls back.
// Building the fallback IR itself is T-059's job, not this one's; conflating them would
// put the degradation policy in two places.

import { validateIr } from '../validate/irValidator.js';

/** §12's default location for the perception service. Overridable per call. */
export const DEFAULT_PERCEIVE_URL = 'http://127.0.0.1:8000';

/**
 * §12 does not name a timeout, but "times out" is listed as a degradation trigger,
 * so one has to exist or that clause is unreachable. 20s is chosen against measured
 * behaviour: stage 3b's OCR worker is a cold subprocess start plus CPU inference,
 * which runs a few seconds on a wireframe (EC-014). Short enough that a dead service
 * does not stall a demo, long enough that a working one is not cut off mid-read.
 */
export const DEFAULT_TIMEOUT_MS = 20000;

/** The sub-objects §12 says come from the response, and nothing else. */
const RESPONSE_OWNED = ['layout', 'theme', 'cards', 'elements'];

/**
 * §6 requires `sectionType`; §12's response does not carry it. Someone has to derive
 * it, and it is Node's because §12 makes Node the assembler.
 *
 * Derived from the layout rather than guessed: a row of a media region beside a
 * content region is a split hero, which is the reference section and the only shape
 * the emitter builds today. Anything else is reported honestly as `generic` rather
 * than mislabelled — a wrong `sectionType` sends the emitter down a template that
 * does not match the detections, and the failure surfaces as a broken layout rather
 * than as a bad label.
 */
export function deriveSectionType(layout) {
  const regions = Array.isArray(layout?.regions) ? layout.regions : [];
  const roles = new Set(regions.map((r) => r?.role));
  if (layout?.direction === 'row' && roles.has('media') && roles.has('content')) {
    return 'split-hero';
  }
  if (roles.has('content')) return 'stacked-hero';
  return 'generic';
}

/**
 * §12: elements come back "identified by position and elementName only". Strip any
 * id-shaped field rather than trusting it. Cheap, and it makes the §1 rule — IDs come
 * from the API, always — impossible to violate across this boundary by accident.
 */
function stripIds(elements) {
  return (Array.isArray(elements) ? elements : []).map((el) => {
    const { fieldId, ...rest } = el || {};
    if (Array.isArray(rest.loop)) {
      rest.loop = rest.loop.map((item) => {
        const clean = {};
        for (const [k, v] of Object.entries(item || {})) {
          if (!/^fieldId\d*$/.test(k)) clean[k] = v;
        }
        return clean;
      });
    }
    return rest;
  });
}

function stripCardIds(cards) {
  if (!cards || typeof cards !== 'object') return cards;
  const items = Array.isArray(cards.items) ? cards.items : [];
  return {
    ...cards,
    items: items.map((item) => {
      const clean = {};
      for (const [k, v] of Object.entries(item || {})) {
        if (!/^fieldId\d*$/.test(k)) clean[k] = v;
      }
      return clean;
    }),
  };
}

/**
 * callPerceive({ image, filename, hints, ... }) -> { ok, body } | { ok:false, reason }
 *
 * NEVER THROWS. Every §12 degradation trigger — unreachable, timeout, non-200 — comes
 * back as `{ ok: false, reason }`. A throw here would have to be caught by every
 * caller, and the one that forgets turns a stopped Python service into a failed
 * generation, which is the exact outcome §12 exists to prevent.
 */
export async function callPerceive({
  image,
  filename = 'wireframe.png',
  contentType = 'image/png',
  hints = {},
  baseUrl = DEFAULT_PERCEIVE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'no fetch implementation available' };
  }
  if (!image) {
    return { ok: false, reason: 'no wireframe image was supplied' };
  }

  // §12's multipart shape: the image, plus a JSON field `hints`.
  const form = new FormData();
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
  form.append('image', new Blob([bytes], { type: contentType }), filename);
  form.append('hints', JSON.stringify(hints ?? {}));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/perceive`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `/perceive returned ${response.status}` };
    }
    return { ok: true, body: await response.json() };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    return {
      ok: false,
      reason: aborted
        ? `/perceive timed out after ${timeoutMs}ms`
        : `/perceive is unreachable: ${err && err.message ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * assembleIr(request, perception) -> { ir, warnings }
 *
 * The §12 split, applied. `request` supplies the five request-owned fields;
 * `perception` supplies the four sub-objects. Pure — no network, no clock — so the
 * split can be tested without a service running.
 */
export function assembleIr(request = {}, perception = {}) {
  const {
    pageName = 'Home',
    sectionName = 'Custom',
    platform = 'Website',
    mode = 'wireframe',
    inputs,
    wireframeRef = null,
    idPolicy,
    variations = '1',
    designTokens,
  } = request;

  const warnings = [
    ...(Array.isArray(perception.warnings) ? perception.warnings : []),
  ];

  for (const key of RESPONSE_OWNED) {
    if (perception[key] === undefined || perception[key] === null) {
      warnings.push(`/perceive omitted "${key}"; the deterministic default was used.`);
    }
  }

  const layout = perception.layout ?? {};
  const elements = stripIds(perception.elements);

  const ir = {
    // --- request-owned, §12. Never read from the response. ---
    irVersion: '1.0',
    pageName,
    sectionName,
    platform,
    source: {
      mode,
      // §6's `inputs` is the list of what was actually supplied. Defaulted from the
      // mode rather than assumed, so combined mode does not silently claim a prompt
      // it never received.
      inputs: Array.isArray(inputs) ? inputs : (mode === 'combined' ? ['wireframe'] : [mode]),
      wireframeRef,
    },
    idPolicy: idPolicy ?? {
      mode: 'allocate',
      contentPolicy: 'overwrite',
      preserve: { elements: {}, cards: {} },
    },

    // --- derived by Node, because §6 requires it and §12 does not return it ---
    sectionType: deriveSectionType(layout),

    // --- response-owned, §12 ---
    layout,
    theme: perception.theme ?? {},
    cards: stripCardIds(perception.cards),
    elements,

    // §2/§6 — always a string. There is no numeric form of this field anywhere,
    // and T-019's validator rejects a numeric one, so coercing here rather than
    // trusting the caller keeps a JSON body with `"variations": 1` from failing
    // validation three layers later.
    variations: String(variations),
    warnings,
  };

  if (designTokens !== undefined) ir.designTokens = designTokens;
  return { ir, warnings };
}

/**
 * perceiveAndAssembleIr(options) -> { ok, ir, warnings, perception } | { ok:false, reason, warnings }
 *
 * The whole path: call the service, assemble, validate. `ok: false` means the caller
 * should take the deterministic path — T-059 owns what that path builds.
 *
 * VALIDATION HAPPENS HERE, not at the caller. The doneWhen asks for "a schema-valid
 * full IR", and an IR that fails §6 must not be handed onward as if it were fine: the
 * emitter would build a component from it and the failure would surface as broken JSX
 * rather than as a bad IR. A schema failure is treated as a perception failure —
 * degrade, warn, continue — because that is what §12 prescribes for a service whose
 * output cannot be used.
 */
export async function perceiveAndAssembleIr(options = {}) {
  const { request = {}, validate = validateIr, ...callOptions } = options;

  const called = await callPerceive(callOptions);
  if (!called.ok) {
    return { ok: false, reason: called.reason, warnings: [called.reason] };
  }

  const { ir, warnings } = assembleIr(request, called.body);

  const result = validate(ir);
  if (!result.valid) {
    const detail = (result.errors || [])
      .slice(0, 3)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
    const reason = `/perceive produced an IR that fails §6 validation — ${detail}`;
    return { ok: false, reason, warnings: [...warnings, reason], ir };
  }

  return { ok: true, ir, warnings, perception: called.body };
}

export default perceiveAndAssembleIr;
