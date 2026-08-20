// tests/hero-section-r8-r14.test.mjs
//
// Verification for T-014: R8-R10, R13-R14 in HeroSection, including the R9
// length>0 guard (CONTRACT.md §7).
//
// These tests run against the source text and the logic module — no React,
// no DOM, no test renderer needed. This is intentional: the contract's
// requirements are structural and the logic module is dependency-free.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const HERO_PATH = 'client/src/sections/generated/HeroSection.jsx';
const source = read(HERO_PATH);

// ---------------------------------------------------------------------------
// R8 — Button with id, aria-label, and onClick stub
// ---------------------------------------------------------------------------
test('R8: button carries id={ids.ctaButton}, aria-label, and onClick', () => {
  // id must be bound from ids map
  assert.match(source, /id=\{ids\.ctaButton\}/, 'R8: button must have id={ids.ctaButton}');
  // aria-label must be present
  assert.match(source, /aria-label=/, 'R8: button must carry aria-label');
  // onClick stub must be present (may be empty but must exist)
  assert.match(source, /onClick=\{/, 'R8: button must have an onClick handler');
});

// ---------------------------------------------------------------------------
// R9 — R9's length>0 guard — verified via the logic module (pure function)
// ---------------------------------------------------------------------------
test('R9: getStatItems renders 4 cards when CMS sends a 4-item array', async () => {
  const { getStatItems, DEFAULT_STAT_CARDS } = await import(
    '../client/src/sections/generated/HeroSection.logic.js'
  );

  // A mocked CMS array of 4 items — the "length trap" guard must pass ALL through
  const fourItems = [
    { field1: 'A', fieldType1: 'Text', fieldId1: '3000000001', field2: 'B', fieldType2: 'Text', fieldId2: '3000000002' },
    { field1: 'C', fieldType1: 'Text', fieldId1: '3000000003', field2: 'D', fieldType2: 'Text', fieldId2: '3000000004' },
    { field1: 'E', fieldType1: 'Text', fieldId1: '3000000005', field2: 'F', fieldType2: 'Text', fieldId2: '3000000006' },
    { field1: 'G', fieldType1: 'Text', fieldId1: '3000000007', field2: 'H', fieldType2: 'Text', fieldId2: '3000000008' },
  ];

  const data = { '2000000006': fourItems };
  const result = getStatItems(data);

  assert.equal(result.length, 4, 'R9: a 4-item CMS array must render 4 cards, not 3');
  assert.equal(result[3].field1, 'G', 'R9: the 4th card must be the 4th CMS item, not a default');
});

test('R9: getStatItems falls back to DEFAULT_STAT_CARDS when CMS value is missing', async () => {
  const { getStatItems, DEFAULT_STAT_CARDS } = await import(
    '../client/src/sections/generated/HeroSection.logic.js'
  );

  const resultMissing = getStatItems({});
  assert.deepEqual(resultMissing, DEFAULT_STAT_CARDS, 'R9: missing CMS value must use DEFAULT_STAT_CARDS');

  const resultNonArray = getStatItems({ '2000000006': 'not-an-array' });
  assert.deepEqual(resultNonArray, DEFAULT_STAT_CARDS, 'R9: non-array CMS value must use DEFAULT_STAT_CARDS');
});

test('R9: no fixed-count comparison (=== 3 or === N) in HeroSection source', () => {
  // Contract §7 R9: "never compare against a fixed count"
  const fixedCountPattern = /\bstatBadges\b.*\.length\s*===?\s*\d/;
  assert.doesNotMatch(source, fixedCountPattern,
    'R9: HeroSection must never compare statBadges.length against a literal number');
});

// ---------------------------------------------------------------------------
// R10 — CSS overlay applied via getElementById after cssData changes
// ---------------------------------------------------------------------------
test('R10: applies allSectionsCss via document.getElementById', () => {
  assert.match(source, /document\.getElementById\(fieldId\)/, 'R10: must use document.getElementById to apply CSS');
  assert.match(source, /node\.style\.cssText\s*=\s*cssText/, 'R10: must set node.style.cssText from cssData');
  // The second useEffect must depend on cssData
  assert.match(source, /\}, \[cssData\]\)/, 'R10: cssData effect must list cssData as its dependency');
});

// ---------------------------------------------------------------------------
// R13 — No real secrets, real bucket URLs, or real customer identifiers
// ---------------------------------------------------------------------------
test('R13: no real production bucket URLs or secrets in source', () => {
  // Common real-host patterns
  const forbiddenPatterns = [
    /s3\.amazonaws\.com/i,
    /storage\.googleapis\.com/i,
    /blob\.core\.windows\.net/i,
    /cloudfront\.net/i,
    /process\.env\.[A-Z_]*SECRET/,
    /process\.env\.[A-Z_]*KEY/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern,
      `R13: source must not contain real production host/secret matching ${pattern}`);
  }
});

// ---------------------------------------------------------------------------
// R14 — export default
// ---------------------------------------------------------------------------
test('R14: component uses export default', () => {
  assert.match(source, /export default function HeroSection/, 'R14: must export default the section component');
});
