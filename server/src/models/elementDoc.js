// server/src/models/elementDoc.js
//
// The Element document model, CONTRACT.md §3, plus the Cards loop item
// shape from §4.
//
// The source appendix's sample element document carries extra fields we do
// not require: _id, section, pageId, isCustom. §2 (and by the same rule,
// §3) is explicit: these are permitted and ignored. parseElementDoc must
// load a raw object carrying every one of them without error, and
// toElementDoc must never emit them back out.

export const CONTENT_TYPES = ['Image', 'Text', 'Textfield', 'Button', 'Cards'];
export const PROJECT_NAME = 'sample-brand';

// Every field §3 requires, in the order the contract lists them.
const REQUIRED_FIELDS = [
  'sectionId',
  'elementName',
  'fieldId',
  'content',
  'contentType',
  'css',
  'loop',
  'projectName',
  'pageName',
];

// Every field §4 requires on a single Cards loop item.
const REQUIRED_LOOP_ITEM_FIELDS = ['field1', 'fieldType1', 'fieldId1', 'field2', 'fieldType2', 'fieldId2'];

function validateLoopItem(item, index) {
  if (!item || typeof item !== 'object') {
    throw new Error(`parseElementDoc: loop[${index}] must be an object`);
  }
  for (const field of REQUIRED_LOOP_ITEM_FIELDS) {
    if (!(field in item)) {
      throw new Error(`parseElementDoc: loop[${index}] missing required field "${field}"`);
    }
  }
}

/**
 * parseElementDoc(raw) — validates a raw object against §3 and §4 and
 * returns a plain object holding exactly the required fields, values
 * unchanged. Appendix-only fields on `raw` are tolerated and dropped, never
 * rejected. Throws a descriptive Error on a missing field, a value outside
 * its closed set, or a `loop`/`contentType` mismatch.
 */
export function parseElementDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('parseElementDoc: expected an object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in raw)) {
      throw new Error(`parseElementDoc: missing required field "${field}"`);
    }
  }

  if (!CONTENT_TYPES.includes(raw.contentType)) {
    throw new Error(`parseElementDoc: "contentType" must be one of ${CONTENT_TYPES.join(' | ')}`);
  }

  if (raw.css !== null && typeof raw.css !== 'string') {
    throw new Error('parseElementDoc: "css" must be null or a string');
  }

  // §3 — loop is required and non-null when contentType is Cards, and null
  // otherwise. Neither half of this rule is optional.
  if (raw.contentType === 'Cards') {
    if (!Array.isArray(raw.loop)) {
      throw new Error('parseElementDoc: "loop" must be a non-null array when contentType is "Cards"');
    }
    raw.loop.forEach(validateLoopItem);
  } else if (raw.loop !== null) {
    throw new Error(`parseElementDoc: "loop" must be null when contentType is "${raw.contentType}"`);
  }

  const doc = {};
  for (const field of REQUIRED_FIELDS) {
    doc[field] = raw[field];
  }
  return doc;
}

/**
 * toElementDoc(doc) — the writer side. Same required-field validation as
 * parseElementDoc, returning a plain object with exactly those fields.
 * Never emits an appendix-only field, even if one is present on `doc`.
 */
export function toElementDoc(doc) {
  return parseElementDoc(doc);
}
