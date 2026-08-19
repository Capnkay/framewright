// client/src/sections/generated/HeroSection.logic.js
//
// The pure, dependency-free data-selection logic behind HeroSection.jsx,
// pulled into its own module so it is unit-testable with a bare
// `node --test` run, without React, react-redux, or PrimeReact installed.
// HeroSection.jsx imports everything below and adds JSX/React/PrimeReact on
// top of it; tests import only this file.

// R1 — const ids = { semanticName: "fieldId", ... }. Matches the reference
// element set (CONTRACT.md §3) and seed/elements.json exactly.
export const ids = {
  heroImage: '2000000001',
  brandBadge: '2000000002',
  headlineMain: '2000000003',
  headlineSub: '2000000004',
  description: '2000000005',
  statBadges: '2000000006',
  ctaButton: '2000000007',
};

// The reference hero's default loop of three, matching CONTRACT.md §4 and §6
// exactly, including the nested field ID range (3000000001-3000000006).
export const DEFAULT_STAT_CARDS = [
  {
    field1: '1000+',
    fieldType1: 'Text',
    fieldId1: '3000000001',
    field2: 'Community<br />Members',
    fieldType2: 'Text',
    fieldId2: '3000000002',
  },
  {
    field1: '40+',
    fieldType1: 'Text',
    fieldId1: '3000000003',
    field2: 'Fitness<br />Programmes',
    fieldType2: 'Text',
    fieldId2: '3000000004',
  },
  {
    field1: '150+',
    fieldType1: 'Text',
    fieldId1: '3000000005',
    field2: 'Fitness<br />Channels',
    fieldType2: 'Text',
    fieldId2: '3000000006',
  },
];

// Hard-coded default fallbacks for every non-Cards element (R6).
export const DEFAULTS = {
  [ids.heroImage]: 'default/images/hero-placeholder.jpg',
  [ids.brandBadge]: 'PULSE FIT',
  [ids.headlineMain]: 'CHALLENGE YOUR LIMITS',
  [ids.headlineSub]: "Be a part of the tribe that's limitless.",
  [ids.description]:
    'Join trainer-led workout sessions designed to kickstart your fitness journey, at your convenience.',
  [ids.ctaButton]: 'FIND A WORKOUT',
};

/**
 * getTextValue(data, fieldId, fallback) — the `data?.[id] || "DEFAULT"`
 * pattern (§9), centralised so every call site is identical and greppable.
 */
export function getTextValue(data, fieldId, fallback) {
  return (data && data[fieldId]) || fallback;
}

/**
 * getStatItems(data) — R9, the length-trap guard, verbatim from CONTRACT.md
 * §7: fall back to DEFAULT_STAT_CARDS only when the CMS value is missing or
 * is not an array. NEVER compare `.length` against a fixed literal like 3 —
 * a regenerated four-stat array must render four cards, not three stale
 * defaults.
 */
export function getStatItems(data) {
  const value = data && data[ids.statBadges];
  return Array.isArray(value) && value.length > 0 ? value : DEFAULT_STAT_CARDS;
}

/**
 * getCardFieldValue(data, item, fieldIdKey, fieldValueKey) — a single card
 * field's live value, matching CONTRACT.md §5.0's stated render pattern
 * exactly: `data?.[item.fieldId1] || item.field1`.
 */
export function getCardFieldValue(data, item, fieldIdKey, fieldValueKey) {
  const fieldId = item && item[fieldIdKey];
  return (data && fieldId && data[fieldId]) || (item && item[fieldValueKey]);
}

/**
 * getAllMountFieldIds() — R3: every field ID in the tree, nested card IDs
 * included, for the mount-time fetchElementsByIds dispatch. Built from the
 * default card set, since that is what the component knows before the store
 * hydrates for the first time.
 */
export function getAllMountFieldIds() {
  const cardFieldIds = DEFAULT_STAT_CARDS.flatMap((item) => [item.fieldId1, item.fieldId2]);
  return [...Object.values(ids), ...cardFieldIds];
}
