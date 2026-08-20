// tests/emit-component.test.mjs
//
// Verification for T-025: the deterministic IR-to-component emitter.
// CONTRACT.md §6 and §7 — R1-R14.
//
// The emitter is a pure function: same IR → same JSX string. All tests run
// offline with no network, no model key, and no npm install of React.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emitComponent, DEFAULT_TOKENS, resolveTokens } from '../server/src/generate/emitComponent.js';

// ---------------------------------------------------------------------------
// Minimal valid IR (finalised — field IDs already attached)
// ---------------------------------------------------------------------------
const MINIMAL_IR = {
  irVersion: '1.0',
  sectionType: 'split-hero',
  platform: 'Website',
  pageName: 'Home',
  sectionName: 'PulseFitHero',
  source: { mode: 'prompt', inputs: ['prompt'] },
  layout: {
    direction: 'row',
    breakpoint: 'md',
    mobileBehaviour: 'stack',
    container: { maxWidth: '1920px', padding: 'px-0 md:px-12' },
    regions: [
      { role: 'media',   side: 'left',  width: '1/2', children: ['heroImage'] },
      { role: 'content', side: 'right', width: '1/2',
        children: ['brandBadge', 'headlineMain', 'headlineSub', 'description', 'statBadges', 'ctaButton'] },
    ],
  },
  theme: { accent: 'red-500', surface: 'white', text: 'gray-800', textMode: 'auto' },
  cards: {
    of: 'statBadges',
    count: 3,
    gridColumns: 3,
    layoutMode: 'grid',
    fieldsPerItem: 2,
    items: [
      { field1: '1000+', fieldId1: '3000000001', field2: 'Community<br />Members', fieldId2: '3000000002' },
      { field1: '40+',   fieldId1: '3000000003', field2: 'Fitness<br />Programmes', fieldId2: '3000000004' },
      { field1: '150+',  fieldId1: '3000000005', field2: 'Fitness<br />Channels',   fieldId2: '3000000006' },
    ],
  },
  elements: [
    { elementName: 'heroImage',    contentType: 'Image',     tag: 'img', order: 0, default: 'default/images/hero-placeholder.jpg', classes: 'w-full h-auto object-cover', css: null, alt: 'Hero image', confidence: null, fieldId: '2000000001' },
    { elementName: 'brandBadge',   contentType: 'Text',      tag: 'span', order: 0, default: 'PULSE FIT',              classes: 'text-sm font-semibold tracking-widest text-red-500', css: null, alt: null, confidence: null, fieldId: '2000000002' },
    { elementName: 'headlineMain', contentType: 'Text',      tag: 'h1',   order: 1, default: 'CHALLENGE YOUR LIMITS',  classes: 'text-4xl md:text-5xl font-extrabold tracking-tight leading-tight', css: null, alt: null, confidence: 0.94, fieldId: '2000000003' },
    { elementName: 'headlineSub',  contentType: 'Text',      tag: 'h2',   order: 2, default: "Be a part of the tribe that's limitless.", classes: 'text-xl md:text-2xl font-medium text-gray-600', css: null, alt: null, confidence: 0.88, fieldId: '2000000004' },
    { elementName: 'description',  contentType: 'Textfield', tag: 'p',    order: 3, default: 'Join trainer-led workout sessions.', classes: 'text-base text-gray-500 max-w-prose', css: null, alt: null, confidence: null, fieldId: '2000000005' },
    { elementName: 'statBadges',   contentType: 'Cards',     tag: 'div',  order: 4, default: null, classes: null, css: null, alt: null, confidence: null, fieldId: '2000000006' },
    { elementName: 'ctaButton',    contentType: 'Button',    tag: 'button', order: 5, default: 'FIND A WORKOUT', classes: null, css: null, alt: null, confidence: null, fieldId: '2000000007' },
  ],
  idPolicy: { mode: 'allocate', contentPolicy: 'overwrite', preserve: { elements: {}, cards: {} } },
  variations: '1',
  warnings: [],
};

// ---------------------------------------------------------------------------
// Helper: emit once and reuse
// ---------------------------------------------------------------------------
let _emitted = null;
function emitted() {
  if (!_emitted) _emitted = emitComponent(MINIMAL_IR);
  return _emitted;
}

// ---------------------------------------------------------------------------
// R1 — const ids map
// ---------------------------------------------------------------------------
test('R1: emitted source declares const ids with all field IDs', () => {
  const src = emitted();
  assert.match(src, /export const ids\s*=\s*\{/, 'R1: must declare exported ids object');
  // Every element's fieldId must appear as a value
  for (const el of MINIMAL_IR.elements) {
    if (el.fieldId) {
      assert.ok(src.includes(el.fieldId), `R1: ids must include fieldId ${el.fieldId} for ${el.elementName}`);
    }
  }
});

// ---------------------------------------------------------------------------
// R2 — pageName prop defaulting to "Home"
// ---------------------------------------------------------------------------
test('R2: pageName prop defaults to "Home"', () => {
  const src = emitted();
  assert.match(src, /pageName\s*=\s*['"]Home['"]/, 'R2: must default pageName to "Home"');
});

// ---------------------------------------------------------------------------
// R3 — fetchElementsByIds dispatched on mount with all IDs incl. nested card IDs
// ---------------------------------------------------------------------------
test('R3: dispatches fetchElementsByIds on mount with all field IDs including card IDs', () => {
  const src = emitted();
  assert.match(src, /dispatch\(fetchElementsByIds/, 'R3: must dispatch fetchElementsByIds');
  assert.match(src, /useEffect/, 'R3: must be inside a useEffect');
  // Nested card IDs must appear in getAllMountFieldIds output
  assert.ok(src.includes('3000000001'), 'R3: nested card fieldId1 must be in mount IDs');
  assert.ok(src.includes('3000000002'), 'R3: nested card fieldId2 must be in mount IDs');
});

// ---------------------------------------------------------------------------
// R4 — reads from state.cms.allSections[pageName]
// ---------------------------------------------------------------------------
test('R4: reads from state.cms.allSections[pageName]', () => {
  const src = emitted();
  assert.match(src, /state\.cms\.allSections\[pageName\]/, 'R4: must read from allSections[pageName]');
});

// ---------------------------------------------------------------------------
// R5 — every editable node carries id={ids.x} or id={item.fieldIdN}
// ---------------------------------------------------------------------------
test('R5: editable nodes carry id={ids.x}', () => {
  const src = emitted();
  assert.match(src, /id=\{ids\.\w+\}/, 'R5: must bind id={ids.x}');
  assert.match(src, /id=\{item\.fieldId\d+\}/, 'R5: must bind id={item.fieldIdN} for cards');
});

// ---------------------------------------------------------------------------
// R6 — text nodes via getHtml + dangerouslySetInnerHTML
// ---------------------------------------------------------------------------
test('R6: text nodes use dangerouslySetInnerHTML with getHtml', () => {
  const src = emitted();
  assert.match(src, /dangerouslySetInnerHTML=\{\{/, 'R6: must use dangerouslySetInnerHTML');
  assert.match(src, /getHtml\(/, 'R6: must call getHtml');
  assert.match(src, /import.*getHtml.*from/, 'R6: must import getHtml');
});

// ---------------------------------------------------------------------------
// R7 — images via getImage + onError
// ---------------------------------------------------------------------------
test('R7: images use getImage and onError={errorImage}', () => {
  const src = emitted();
  assert.match(src, /getImage\(/, 'R7: must call getImage');
  assert.match(src, /onError=\{errorImage\}/, 'R7: must set onError={errorImage}');
  assert.match(src, /import.*getImage.*errorImage.*from/, 'R7: must import getImage and errorImage');
});

// ---------------------------------------------------------------------------
// R8 — button with id, aria-label, onClick stub
// ---------------------------------------------------------------------------
test('R8: button carries id, aria-label, and onClick', () => {
  const src = emitted();
  assert.match(src, /id=\{ids\.ctaButton\}/, 'R8: button must have id={ids.ctaButton}');
  assert.match(src, /aria-label=/, 'R8: button must carry aria-label');
  assert.match(src, /onClick=\{/, 'R8: button must have onClick handler');
});

// ---------------------------------------------------------------------------
// R9 — length>0 guard; no fixed-count comparison
// ---------------------------------------------------------------------------
test('R9: getStatItems uses length>0 guard, never a fixed literal', () => {
  const src = emitted();
  // Must use Array.isArray + .length > 0
  assert.match(src, /Array\.isArray\(value\)\s*&&\s*value\.length\s*>\s*0/, 'R9: must guard with Array.isArray && .length > 0');
  // Must NOT compare length against a fixed number (=== 3 etc.)
  assert.doesNotMatch(src, /\.length\s*===?\s*\d/, 'R9: must not compare .length against a literal');
});

test('R9: 4-item IR produces a DEFAULT_STAT_CARDS with 4 items', () => {
  const ir4 = JSON.parse(JSON.stringify(MINIMAL_IR));
  ir4.cards.items.push({ field1: 'NEW', fieldId1: '3000000007', field2: 'Item', fieldId2: '3000000008' });
  const src4 = emitComponent(ir4);
  // The generated DEFAULT_STAT_CARDS must mention all 4 field IDs
  assert.ok(src4.includes('3000000007'), 'R9: 4th card fieldId1 must be in DEFAULT_STAT_CARDS');
  assert.ok(src4.includes('3000000008'), 'R9: 4th card fieldId2 must be in DEFAULT_STAT_CARDS');
});

// ---------------------------------------------------------------------------
// R10 — CSS overlay via getElementById
// ---------------------------------------------------------------------------
test('R10: applies allSectionsCss via document.getElementById', () => {
  const src = emitted();
  assert.match(src, /document\.getElementById\(fieldId\)/, 'R10: must use getElementById');
  assert.match(src, /node\.style\.cssText\s*=\s*cssText/, 'R10: must set cssText');
  assert.match(src, /\}, \[cssData\]\)/, 'R10: cssData effect must list cssData as dependency');
});

// ---------------------------------------------------------------------------
// R11 — Tailwind layout
// ---------------------------------------------------------------------------
test('R11: uses Tailwind for two-column/stacked layout with max-width', () => {
  const src = emitted();
  assert.match(src, /flex-col\s+md:flex-row/, 'R11: must stack on mobile, row on desktop');
  assert.match(src, /max-w-\[/, 'R11: must have max-width container');
});

// ---------------------------------------------------------------------------
// R12 — dynamicStyle and dynamicStyle2
// ---------------------------------------------------------------------------
test('R12: text/button nodes have dynamicStyle, images have dynamicStyle2', () => {
  const src = emitted();
  assert.match(src, /dynamicStyle /, 'R12: text and button nodes must include dynamicStyle class');
  assert.match(src, /dynamicStyle2 /, 'R12: image nodes must include dynamicStyle2 class');
});

// ---------------------------------------------------------------------------
// R13 — no real secrets or production URLs
// ---------------------------------------------------------------------------
test('R13: no real bucket URLs or secrets', () => {
  const src = emitted();
  assert.doesNotMatch(src, /s3\.amazonaws\.com/i, 'R13: no S3 host');
  assert.doesNotMatch(src, /storage\.googleapis\.com/i, 'R13: no GCS host');
  assert.doesNotMatch(src, /process\.env\.[A-Z_]*SECRET/, 'R13: no secret env vars');
});

// ---------------------------------------------------------------------------
// R14 — export default
// ---------------------------------------------------------------------------
test('R14: component uses export default', () => {
  const src = emitted();
  assert.match(src, /export default function /, 'R14: must use export default');
});

// ---------------------------------------------------------------------------
// §6.1 — designTokens: absent ≡ DEFAULT_TOKENS
// ---------------------------------------------------------------------------
test('§6.1: IR with no designTokens and IR with DEFAULT_TOKENS produce identical output', () => {
  const irNoTokens = JSON.parse(JSON.stringify(MINIMAL_IR));
  delete irNoTokens.designTokens;

  const irWithDefaults = JSON.parse(JSON.stringify(MINIMAL_IR));
  irWithDefaults.designTokens = JSON.parse(JSON.stringify(DEFAULT_TOKENS));

  assert.equal(emitComponent(irNoTokens), emitComponent(irWithDefaults),
    '§6.1: absent designTokens must produce byte-identical output to explicit DEFAULT_TOKENS');
});

test('§6.1: unknown token keys are silently ignored', () => {
  const irWithUnknown = JSON.parse(JSON.stringify(MINIMAL_IR));
  irWithUnknown.designTokens = { unknownGroup: { unknownKey: 'should-not-crash' } };
  assert.doesNotThrow(() => emitComponent(irWithUnknown), '§6.1: unknown token keys must not throw');
});

// ---------------------------------------------------------------------------
// Determinism: same IR always gives same output
// ---------------------------------------------------------------------------
test('Determinism: same IR emits identical output on repeated calls', () => {
  const ir = JSON.parse(JSON.stringify(MINIMAL_IR));
  const out1 = emitComponent(ir);
  const out2 = emitComponent(ir);
  assert.equal(out1, out2, 'Emitter must be deterministic: same IR → same output');
});
