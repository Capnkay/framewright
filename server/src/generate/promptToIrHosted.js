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
//
// T-123 / B-005 — a live Bedrock call returned 200 in 22.5s and an IR that
// failed §6 validation, for three reasons: `source.mode` came back "code" for
// a prompt request, `pageName` came back "landing" when "Home" was the
// caller's own value, and `designTokens` carried keys with spaces in them
// ("shadow Small"). `response_format: { strict: true }` does not stop any of
// this — a schema enforces SHAPE, not which value among the legal ones is
// true. The caller already knows pageName, sectionName, platform, variations
// and the fact that this call is a prompt call; those are not the model's to
// decide, and asking it to emit them anyway just gives it room to be wrong
// about ground truth it isn't in a position to know. So they are PINNED —
// overwritten unconditionally after the call returns — rather than validated
// and rejected on mismatch. This is a repair, not the §6 field-ID rejection
// above: a field ID is data the model must never invent at all, while these
// are fields whose true value is already known and the model's guess is
// simply discarded. Each override that actually changed something is named
// in the IR's warnings, on the same principle as promptToIrKeyless's own
// fallback notes — a value that moved without a recorded reason is
// indistinguishable from a bug.
//
// designTokens keys are cheaper to get wrong than to get right: §6.1 rule 4
// already has the emitter ignore any key it does not recognise, so a key
// like "shadow Small" was never going to reach the page. But "silently
// dropped three layers away inside the emitter" is exactly the kind of
// nothing-failed-but-nothing-worked outcome this file exists to avoid, so a
// malformed key is stripped and named here, at the point it was found,
// instead of relying on that later, unrelated safety net to explain itself.

import { promptToIrKeyless } from './promptToIrKeyless.js';
import { validateIr, irSchema } from '../validate/irValidator.js';
import { callModel as orchestratorCallModel } from '../models/orchestrator.js';
import { repairElementNames, repairReferences } from './repairModelIr.js';

// A designTokens leaf key must be a bare identifier — every key in
// DEFAULT_TOKENS (server/src/generate/designTokens.js) is, e.g.
// "headingFamily", "card", "h1". A key containing a space or any other
// character outside this set cannot be a real token under §6.1's own naming,
// whatever its value looks like.
const TOKEN_KEY = /^[A-Za-z][A-Za-z0-9]*$/;



/**
 * pinCallerFields(candidate, caller) -> { pinned, warnings }
 *
 * Overwrites the fields the CALLER supplied — pageName, sectionName,
 * platform, variations — and pins source.mode to "prompt", since this module
 * only ever runs for a prompt call. `candidate` is not mutated; `pinned` is a
 * shallow copy with these fields replaced. `warnings` names only the fields
 * that actually changed, so a model that already got it right adds nothing.
 */
function pinCallerFields(candidate, caller) {
  const pinned = { ...candidate };
  const warnings = [];

  const pin = (key, value) => {
    if (pinned[key] !== value) {
      warnings.push(
        `Model set ${key}=${JSON.stringify(pinned[key])}; pinned to the caller-supplied ${JSON.stringify(value)} (§6 — this field is not the model's to choose).`,
      );
    }
    pinned[key] = value;
  };

  pin('pageName', caller.pageName);
  pin('sectionName', caller.sectionName);
  pin('platform', caller.platform);
  pin('variations', String(caller.variations));

  const modelMode = pinned.source && typeof pinned.source === 'object' ? pinned.source.mode : undefined;
  if (modelMode !== 'prompt') {
    warnings.push(
      `Model set source.mode=${JSON.stringify(modelMode)}; pinned to "prompt" (§6 — this call is always a prompt call).`,
    );
  }
  pinned.source = { ...(pinned.source && typeof pinned.source === 'object' ? pinned.source : {}), mode: 'prompt' };

  return { pinned, warnings };
}

/**
 * repairDesignTokenKeys(ir) -> warnings
 *
 * Mutates `ir.designTokens` in place, dropping any key that is not a bare
 * identifier at any depth, and returns one warning per key dropped. A no-op,
 * warning-free pass-through when designTokens is absent or every key is
 * well-formed — the common case, since §6.1 says designTokens is optional.
 */
function repairDesignTokenKeys(ir) {
  const warnings = [];
  if (!ir.designTokens || typeof ir.designTokens !== 'object' || Array.isArray(ir.designTokens)) {
    return warnings;
  }

  // Clone before mutating — designTokens may be the same object reference
  // the transport handed back, and this module has no business mutating
  // whatever the caller's mock or the real HTTP client still holds.
  ir.designTokens = structuredClone(ir.designTokens);

  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const key of Object.keys(node)) {
      if (!TOKEN_KEY.test(key)) {
        warnings.push(
          `Model's designTokens key ${JSON.stringify(`${path}.${key}`)} is not a valid token name (§6.1); dropped, value was ${JSON.stringify(node[key])}.`,
        );
        delete node[key];
        continue;
      }
      if (node[key] && typeof node[key] === 'object' && !Array.isArray(node[key])) {
        walk(node[key], `${path}.${key}`);
      }
    }
  };

  walk(ir.designTokens, 'designTokens');
  return warnings;
}

// §16.2 — default 30 s, hard ceiling 60 s, inherited from NFR-02's budget.
export const DEFAULT_TIMEOUT_MS = 90_000;
export const MAX_TIMEOUT_MS = 120_000;

/**
 * The instruction sent with every prompt-to-IR call.
 *
 * Every rule below is here because a live Bedrock run broke it (B-012), not because it
 * seemed like good advice. The schema already constrains the SHAPE of the response; none
 * of these are shape problems, which is exactly why `strict: true` did not catch them:
 *
 *   - "Card Header"          — a name that is not an identifier, emitting an unparseable
 *                              `const ids` map and taking the whole component with it
 *   - children: ["heading"]  — a region child naming an element that was never declared
 *   - cards.of: "responsive" — a card loop over an element that does not exist
 *   - default: "true"        — a boolean where display copy belongs
 *   - three elements typed Cards, with no single owner for the loop
 *
 * The repair functions in this module fix all five deterministically, so the floor holds
 * whether or not the model reads this. This raises the ceiling: repaired IR is correct
 * but lossy — a dropped region child is a layout the user described and did not get.
 */
const SYSTEM_PROMPT = [
  'You convert a description of a web page section into Framewright IR: a JSON object',
  'describing the section as editable content fields plus a layout that arranges them.',
  '',
  'Rules, all of which matter:',
  '',
  '1. elementName must be a bare camelCase identifier: headlineMain, tierCards, ctaButton.',
  '   Never a phrase, never spaces or punctuation. It is emitted as a JavaScript key.',
  "2. Every element you declare must appear in exactly one region's children array, and",
  '   every name in a children array must be an element you declared. Names are how',
  '   regions and elements are connected; a name on one side only renders nothing.',
  '3. default is the real display copy a visitor would read: "Start free today", not',
  '   "true", not "text", not a placeholder. This is the content a CMS editor will edit,',
  '   so write it as if it were shipping.',
  '4. Use Cards for a repeating group — pricing tiers, feature cards, testimonials. Declare',
  "   ONE element with contentType Cards, set cards.of to that element's name, set count to",
  '   the number of repeats, and fill cards.items with one object per repeat carrying real',
  '   copy. Do not declare one element per repeat.',
  '5. Produce 5 to 9 elements. Fewer is not a section; more is not a section either.',
  '6. Never invent an id, fieldId, sectionId or elementId. Those are allocated elsewhere',
  '   and any you supply will be discarded.',
  '',
  'Match the section the user actually asked for. A request for a pricing table must not',
  'come back as a hero, and the copy must be about their subject, not a generic example.',
].join('\n');

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

  // Same defaults as promptToIrKeyless — the two paths must agree on what
  // "no option supplied" means, since either can be the one the caller ends
  // up with.
  const {
    pageName = 'Home',
    sectionName = 'Custom',
    platform = 'Website',
    variations = '1',
  } = irOptions;
  const callerFields = { pageName, sectionName, platform, variations };

  const keyless = () => promptToIrKeyless(prompt, irOptions);

  let response;
  try {
    // ONE call. The orchestrator owns the single retry (§16.2); adding one
    // here is what turns a two-attempt budget into four.
    response = await callModel({
      purpose: PURPOSE,
      input: prompt,
      system: SYSTEM_PROMPT,
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

  // T-123 / B-005 — pin the fields the caller already knows the true value
  // of, and strip a designTokens key the model could not have meant, before
  // the schema even sees the candidate. See the file header for why this is
  // a repair rather than a rejection.
  const { pinned, warnings: pinWarnings } = pinCallerFields(candidate, callerFields);
  const tokenWarnings = repairDesignTokenKeys(pinned);
  const nameWarnings = repairElementNames(pinned);
  // Names are normalised BEFORE references are checked, so that a region child written
  // as "Card Header" is compared against the already-renamed "cardHeader" and not
  // reported as dangling by the very step that renamed it.
  const { warnings: refWarnings, viable } = repairReferences(pinned);
  const repairWarnings = [...pinWarnings, ...tokenWarnings, ...nameWarnings, ...refWarnings];

  // §16.2 — output is validated against the schema before it is returned.
  // An invalid response is a failure, not a value. Validated AFTER pinning:
  // a candidate the pin/repair step could not save is still a real failure,
  // and it should fall back with the underlying schema error, not one about
  // a field this module just fixed.
  const result = validateIr(pinned);
  if (!result.valid) {
    const first = result.errors[0];
    const detail = first ? `${first.path}: ${first.message}` : 'unknown schema error';
    return fallback(keyless(), `model output failed IR validation (${detail})`, meta);
  }

  // The viability gate sits AFTER schema validation deliberately. A response that is
  // malformed at the shape level — `elements: "not-an-array"` — must fall back with the
  // SCHEMA's reason, which names the offending field, and not with this module's much
  // vaguer "nothing was placed". Same principle as pinning being validated afterwards:
  // report the underlying failure, not the symptom the last step happened to see.
  if (!viable) {
    return fallback(
      keyless(),
      'model IR left too few placed elements to form an editable section (§9)',
      meta,
    );
  }

  if (repairWarnings.length) {
    pinned.warnings = [...(pinned.warnings || []), ...repairWarnings];
  }

  return {
    ir: pinned,
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
