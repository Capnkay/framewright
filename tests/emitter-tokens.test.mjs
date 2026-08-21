// tests/emitter-tokens.test.mjs — T-093, CONTRACT.md §6.1 and §7.
//
// The assertion this file exists for: `designTokens` must be able to arrive
// without changing anything. §6.1 says an IR with no designTokens and an IR
// carrying DEFAULT_TOKENS explicitly must produce BYTE-IDENTICAL output, and
// calls that equivalence "the assertion that stops this field quietly changing
// the deterministic path". Everything else here is in service of that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emitComponent, DEFAULT_TOKENS, resolveTokens } from '../server/src/generate/emitComponent.js';
import {
  DEFAULT_TOKENS as TOKENS_MODULE_DEFAULTS,
  tokensFromIr,
  validateTokens,
} from '../server/src/generate/designTokens.js';
import { promptToIrKeyless } from '../server/src/generate/promptToIrKeyless.js';

/** A finalised IR — field IDs already attached, as the emitter expects. */
function baseIr(overrides = {}) {
  const ir = promptToIrKeyless('a split hero with three stats');
  ir.elements = ir.elements.map((el, i) => ({ ...el, fieldId: `200000000${i + 1}` }));
  ir.cards.items = ir.cards.items.map((item, i) => ({
    ...item,
    fieldId1: `300000000${i * 2 + 1}`,
    fieldId2: `300000000${i * 2 + 2}`,
  }));
  return { ...ir, ...overrides };
}

const deepCopy = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------
// doneWhen 1 — the byte-identical equivalence.
// ---------------------------------------------------------------------

test('doneWhen — absent designTokens and explicit DEFAULT_TOKENS emit byte-identical output', () => {
  const without = baseIr();
  assert.equal('designTokens' in without, false, 'the baseline IR must carry no designTokens');

  const withDefaults = baseIr({ designTokens: deepCopy(DEFAULT_TOKENS) });

  const a = emitComponent(without);
  const b = emitComponent(withDefaults);

  assert.equal(a, b, '§6.1: explicit DEFAULT_TOKENS must change nothing');
  assert.equal(a.length, b.length, 'byte-for-byte, not merely equivalent');
});

test('the equivalence holds for every group supplied on its own', () => {
  const baseline = emitComponent(baseIr());

  for (const group of Object.keys(DEFAULT_TOKENS)) {
    const partial = { [group]: deepCopy(DEFAULT_TOKENS[group]) };
    const emitted = emitComponent(baseIr({ designTokens: partial }));
    assert.equal(emitted, baseline, `supplying only "${group}" at its default must change nothing`);
  }
});

test('the equivalence holds for a card-list layout too, not just the grid default', () => {
  const listIr = baseIr();
  listIr.cards.layoutMode = 'list';

  const withDefaults = deepCopy(listIr);
  withDefaults.designTokens = deepCopy(DEFAULT_TOKENS);

  assert.equal(emitComponent(listIr), emitComponent(withDefaults));
});

// ---------------------------------------------------------------------
// ONE definition of the tokens. This is the defect T-093 closed.
// ---------------------------------------------------------------------

test('the emitter re-exports the token module rather than defining its own set', () => {
  // Same object identity, not merely equal values — two definitions with
  // identical values today are two definitions that drift tomorrow.
  assert.equal(DEFAULT_TOKENS, TOKENS_MODULE_DEFAULTS, 'there must be exactly one DEFAULT_TOKENS');
});

test('an unrecognised token key is ignored, not emitted — §6.1 rule 4', () => {
  const baseline = emitComponent(baseIr());
  const emitted = emitComponent(
    baseIr({ designTokens: { colors: { inventedKey: 'teal-500' }, aWholeUnknownGroup: { x: 'y' } } }),
  );

  assert.equal(emitted, baseline, 'an unknown token must not reach the output');
  assert.ok(!emitted.includes('inventedKey'));
  assert.ok(!emitted.includes('teal-500'));
});

test('a colour literal or raw CSS value never reaches an emitted className — §6.1 rules 1 and 2', () => {
  const baseline = emitComponent(baseIr());
  const emitted = emitComponent(
    baseIr({ designTokens: { colors: { accent: '#ef4444' }, spacing: { gap: '16px' } } }),
  );

  // The offending values are declined in favour of the defaults, so output is
  // unchanged. §6.1 rule 1: a raw value would force the emitter to invent a
  // class name or inline a style, and inlining collides with R10 and §8.
  assert.equal(emitted, baseline);
  assert.ok(!emitted.includes('#ef4444'), 'no hex literal may appear in the source');
  assert.ok(!emitted.includes('16px'), 'no raw CSS length may appear as a class');
  assert.ok(!emitted.includes('bg-#'), 'the accent must never be interpolated as a literal');
});

test('resolving tokens never yields a rule-violating set, whatever the IR carried', () => {
  const inputs = [
    undefined,
    {},
    { colors: { accent: '#000' } },
    { spacing: { gap: '2rem' } },
    { typography: { scale: { h1: 'calc(1px)' } } },
    { unknown: { k: 'v' } },
  ];
  for (const designTokens of inputs) {
    const tokens = tokensFromIr(baseIr({ designTokens }));
    assert.deepEqual(validateTokens(tokens).errors, [], `tokens stayed rule-compliant for ${JSON.stringify(designTokens)}`);
  }
});

test('resolveTokens(undefined) hands back a copy, not the shared default', () => {
  const a = resolveTokens(undefined);
  a.colors.accent = 'HACKED';
  assert.equal(
    resolveTokens(undefined).colors.accent,
    'red-500',
    'one generation mutating its tokens must not change the default for the next',
  );
  assert.equal(emitComponent(baseIr()).includes('HACKED'), false);
});

// ---------------------------------------------------------------------
// doneWhen 2 — theme.accent and designTokens.colors.accent agree.
// ---------------------------------------------------------------------

test('doneWhen — theme.accent and designTokens.colors.accent are asserted to agree — §6.1 rule 3', () => {
  const ir = baseIr();
  ir.theme.accent = 'emerald-500';

  const tokens = tokensFromIr(ir);
  assert.equal(tokens.colors.accent, ir.theme.accent, 'the token accent must follow theme.accent');

  // And the agreement is visible in the output, not just in the resolver.
  const emitted = emitComponent(ir);
  assert.ok(emitted.includes('bg-emerald-500'), 'the emitted button must use the agreed accent');
  assert.ok(!emitted.includes('bg-red-500'), 'the default accent must not survive alongside it');
});

test('an explicit token accent is authoritative over theme when they disagree', () => {
  const ir = baseIr({ designTokens: { colors: { accent: 'indigo-500' } } });
  ir.theme.accent = 'red-500';

  assert.equal(tokensFromIr(ir).colors.accent, 'indigo-500');
  assert.ok(emitComponent(ir).includes('bg-indigo-500'));
});

test('theme is not deprecated — §6.1 rule 3 — and still drives the emitted colour alone', () => {
  const ir = baseIr();
  ir.theme.accent = 'violet-500';
  assert.equal('designTokens' in ir, false, 'no designTokens at all');
  assert.ok(emitComponent(ir).includes('bg-violet-500'), 'theme.accent alone must still be honoured');
});

// ---------------------------------------------------------------------
// doneWhen 3 — a prompt changing the accent moves BOTH, and warns.
// ---------------------------------------------------------------------

test('doneWhen — a prompt changing the accent moves both and records a warning (§6)', () => {
  const ir = promptToIrKeyless('a split hero with three stats and a green accent');

  assert.equal(ir.theme.accent, 'green-500', 'theme.accent moved');
  assert.equal(ir.designTokens.colors.accent, 'green-500', 'designTokens.colors.accent moved too');
  assert.equal(tokensFromIr(ir).colors.accent, 'green-500', 'and they agree');

  const warning = ir.warnings.find((w) => /prompt set the accent/i.test(w));
  assert.ok(warning, '§6 conflict resolution: the override must be recorded');
  assert.match(warning, /green-500/);
  assert.match(warning, /prompt wins/i);
});

test('the moved accent reaches the emitted component', () => {
  const ir = promptToIrKeyless('split hero, three stats, a sky accent');
  ir.elements = ir.elements.map((el, i) => ({ ...el, fieldId: `200000000${i + 1}` }));
  ir.cards.items = ir.cards.items.map((item, i) => ({
    ...item,
    fieldId1: `300000000${i * 2 + 1}`,
    fieldId2: `300000000${i * 2 + 2}`,
  }));

  const emitted = emitComponent(ir);
  assert.ok(emitted.includes('bg-sky-500'));
  assert.ok(!emitted.includes('bg-red-500'));
});

test('a prompt that does not mention a colour emits no designTokens and no override warning', () => {
  const ir = promptToIrKeyless('a split hero with three stats');

  assert.equal('designTokens' in ir, false, 'absence is what preserves the deterministic path');
  assert.equal(ir.theme.accent, 'red-500');
  assert.ok(!ir.warnings.some((w) => /prompt set the accent/i.test(w)));
  assert.ok(ir.warnings.some((w) => /No accent colour found/i.test(w)));
});

test('a prompt naming the default colour explicitly does not claim an override', () => {
  // "red" IS the default. Recording an override here would put a warning in
  // front of a judge describing a change that did not happen.
  const ir = promptToIrKeyless('a split hero with a red accent');
  assert.equal(ir.theme.accent, 'red-500');
  assert.equal('designTokens' in ir, false);
  assert.ok(!ir.warnings.some((w) => /prompt set the accent/i.test(w)));
});

// ---------------------------------------------------------------------
// The emitter stays deterministic, which is the whole point of §6.1.
// ---------------------------------------------------------------------

test('emitting the same IR twice is byte-identical', () => {
  const ir = baseIr({ designTokens: { colors: { accent: 'teal-500' } } });
  assert.equal(emitComponent(ir), emitComponent(ir));
});

test('emitting does not mutate the IR it was given', () => {
  const ir = baseIr({ designTokens: { colors: { accent: 'teal-500' } } });
  const before = deepCopy(ir);
  emitComponent(ir);
  assert.deepEqual(ir, before);
});

test('a token override still satisfies R11/R12 — layout and marker classes survive', () => {
  const emitted = emitComponent(
    baseIr({ designTokens: { breakpoints: { stack: 'lg' }, spacing: { gap: 'gap-8' } } }),
  );
  assert.ok(emitted.includes('dynamicStyle'), 'R12: text/button marker class');
  assert.ok(emitted.includes('dynamicStyle2'), 'R12: image marker class');
  assert.ok(emitted.includes('gap-8'), 'the recognised override applied');
  assert.ok(/flex flex-col/.test(emitted), 'R11: stacked on mobile');
  assert.ok(/max-w-\[1920px\]/.test(emitted), 'R11: inside a max-width container');
});

test('an explicit layout.breakpoint beats the breakpoints.stack token — §6: layout is the spatial authority', () => {
  // Not a bug: §6's conflict order gives spatial layout to the wireframe, and
  // layout.breakpoint is that decision written down. breakpoints.stack is the
  // fallback for an IR that never stated one, not an override of one that did.
  const stated = baseIr({ designTokens: { breakpoints: { stack: 'lg' } } });
  stated.layout.breakpoint = 'md';
  assert.ok(emitComponent(stated).includes('md:flex-row'), 'the stated breakpoint wins');

  const unstated = baseIr({ designTokens: { breakpoints: { stack: 'lg' } } });
  delete unstated.layout.breakpoint;
  assert.ok(emitComponent(unstated).includes('lg:flex-row'), 'the token fills the gap when none was stated');
});
