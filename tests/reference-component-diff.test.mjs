// tests/reference-component-diff.test.mjs
//
// T-075 — CONTRACT.md §7.
//
// doneWhen: "The deterministic emitter's output for the reference IR matches the
// hand-written golden component on every R1-R14 property; a future contract drift
// breaks this test first."
//
// THIS IS A DRIFT ALARM, and its design follows from that. There are two artefacts
// that must agree — the hand-written golden component (`HeroSection.jsx`, which is
// what the brief graded) and whatever the emitter produces from the reference IR —
// and three ways they can come apart:
//
//   1. Someone edits the emitter. Caught by comparing a fresh emit against the
//      CHECKED-IN reference file, which is a snapshot committed alongside this test.
//   2. Someone edits the golden component. Caught by asserting R1-R14 against it.
//   3. Someone edits the contract, and then one of the two to match. Caught because
//      the R1-R14 assertions below are written from §7's table, not from either file.
//
// WHY PROPERTIES AND NOT A TEXT DIFF between golden and emitted. They are not
// supposed to be byte-identical and never will be — the golden is hand-written with
// hand-chosen whitespace and comments, the emitter produces generated source with a
// provenance header. A byte comparison between them would fail on the first commit
// and be deleted by the third. §7's R-rules are the properties that actually have to
// hold, so they are what is compared. The byte-exact comparison is used where it IS
// meaningful: emitter output against its own committed snapshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitComponent } from '../server/src/generate/emitComponent.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The golden component is TWO files. `HeroSection.logic.js` holds `ids`, `DEFAULTS`
// and the pure helpers, extracted deliberately so `tests/golden.test.mjs` can exercise
// them without react, react-redux or primereact installed. R1 lives in the logic file
// and R6 in the JSX, so asserting §7 against either half alone reports a violation that
// is really a file split.
const GOLDEN_PARTS = [
  'client/src/sections/generated/HeroSection.jsx',
  'client/src/sections/generated/HeroSection.logic.js',
];
const REFERENCE = path.join(
  ROOT, 'client/src/sections/generated/reference/HeroSection-reference.jsx',
);

/**
 * The §6 example IR, extended with §3's full reference element set and with field IDs
 * ATTACHED, matching `server/data/seed/elements.json` exactly.
 *
 * The IDs matter and are not decoration. `emitComponent`'s header says it "takes a
 * finalised IR (field IDs already attached by the allocator)" — R1's `const ids` map is
 * built from them, so an IR without them emits an empty map and a component bound to
 * nothing. Using the seeded IDs rather than invented ones means the reference component
 * is one the running store can actually hydrate, which is what makes it a reference
 * rather than a shape.
 *
 * Exported so `tools/` can regenerate the checked-in reference from exactly this
 * object. If the generator built its own copy, the two would drift and the snapshot
 * test would be comparing the emitter against a stale IR rather than against itself.
 */
export function makeReferenceIr() {
  return {
    irVersion: '1.0',
    sectionType: 'split-hero',
    platform: 'Website',
    pageName: 'Home',
    sectionName: 'Custom',

    source: {
      mode: 'combined',
      inputs: ['wireframe', 'prompt'],
      wireframeRef: 'uploads/job-0000000001.png',
    },

    layout: {
      direction: 'row',
      breakpoint: 'md',
      mobileBehaviour: 'stack',
      container: { maxWidth: '1920px', padding: 'px-0 md:px-12' },
      regions: [
        { role: 'media', side: 'left', width: '1/2', children: ['heroImage'] },
        {
          role: 'content', side: 'right', width: '1/2',
          children: ['brandBadge', 'headlineMain', 'headlineSub', 'description', 'statBadges', 'ctaButton'],
        },
      ],
      accents: [
        { edge: 'left', width: 'w-8', colour: 'red-500', fromBreakpoint: 'md' },
        { edge: 'right', width: 'w-8', colour: 'red-500', fromBreakpoint: 'md' },
      ],
    },

    theme: { accent: 'red-500', surface: 'white', text: 'gray-800', textMode: 'auto' },

    cards: {
      of: 'statBadges', count: 3, gridColumns: 3, layoutMode: 'grid', fieldsPerItem: 2,
      items: [
        { field1: '1000+', field2: 'Community<br />Members' },
        { field1: '40+', field2: 'Fitness<br />Programmes' },
        { field1: '150+', field2: 'Fitness<br />Channels' },
      ],
    },

    elements: [
      el('heroImage', 'Image', 'img', 0, 'default/images/hero-placeholder.jpg',
        'w-full h-auto object-cover',
        { alt: 'Athlete performing a dumbbell exercise', fieldId: '2000000001' }),
      el('brandBadge', 'Text', 'span', 1, 'PULSE FIT',
        'text-sm font-semibold tracking-widest text-red-500', { fieldId: '2000000002' }),
      el('headlineMain', 'Text', 'h1', 2, 'CHALLENGE YOUR LIMITS',
        'text-4xl md:text-5xl font-extrabold tracking-tight leading-tight', { fieldId: '2000000003' }),
      el('headlineSub', 'Text', 'h2', 3, "Be a part of the tribe that's limitless.",
        'text-xl md:text-2xl font-medium text-gray-600', { fieldId: '2000000004' }),
      el('description', 'Textfield', 'p', 4,
        'Join trainer-led workout sessions designed to kickstart your fitness journey, at your convenience.',
        'text-base text-gray-500 max-w-prose', { fieldId: '2000000005' }),
      el('statBadges', 'Cards', 'div', 5, '', 'grid grid-cols-3 gap-4 py-2', {
        fieldId: '2000000006',
        loop: [
          { field1: '1000+', fieldId1: '3000000001', field2: 'Community<br />Members', fieldId2: '3000000002' },
          { field1: '40+', fieldId1: '3000000003', field2: 'Fitness<br />Programmes', fieldId2: '3000000004' },
          { field1: '150+', fieldId1: '3000000005', field2: 'Fitness<br />Channels', fieldId2: '3000000006' },
        ],
      }),
      el('ctaButton', 'Button', 'Button', 6, 'FIND A WORKOUT',
        'bg-red-500 text-white font-bold px-8 py-3', { fieldId: '2000000007' }),
    ],

    idPolicy: {
      mode: 'allocate',
      contentPolicy: 'overwrite',
      preserve: { elements: {}, cards: {} },
    },

    variations: '1',
    warnings: [],
  };
}

function el(elementName, contentType, tag, order, def, classes, extra = {}) {
  const element = {
    elementName, contentType, tag, order,
    default: def, classes, css: null, alt: extra.alt ?? null,
    confidence: null, sourceOf: 'default', bbox: null,
  };
  if (extra.fieldId) element.fieldId = extra.fieldId;
  if (extra.loop) element.loop = extra.loop;
  return element;
}

const emitted = emitComponent(makeReferenceIr());
const golden = GOLDEN_PARTS.map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');

// ---------------------------------------------------------------------
// The snapshot — an emitter change breaks this first
// ---------------------------------------------------------------------

test('doneWhen — the checked-in reference matches a fresh emit byte for byte', () => {
  assert.ok(
    fs.existsSync(REFERENCE),
    `${path.relative(ROOT, REFERENCE)} is missing. Regenerate it with:\n`
    + '  node tools/emit-reference.mjs',
  );

  const committed = fs.readFileSync(REFERENCE, 'utf8');
  assert.equal(
    committed.replace(/\r\n/g, '\n'),
    emitted.replace(/\r\n/g, '\n'),
    'The emitter no longer produces the committed reference component. If the change\n'
    + 'was intended, regenerate with `node tools/emit-reference.mjs` and commit the\n'
    + 'diff — that diff is the point, because it is what a reviewer reads.',
  );
});

// ---------------------------------------------------------------------
// R1-R14, asserted against BOTH artefacts
// ---------------------------------------------------------------------
//
// Each rule is checked on the golden and on the emitter's output. A rule that only
// held for one of them would mean the emitter and the graded component had diverged,
// which is precisely what this task exists to detect.

const BOTH = [['golden', golden], ['emitted', emitted]];

function forBoth(name, assertion) {
  test(name, () => {
    for (const [which, source] of BOTH) assertion(source, which);
  });
}

forBoth('R1 — declares a const ids map of semantic name to field ID', (src, which) => {
  assert.match(src, /const\s+ids\s*=\s*\{/, `${which} has no ids map`);
  for (const name of ['heroImage', 'headlineMain', 'ctaButton']) {
    assert.ok(src.includes(name), `${which}: ids is missing ${name}`);
  }
});

forBoth('R2 — accepts pageName as a prop defaulting to "Home"', (src, which) => {
  assert.match(src, /pageName\s*=\s*['"]Home['"]/, `${which} does not default pageName`);
});

forBoth('R3 — dispatches fetchElementsByIds on mount', (src, which) => {
  assert.ok(src.includes('fetchElementsByIds'), `${which} never fetches`);
  assert.match(src, /useEffect/, `${which} does not fetch on mount`);
});

forBoth('R3 — the mount fetch includes NESTED card IDs, not just top-level', (src, which) => {
  // §9 names this exactly: "nested card IDs missing from the mount-time fetch" is one
  // of the causes of a dead store that still renders perfectly.
  assert.match(
    src, /fieldId\d|getAllMountFieldIds|DEFAULT_STAT/,
    `${which} shows no sign of collecting nested card field IDs`,
  );
});

forBoth('R4 — reads live values from state.cms.allSections[pageName]', (src, which) => {
  assert.match(src, /allSections/, `${which} does not read allSections`);
});

forBoth('R5 — editable nodes carry id={ids.x} or id={item.fieldIdN}', (src, which) => {
  assert.match(src, /id=\{ids\./, `${which} has no id={ids.…} binding`);
});

forBoth('R6 — text nodes use dangerouslySetInnerHTML through the §8 sanitiser', (src, which) => {
  assert.ok(src.includes('dangerouslySetInnerHTML'), `${which} does not use it`);
  assert.ok(src.includes('getHtml'), `${which} bypasses the §8 sanitiser helper`);
});

forBoth('R6 — every getHtml call carries a hard-coded default fallback', (src, which) => {
  const calls = src.match(/getHtml\([^)]*\)/g) || [];
  assert.ok(calls.length > 0, `${which} has no getHtml calls`);
  for (const call of calls) {
    assert.ok(call.includes(','), `${which}: getHtml call without a fallback: ${call}`);
  }
});

forBoth('R7 — images go through getImage and set onError', (src, which) => {
  assert.ok(src.includes('getImage'), `${which} does not use getImage`);
  assert.match(src, /onError/, `${which} sets no image onError`);
});

forBoth('R8 — buttons use PrimeReact Button with an aria-label', (src, which) => {
  assert.match(src, /<Button/, `${which} has no PrimeReact Button`);
  assert.match(src, /aria-label/, `${which} button has no aria-label`);
});

forBoth('R9 — repeating items render from the loop array', (src, which) => {
  assert.match(src, /\.map\(/, `${which} does not map over a loop`);
});

forBoth('R9 — the length trap: no comparison against a fixed count', (src, which) => {
  // §7's own note. `length === 3` is the documented way to break card growth, and
  // regeneration is allowed to change the count (§13.3).
  assert.doesNotMatch(
    src, /\.length\s*[=!]==?\s*\d/,
    `${which} compares a CMS array length against a literal — §7's R9 length trap`,
  );
});

forBoth('R10 — applies allSectionsCss onto matching DOM ids', (src, which) => {
  assert.match(src, /allSectionsCss|cssData/, `${which} never applies the css overlay`);
  assert.match(src, /getElementById|cssText/, `${which} does not apply css to DOM nodes`);
});

forBoth('R11 — Tailwind two-column desktop, stacked mobile, max-width container', (src, which) => {
  assert.match(src, /md:/, `${which} has no responsive breakpoint classes`);
  assert.match(src, /max-w|maxWidth/, `${which} has no max-width container`);
});

forBoth('R12 — dynamicStyle on text and buttons, dynamicStyle2 on images', (src, which) => {
  assert.ok(src.includes('dynamicStyle'), `${which} is missing the dynamicStyle marker`);
  assert.ok(src.includes('dynamicStyle2'), `${which} is missing the dynamicStyle2 marker`);
});

forBoth('R13 — no real secrets, buckets, or customer identifiers', (src, which) => {
  // §14's shapes, applied to the component source.
  assert.doesNotMatch(src, /https?:\/\/(?!localhost|127\.0\.0\.1|example\.com)[a-z0-9.-]+\.[a-z]{2,}/i,
    `${which} contains a real-looking host`);
  assert.doesNotMatch(src, /[Cc]:\\Users\\|\/home\/|\/Users\//, `${which} contains an absolute local path`);
  assert.doesNotMatch(src, /sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}/, `${which} contains a key-shaped literal`);
});

forBoth('R14 — export default the section component', (src, which) => {
  assert.match(src, /export\s+default\s+function|export\s+default\s+\w+/, `${which} has no default export`);
});

// ---------------------------------------------------------------------
// Cross-checks between the two artefacts
// ---------------------------------------------------------------------

test('both artefacts agree on the §1 field-ID ranges they use', () => {
  const ids = (src) => new Set((src.match(/\b[123]\d{9}\b/g) || []));
  const g = ids(golden);
  const e = ids(emitted);

  assert.ok(g.size > 0, 'the golden component declares no field IDs');
  for (const id of [...g, ...e]) {
    assert.match(id, /^[123]\d{9}$/, `${id} is outside §1's sanctioned ranges`);
  }
});

test('the emitted component names every element in the reference IR', () => {
  for (const element of makeReferenceIr().elements) {
    assert.ok(
      emitted.includes(element.elementName),
      `the emitter dropped ${element.elementName}`,
    );
  }
});

test('the emitter is deterministic — the same IR gives the same source', () => {
  assert.equal(emitComponent(makeReferenceIr()), emitComponent(makeReferenceIr()));
});

test('the emitted component carries a provenance header naming its source IR', () => {
  // Not an R-rule; it is what makes a checked-in generated file reviewable rather
  // than mysterious, and it is why the byte-exact snapshot above is worth reading.
  assert.match(emitted, /SOURCE IR/, 'emitted source has no provenance header');
});
