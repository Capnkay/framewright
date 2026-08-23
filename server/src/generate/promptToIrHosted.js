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

// A designTokens leaf key must be a bare identifier — every key in
// DEFAULT_TOKENS (server/src/generate/designTokens.js) is, e.g.
// "headingFamily", "card", "h1". A key containing a space or any other
// character outside this set cannot be a real token under §6.1's own naming,
// whatever its value looks like.
const TOKEN_KEY = /^[A-Za-z][A-Za-z0-9]*$/;

// A bare JS identifier — what `const ids` keys and JSX references both require.
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Below this a model response is not a section. The instruction asks for 5 to 9; this
// is that floor with slack, and it is the difference between a bespoke section and a
// component with nothing in it to edit.
const MIN_PLACED_ELEMENTS = 3;

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

/**
 * repairElementNames(ir) -> warnings
 *
 * Mutates `ir` in place so every `elementName` is a bare camelCase identifier, and
 * returns one warning per name rewritten.
 *
 * Why this is required rather than cosmetic: `elementName` is not just a label. §9's
 * `const ids` map is emitted as `{ <elementName>: '<fieldId>' }`, so a name the model
 * wrote as "Card Header" emits `Card Header: '2000000546'` — a syntax error that makes
 * the whole component unparseable. Measured on a live Bedrock run (B-012): a pricing
 * prompt produced eleven elements, seven of them multi-word, and stage 6 failed on a
 * parse error while the elements themselves had already been allocated real IDs and
 * persisted. The store was fine; the component could not be loaded.
 *
 * The rewrite must reach every reference in the same pass. `layout.regions[].children`
 * and `cards.of` address elements BY NAME, so renaming the element alone would leave the
 * emitter looking up a child that no longer exists and silently rendering nothing —
 * which is exactly the failure mode rule 2 exists to catch, since a region that renders
 * no children still compiles and still looks plausible.
 *
 * Collisions are resolved by suffixing rather than dropping. Two distinct elements that
 * normalise to the same identifier ("Feature Item" and "feature item") are two distinct
 * fieldIds in the store, and merging them would silently lose one editable field.
 */
function repairElementNames(ir) {
  const warnings = [];
  if (!Array.isArray(ir.elements)) return warnings;

  const rename = new Map();          // original -> normalised
  const taken = new Set();

  for (const element of ir.elements) {
    const original = element && typeof element.elementName === 'string' ? element.elementName : '';
    if (!original) continue;
    if (IDENTIFIER.test(original)) {
      taken.add(original);
      continue;
    }
    let candidate = toIdentifier(original);
    if (!candidate) candidate = 'field';
    let unique = candidate;
    let n = 2;
    while (taken.has(unique)) unique = `${candidate}${n++}`;
    taken.add(unique);
    rename.set(original, unique);
    element.elementName = unique;
    warnings.push(
      `Model named an element ${JSON.stringify(original)}, which is not a valid identifier and would emit an unparseable \`ids\` map (§9); renamed to ${JSON.stringify(unique)}.`,
    );
  }

  if (!rename.size) return warnings;

  // Every by-name reference, rewritten in the same pass. See the note above.
  if (ir.layout && Array.isArray(ir.layout.regions)) {
    for (const region of ir.layout.regions) {
      if (!region || !Array.isArray(region.children)) continue;
      region.children = region.children.map(name => rename.get(name) ?? name);
    }
  }
  if (ir.cards && typeof ir.cards === 'object' && !Array.isArray(ir.cards)) {
    if (rename.has(ir.cards.of)) ir.cards.of = rename.get(ir.cards.of);
  }

  return warnings;
}

/** "Card Header" -> "cardHeader"; "icon-check" -> "iconCheck"; "2 cols" -> "cols". */
function toIdentifier(raw) {
  const words = String(raw)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean);
  if (!words.length) return '';
  const joined =
    words[0].toLowerCase() +
    words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  // Trim any leading digits LAST, so that "2 cols" yields "cols" and not "Cols" — the
  // capitalisation belongs to the second word only while it is still the second word.
  const trimmed = joined.replace(/^[0-9]+/, '');
  return /^[A-Za-z_$]/.test(trimmed) ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : '';
}

/**
 * repairReferences(ir) -> { warnings, viable }
 *
 * The IR schema checks SHAPES, not REFERENCES. `layout.regions[].children` and
 * `cards.of` address elements by name, and nothing in §6's schema requires those names
 * to exist — so a model can return an IR that validates perfectly and is still
 * unrenderable. Measured on a live Bedrock pricing run (B-012):
 *
 *   elements : starter:Cards, team:Cards, scale:Cards
 *   regions  : [{children:["heading","subheading"]}, {children:["starter","team","scale"]}]
 *   cards.of : "responsive"
 *
 * Neither "heading" nor "subheading" nor "responsive" was an element. The job reported
 * seven green stages, the component compiled, and it emitted `id={ids.responsive}` —
 * undefined — with not one `data?.[ids.x] || "DEFAULT"` binding in it. A section that
 * compiles and is not bound to the store is precisely the failure AGENTS.md rule 2
 * exists to catch, and it is the 25-point criterion.
 *
 * So references are repaired here, deterministically, rather than hoped for in a prompt.
 * A better prompt raises the hit rate; only this guarantees the floor.
 *
 * `viable: false` means the repair could not leave a single element placed in a region.
 * The caller treats that as a model failure and falls back to the deterministic path —
 * a template section that works beats a bespoke one that renders nothing.
 */
function repairReferences(ir) {
  const warnings = [];
  const byName = new Map(
    (Array.isArray(ir.elements) ? ir.elements : [])
      .filter(e => e && typeof e.elementName === 'string')
      .map(e => [e.elementName, e]),
  );
  if (!byName.size) return { warnings, viable: false };

  // 1. cards.of must name a real element, and that element must be the Cards one.
  if (ir.cards && typeof ir.cards === 'object' && !Array.isArray(ir.cards)) {
    if (!byName.has(ir.cards.of)) {
      const cardsElements = [...byName.values()].filter(e => e.contentType === 'Cards');
      if (cardsElements.length === 1) {
        warnings.push(
          `Model set cards.of to ${JSON.stringify(ir.cards.of)}, which is not an element; repointed at the only Cards element, ${JSON.stringify(cardsElements[0].elementName)}.`,
        );
        ir.cards.of = cardsElements[0].elementName;
      } else {
        // No unambiguous owner. Dropping the loop is the safe move, but the elements
        // it would have owned must stop claiming to be Cards or the emitter will try
        // to iterate a collection that no longer exists.
        warnings.push(
          `Model set cards.of to ${JSON.stringify(ir.cards.of)}, which is not an element, and ${cardsElements.length} elements claim contentType Cards, so there is no unambiguous owner; the card loop was dropped and those elements were treated as Text.`,
        );
        delete ir.cards;
        for (const element of cardsElements) element.contentType = 'Text';
      }
    }
  }

  // 2. A region child that names no element renders nothing. Drop it, keep the rest.
  let placed = 0;
  if (ir.layout && Array.isArray(ir.layout.regions)) {
    for (const region of ir.layout.regions) {
      if (!region || !Array.isArray(region.children)) continue;
      const kept = [];
      for (const name of region.children) {
        if (byName.has(name)) kept.push(name);
        else warnings.push(`Model placed ${JSON.stringify(name)} in a region but declared no such element; the reference was dropped.`);
      }
      region.children = kept;
      placed += kept.length;
    }
  }

  // 3. An element declared but placed nowhere is an allocated, paid-for field that no
  //    one can edit. Append the orphans to the last region rather than lose them.
  const referenced = new Set(
    (ir.layout && Array.isArray(ir.layout.regions) ? ir.layout.regions : [])
      .flatMap(r => (r && Array.isArray(r.children) ? r.children : [])),
  );
  const orphans = [...byName.keys()].filter(n => !referenced.has(n));
  if (orphans.length && ir.layout && Array.isArray(ir.layout.regions) && ir.layout.regions.length) {
    const last = ir.layout.regions[ir.layout.regions.length - 1];
    last.children = [...(Array.isArray(last.children) ? last.children : []), ...orphans];
    placed += orphans.length;
    warnings.push(
      `Model declared ${orphans.length} element(s) it placed in no region (${orphans.map(o => JSON.stringify(o)).join(', ')}); appended to the last region so they remain editable.`,
    );
  }

  // "At least one element survived" is too weak a floor, and that was measured too: a
  // testimonial prompt came back as a single Cards element, passed a placed > 0 gate,
  // and emitted a section with a card loop and NOT ONE editable text binding. It
  // compiled, it rendered, and there was nothing in it a CMS editor could change —
  // worth zero of the 25 points and indistinguishable from success in the stage trace.
  //
  // So the floor is what the instruction already asks the model for, with slack: enough
  // elements to be a section, and at least one of them a plain field rather than a
  // collection, since a lone Cards element binds nothing on its own.
  const placedNames = new Set(
    (ir.layout && Array.isArray(ir.layout.regions) ? ir.layout.regions : [])
      .flatMap(r => (r && Array.isArray(r.children) ? r.children : [])),
  );
  const hasPlainField = [...placedNames].some(n => {
    const element = byName.get(n);
    return element && element.contentType !== 'Cards';
  });
  const viable = placed >= MIN_PLACED_ELEMENTS && hasPlainField;
  if (!viable) {
    warnings.push(
      `Model IR placed ${placed} element(s) with ${hasPlainField ? 'no' : 'only a collection and no'} editable field; below the floor for a usable section.`,
    );
  }

  return { warnings, viable };
}

// §16.2 — default 30 s, hard ceiling 60 s, inherited from NFR-02's budget.
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 60_000;

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
