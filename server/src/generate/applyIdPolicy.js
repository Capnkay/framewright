// server/src/generate/applyIdPolicy.js
//
// idPolicy.mode and idPolicy.contentPolicy — CONTRACT.md §6 and §13.3.
//
// §13.3 says of preserve: "Rule 2 is the whole demo. A judge types their own
// headline, we change the design, and their words are still there because
// headlineMain kept 2000000003. If regeneration mints a new ID, the moment
// fails live and publicly."
//
// And §6 says the part that is easy to get wrong while believing you are
// finished: "Preserving an ID while overwriting its content preserves nothing
// a human can see: the judge's typed headline would be replaced by CHALLENGE
// YOUR LIMITS on regeneration, with the same field ID, and the moment fails
// live. An ID is not the thing being preserved — the *content reachable
// through it* is. Anyone implementing preserve as ID-only has implemented the
// wrong feature."
//
// So the two axes are separate and both are load-bearing:
//
//   mode           allocate | preserve   — which fieldId an element gets
//   contentPolicy  overwrite | keep      — whether stored content survives
//
// REGENERATION FORCES contentPolicy: 'keep'. Not defaults to — forces. A
// caller passing `overwrite` for a regeneration is asking for the failure mode
// §6 describes, so it is overridden and the override is recorded.
//
// THE ONE EXCEPTION, from §6: "when the regeneration prompt explicitly changes
// a field's copy, that field is overwritten and the change is recorded in
// warnings." The signal for "the prompt explicitly changed this" already
// exists in the IR — §6's field notes say `sourceOf` is "what makes the
// conflict-resolution rule auditable rather than assumed". An element with
// sourceOf: 'prompt' is one the prompt spoke about; anything else is a
// template default that must not clobber stored content.
//
// Card slots: this module reads and honours idPolicy.preserve.cards
// positionally, which is what §6 specifies ("one inner array per loop item,
// positional by index"). Growth and shrink across a changing count, plus the
// §13.3 preservedIds/newIds response shape, are T-063.

export const ID_MODES = ['allocate', 'preserve'];
export const CONTENT_POLICIES = ['overwrite', 'keep'];

/** §1's three sanctioned ranges, by what is being allocated. */
const RANGE = { element: 'element', cardField: 'cardField' };

function indexExistingElements(existingElements) {
  const byName = new Map();
  const byFieldId = new Map();
  for (const el of existingElements || []) {
    if (!el || typeof el !== 'object') continue;
    if (el.elementName) byName.set(el.elementName, el);
    if (el.fieldId) byFieldId.set(String(el.fieldId), el);
  }
  return { byName, byFieldId };
}

/**
 * Did the prompt explicitly speak about this element's copy?
 *
 * §6's field notes make `sourceOf` the auditable record of which input set a
 * field. Only 'prompt' counts here: 'wireframe' means the layout moved, not
 * that the words changed, and 'default' means nobody asked for anything.
 */
function promptChangedCopy(irElement) {
  return irElement && irElement.sourceOf === 'prompt';
}

/**
 * applyIdPolicy({ ir, existingElements, allocateId, isRegeneration })
 *
 *   -> {
 *        elements,        resolved descriptors, in IR order
 *        preservedIds,    { elementName: fieldId } for everything reused
 *        newIds,          [fieldId] for everything freshly allocated
 *        orphanedIds,     [fieldId] present before, absent from the new IR
 *        contentPolicy,   the policy actually applied
 *        mode,            the mode actually applied
 *        warnings         every decision §6 requires recording
 *      }
 *
 * `allocateId(range)` is injected — §1 requires IDs to come from the central
 * allocator, and this module must never mint one itself.
 *
 * Nothing here writes to a store. It decides; the caller persists. That keeps
 * it a pure function of (IR, existing state) and therefore testable against
 * the exact scenario §13.3 describes.
 */
export async function applyIdPolicy({
  ir,
  existingElements = [],
  allocateId,
  isRegeneration = false,
} = {}) {
  if (!ir || typeof ir !== 'object') throw new Error('applyIdPolicy: an IR is required');
  if (typeof allocateId !== 'function') {
    throw new Error('applyIdPolicy: `allocateId` is required — §1 forbids minting IDs locally');
  }

  const warnings = [];
  const idPolicy = ir.idPolicy || {};
  const preserveMap = (idPolicy.preserve && idPolicy.preserve.elements) || {};
  const preserveCards = (idPolicy.preserve && idPolicy.preserve.cards) || {};

  // --- mode ---------------------------------------------------------------
  let mode = ID_MODES.includes(idPolicy.mode) ? idPolicy.mode : 'allocate';
  if (isRegeneration && mode !== 'preserve') {
    warnings.push(
      `§13.3: idPolicy.mode is forced to "preserve" for a regeneration (was ${JSON.stringify(idPolicy.mode)}).`,
    );
    mode = 'preserve';
  }

  // --- contentPolicy ------------------------------------------------------
  let contentPolicy = CONTENT_POLICIES.includes(idPolicy.contentPolicy)
    ? idPolicy.contentPolicy
    : 'overwrite';
  if (isRegeneration && contentPolicy !== 'keep') {
    // §6: preserving an ID while overwriting its content preserves nothing a
    // human can see. This is the line that keeps the judge's headline alive.
    warnings.push(
      `§6: regeneration forces contentPolicy "keep" (was ${JSON.stringify(idPolicy.contentPolicy)}) — an ID is not the thing being preserved, the content reachable through it is.`,
    );
    contentPolicy = 'keep';
  }

  const { byName } = indexExistingElements(existingElements);
  const irElements = Array.isArray(ir.elements) ? ir.elements : [];

  const elements = [];
  const preservedIds = {};
  const newIds = [];
  const seenNames = new Set();

  for (const irEl of irElements) {
    if (!irEl || !irEl.elementName) continue;
    const { elementName } = irEl;

    // F-008, defence in depth. validateIr rejects a duplicate elementName at
    // the boundary, which is where an untrusted model response is caught and
    // turned into a keyless fallback (§16.2). This guard is for everything
    // that reaches here WITHOUT having gone through that boundary — the
    // generate, regenerate and replay routes all call applyIdPolicy directly.
    // Two elements sharing a name would otherwise resolve to the same fieldId
    // and be handed out as a duplicate, which §1 forbids and §14's pre-submit
    // gate is built to catch. Failing loudly here beats issuing it: a
    // duplicate ID surfaces as a blocked push for whoever runs the demo,
    // arbitrarily far from the code that caused it.
    if (seenNames.has(elementName)) {
      throw new Error(
        `applyIdPolicy: duplicate elementName ${JSON.stringify(elementName)} in ir.elements — §6 keys elements by name, so this would issue one fieldId to two elements (§1, §14). See _build/findings/F-008.md`,
      );
    }
    seenNames.add(elementName);

    const existing = byName.get(elementName);

    // --- which fieldId -----------------------------------------------------
    let fieldId;
    let isNew = false;

    if (mode === 'preserve') {
      // The IR's explicit map first — it is the caller's stated intent —
      // then whatever the store already holds for this name.
      const mapped = preserveMap[elementName];
      if (mapped) fieldId = String(mapped);
      else if (existing && existing.fieldId) fieldId = String(existing.fieldId);
    }

    if (!fieldId) {
      // §13.3 rule 3 — only genuinely new elements receive newly allocated IDs.
      fieldId = String(await allocateId(RANGE.element));
      isNew = true;
      newIds.push(fieldId);
    } else {
      preservedIds[elementName] = fieldId;
    }

    // --- which content -----------------------------------------------------
    const hadStoredContent =
      existing !== undefined && existing.content !== undefined && existing.content !== null;

    let content;
    let contentSource;

    if (isNew || !hadStoredContent) {
      // §6: under "keep", the IR's default is applied ONLY to elements that
      // did not previously exist. A brand-new element has nothing to keep.
      content = irEl.default ?? null;
      contentSource = 'ir-default';
    } else if (contentPolicy === 'overwrite') {
      content = irEl.default ?? null;
      contentSource = 'ir-default';
    } else if (promptChangedCopy(irEl)) {
      // §6's one exception. Recorded, because a silent overwrite of a judge's
      // typed copy is indistinguishable from the bug this whole module exists
      // to prevent.
      content = irEl.default ?? null;
      contentSource = 'prompt-override';
      warnings.push(
        `§6: the prompt explicitly changed "${elementName}" copy, so its stored content was overwritten despite contentPolicy "keep".`,
      );
    } else {
      content = existing.content;
      contentSource = 'stored';
    }

    // --- nested card field IDs (§6, positional by index) -------------------
    let loop;
    if (irEl.contentType === 'Cards') {
      loop = await resolveCardLoop({
        elementName,
        ir,
        existing,
        preserveRows: preserveCards[elementName],
        mode,
        contentPolicy,
        allocateId,
        newIds,
        warnings,
        promptChanged: promptChangedCopy(irEl),
      });
    }

    elements.push({
      elementName,
      fieldId,
      contentType: irEl.contentType,
      content: irEl.contentType === 'Cards' ? null : content,
      contentSource,
      isNew,
      ...(loop ? { loop } : {}),
    });
  }

  // §13.3 rule 3 — "An element that disappears from the new layout is left in
  // the store, not deleted — its content survives in case a later variation
  // brings it back." Reported so the caller can see it chose not to delete.
  const orphanedIds = [];
  for (const [name, el] of byName) {
    if (!seenNames.has(name) && el.fieldId) {
      orphanedIds.push(String(el.fieldId));
      warnings.push(
        `§13.3: "${name}" (${el.fieldId}) is absent from the new layout; left in the store rather than deleted.`,
      );
    }
  }

  return { elements, preservedIds, newIds, orphanedIds, contentPolicy, mode, warnings };
}

/**
 * Card loop items, positional by index (§6: "one inner array per loop item,
 * positional by index"). Preserves the nested field IDs an existing item
 * already had and allocates only for slots that never existed.
 *
 * Growth and shrink across a changing count is T-063; this honours whatever
 * count the IR states and preserves by index within it.
 */
async function resolveCardLoop({
  ir,
  existing,
  preserveRows,
  mode,
  contentPolicy,
  allocateId,
  newIds,
  warnings,
  promptChanged,
}) {
  const cards = ir.cards || {};
  const items = Array.isArray(cards.items) ? cards.items : [];
  const fieldsPerItem = Number.isInteger(cards.fieldsPerItem) ? cards.fieldsPerItem : 2;
  const existingLoop = Array.isArray(existing?.loop) ? existing.loop : [];

  const loop = [];

  for (let i = 0; i < items.length; i += 1) {
    const irItem = items[i] || {};
    const existingItem = existingLoop[i];
    const preservedRow = Array.isArray(preserveRows) ? preserveRows[i] : undefined;
    const item = {};

    for (let f = 1; f <= fieldsPerItem; f += 1) {
      const idKey = `fieldId${f}`;
      const valueKey = `field${f}`;
      const typeKey = `fieldType${f}`;

      let fieldId;
      if (mode === 'preserve') {
        if (preservedRow && preservedRow[f - 1]) fieldId = String(preservedRow[f - 1]);
        else if (existingItem && existingItem[idKey]) fieldId = String(existingItem[idKey]);
      }

      const slotIsNew = !fieldId;
      if (slotIsNew) {
        fieldId = String(await allocateId(RANGE.cardField));
        newIds.push(fieldId);
      }

      const storedValue = existingItem ? existingItem[valueKey] : undefined;
      const hadStored = storedValue !== undefined && storedValue !== null;

      let value;
      if (slotIsNew || !hadStored) value = irItem[valueKey] ?? null;
      else if (contentPolicy === 'overwrite' || promptChanged) value = irItem[valueKey] ?? null;
      else value = storedValue;

      item[valueKey] = value;
      item[typeKey] = irItem[typeKey] || existingItem?.[typeKey] || 'Text';
      item[idKey] = fieldId;
    }

    loop.push(item);
  }

  if (existingLoop.length > items.length) {
    // §13.3 rule 4 — "Shrinking leaves the orphaned items in place."
    warnings.push(
      `§13.3: card count shrank from ${existingLoop.length} to ${items.length}; the orphaned items' IDs are left stored, not deleted.`,
    );
  }

  return loop;
}

export default applyIdPolicy;
