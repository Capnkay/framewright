// server/src/generate/repairModelIr.js — make model-produced IR renderable.
//
// Extracted from promptToIrHosted so that every path which lets a model write IR gets
// the same floor: prompt, wireframe semantics and code. The failures these repair are
// not specific to prompts — they are what a language model does to a schema that
// constrains shape and not meaning — so a second copy of them in the wireframe path
// would drift from this one within a day.
//
// Every rule here was measured on a live Bedrock run. See B-012.

// A bare JS identifier — what `const ids` keys and JSX references both require.
export const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Below this a model response is not a section. The instruction asks for 5 to 9; this
// is that floor with slack, and it is the difference between a bespoke section and a
// component with nothing in it to edit.
export const MIN_PLACED_ELEMENTS = 3;

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
export function repairElementNames(ir) {
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
export function toIdentifier(raw) {
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
export function repairReferences(ir) {
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

