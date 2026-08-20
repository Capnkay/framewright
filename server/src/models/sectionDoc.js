// server/src/models/sectionDoc.js
//
// The Section document model, CONTRACT.md §2. One per generated section
// instance.
//
// The source appendix's sample section document carries extra fields we do
// not require: _id, pageId, layoutPlacementId, isBuild, cardClassName,
// cardCssText, cardListBodyGapPx, sectionClassName, tableClassName,
// tableCssText, createdAt, updatedAt. §2 is explicit: these are permitted
// and ignored. parseSectionDoc must load a raw object carrying every one of
// them without error, and toSectionDoc must never emit them back out.

export const SECTION_STATUSES = ['Pending', 'Approved', 'Rejected'];
export const CARD_LAYOUT_MODES = ['grid', 'list'];
export const SECTION_TEXT_MODES = ['auto', 'light', 'dark'];

// Every field §2 requires, in the order the contract lists them.
const REQUIRED_FIELDS = [
  'sectionName',
  'sectionId',
  'variations',
  'path',
  'sectionStatus',
  'wireframes',
  'platform',
  'pageName',
  'isGenerated',
  'cardGridColumns',
  'cardLayoutMode',
  'sectionTextMode',
  'sectionColor',
  'sectionPaddingTop',
  'sectionPaddingBottom',
  'sectionPaddingLeft',
  'sectionPaddingRight',
];

/**
 * parseSectionDoc(raw) — validates a raw object against §2 and returns a
 * plain object holding exactly the required fields, values unchanged.
 * Appendix-only fields on `raw` are tolerated and dropped, never rejected.
 * Throws a descriptive Error on a missing field or a value outside its
 * closed set.
 */
export function parseSectionDoc(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('parseSectionDoc: expected an object');
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in raw)) {
      throw new Error(`parseSectionDoc: missing required field "${field}"`);
    }
  }

  if (typeof raw.variations !== 'string') {
    throw new Error('parseSectionDoc: "variations" must be a string (§2 — no numeric form exists)');
  }
  if (!SECTION_STATUSES.includes(raw.sectionStatus)) {
    throw new Error(`parseSectionDoc: "sectionStatus" must be one of ${SECTION_STATUSES.join(' | ')}`);
  }
  if (!CARD_LAYOUT_MODES.includes(raw.cardLayoutMode)) {
    throw new Error(`parseSectionDoc: "cardLayoutMode" must be one of ${CARD_LAYOUT_MODES.join(' | ')}`);
  }
  if (!SECTION_TEXT_MODES.includes(raw.sectionTextMode)) {
    throw new Error(`parseSectionDoc: "sectionTextMode" must be one of ${SECTION_TEXT_MODES.join(' | ')}`);
  }
  if (typeof raw.isGenerated !== 'boolean') {
    throw new Error('parseSectionDoc: "isGenerated" must be a boolean');
  }

  const doc = {};
  for (const field of REQUIRED_FIELDS) {
    doc[field] = raw[field];
  }
  return doc;
}

/**
 * toSectionDoc(doc) — the writer side. Same required-field validation as
 * parseSectionDoc, returning a plain object with exactly those fields.
 * Never emits an appendix-only field, even if one is present on `doc`.
 */
export function toSectionDoc(doc) {
  return parseSectionDoc(doc);
}
