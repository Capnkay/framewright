// tests/section-fields.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseAccent, buildSectionFieldsPayload } from '../client/src/studio/SectionFields.logic.js';
import promptToIrKeyless from '../server/src/generate/promptToIrKeyless.js';

test('SectionFields logic', async (t) => {
  await t.test('normaliseAccent', async (t2) => {
    await t2.test('returns valid palette names', () => {
      assert.equal(normaliseAccent('blue'), 'blue');
      assert.equal(normaliseAccent(' GREEN '), 'green');
      assert.equal(normaliseAccent('fuchsia'), 'fuchsia');
    });

    await t2.test('strips weight suffix if provided', () => {
      assert.equal(normaliseAccent('emerald-500'), 'emerald');
      assert.equal(normaliseAccent('rose-900'), 'rose');
    });

    await t2.test('returns null for empty or invalid', () => {
      assert.equal(normaliseAccent(''), null);
      assert.equal(normaliseAccent('   '), null);
      assert.equal(normaliseAccent('magenta'), null);
      assert.equal(normaliseAccent(null), null);
    });
  });

  await t.test('buildSectionFieldsPayload', async (t2) => {
    await t2.test('applies defaults for empty fields', () => {
      const payload = buildSectionFieldsPayload({});
      assert.equal(payload.pageName, 'Home');
      assert.equal(payload.sectionName, 'Custom');
      assert.equal(payload.accent, null);
      assert.equal(payload.promptExtension, null);
    });

    await t2.test('applies defaults for whitespace fields', () => {
      const payload = buildSectionFieldsPayload({ pageName: '   ', sectionName: ' ' });
      assert.equal(payload.pageName, 'Home');
      assert.equal(payload.sectionName, 'Custom');
    });

    await t2.test('preserves exact case of pageName - do not normalise', () => {
      const payload = buildSectionFieldsPayload({ pageName: 'aBoUtUs', sectionName: 'HERO' });
      assert.equal(payload.pageName, 'aBoUtUs');
      assert.equal(payload.sectionName, 'HERO');
    });

    await t2.test('builds promptExtension for valid accent', () => {
      const payload = buildSectionFieldsPayload({ accent: 'violet' });
      assert.equal(payload.promptExtension, 'Make the accent violet.');
    });

    await t2.test('accent survives into the IR theme.accent and designTokens (integration)', () => {
      const payload = buildSectionFieldsPayload({ accent: 'amber' });
      // We pass the prompt extension as the user's prompt to prove the two hops
      // work when it reaches the generator.
      const ir = promptToIrKeyless(payload.promptExtension);
      
      // §6.1 rule 3: theme.accent and designTokens.colors.accent must agree
      assert.equal(ir.theme.accent, 'amber-500');
      assert.equal(ir.designTokens.colors.accent, 'amber-500');
    });
  });
});
