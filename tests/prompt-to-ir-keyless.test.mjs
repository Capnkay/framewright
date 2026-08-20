import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  promptToIrKeyless,
  extractCardCount,
  extractAccent,
  extractCtaLabel,
  extractSectionType,
  extractTextMode,
} from '../server/src/generate/promptToIrKeyless.js';
import { validateIr } from '../server/src/validate/irValidator.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = path.join(REPO_ROOT, 'server/src/generate/promptToIrKeyless.js');

// ---------------------------------------------------------------------
// The doneWhen case, stated in full: LLM_API_KEY unset, four stats, a green
// accent, schema-valid, and zero network calls.
// ---------------------------------------------------------------------

test('doneWhen — four stats + green accent, key unset, schema-valid, zero network calls', () => {
  const savedKey = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  // Every outbound path this process could take, replaced with a tripwire.
  const savedFetch = globalThis.fetch;
  const savedXhr = globalThis.XMLHttpRequest;
  let networkCalls = 0;
  globalThis.fetch = (...args) => {
    networkCalls += 1;
    throw new Error(`keyless path made a network call: fetch(${String(args[0])})`);
  };
  globalThis.XMLHttpRequest = function TripwireXhr() {
    networkCalls += 1;
    throw new Error('keyless path made a network call: XMLHttpRequest');
  };

  try {
    const ir = promptToIrKeyless(
      'Build a split hero for a gym with four stats and a green accent colour.',
    );

    assert.equal(process.env.LLM_API_KEY, undefined, 'the key must be unset for this case');
    assert.equal(networkCalls, 0, 'the keyless path must make zero network calls');

    assert.equal(ir.cards.count, 4, 'cards.count must be 4');
    assert.equal(ir.cards.items.length, 4, 'cards.items must actually hold 4 items');
    assert.ok(/green/.test(ir.theme.accent), `theme.accent must reflect green, got ${ir.theme.accent}`);

    const result = validateIr(ir);
    assert.deepEqual(result.errors, []);
    assert.equal(result.valid, true, 'the produced IR must be schema-valid');
  } finally {
    globalThis.fetch = savedFetch;
    globalThis.XMLHttpRequest = savedXhr;
    if (savedKey !== undefined) process.env.LLM_API_KEY = savedKey;
  }
});

test('the module imports nothing that could reach the network', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const imports = [...source.matchAll(/^\s*import\s.*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);

  // Static proof to sit alongside the runtime tripwire above: no http client,
  // no provider SDK, nothing from node: that opens a socket.
  const forbidden = /^(node:)?(http|https|net|tls|dgram|undici)$|openai|anthropic|axios|node-fetch|got$/i;
  for (const spec of imports) {
    assert.ok(!forbidden.test(spec), `must not import a network-capable module, found "${spec}"`);
  }
  assert.ok(!/\bfetch\s*\(/.test(source), 'must not call fetch()');
  assert.ok(!/\brequire\s*\(/.test(source), 'must not use require()');
});

// ---------------------------------------------------------------------
// Schema validity across a spread of prompts — the property that matters
// most, since every downstream stage assumes it.
// ---------------------------------------------------------------------

test('every prompt shape produces a schema-valid IR', () => {
  const prompts = [
    '',
    'hero',
    'a split hero with six metrics and an indigo accent',
    'banner, three cards, CTA "Start Free Trial"',
    'dark background hero with 2 stats in blue',
    'make me something nice',
    'a hero with 99 stats',
    'one card only',
  ];

  for (const prompt of prompts) {
    const ir = promptToIrKeyless(prompt);
    const result = validateIr(ir);
    assert.deepEqual(result.errors, [], `prompt ${JSON.stringify(prompt)} produced an invalid IR`);
  }
});

test('the same prompt always produces the same IR — the path is deterministic', () => {
  const prompt = 'split hero, four stats, teal accent, CTA "Join Now"';
  const a = promptToIrKeyless(prompt);
  const b = promptToIrKeyless(prompt);
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------
// §6 field notes — the invariants a downstream consumer relies on.
// ---------------------------------------------------------------------

test('no field ID ever appears in the IR — §6: the API attaches them after the IR is final', () => {
  const ir = promptToIrKeyless('hero with five stats');
  const serialised = JSON.stringify(ir);
  assert.ok(!/"fieldId\d*"/.test(serialised), 'the IR must carry no fieldId keys');
  for (const item of ir.cards.items) {
    assert.deepEqual(Object.keys(item).sort(), ['field1', 'field2']);
  }
});

test('variations is always a string, even when a number is passed in', () => {
  const ir = promptToIrKeyless('hero', { variations: 2 });
  assert.strictEqual(ir.variations, '2');
  assert.equal(validateIr(ir).valid, true);
});

test('confidence and bbox are null for a prompt source — §6: null when not from an image', () => {
  const ir = promptToIrKeyless('hero with a purple accent');
  for (const el of ir.elements) {
    assert.strictEqual(el.confidence, null, `${el.elementName}.confidence must be null`);
    assert.strictEqual(el.bbox, null, `${el.elementName}.bbox must be null`);
  }
});

test('sourceOf marks only the fields the prompt actually set', () => {
  const ir = promptToIrKeyless('hero, CTA "Book A Class"');
  const cta = ir.elements.find((el) => el.elementName === 'ctaButton');
  const headline = ir.elements.find((el) => el.elementName === 'headlineMain');
  assert.equal(cta.sourceOf, 'prompt');
  assert.equal(cta.default, 'BOOK A CLASS');
  assert.equal(headline.sourceOf, 'default');
});

test('the accent is a Tailwind palette name, never a colour literal — §6.1 rule 2', () => {
  for (const prompt of ['green accent', 'blue theme', 'a rose brand colour']) {
    const ir = promptToIrKeyless(prompt);
    assert.match(ir.theme.accent, /^[a-z]+-\d{2,3}$/, `${ir.theme.accent} must be a palette name`);
    assert.ok(!ir.theme.accent.includes('#'), 'must never be a hex literal');
  }
});

test('cards.count, cards.items.length and the grid stay consistent', () => {
  for (const n of [1, 2, 3, 4, 6, 10]) {
    const ir = promptToIrKeyless(`hero with ${n} stats`);
    assert.equal(ir.cards.count, n);
    assert.equal(ir.cards.items.length, n);
    assert.ok(ir.cards.gridColumns >= 1 && ir.cards.gridColumns <= 4);
  }
});

// ---------------------------------------------------------------------
// Extractors, directly.
// ---------------------------------------------------------------------

test('extractCardCount reads digits, number words, and noun-first phrasing', () => {
  assert.equal(extractCardCount('four stats').value, 4);
  assert.equal(extractCardCount('4 stats').value, 4);
  assert.equal(extractCardCount('with 6 cards please').value, 6);
  assert.equal(extractCardCount('stats: 5').value, 5);
  assert.equal(extractCardCount('seven metrics').value, 7);
  assert.equal(extractCardCount('no numbers here').found, false);
  assert.equal(extractCardCount('no numbers here').value, 3);
});

test('extractCardCount clamps an absurd count rather than trusting it', () => {
  const result = extractCardCount('a hero with 99 stats');
  assert.equal(result.value, 10);
  assert.equal(result.clampedFrom, 99);
});

test('extractAccent prefers a colour next to an accent-ish noun', () => {
  assert.equal(extractAccent('a green accent').value, 'green-500');
  assert.equal(extractAccent('accent: blue').value, 'blue-500');
  assert.equal(extractAccent('brand colour teal').value, 'teal-500');
  assert.equal(extractAccent('nothing colourful').found, false);
  assert.equal(extractAccent('nothing colourful').value, 'red-500');
});

test('extractCtaLabel reads quoted labels and "labelled" phrasing', () => {
  assert.equal(extractCtaLabel('CTA "Start Now"').value, 'START NOW');
  assert.equal(extractCtaLabel("button labelled Join Today").value, 'JOIN TODAY');
  assert.equal(extractCtaLabel('a "Sign Up" button').value, 'SIGN UP');
  assert.equal(extractCtaLabel('no cta mentioned at all').found, false);
});

test('extractSectionType and extractTextMode fall back honestly', () => {
  assert.equal(extractSectionType('a split-hero section').value, 'split-hero');
  assert.equal(extractSectionType('a hero').found, true);
  assert.equal(extractSectionType('something unrecognised').found, false);

  assert.equal(extractTextMode('on a dark background').value, 'dark');
  assert.equal(extractTextMode('light surface').value, 'light');
  assert.equal(extractTextMode('unspecified').value, 'auto');
});

// ---------------------------------------------------------------------
// Warnings — an extractor that silently guesses is indistinguishable from
// one that understood.
// ---------------------------------------------------------------------

test('every fallback is recorded in warnings', () => {
  const ir = promptToIrKeyless('make me something nice');
  assert.ok(ir.warnings.length > 0);
  assert.ok(ir.warnings.some((w) => /card count/i.test(w)));
  assert.ok(ir.warnings.some((w) => /accent/i.test(w)));
  assert.ok(ir.warnings.every((w) => typeof w === 'string'));
});

test('a fully-specified prompt warns about nothing it actually found', () => {
  const ir = promptToIrKeyless('split hero, three stats, green accent, CTA "Go"');
  assert.ok(!ir.warnings.some((w) => /card count/i.test(w)));
  assert.ok(!ir.warnings.some((w) => /accent colour found/i.test(w)));
  assert.ok(!ir.warnings.some((w) => /CTA label/i.test(w)));
});

test('asking for more cards than the template supplies warns rather than inventing statistics', () => {
  const ir = promptToIrKeyless('hero with six stats');
  assert.ok(ir.warnings.some((w) => /placeholder/i.test(w)));
  assert.equal(ir.cards.items[5].field1, '—');
});

test('an empty prompt is a supported input, not an error', () => {
  const ir = promptToIrKeyless('');
  assert.equal(validateIr(ir).valid, true);
  assert.ok(ir.warnings.some((w) => /empty/i.test(w)));
});

test('a non-string prompt is tolerated rather than thrown on', () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    const ir = promptToIrKeyless(bad);
    assert.equal(validateIr(ir).valid, true, `input ${JSON.stringify(bad)} must still yield valid IR`);
  }
});
