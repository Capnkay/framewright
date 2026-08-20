// server/src/generate/promptToIrHosted.js
//
// The hosted-model prompt-to-IR path — CONTRACT.md §6, §16.2.
//
// This is the ENHANCEMENT path. The keyless path beside it is the one that
// must always work (ROADMAP.md Phase 2, Gate 2); this one produces a richer
// IR when a model is available and gets out of the way completely when it is
// not. Every failure mode ends the same way: a valid IR from
// promptToIrKeyless, never an exception reaching the caller.
//
// §16.2 governs the call itself, and three of its rules shape this file:
//
//   1. "Every hosted-model call in the system goes through one orchestrator.
//      Stage 5 does not call a provider directly, and neither does anything
//      else." So this module never opens a socket. It calls `callModel`,
//      which is injected — T-085 builds the real orchestrator, and until it
//      lands the default below is the §16.2-compliant no-key behaviour.
//
//   2. "Retries: exactly ONE, on timeout or a schema-validation failure."
//      That retry belongs to the ORCHESTRATOR, and this module therefore
//      performs NONE of its own. §18.2 adds a second, separate retry of the
//      whole emit step later in the pipeline; the corrections register is
//      explicit that the two must not compose into four attempts. One call
//      out of here, one retry inside the orchestrator, and that is the
//      budget — NFR-02 gives the entire generation 60 seconds.
//
//   3. "LLM_API_KEY unset means every callModel returns { ok: false }
//      immediately, without a network attempt. This is a supported state,
//      not an error." Not a degraded mode to warn loudly about — the normal
//      operating state of the deterministic demo.
//
// "Model output is untrusted input" (§16.2). It is validated against the IR
// schema before it is believed, and an invalid response is a failure, not a
// value. In particular §6 is explicit that a model never supplies a field ID
// — an IR carrying one is rejected outright rather than quietly stripped,
// because silently repairing untrusted output teaches nobody that the model
// is misbehaving.

import { promptToIrKeyless } from './promptToIrKeyless.js';
import { validateIr, irSchema } from '../validate/irValidator.js';
import { callModel as orchestratorCallModel } from '../models/orchestrator.js';

// §16.2 — default 30 s, hard ceiling 60 s, inherited from NFR-02's budget.
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 60_000;

export const PURPOSE = 'prompt-to-ir';

/**
 * The default orchestrator — the real one, from T-085.
 *
 * This was a local stub until T-085 landed; it now delegates to the single
 * §16.2 call site. That matters for more than tidiness: the stub read
 * LLM_API_KEY itself, and §16.2 permits exactly one module to do that. With
 * this import in place, "every hosted-model call goes through callModel" is
 * true of the whole repository, which is what T-085's grep test asserts.
 *
 * Still injectable via options.callModel — every test in this suite drives
 * the fallback logic without a network.
 */
const defaultCallModel = orchestratorCallModel;

/** §6 — a model never supplies a field ID. Detect one anywhere in the IR. */
function findFieldIdKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const found = findFieldIdKey(value[i], `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (/^fieldId\d*$/.test(key)) return `${path}.${key}`;
      const found = findFieldIdKey(value[key], `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

function clampTimeout(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(ms, MAX_TIMEOUT_MS);
}

/**
 * promptToIrHostedWithMeta(prompt, options)
 *   -> { ir, usedPath: 'hosted' | 'keyless', reason, meta }
 *
 * The full-detail form. `meta` is §16.2's trace shape
 * ({ purpose, model, ms, attempts, ok }) when the orchestrator supplied one,
 * so the caller can append it to the job's stage-5 record per §11.
 *
 * `reason` names why the keyless path was used, and is null on the hosted
 * path. The Glass Box shows this: "fell back" with no reason is the kind of
 * silent degradation §9 exists to make impossible.
 *
 * Never throws. Any exception from the injected orchestrator is caught and
 * turned into a fallback, because §16.2 requires that a model failure never
 * propagate to the user as a crash.
 */
export async function promptToIrHostedWithMeta(prompt, options = {}) {
  const { callModel = defaultCallModel, timeoutMs, ...irOptions } = options;

  const keyless = () => promptToIrKeyless(prompt, irOptions);

  let response;
  try {
    // ONE call. The orchestrator owns the single retry (§16.2); adding one
    // here is what turns a two-attempt budget into four.
    response = await callModel({
      purpose: PURPOSE,
      input: prompt,
      schema: irSchema,
      timeoutMs: clampTimeout(timeoutMs),
    });
  } catch (err) {
    const reason = `model orchestrator threw: ${err && err.message ? err.message : String(err)}`;
    return fallback(keyless(), reason, null);
  }

  if (!response || response.ok !== true) {
    const reason = (response && response.error) || 'model call failed';
    return fallback(keyless(), reason, response && response.meta ? response.meta : null);
  }

  const meta = response.meta || null;
  const candidate = response.value;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return fallback(keyless(), 'model returned a non-object IR', meta);
  }

  // §6 — a model that emits a field ID is producing invalid IR. Rejected,
  // not repaired.
  const strayId = findFieldIdKey(candidate);
  if (strayId) {
    return fallback(keyless(), `model supplied a field ID at ${strayId}; §6 forbids IDs in the IR`, meta);
  }

  // §16.2 — output is validated against the schema before it is returned.
  // An invalid response is a failure, not a value.
  const result = validateIr(candidate);
  if (!result.valid) {
    const first = result.errors[0];
    const detail = first ? `${first.path}: ${first.message}` : 'unknown schema error';
    return fallback(keyless(), `model output failed IR validation (${detail})`, meta);
  }

  return {
    ir: candidate,
    usedPath: 'hosted',
    reason: null,
    meta,
  };
}

function fallback(ir, reason, meta) {
  return {
    ir: {
      ...ir,
      // The fallback is recorded in the IR itself, so it survives into the
      // job trace and the Studio without the caller having to remember to
      // copy it across.
      warnings: [...(ir.warnings || []), `Hosted model not used: ${reason}. Generated by the deterministic keyless path.`],
    },
    usedPath: 'keyless',
    reason,
    meta,
  };
}

/**
 * promptToIrHosted(prompt, options) -> Promise<IR>
 *
 * The plain form, signature-compatible with promptToIrKeyless so a caller
 * can swap one for the other. Always resolves to a schema-valid IR.
 */
export async function promptToIrHosted(prompt, options = {}) {
  const { ir } = await promptToIrHostedWithMeta(prompt, options);
  return ir;
}

export default promptToIrHosted;
