// tests/prompt-to-ir-hosted-output.test.mjs
//
// T-123 — CONTRACT.md §6, §16.2. docs/BENCHMARK-RESULTS.md B-005.
//
// A live Bedrock call (qwen.qwen3-coder-next) returned 200 in 22.5s for a
// prompt-to-IR request, and the reply failed to honour three fields the
// CALLER already supplied the true value for:
//
//   - "source": { "mode": "code" }   — the call was a prompt, not code.
//   - "pageName": "landing"          — "Home" was passed in and ignored.
//   - "shadow Small" / "shadow XL"   — designTokens keys with spaces.
//
// response_format: { type: 'json_schema', strict: true } did not stop any of
// this — a schema enforces shape, not which legal value is true, and a key
// name with a space is still a legal object key. This is the realistic bad
// reply B-005 recorded, reconstructed here so it never needs a live Bedrock
// key to re-check.
//
// doneWhen: the request pins the caller-supplied fields so the model cannot
// invent them, and this reply is either repaired or rejected with the reason
// reaching the IR's warnings. The implementation REPAIRS: pageName, source.mode,
// sectionName, platform and variations are overwritten with the caller's own
// values, and a designTokens key that cannot be a real token is dropped —
// each change is named in ir.warnings rather than happening silently.

import { test } from 'node:test';
import assert from 'node:assert';

import { promptToIrHostedWithMeta } from '../server/src/generate/promptToIrHosted.js';
import { promptToIrKeyless } from '../server/src/generate/promptToIrKeyless.js';
import { validateIr } from '../server/src/validate/irValidator.js';

const PROMPT = 'a bold hero section with three stats and a dark accent';

/**
 * The B-005 reply, reconstructed: a structurally sound IR (so the only
 * failures under test are the three named ones, not incidental schema
 * breakage) carrying exactly the three recorded defects.
 */
function b005Reply() {
  const ir = promptToIrKeyless(PROMPT, { pageName: 'Home' });
  return {
    ...ir,
    source: { ...ir.source, mode: 'code' },
    pageName: 'landing',
    designTokens: {
      colors: { accent: 'emerald-500' },
      shadows: { 'shadow Small': 'shadow-sm', 'shadow XL': 'shadow-xl' },
    },
  };
}

test('B-005: source.mode, pageName and designTokens keys are repaired, not silently accepted', async () => {
  const { ir, usedPath, reason, meta } = await promptToIrHostedWithMeta(PROMPT, {
    pageName: 'Home',
    callModel: async () => ({
      ok: true,
      value: b005Reply(),
      meta: { purpose: 'prompt-to-ir', model: 'qwen.qwen3-coder-next', ms: 22_500, attempts: 1, ok: true },
    }),
  });

  // Repaired, not rejected: the call succeeded and the IR is usable, so the
  // 22.5 seconds are not thrown away the way B-005 measured them being.
  assert.equal(usedPath, 'hosted', 'a repairable reply must still count as the hosted path');
  assert.equal(reason, null);
  assert.equal(validateIr(ir).valid, true, 'the repaired IR must be schema-valid');
  assert.equal(meta.ms, 22_500, 'the real call latency is still surfaced in the trace');

  // Defect 1 — source.mode pinned to "prompt", the true mode of this call.
  assert.equal(ir.source.mode, 'prompt', 'source.mode must never be left as the model\'s guess');

  // Defect 2 — pageName pinned to the caller's own value.
  assert.equal(ir.pageName, 'Home', 'pageName must be the caller\'s value, not the model\'s invention');

  // Defect 3 — the malformed designTokens keys are gone, and the well-formed
  // sibling key the model also proposed survives untouched.
  assert.ok(!('shadow Small' in (ir.designTokens.shadows || {})), 'a token key with a space must not survive');
  assert.ok(!('shadow XL' in (ir.designTokens.shadows || {})), 'a token key with a space must not survive');
  assert.equal(ir.designTokens.colors.accent, 'emerald-500', 'a well-formed sibling token must be left alone');

  // Every repair is named in warnings — a value that moved without a
  // recorded reason is indistinguishable from a bug (same principle as the
  // keyless path's own fallback notes).
  assert.ok(ir.warnings.some((w) => /pageName/.test(w) && /pinned/.test(w)), 'pageName repair must be recorded');
  assert.ok(ir.warnings.some((w) => /source\.mode/.test(w) && /pinned/.test(w)), 'source.mode repair must be recorded');
  assert.ok(
    ir.warnings.some((w) => /shadow Small/.test(w) && /dropped/.test(w)),
    'the dropped designTokens key must be named, not just silently absent',
  );
  assert.ok(
    ir.warnings.some((w) => /shadow XL/.test(w) && /dropped/.test(w)),
    'the second dropped designTokens key must be named too',
  );
});

test('B-005: sectionName, platform and variations are pinned the same way when the model diverges', async () => {
  const { ir } = await promptToIrHostedWithMeta(PROMPT, {
    pageName: 'Home',
    sectionName: 'HeroBanner',
    platform: 'App',
    variations: '2',
    callModel: async () => {
      const ir = promptToIrKeyless(PROMPT, { pageName: 'Home' });
      return {
        ok: true,
        value: { ...ir, sectionName: 'Custom', platform: 'Website', variations: '1' },
      };
    },
  });

  assert.equal(ir.sectionName, 'HeroBanner');
  assert.equal(ir.platform, 'App');
  assert.strictEqual(ir.variations, '2');
  assert.equal(validateIr(ir).valid, true);
});

test('B-005: a model that already gets every pinned field right adds no repair warnings', async () => {
  const { ir } = await promptToIrHostedWithMeta(PROMPT, {
    pageName: 'Home',
    callModel: async () => ({ ok: true, value: promptToIrKeyless(PROMPT, { pageName: 'Home' }) }),
  });

  assert.ok(
    !ir.warnings.some((w) => /pinned|dropped/.test(w)),
    'a compliant model reply must not accumulate repair noise',
  );
});

test('B-005: a reply the pin/repair step cannot save still falls back with the reason in warnings', async () => {
  const { ir, usedPath, reason } = await promptToIrHostedWithMeta(PROMPT, {
    pageName: 'Home',
    callModel: async () => {
      const ir = promptToIrKeyless(PROMPT, { pageName: 'Home' });
      // A defect pinning does not and should not touch: the model inventing
      // an element shape has nothing to do with caller-supplied fields.
      return { ok: true, value: { ...ir, elements: 'not-an-array' } };
    },
  });

  assert.equal(usedPath, 'keyless');
  assert.ok(reason && /elements/.test(reason), 'the real, un-repairable failure must still surface in the reason');
  const warning = ir.warnings.find((w) => /Hosted model not used/i.test(w));
  assert.ok(warning, 'the rejection must be recorded in the IR, not swallowed');
  assert.equal(validateIr(ir).valid, true);
});
