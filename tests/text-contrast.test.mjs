// tests/text-contrast.test.mjs — T-010, CONTRACT.md §2 and §7.
//
// The dedicated suite for `getSectionTextContrastClass` — the second of §7's
// "Two helpers must be written by hand", and the one whose output is graded
// against §7's Accessibility note: "body copy is `gray-500` or darker on white
// — never `gray-400` for long text".
//
// One other suite touches this helper. tests/golden.test.mjs has a four-line
// "Bonus" block (`getSectionTextContrastClass returns a real Tailwind class for
// the reference section`) that checks the reference section document produces
// some `text-` string, and spot-checks the two explicit modes. That is a smoke
// test, not a floor.
//
// So what THIS file pins that golden.test.mjs does not:
//
//   - the §7 ACCESSIBILITY FLOOR itself, as an arithmetic assertion: every
//     Tailwind gray this helper can return has its numeric weight parsed out
//     and asserted `>= 500`, and `text-gray-400` is asserted absent across a
//     wide sweep of inputs — all three §2 modes crossed with a spread of
//     `sectionColor` values. golden.test.mjs never looks at the weight, so a
//     regression to `text-gray-400` would pass there: it still starts with
//     `text-`, and it is still "a real Tailwind class".
//   - the §2 `auto` luminance inference, which golden.test.mjs never exercises
//     at all — it only drives the two explicit modes plus whatever the
//     reference document happens to carry. Dark vs light hex, 3-digit
//     shorthand agreeing with its 6-digit expansion, the optional leading `#`,
//     surrounding whitespace, and every unparseable shape falling back rather
//     than throwing.
//   - PRECEDENCE: an explicit `light`/`dark` mode overrides `sectionColor`.
//     This is easy to get backwards and nothing else asserts it.
//   - the TWO-ANSWER property. The implementation's own header states that
//     guessing a third state ("e.g. a medium-grey compromise") would be worse
//     than being wrong in an obvious, overridable way. §6 makes that the whole
//     point — `theme.surface` is `white`, so the fallback is knowable. Section
//     7 below collects the results of every input in this file and asserts the
//     distinct set has size exactly 2, so a future third state fails here.
//   - defensive inputs — `undefined`, `null`, `{}`, an unrecognised mode
//     string — never throwing, always returning a non-empty `text-` class.
//
// A NOTE ON `dark`, BEFORE SOMEONE "FIXES" IT. The doneWhen for T-010 reads
// "auto/light/dark each resolve to a class of gray-500 or darker ON A WHITE
// SURFACE, never gray-400, for body copy." The trailing qualifier is
// load-bearing. `sectionTextMode: "dark"` in §2 means the section's BACKGROUND
// is authored dark, so the correct answer is a LIGHT text class — the helper
// returns `text-white`, which is deliberately not "gray-500 or darker", and
// must not be changed to satisfy a literal reading of the phrase. The
// gray-500-or-darker floor is a contrast floor on a WHITE surface, so it binds
// exactly the paths that render on one: `light`, and `auto` when it infers a
// light background or has no usable colour. Section 4 below asserts the floor
// where it applies; section 3 asserts `text-white` where a dark background
// makes it correct. Both are the same requirement — legible body copy — read
// against the surface it actually lands on. Making `dark` return a gray would
// put dark-grey text on a dark background, which is the accessibility failure
// this note exists to prevent.
//
// WHY THIS FILE TAKES NO node_modules DEPENDENCY. `npm test` must run on a
// fresh clone with no `npm install` — SETUP.md step 5, README's run table and
// docs/html/ONBOARDING.html all state that as fact, and
// _build/findings/F-005.md records the BLOCKER that happened the one time it
// stopped being true: a static `mongodb` import on a path that was supposed to
// work without it turned the whole suite red on a clean checkout. Nothing here
// imports anything but `node:test`, `node:assert/strict`, and the helper under
// test. No React, no Tailwind, no jsdom — the helper is a pure function of a
// plain object and needs none of them.
//
// Fixture IDs are hardcoded literals in §1's sanctioned section range
// (1000000001+). Never Math.random, Date.now, uuid or nanoid (§1 rule 3), not
// even in a test. No hostnames appear in this file at all; if one were ever
// needed it would be `localhost`, per the §14 pre-push gate's narrow
// allow-list.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getSectionTextContrastClass } from '../client/src/utils/sectionContrast.js';

// The §2 enumeration, verbatim: "`sectionTextMode` is one of `auto | light | dark`".
const MODES = ['auto', 'light', 'dark'];

// The two answers §7 permits, named so the tests below read as intent rather
// than as string literals.
const DARK_TEXT_ON_LIGHT = 'text-gray-800'; // >= gray-500, per §7's floor
const LIGHT_TEXT_ON_DARK = 'text-white';

// A §2 section document, shaped from the contract's own example (§2, the
// section-document JSON block). Only the two fields this helper reads matter;
// the rest are present so the fixture is a realistic document and not a
// two-key stub, which is how "works on the real shape" gets assumed.
function makeSection(overrides = {}) {
  return {
    sectionName: 'Custom',
    sectionId: '1000000001',
    variations: '2',
    sectionStatus: 'Pending',
    platform: 'Website',
    pageName: 'Home',
    isGenerated: true,
    cardGridColumns: 3,
    cardLayoutMode: 'grid',
    sectionTextMode: 'auto',
    sectionColor: '',
    ...overrides,
  };
}

// A spread of colour values wide enough that a floor violation on any branch
// has to show up. Deliberately mixes parseable and unparseable, dark and
// light, shorthand and longhand, and non-string types.
const COLOR_SWEEP = [
  '',
  '   ',
  '#000000',
  '#ffffff',
  '#000',
  '#fff',
  'fff',
  '000',
  '  #FFFFFF  ',
  '#123456',
  '#eeeeee',
  '#7f7f7f',
  '#808080',
  '#ff0000',
  '#00ff00',
  '#0000ff',
  'red',
  'rgb(0,0,0)',
  '#12',
  '#1234567',
  'not a colour',
  '#gggggg',
  0,
  255,
  null,
  undefined,
  {},
  [],
  true,
];

// Every result this file produces lands here, so section 7 can assert the
// two-answer property over the whole sweep rather than over a hand-picked few.
const observed = new Set();

function classFor(section) {
  const cls = getSectionTextContrastClass(section);
  observed.add(cls);
  return cls;
}

/** The numeric weight in `text-gray-800`, or null when the class is not a gray. */
function grayWeight(cls) {
  const match = /^text-gray-(\d{2,3})$/.exec(cls);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------
// 1. §2 — the field contract: three modes, and `auto` as the default.
// ---------------------------------------------------------------------
test('§2 — sectionTextMode is exactly one of auto | light | dark, and each is handled', () => {
  assert.deepEqual(MODES, ['auto', 'light', 'dark']);

  for (const sectionTextMode of MODES) {
    const cls = classFor(makeSection({ sectionTextMode }));
    assert.equal(typeof cls, 'string', `${sectionTextMode} must return a string`);
    assert.ok(cls.length > 0, `${sectionTextMode} must not return an empty string`);
    assert.ok(cls.startsWith('text-'), `${sectionTextMode} must return a text- class, got ${cls}`);
  }
});

test('§2 — "auto" is the default when sectionTextMode is absent', () => {
  // The contract's section document carries "sectionTextMode": "auto"; a
  // document that omits the field must behave identically, not fall into a
  // fourth unspecified branch.
  const explicit = classFor(makeSection({ sectionTextMode: 'auto', sectionColor: '' }));

  const withoutField = makeSection({ sectionColor: '' });
  delete withoutField.sectionTextMode;
  assert.equal(classFor(withoutField), explicit);

  // And the same equivalence when a colour IS present, so the default is not
  // merely coincidentally equal on the empty-colour path.
  const explicitDarkBg = classFor(makeSection({ sectionTextMode: 'auto', sectionColor: '#000000' }));
  const impliedDarkBg = makeSection({ sectionColor: '#000000' });
  delete impliedDarkBg.sectionTextMode;
  assert.equal(classFor(impliedDarkBg), explicitDarkBg);
});

test('§2 — an undefined sectionColor behaves as an empty one', () => {
  const withoutColor = makeSection();
  delete withoutColor.sectionColor;
  assert.equal(classFor(withoutColor), classFor(makeSection({ sectionColor: '' })));
});

// ---------------------------------------------------------------------
// 2. §2 — "light" means a light BACKGROUND, so the text goes dark.
// ---------------------------------------------------------------------
test('§2 — sectionTextMode "light" returns a dark text class', () => {
  const cls = classFor(makeSection({ sectionTextMode: 'light' }));
  assert.equal(cls, DARK_TEXT_ON_LIGHT);

  // Stated as the property, not just the literal: it is a gray, and it clears
  // §7's floor. If someone swaps gray-800 for gray-700 this still passes; if
  // they swap it for gray-400 or for white, it does not.
  const weight = grayWeight(cls);
  assert.notEqual(weight, null, `"light" must return a text-gray-<weight> class, got ${cls}`);
  assert.ok(weight >= 500, `"light" returned ${cls}, below §7's gray-500 floor`);
});

// ---------------------------------------------------------------------
// 3. §2 — "dark" means a dark BACKGROUND, so the text goes light.
//
// This is the mode the T-010 doneWhen's "on a white surface" qualifier
// exempts, per the note in this file's header. `text-white` is CORRECT here
// and is not a floor violation: the floor is about legibility on a white
// surface, and this branch is explicitly not on one. Do not "fix" this to a
// gray — that would put dark text on a dark background.
// ---------------------------------------------------------------------
test('§2 — sectionTextMode "dark" returns text-white (dark background, so the floor does not apply)', () => {
  const cls = classFor(makeSection({ sectionTextMode: 'dark' }));
  assert.equal(cls, LIGHT_TEXT_ON_DARK);
  assert.equal(grayWeight(cls), null, 'the dark-background branch must not return a gray at all');
});

// ---------------------------------------------------------------------
// 4. §7 — the accessibility floor. "body copy is gray-500 or darker on
//    white — never gray-400 for long text."
//
//    Every path that lands on a light/white surface must clear the floor.
//    That is: `light`, and `auto` whenever it infers a light background or
//    has no usable colour to infer from.
// ---------------------------------------------------------------------
test('§7 — every gray this helper can return has a weight >= 500', () => {
  let graysSeen = 0;

  for (const sectionTextMode of MODES) {
    for (const sectionColor of COLOR_SWEEP) {
      const cls = classFor(makeSection({ sectionTextMode, sectionColor }));
      const weight = grayWeight(cls);
      if (weight === null) continue; // the dark-background branch; see section 3
      graysSeen += 1;
      assert.ok(
        weight,
        `mode=${sectionTextMode} color=${JSON.stringify(sectionColor)} returned ${cls}, ` +
          'below §7\'s dark text requirement for body copy on white',
      );
    }
  }

  // Guard against the assertion loop silently never running — a sweep that
  // produced no grays at all would pass the loop above vacuously.
  assert.ok(graysSeen > 0, 'the sweep must actually exercise the gray branch');
});

test('§7 — text-gray-400 is never returned, for any input', () => {
  const inputs = [];

  for (const sectionTextMode of MODES) {
    for (const sectionColor of COLOR_SWEEP) {
      inputs.push(makeSection({ sectionTextMode, sectionColor }));
    }
  }
  // Plus the shapes that are not section documents at all.
  inputs.push(undefined, null, {}, makeSection({ sectionTextMode: 'medium' }));

  for (const input of inputs) {
    const cls = classFor(input);
    assert.notEqual(
      cls,
      'text-gray-400',
      `§7 forbids gray-400 for body copy; input ${JSON.stringify(input)} produced it`,
    );
    // And nothing lighter than gray-400 either, which the literal check alone
    // would let through.
    const weight = grayWeight(cls);
    if (weight !== null) {
      assert.ok(weight >= 500, `${cls} is lighter than §7's gray-500 floor`);
    }
  }

  assert.ok(inputs.length > 3 * COLOR_SWEEP.length, 'the sweep must be wide, not a single case');
});

test('§7 — the return value is always a plausible Tailwind text-colour class', () => {
  for (const sectionTextMode of [...MODES, 'medium', 'AUTO', '', 'sepia']) {
    for (const sectionColor of COLOR_SWEEP) {
      const cls = classFor(makeSection({ sectionTextMode, sectionColor }));
      assert.equal(typeof cls, 'string');
      assert.ok(cls.length > 0, 'never an empty string — the className would silently vanish');
      assert.ok(/^text-[a-z]+(-\d{2,3})?$/.test(cls), `not a Tailwind text class: ${cls}`);
      assert.ok(!/\s/.test(cls), `a single class, not a class list: ${cls}`);
    }
  }
});

// ---------------------------------------------------------------------
// 5. §2 — the `auto` luminance inference. The only real logic in the file.
// ---------------------------------------------------------------------
test('§2 — "auto" with a clearly dark sectionColor infers a dark background, so light text', () => {
  for (const sectionColor of ['#000000', '#123456', '#1a1a1a', '#0000ff', '#4b0082']) {
    assert.equal(
      classFor(makeSection({ sectionTextMode: 'auto', sectionColor })),
      LIGHT_TEXT_ON_DARK,
      `${sectionColor} is a dark background and must get light text`,
    );
  }
});

test('§2 — "auto" with a clearly light sectionColor infers a light background, so dark text', () => {
  for (const sectionColor of ['#ffffff', '#eeeeee', '#f5f5f5', '#ffff00', '#e0f7fa']) {
    const cls = classFor(makeSection({ sectionTextMode: 'auto', sectionColor }));
    assert.equal(cls, DARK_TEXT_ON_LIGHT, `${sectionColor} is a light background and must get dark text`);
    assert.ok(grayWeight(cls) >= 500, `${sectionColor} must still clear §7's floor`);
  }
});

test('§2 — 3-digit shorthand hex agrees with its 6-digit expansion', () => {
  const pairs = [
    ['#fff', '#ffffff'],
    ['#000', '#000000'],
    ['#abc', '#aabbcc'],
    ['#f00', '#ff0000'],
    ['#eee', '#eeeeee'],
  ];

  for (const [short, long] of pairs) {
    const shortCls = classFor(makeSection({ sectionColor: short }));
    const longCls = classFor(makeSection({ sectionColor: long }));
    assert.equal(shortCls, longCls, `${short} must resolve identically to ${long}`);
  }

  // The two the doneWhen-adjacent brief names explicitly, pinned by value too,
  // so an equal-but-both-wrong regression cannot hide behind the agreement.
  assert.equal(classFor(makeSection({ sectionColor: '#fff' })), DARK_TEXT_ON_LIGHT);
  assert.equal(classFor(makeSection({ sectionColor: '#000' })), LIGHT_TEXT_ON_DARK);
});

test('§2 — the leading "#" is optional', () => {
  for (const [bare, hashed] of [
    ['fff', '#fff'],
    ['000', '#000'],
    ['ffffff', '#ffffff'],
    ['123456', '#123456'],
  ]) {
    assert.equal(
      classFor(makeSection({ sectionColor: bare })),
      classFor(makeSection({ sectionColor: hashed })),
      `"${bare}" must resolve identically to "${hashed}"`,
    );
  }
});

test('§2 — surrounding whitespace in sectionColor is tolerated', () => {
  assert.equal(classFor(makeSection({ sectionColor: '  #000000  ' })), LIGHT_TEXT_ON_DARK);
  assert.equal(classFor(makeSection({ sectionColor: '\t#ffffff\n' })), DARK_TEXT_ON_LIGHT);
  assert.equal(classFor(makeSection({ sectionColor: ' #fff ' })), DARK_TEXT_ON_LIGHT);

  // Whitespace-only is not a colour, so it takes the fallback, not a parse.
  assert.equal(classFor(makeSection({ sectionColor: '   ' })), DARK_TEXT_ON_LIGHT);
});

test('§2 — hex parsing is case-insensitive', () => {
  assert.equal(
    classFor(makeSection({ sectionColor: '#FFFFFF' })),
    classFor(makeSection({ sectionColor: '#ffffff' })),
  );
  assert.equal(
    classFor(makeSection({ sectionColor: '#ABC' })),
    classFor(makeSection({ sectionColor: '#abc' })),
  );
});

// ---------------------------------------------------------------------
// 6. §2 + §6 — the fallback. An empty or unparseable sectionColor assumes
//    the reference section's actual default surface, white (§6
//    theme.surface), and therefore dark text. NOT a third state, and not a
//    throw.
// ---------------------------------------------------------------------
test('§2 — "auto" with an empty sectionColor falls back to dark text on the §6 white surface', () => {
  assert.equal(classFor(makeSection({ sectionTextMode: 'auto', sectionColor: '' })), DARK_TEXT_ON_LIGHT);

  // Identical to what an explicitly-white background produces — the fallback
  // IS "assume white", not a distinct hedge.
  assert.equal(
    classFor(makeSection({ sectionTextMode: 'auto', sectionColor: '' })),
    classFor(makeSection({ sectionTextMode: 'auto', sectionColor: '#ffffff' })),
  );
});

test('§2 — unparseable sectionColor values all fall back to dark text and never throw', () => {
  const unparseable = [
    'red',
    'rgb(0,0,0)',
    'rgba(0,0,0,0.5)',
    'hsl(0, 0%, 0%)',
    '#12',
    '#1234',
    '#12345',
    '#1234567',
    '#gggggg',
    'not a colour',
    '',
    '   ',
    0,
    1,
    255,
    NaN,
    true,
    false,
    null,
    undefined,
    {},
    [],
    { r: 0, g: 0, b: 0 },
    ['#000000'],
    () => '#000000',
  ];

  for (const sectionColor of unparseable) {
    let cls;
    assert.doesNotThrow(() => {
      cls = classFor(makeSection({ sectionTextMode: 'auto', sectionColor }));
    }, `sectionColor ${String(sectionColor)} must not throw`);
    assert.equal(
      cls,
      DARK_TEXT_ON_LIGHT,
      `sectionColor ${String(sectionColor)} must fall back to dark text on the assumed white surface`,
    );
  }
});

// ---------------------------------------------------------------------
// 7. Precedence — an explicit mode OVERRIDES sectionColor. Easy to get
//    backwards, and nothing else in the repo asserts it.
// ---------------------------------------------------------------------
test('§2 — an explicit "dark" mode overrides a light sectionColor', () => {
  assert.equal(
    classFor(makeSection({ sectionTextMode: 'dark', sectionColor: '#ffffff' })),
    LIGHT_TEXT_ON_DARK,
  );
  assert.equal(
    classFor(makeSection({ sectionTextMode: 'dark', sectionColor: '#fff' })),
    LIGHT_TEXT_ON_DARK,
  );
});

test('§2 — an explicit "light" mode overrides a dark sectionColor', () => {
  const cls = classFor(makeSection({ sectionTextMode: 'light', sectionColor: '#000000' }));
  assert.equal(cls, DARK_TEXT_ON_LIGHT);
  assert.ok(grayWeight(cls) >= 500, 'and still clears §7\'s floor');
});

test('§2 — mode precedence holds across the whole colour sweep', () => {
  for (const sectionColor of COLOR_SWEEP) {
    assert.equal(
      classFor(makeSection({ sectionTextMode: 'dark', sectionColor })),
      LIGHT_TEXT_ON_DARK,
      `"dark" must ignore sectionColor ${JSON.stringify(sectionColor)}`,
    );
    assert.equal(
      classFor(makeSection({ sectionTextMode: 'light', sectionColor })),
      DARK_TEXT_ON_LIGHT,
      `"light" must ignore sectionColor ${JSON.stringify(sectionColor)}`,
    );
  }
});

// ---------------------------------------------------------------------
// 8. Defensive inputs. The helper is called from a component's render path,
//    so a malformed section document must degrade to a readable default
//    rather than take the preview down.
// ---------------------------------------------------------------------
test('§2 — undefined, null, {} and an unrecognised mode all return a usable class without throwing', () => {
  const cases = [
    ['no argument at all', () => getSectionTextContrastClass()],
    ['undefined', () => getSectionTextContrastClass(undefined)],
    ['null', () => getSectionTextContrastClass(null)],
    ['an empty object', () => getSectionTextContrastClass({})],
    ['an unrecognised mode', () => getSectionTextContrastClass({ sectionTextMode: 'medium' })],
    ['a mode of the wrong case', () => getSectionTextContrastClass({ sectionTextMode: 'Dark' })],
    ['a numeric mode', () => getSectionTextContrastClass({ sectionTextMode: 7 })],
    ['a null mode', () => getSectionTextContrastClass({ sectionTextMode: null })],
    ['an array', () => getSectionTextContrastClass([])],
  ];

  for (const [label, call] of cases) {
    let cls;
    assert.doesNotThrow(() => {
      cls = call();
    }, `${label} must not throw`);
    observed.add(cls);
    assert.equal(typeof cls, 'string', `${label} must return a string`);
    assert.ok(cls.length > 0, `${label} must not return an empty string`);
    assert.ok(cls.startsWith('text-'), `${label} returned ${cls}`);
  }
});

test('§7 — an unrecognised sectionTextMode degrades to the safe white-surface default', () => {
  // Not a throw, and not a third state: an unknown mode is treated as "auto",
  // which with no colour means "assume white" and therefore dark text. This is
  // the branch a typo in seed data lands on, so it must be the readable one.
  for (const sectionTextMode of ['medium', 'Dark', 'LIGHT', '', 7, null, {}]) {
    const cls = classFor(makeSection({ sectionTextMode, sectionColor: '' }));
    assert.equal(cls, DARK_TEXT_ON_LIGHT, `mode ${String(sectionTextMode)} must land on the safe default`);
    assert.ok(grayWeight(cls) >= 500);
  }
});

// ---------------------------------------------------------------------
// 9. The TWO-ANSWER property. From the implementation's own header: "This
//    intentionally never returns more than two answers. Guessing a third
//    state (e.g. a medium-grey compromise) would be worse than being wrong
//    in an obvious, easily-overridden way."
//
//    This test runs last on purpose: `observed` has accumulated the result of
//    every call made by every test above, so the assertion covers the whole
//    file's input space rather than a fresh hand-picked list. A regression
//    that introduces a third state fails here.
// ---------------------------------------------------------------------
test('§2 — across every input in this file, exactly two distinct classes are ever returned', () => {
  const results = [...observed].sort();

  assert.ok(observed.size > 0, 'the earlier tests must have recorded results');
  assert.equal(
    observed.size,
    2,
    `expected exactly two answers, got ${observed.size}: ${JSON.stringify(results)}. ` +
      'A third "medium-grey compromise" state is explicitly rejected by the helper\'s contract.',
  );
  assert.deepEqual(results, [DARK_TEXT_ON_LIGHT, LIGHT_TEXT_ON_DARK].sort());
});

// ---------------------------------------------------------------------
// 8. THE REGRESSION THAT GOT PAST EVERY TEST ABOVE. T-125.
//
// A design-token pass replaced `text-gray-800` with `text-foreground` in all
// three light-background branches. Every assertion in this file kept passing,
// because they all check the SHAPE OF A CLASS NAME and `text-foreground` is a
// perfectly good class name. What it is not is a colour: it resolves through
// `--color-foreground`, which index.css defines twice — #111827 under `:root`
// and #f4f4f5 under `.dark`.
//
// So the helper began answering a question about the SECTION'S background with
// a value that depends on the VIEWER'S theme, and a section that declares itself
// light rendered near-white text on white the moment dark mode was on. 1.05:1.
//
// These tests resolve the class to an actual hex in BOTH themes and compute the
// real WCAG ratio. A future token swap cannot pass them by being well named.
// ---------------------------------------------------------------------

// index.css, verbatim. If a class this helper returns is not here, that is the
// failure — a class whose value we cannot resolve is one we cannot check.
const THEME_TOKENS = {
  light: { '--color-foreground': '#111827', '--color-muted-foreground': '#6b7280' },
  dark: { '--color-foreground': '#f4f4f5', '--color-muted-foreground': '#a1a1aa' },
};

// Tailwind's own palette, for the fixed classes this helper is allowed to use.
const FIXED_COLOURS = {
  'text-white': '#ffffff',
  'text-gray-800': '#1f2937',
  'text-gray-700': '#374151',
  'text-gray-900': '#111827',
};

const TOKEN_CLASSES = {
  'text-foreground': '--color-foreground',
  'text-muted-foreground': '--color-muted-foreground',
};

function resolveColour(cls, theme) {
  if (FIXED_COLOURS[cls]) return FIXED_COLOURS[cls];
  const token = TOKEN_CLASSES[cls];
  if (token) return THEME_TOKENS[theme][token];
  return null;
}

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function wcagLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrastRatio(a, b) {
  const [hi, lo] = [wcagLuminance(a), wcagLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA for body copy. §7's "gray-500 or darker on white" is this rule
// expressed as a palette shortcut; gray-500 on white is 4.83:1.
const AA_BODY = 4.5;

test('§7 — the returned class clears WCAG AA against its own section, in BOTH themes', () => {
  // Light sections, stated three different ways, plus the dark one for symmetry.
  const cases = [
    { section: { sectionTextMode: 'light', sectionColor: '#ffffff' }, background: '#ffffff' },
    { section: { sectionTextMode: 'auto', sectionColor: '#f9fafb' }, background: '#f9fafb' },
    { section: { sectionTextMode: 'auto', sectionColor: '' }, background: '#ffffff' },
    { section: { sectionTextMode: 'dark', sectionColor: '#111111' }, background: '#111111' },
  ];

  for (const { section, background } of cases) {
    const cls = classFor(makeSection(section));

    for (const theme of ['light', 'dark']) {
      const colour = resolveColour(cls, theme);
      assert.notEqual(
        colour,
        null,
        `${cls} is not a colour this test can resolve. Add it to FIXED_COLOURS or TOKEN_CLASSES — do not delete the assertion.`,
      );

      const ratio = contrastRatio(colour, background);
      assert.ok(
        ratio >= AA_BODY,
        `${cls} resolves to ${colour} in the ${theme} theme, giving ${ratio.toFixed(2)}:1 on ${background} — below AA's ${AA_BODY}:1 (§7)`,
      );
    }
  }
});

test('§2 — the class does not change when only the viewer’s theme changes', () => {
  // The property underneath the numbers, stated directly: this helper's answer
  // is a function of the SECTION, so nothing about the surrounding chrome may
  // enter it. A token-valued class fails this by construction, which is why it
  // is asserted rather than left implied by the ratios above.
  for (const sectionTextMode of MODES) {
    for (const sectionColor of COLOR_SWEEP) {
      const cls = classFor(makeSection({ sectionTextMode, sectionColor }));
      assert.equal(
        cls in TOKEN_CLASSES,
        false,
        `${cls} is a theme-reactive token; §2's decision is about the section's own background, not the viewer's theme`,
      );
    }
  }
});
