import { test } from 'node:test';
import assert from 'node:assert';
import { parseSectionDoc, toSectionDoc } from '../server/src/models/sectionDoc.js';
import { parseElementDoc, toElementDoc } from '../server/src/models/elementDoc.js';
import sectionsData from '../server/data/seed/sections.json' with { type: 'json' };
import elementsData from '../server/data/seed/elements.json' with { type: 'json' };
const sectionSeed = sectionsData[0];
const elementsSeed = elementsData;

// The source appendix's sample documents carry these extra fields. §2/§3
// call them permitted and ignored: our reader must not choke on them, and
// our writer must never emit them back out.
const SECTION_APPENDIX_EXTRAS = {
  _id: { $oid: '5f8d0d55b54764421b7156c9' },
  pageId: '4000000001',
  layoutPlacementId: '5000000001',
  isBuild: false,
  cardClassName: 'grid-cols-3',
  cardCssText: 'gap: 1rem;',
  cardListBodyGapPx: 16,
  sectionClassName: 'w-full',
  tableClassName: '',
  tableCssText: '',
  createdAt: '2026-08-19T00:00:00.000Z',
  updatedAt: '2026-08-19T00:00:00.000Z',
};

const ELEMENT_APPENDIX_EXTRAS = {
  _id: { $oid: '5f8d0d55b54764421b7156ca' },
  section: '1000000001',
  pageId: '4000000001',
  isCustom: false,
};

test('parseSectionDoc loads a document carrying every appendix-only field without error', () => {
  const raw = { ...sectionSeed, ...SECTION_APPENDIX_EXTRAS };
  const doc = parseSectionDoc(raw);

  for (const [key, value] of Object.entries(sectionSeed)) {
    assert.deepEqual(doc[key], value, `required field "${key}" must round-trip unchanged`);
  }
  for (const key of Object.keys(SECTION_APPENDIX_EXTRAS)) {
    assert.ok(!(key in doc), `appendix-only field "${key}" must not be emitted`);
  }
});

test('toSectionDoc never emits an appendix-only field even when present on the input', () => {
  const raw = { ...sectionSeed, ...SECTION_APPENDIX_EXTRAS };
  const doc = toSectionDoc(raw);
  assert.deepEqual(Object.keys(doc).sort(), Object.keys(sectionSeed).sort());
});

test('parseSectionDoc rejects a missing required field', () => {
  const { sectionName, ...withoutName } = sectionSeed;
  assert.throws(() => parseSectionDoc(withoutName), /missing required field "sectionName"/);
});

test('parseSectionDoc rejects an out-of-set enum value', () => {
  assert.throws(
    () => parseSectionDoc({ ...sectionSeed, sectionStatus: 'Bogus' }),
    /sectionStatus/,
  );
});

test('parseSectionDoc rejects a non-string "variations" — §2, no numeric form exists', () => {
  assert.throws(() => parseSectionDoc({ ...sectionSeed, variations: 2 }), /variations/);
});

test('parseElementDoc loads every reference element, including Cards, carrying appendix-only fields', () => {
  for (const el of elementsSeed) {
    const raw = { ...el, ...ELEMENT_APPENDIX_EXTRAS };
    const doc = parseElementDoc(raw);

    for (const [key, value] of Object.entries(el)) {
      assert.deepEqual(doc[key], value, `required field "${key}" must round-trip unchanged for ${el.elementName}`);
    }
    for (const key of Object.keys(ELEMENT_APPENDIX_EXTRAS)) {
      assert.ok(!(key in doc), `appendix-only field "${key}" must not be emitted`);
    }
  }
});

test('toElementDoc never emits an appendix-only field even when present on the input', () => {
  const cardsElement = elementsSeed.find((el) => el.contentType === 'Cards');
  const raw = { ...cardsElement, ...ELEMENT_APPENDIX_EXTRAS };
  const doc = toElementDoc(raw);
  assert.deepEqual(Object.keys(doc).sort(), Object.keys(cardsElement).sort());
});

test('parseElementDoc requires a non-null loop array when contentType is Cards', () => {
  const cardsElement = elementsSeed.find((el) => el.contentType === 'Cards');
  assert.throws(() => parseElementDoc({ ...cardsElement, loop: null }), /"loop" must be a non-null array/);
});

test('parseElementDoc requires loop to be null when contentType is not Cards', () => {
  const textElement = elementsSeed.find((el) => el.contentType === 'Text');
  assert.throws(
    () => parseElementDoc({ ...textElement, loop: [{}] }),
    /"loop" must be null when contentType is "Text"/,
  );
});

test('parseElementDoc validates every Cards loop item carries both nested field IDs (§4)', () => {
  const cardsElement = elementsSeed.find((el) => el.contentType === 'Cards');
  const { fieldId2, ...itemMissingFieldId2 } = cardsElement.loop[0];
  const raw = { ...cardsElement, loop: [itemMissingFieldId2, ...cardsElement.loop.slice(1)] };
  assert.throws(() => parseElementDoc(raw), /loop\[0\] missing required field "fieldId2"/);
});

test('parseElementDoc rejects an out-of-set contentType', () => {
  const textElement = elementsSeed.find((el) => el.contentType === 'Text');
  assert.throws(() => parseElementDoc({ ...textElement, contentType: 'Video' }), /contentType/);
});
