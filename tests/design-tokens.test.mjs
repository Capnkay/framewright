import { test } from 'node:test';
import assert from 'node:assert';

import {
  DEFAULT_TOKENS,
  resolveTokens,
  tokensFromIr,
  validateTokens,
  isColourLiteral,
  isTailwindTokenValue,
} from '../server/src/generate/designTokens.js';
import { validateIr } from '../server/src/validate/irValidator.js';
import { promptToIrKeyless } from '../server/src/generate/promptToIrKeyless.js';

/** Deep-walk every leaf value in a token tree. */
function leaves(node, path = '$', out = []) {
  for (const [key, value] of Object.entries(node)) {
    const here = `${path}.${key}`;
    if (value && typeof value === 'object') leaves(value, here, out);
    else out.push([here, value]);
  }
  return out;
}

// ---------------------------------------------------------------------
// doneWhen 1 — designTokens is optional and an IR without it still validates.
// ---------------------------------------------------------------------

test('doneWhen — designTokens is optional; an IR without it validates', () => {
  const ir = promptToIrKeyless('split hero with three stats');
  assert.equal('designTokens' in ir, false, 'the keyless path emits no designTokens');
  assert.deepEqual(validateIr(ir).errors, []);
  assert.equal(validateIr(ir).valid, true);
});

test('an IR carrying DEFAULT_TOKENS explicitly also validates', () => {
  const ir = { ...promptToIrKeyless('split hero'), designTokens: DEFAULT_TOKENS };
  assert.deepEqual(validateIr(ir).errors, []);
});

// ---------------------------------------------------------------------
// The equivalence §6.1 exists to protect: absent === DEFAULT_TOKENS.
// ---------------------------------------------------------------------

test('resolveTokens(undefined) deeply equals resolveTokens(DEFAULT_TOKENS) — §6.1 equivalence', () => {
  assert.deepEqual(resolveTokens(undefined), resolveTokens(DEFAULT_TOKENS));
  assert.deepEqual(resolveTokens(null), resolveTokens(DEFAULT_TOKENS));
  assert.deepEqual(resolveTokens({}), resolveTokens(DEFAULT_TOKENS));
});

test('resolveTokens(undefined) reproduces DEFAULT_TOKENS exactly, group for group', () => {
  const resolved = resolveTokens(undefined);
  assert.deepEqual(Object.keys(resolved).sort(), Object.keys(DEFAULT_TOKENS).sort());
  for (const [path, value] of leaves(DEFAULT_TOKENS)) {
    const actual = leaves(resolved).find(([p]) => p === path);
    assert.ok(actual, `${path} must survive resolution`);
    assert.equal(actual[1], value, `${path} must be unchanged`);
  }
});

test('resolveTokens returns a mutable copy — DEFAULT_TOKENS itself is frozen', () => {
  const a = resolveTokens();
  a.colors.accent = 'blue-500';
  assert.equal(DEFAULT_TOKENS.colors.accent, 'red-500', 'the shared default must not be mutable through a resolution');
  assert.equal(resolveTokens().colors.accent, 'red-500');
  assert.throws(() => {
    'use strict';
    DEFAULT_TOKENS.colors.accent = 'green-500';
  });
});

// ---------------------------------------------------------------------
// doneWhen 2 — every token value is a Tailwind class, no colour literals.
// ---------------------------------------------------------------------

test('doneWhen — every DEFAULT_TOKENS value is a Tailwind utility class, no colour literal', () => {
  const result = validateTokens(DEFAULT_TOKENS);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);

  for (const [path, value] of leaves(DEFAULT_TOKENS)) {
    assert.equal(typeof value, 'string', `${path} must be a string`);
    assert.ok(!value.includes('#'), `${path} must not be a hex literal`);
    assert.ok(isTailwindTokenValue(value), `${path} = ${JSON.stringify(value)} must be a Tailwind class`);
  }
});

test('isColourLiteral catches the forms a model or designer actually emits', () => {
  for (const bad of ['#ef4444', '#FFF', '#ef4444ff', 'rgb(239,68,68)', 'rgba(0,0,0,.5)', 'hsl(0 84% 60%)', 'oklch(0.7 0.2 20)']) {
    assert.equal(isColourLiteral(bad), true, `${bad} must be recognised as a colour literal`);
  }
  // §6.1's own reference tokens use bare palette words — these are symbolic,
  // not literals, and rejecting them would reject the contract's example.
  for (const good of ['white', 'black', 'red-500', 'gray-800', 'gray-50']) {
    assert.equal(isColourLiteral(good), false, `${good} must NOT be treated as a colour literal`);
  }
});

test('isTailwindTokenValue rejects raw CSS values — §6.1 rule 1', () => {
  for (const bad of ['36px', '1.5rem', '100%', '12pt', '2em', 'calc(100% - 2rem)', 'url(x.png)', 'font-weight: bold', '']) {
    assert.equal(isTailwindTokenValue(bad), false, `${bad} must be rejected`);
  }
  for (const good of ['text-4xl', 'text-4xl md:text-5xl', 'py-8 md:py-16', 'shadow-none', 'md', 'rounded-md']) {
    assert.equal(isTailwindTokenValue(good), true, `${good} must be accepted`);
  }
});

test('a CSS declaration is rejected even without a space after the colon', () => {
  // The colon cannot simply be banned — Tailwind variants are built on it —
  // so a declaration is separated from a variant by checking the prefix.
  for (const bad of ['font-weight:bold', 'background-color:red', 'display:flex']) {
    assert.equal(isTailwindTokenValue(bad), false, `${bad} is a CSS declaration, not a utility class`);
  }
  for (const good of ['hover:bg-red-600', 'dark:text-white', 'md:w-1/2', 'lg:-mt-4', 'group-hover:opacity-100']) {
    assert.equal(isTailwindTokenValue(good), true, `${good} is a legitimate Tailwind variant`);
  }
});

test('validateTokens reports the offending path and the rule it broke', () => {
  const bad = { colors: { accent: '#ef4444' }, spacing: { gap: '16px' } };
  const result = validateTokens(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === '$.colors.accent' && /colour literal/i.test(e.message)));
  assert.ok(result.errors.some((e) => e.path === '$.spacing.gap' && /Tailwind/i.test(e.message)));
});

// ---------------------------------------------------------------------
// doneWhen 3 — an unrecognised token key is ignored, not rejected.
// ---------------------------------------------------------------------

test('doneWhen — an unrecognised token key is ignored, not an error (§6.1 rule 4)', () => {
  const withUnknown = {
    colors: { accent: 'green-500', somethingNew: 'teal-500' },
    aWholeUnknownGroup: { anything: 'at-all' },
  };

  // Ignored by the resolver...
  const resolved = resolveTokens(withUnknown);
  assert.equal(resolved.colors.accent, 'green-500', 'a recognised override still applies');
  assert.equal('somethingNew' in resolved.colors, false, 'an unknown key is dropped');
  assert.equal('aWholeUnknownGroup' in resolved, false, 'an unknown group is dropped');
  // ...and everything else falls back to the default.
  assert.equal(resolved.colors.surface, DEFAULT_TOKENS.colors.surface);

  // ...and never fails schema validation.
  const ir = { ...promptToIrKeyless('hero'), designTokens: withUnknown };
  assert.deepEqual(validateIr(ir).errors, [], 'an unknown token key must never fail a generation');
});

test('a rule-violating override is declined in favour of the default, not thrown on', () => {
  const resolved = resolveTokens({ colors: { accent: '#ef4444' }, spacing: { gap: '16px' } });
  assert.equal(resolved.colors.accent, DEFAULT_TOKENS.colors.accent, 'a colour literal is declined');
  assert.equal(resolved.spacing.gap, DEFAULT_TOKENS.spacing.gap, 'a raw CSS value is declined');
});

// ---------------------------------------------------------------------
// Overrides that ARE valid.
// ---------------------------------------------------------------------

test('a recognised, rule-compliant override is adopted', () => {
  const resolved = resolveTokens({
    colors: { accent: 'green-500' },
    typography: { scale: { h1: 'text-5xl md:text-6xl' } },
    breakpoints: { stack: 'lg' },
  });
  assert.equal(resolved.colors.accent, 'green-500');
  assert.equal(resolved.typography.scale.h1, 'text-5xl md:text-6xl');
  assert.equal(resolved.breakpoints.stack, 'lg');
  // Untouched siblings keep their defaults.
  assert.equal(resolved.typography.scale.h2, DEFAULT_TOKENS.typography.scale.h2);
  assert.equal(resolved.colors.surface, DEFAULT_TOKENS.colors.surface);
});

test('nested scale overrides merge rather than replace the group', () => {
  const resolved = resolveTokens({ typography: { scale: { body: 'text-lg' } } });
  assert.equal(resolved.typography.scale.body, 'text-lg');
  assert.equal(resolved.typography.scale.h1, DEFAULT_TOKENS.typography.scale.h1);
  assert.equal(resolved.typography.headingFamily, DEFAULT_TOKENS.typography.headingFamily);
});

// ---------------------------------------------------------------------
// §6.1 rule 3 — theme stays, and theme.accent agrees with the token accent.
// ---------------------------------------------------------------------

test('tokensFromIr keeps theme.accent and colors.accent in agreement — §6.1 rule 3', () => {
  const ir = promptToIrKeyless('a split hero with a green accent');
  assert.equal(ir.theme.accent, 'green-500');

  const tokens = tokensFromIr(ir);
  assert.equal(tokens.colors.accent, ir.theme.accent, 'theme.accent and designTokens.colors.accent must agree');
});

test('an explicit token accent wins over the theme, and a bad one falls back', () => {
  const base = promptToIrKeyless('hero with a green accent');

  const explicit = tokensFromIr({ ...base, designTokens: { colors: { accent: 'indigo-500' } } });
  assert.equal(explicit.colors.accent, 'indigo-500', 'an explicit token accent is authoritative');

  const bad = tokensFromIr({ ...base, designTokens: { colors: { accent: '#4f46e5' } } });
  assert.equal(bad.colors.accent, DEFAULT_TOKENS.colors.accent, 'a colour literal is declined');
});

test('tokensFromIr tolerates a missing or malformed IR rather than throwing', () => {
  for (const bad of [undefined, null, {}, { theme: null }, { designTokens: 'nope' }]) {
    const tokens = tokensFromIr(bad);
    assert.deepEqual(Object.keys(tokens).sort(), Object.keys(DEFAULT_TOKENS).sort());
    assert.deepEqual(validateTokens(tokens).errors, []);
  }
});

test('every resolution, however odd its input, still satisfies §6.1 rules 1 and 2', () => {
  const inputs = [
    undefined,
    {},
    { colors: { accent: '#000000' } },
    { spacing: { gap: '2rem' } },
    { unknown: { x: 'y' } },
    { typography: { scale: { h1: 'calc(1px)' } } },
  ];
  for (const input of inputs) {
    const result = validateTokens(resolveTokens(input));
    assert.deepEqual(result.errors, [], `resolution of ${JSON.stringify(input)} must stay rule-compliant`);
  }
});
