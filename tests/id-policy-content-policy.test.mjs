// tests/id-policy-content-policy.test.mjs — T-062, CONTRACT.md §6 and §13.3.
//
// The scenario every test here is really about, in §13.3's words: "A judge
// types their own headline, we change the design, and their words are still
// there because headlineMain kept 2000000003."
//
// And §6's warning about the way this gets built wrong while looking finished:
// "Anyone implementing preserve as ID-only has implemented the wrong feature."
// So the central test is not that the ID survived — it is that the CONTENT
// reachable through it survived.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyIdPolicy, ID_MODES, CONTENT_POLICIES } from '../server/src/generate/applyIdPolicy.js';

/** A central allocator stand-in, honouring §1's ranges. */
function allocator() {
  const counters = { section: 1000000010, element: 2000000010, cardField: 3000000010 };
  const issued = [];
  const allocateId = async (range) => {
    if (!(range in counters)) throw new Error(`unsanctioned range: ${range}`);
    const id = String(counters[range]++);
    issued.push({ range, id });
    return id;
  };
  return { allocateId, issued };
}

/** The stored state a judge has already edited. */
function storedElements() {
  return [
    { elementName: 'heroImage', fieldId: '2000000001', contentType: 'Image', content: 'uploads/judge.png', loop: null },
    { elementName: 'brandBadge', fieldId: '2000000002', contentType: 'Text', content: 'PULSE FIT', loop: null },
    // The judge typed this.
    { elementName: 'headlineMain', fieldId: '2000000003', contentType: 'Text', content: 'JUDGE TYPED THIS', loop: null },
    { elementName: 'ctaButton', fieldId: '2000000007', contentType: 'Button', content: 'BOOK NOW', loop: null },
    {
      elementName: 'statBadges',
      fieldId: '2000000006',
      contentType: 'Cards',
      content: null,
      loop: [
        { field1: '9000+', fieldType1: 'Text', fieldId1: '3000000001', field2: 'Judge<br />Edited', fieldType2: 'Text', fieldId2: '3000000002' },
        { field1: '40+', fieldType1: 'Text', fieldId1: '3000000003', field2: 'Fitness<br />Programmes', fieldType2: 'Text', fieldId2: '3000000004' },
        { field1: '150+', fieldType1: 'Text', fieldId1: '3000000005', field2: 'Fitness<br />Channels', fieldType2: 'Text', fieldId2: '3000000006' },
      ],
    },
  ];
}

/** A freshly generated IR whose defaults differ from what is stored. */
function newIr({ elements, cards, idPolicy } = {}) {
  return {
    irVersion: '1.0',
    sectionType: 'split-hero',
    elements:
      elements || [
        { elementName: 'heroImage', contentType: 'Image', default: 'default/images/hero-placeholder.jpg', sourceOf: 'default' },
        { elementName: 'brandBadge', contentType: 'Text', default: 'PULSE FIT', sourceOf: 'default' },
        { elementName: 'headlineMain', contentType: 'Text', default: 'CHALLENGE YOUR LIMITS', sourceOf: 'default' },
        { elementName: 'statBadges', contentType: 'Cards', default: null, sourceOf: 'default' },
        { elementName: 'ctaButton', contentType: 'Button', default: 'FIND A WORKOUT', sourceOf: 'default' },
      ],
    cards:
      cards || {
        of: 'statBadges',
        count: 3,
        fieldsPerItem: 2,
        items: [
          { field1: '1000+', field2: 'Community<br />Members' },
          { field1: '40+', field2: 'Fitness<br />Programmes' },
          { field1: '150+', field2: 'Fitness<br />Channels' },
        ],
      },
    idPolicy: idPolicy || { mode: 'preserve', contentPolicy: 'keep', preserve: { elements: {}, cards: {} } },
  };
}

const byName = (result, name) => result.elements.find((e) => e.elementName === name);

// ---------------------------------------------------------------------
// doneWhen — regeneration forces keep, and stored content survives even
// when the IR's default differs.
// ---------------------------------------------------------------------

test("doneWhen — a preserved fieldId's stored content survives even when the IR default differs", async () => {
  const { allocateId } = allocator();
  const result = await applyIdPolicy({
    ir: newIr(),
    existingElements: storedElements(),
    allocateId,
    isRegeneration: true,
  });

  const headline = byName(result, 'headlineMain');

  // The ID survived — §13.3 rule 2.
  assert.equal(headline.fieldId, '2000000003');
  assert.equal(result.preservedIds.headlineMain, '2000000003');

  // And, the part that actually matters, so did the words.
  assert.equal(headline.content, 'JUDGE TYPED THIS', "§6: the judge's copy must survive regeneration");
  assert.notEqual(headline.content, 'CHALLENGE YOUR LIMITS', 'the IR default must NOT clobber it');
  assert.equal(headline.contentSource, 'stored');
});

test('doneWhen — regeneration FORCES contentPolicy keep, even when the IR asked for overwrite', async () => {
  const { allocateId } = allocator();
  const ir = newIr({ idPolicy: { mode: 'preserve', contentPolicy: 'overwrite', preserve: {} } });

  const result = await applyIdPolicy({
    ir,
    existingElements: storedElements(),
    allocateId,
    isRegeneration: true,
  });

  assert.equal(result.contentPolicy, 'keep', 'the request was overridden, not honoured');
  assert.equal(byName(result, 'headlineMain').content, 'JUDGE TYPED THIS');
  assert.ok(
    result.warnings.some((w) => /forces contentPolicy "keep"/.test(w)),
    'the override must be recorded',
  );
});

test('regeneration forces mode preserve too, and records it', async () => {
  const { allocateId } = allocator();
  const ir = newIr({ idPolicy: { mode: 'allocate', contentPolicy: 'keep', preserve: {} } });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });

  assert.equal(result.mode, 'preserve');
  assert.equal(byName(result, 'headlineMain').fieldId, '2000000003');
  assert.ok(result.warnings.some((w) => /idPolicy\.mode is forced to "preserve"/.test(w)));
});

test('every unchanged elementName keeps its existing fieldId — §13.3 rule 2', async () => {
  const { allocateId, issued } = allocator();
  const result = await applyIdPolicy({
    ir: newIr(),
    existingElements: storedElements(),
    allocateId,
    isRegeneration: true,
  });

  assert.equal(byName(result, 'heroImage').fieldId, '2000000001');
  assert.equal(byName(result, 'brandBadge').fieldId, '2000000002');
  assert.equal(byName(result, 'headlineMain').fieldId, '2000000003');
  assert.equal(byName(result, 'statBadges').fieldId, '2000000006');
  assert.equal(byName(result, 'ctaButton').fieldId, '2000000007');

  assert.deepEqual(result.newIds, [], 'nothing new to allocate');
  assert.equal(issued.length, 0, 'the allocator must not be touched at all');
});

// ---------------------------------------------------------------------
// doneWhen — the exception: the prompt explicitly changed the copy.
// ---------------------------------------------------------------------

test('doneWhen — a prompt that explicitly changes a field overwrites it, and warns', async () => {
  const { allocateId } = allocator();
  // §6's `sourceOf` is the auditable record of which input set a field.
  const ir = newIr();
  ir.elements = ir.elements.map((el) =>
    el.elementName === 'ctaButton' ? { ...el, default: 'GO GREEN', sourceOf: 'prompt' } : el,
  );

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });

  const cta = byName(result, 'ctaButton');
  assert.equal(cta.fieldId, '2000000007', 'the ID is still preserved');
  assert.equal(cta.content, 'GO GREEN', 'the prompt wins over stored content');
  assert.equal(cta.contentSource, 'prompt-override');

  const warning = result.warnings.find((w) => /explicitly changed "ctaButton"/.test(w));
  assert.ok(warning, '§6 requires the exception to be recorded in warnings');
  assert.match(warning, /despite contentPolicy "keep"/);

  // And nothing else was disturbed by it.
  assert.equal(byName(result, 'headlineMain').content, 'JUDGE TYPED THIS');
});

test('sourceOf wireframe or default never overwrites stored copy — only prompt does', async () => {
  for (const sourceOf of ['wireframe', 'default', 'code', undefined]) {
    const { allocateId } = allocator();
    const ir = newIr();
    ir.elements = ir.elements.map((el) =>
      el.elementName === 'headlineMain' ? { ...el, sourceOf } : el,
    );
    const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });
    assert.equal(
      byName(result, 'headlineMain').content,
      'JUDGE TYPED THIS',
      `sourceOf ${JSON.stringify(sourceOf)} must not clobber stored content`,
    );
  }
});

// ---------------------------------------------------------------------
// The two axes are independent.
// ---------------------------------------------------------------------

test('mode and contentPolicy are separate axes — preserve + overwrite is expressible outside regeneration', async () => {
  const { allocateId } = allocator();
  const ir = newIr({ idPolicy: { mode: 'preserve', contentPolicy: 'overwrite', preserve: {} } });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: false });

  assert.equal(result.mode, 'preserve');
  assert.equal(result.contentPolicy, 'overwrite');
  // ID preserved, content replaced — exactly the combination §6 warns is wrong
  // FOR REGENERATION, but which must remain expressible for other callers.
  assert.equal(byName(result, 'headlineMain').fieldId, '2000000003');
  assert.equal(byName(result, 'headlineMain').content, 'CHALLENGE YOUR LIMITS');
});

test('mode allocate mints a fresh ID for every element and ignores stored ones', async () => {
  const { allocateId } = allocator();
  const ir = newIr({ idPolicy: { mode: 'allocate', contentPolicy: 'overwrite', preserve: {} } });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: false });

  assert.deepEqual(result.preservedIds, {});
  assert.equal(result.newIds.length > 0, true);
  for (const el of result.elements) {
    assert.match(el.fieldId, /^[23][0-9]{9}$/, 'every ID stays in a sanctioned §1 range');
    assert.equal(el.isNew, true);
  }
});

test('the explicit idPolicy.preserve.elements map wins over what the store holds', async () => {
  const { allocateId } = allocator();
  const ir = newIr({
    idPolicy: { mode: 'preserve', contentPolicy: 'keep', preserve: { elements: { headlineMain: '2000000099' } } },
  });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });
  assert.equal(byName(result, 'headlineMain').fieldId, '2000000099', "the IR's stated intent is authoritative");
});

// ---------------------------------------------------------------------
// New and disappearing elements — §13.3 rules 3 and 4.
// ---------------------------------------------------------------------

test('§13.3 rule 3 — only genuinely new elements receive newly allocated IDs', async () => {
  const { allocateId, issued } = allocator();
  const ir = newIr();
  ir.elements.push({ elementName: 'secondaryCta', contentType: 'Button', default: 'LEARN MORE', sourceOf: 'prompt' });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });

  const fresh = byName(result, 'secondaryCta');
  assert.equal(fresh.isNew, true);
  assert.equal(fresh.content, 'LEARN MORE', 'a new element takes the IR default — it has nothing to keep');
  assert.equal(fresh.contentSource, 'ir-default');
  assert.deepEqual(result.newIds, [fresh.fieldId]);
  assert.equal(issued.length, 1, 'exactly one allocation for exactly one new element');

  // A brand-new element does not trigger the prompt-override warning: there
  // was no stored content to overwrite.
  assert.ok(!result.warnings.some((w) => /explicitly changed "secondaryCta"/.test(w)));
});

test('§13.3 rule 3 — a disappearing element is left in the store, not deleted', async () => {
  const { allocateId } = allocator();
  const ir = newIr();
  ir.elements = ir.elements.filter((el) => el.elementName !== 'brandBadge');

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });

  assert.deepEqual(result.orphanedIds, ['2000000002']);
  assert.ok(!result.elements.some((e) => e.elementName === 'brandBadge'));
  assert.ok(result.warnings.some((w) => /left in the store rather than deleted/.test(w)));
});

// ---------------------------------------------------------------------
// Card loop items — positional by index (§6).
// ---------------------------------------------------------------------

test('nested card field IDs are preserved positionally, and edited card copy survives', async () => {
  const { allocateId, issued } = allocator();
  const result = await applyIdPolicy({
    ir: newIr(),
    existingElements: storedElements(),
    allocateId,
    isRegeneration: true,
  });

  const loop = byName(result, 'statBadges').loop;
  assert.equal(loop.length, 3);
  assert.equal(loop[0].fieldId1, '3000000001');
  assert.equal(loop[0].fieldId2, '3000000002');
  assert.equal(loop[2].fieldId2, '3000000006');

  // The judge edited card 1; the IR default says 1000+. Keep must win.
  assert.equal(loop[0].field1, '9000+', 'edited card copy must survive regeneration');
  assert.equal(loop[0].field2, 'Judge<br />Edited');
  assert.equal(issued.length, 0, 'no nested ID needed allocating');
});

test('a fourth card slot allocates a new nested pair and preserves the first three', async () => {
  const { allocateId } = allocator();
  const ir = newIr({
    cards: {
      of: 'statBadges',
      count: 4,
      fieldsPerItem: 2,
      items: [
        { field1: '1000+', field2: 'Community<br />Members' },
        { field1: '40+', field2: 'Fitness<br />Programmes' },
        { field1: '150+', field2: 'Fitness<br />Channels' },
        { field1: '24/7', field2: 'Open<br />Always' },
      ],
    },
  });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });
  const loop = byName(result, 'statBadges').loop;

  assert.equal(loop.length, 4);
  assert.equal(loop[0].fieldId1, '3000000001', 'items 0-2 keep their nested IDs');
  assert.equal(loop[2].fieldId2, '3000000006');
  assert.match(loop[3].fieldId1, /^3[0-9]{9}$/, 'the new slot gets a cardField-range ID');
  assert.equal(loop[3].field1, '24/7', 'and takes its content from the IR');
  assert.equal(result.newIds.length, 2, 'exactly one new pair');
});

test('§13.3 rule 4 — shrinking leaves the orphaned card items in place, with a warning', async () => {
  const { allocateId } = allocator();
  const ir = newIr({
    cards: { of: 'statBadges', count: 2, fieldsPerItem: 2, items: [{ field1: 'a', field2: 'b' }, { field1: 'c', field2: 'd' }] },
  });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });

  assert.equal(byName(result, 'statBadges').loop.length, 2);
  assert.ok(result.warnings.some((w) => /card count shrank from 3 to 2/.test(w)));
});

test('the explicit preserve.cards map is honoured positionally', async () => {
  const { allocateId } = allocator();
  const ir = newIr({
    idPolicy: {
      mode: 'preserve',
      contentPolicy: 'keep',
      preserve: { elements: {}, cards: { statBadges: [['3000000091', '3000000092']] } },
    },
  });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });
  const loop = byName(result, 'statBadges').loop;

  assert.equal(loop[0].fieldId1, '3000000091', 'row 0 comes from the map');
  assert.equal(loop[0].fieldId2, '3000000092');
  assert.equal(loop[1].fieldId1, '3000000003', 'row 1 falls back to the store');
});

// ---------------------------------------------------------------------
// §1 — IDs come from the allocator, always.
// ---------------------------------------------------------------------

test('§1 — the module never mints an ID itself and refuses to run without an allocator', async () => {
  await assert.rejects(() => applyIdPolicy({ ir: newIr(), existingElements: [] }), /allocateId. is required/);
  await assert.rejects(() => applyIdPolicy({ allocateId: async () => '1' }), /an IR is required/);
});

test('every allocation asks for a sanctioned §1 range', async () => {
  const { allocateId, issued } = allocator();
  const ir = newIr({ idPolicy: { mode: 'allocate', contentPolicy: 'overwrite', preserve: {} } });
  await applyIdPolicy({ ir, existingElements: [], allocateId, isRegeneration: false });

  assert.ok(issued.length > 0);
  for (const { range } of issued) {
    assert.ok(['element', 'cardField'].includes(range), `unexpected range ${range}`);
  }
});

test('a first generation with no stored state takes every default from the IR', async () => {
  const { allocateId } = allocator();
  const result = await applyIdPolicy({
    ir: newIr({ idPolicy: { mode: 'allocate', contentPolicy: 'overwrite', preserve: {} } }),
    existingElements: [],
    allocateId,
    isRegeneration: false,
  });

  assert.equal(byName(result, 'headlineMain').content, 'CHALLENGE YOUR LIMITS');
  assert.deepEqual(result.orphanedIds, []);
  assert.deepEqual(result.preservedIds, {});
});

test('the closed sets are exported and match §6', () => {
  assert.deepEqual(ID_MODES, ['allocate', 'preserve']);
  assert.deepEqual(CONTENT_POLICIES, ['overwrite', 'keep']);
});

// ---------------------------------------------------------------------
// F-008 — a duplicate elementName must never become a duplicate fieldId.
// ---------------------------------------------------------------------

test('F-008: a duplicate elementName is refused, not issued the same fieldId twice', async () => {
  const { allocateId } = allocator();
  const ir = newIr();
  // Two elements sharing a name. Before the fix both resolved to 2000000003.
  ir.elements = [...ir.elements, { elementName: 'headlineMain', contentType: 'Text', default: 'A SECOND ONE', sourceOf: 'default' }];

  await assert.rejects(
    () => applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true }),
    /duplicate elementName "headlineMain"/,
    '§1 forbids two elements receiving one ID; failing loudly beats issuing it',
  );
});

test('F-008: the refusal fires under mode allocate too, not just preserve', async () => {
  const { allocateId } = allocator();
  const ir = newIr({ idPolicy: { mode: 'allocate', contentPolicy: 'overwrite', preserve: {} } });
  ir.elements = [...ir.elements, { elementName: 'ctaButton', contentType: 'Button', default: 'DUPE', sourceOf: 'default' }];

  await assert.rejects(
    () => applyIdPolicy({ ir, existingElements: [], allocateId, isRegeneration: false }),
    /duplicate elementName "ctaButton"/,
  );
});

test('F-008: no fieldId is ever issued twice across a full regeneration', async () => {
  const { allocateId } = allocator();
  const ir = newIr({
    cards: {
      of: 'statBadges',
      count: 4,
      fieldsPerItem: 2,
      items: [
        { field1: '1000+', field2: 'a' },
        { field1: '40+', field2: 'b' },
        { field1: '150+', field2: 'c' },
        { field1: '24/7', field2: 'd' },
      ],
    },
  });
  ir.elements.push({ elementName: 'secondaryCta', contentType: 'Button', default: 'MORE', sourceOf: 'prompt' });

  const result = await applyIdPolicy({ ir, existingElements: storedElements(), allocateId, isRegeneration: true });

  // Every id the module hands out, top-level and nested.
  const all = [];
  for (const el of result.elements) {
    all.push(el.fieldId);
    for (const item of el.loop || []) {
      for (const [k, v] of Object.entries(item)) if (/^fieldId\d+$/.test(k)) all.push(v);
    }
  }

  assert.equal(new Set(all).size, all.length, `duplicate id issued: ${all.join(',')}`);
  for (const id of all) assert.match(id, /^[23][0-9]{9}$/, 'and every one stays in a §1 range');
});
