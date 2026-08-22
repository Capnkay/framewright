import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  promptToIrHosted,
  promptToIrHostedWithMeta,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  PURPOSE,
} from '../server/src/generate/promptToIrHosted.js';
import { promptToIrKeyless } from '../server/src/generate/promptToIrKeyless.js';
import { validateIr } from '../server/src/validate/irValidator.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE_PATH = path.join(REPO_ROOT, 'server/src/generate/promptToIrHosted.js');

const PROMPT = 'split hero, four stats, green accent, CTA "Join Now"';

/** A well-formed model response: the keyless IR with a richer headline. */
function goodModelIr(prompt = PROMPT) {
  const ir = promptToIrKeyless(prompt);
  return {
    ...ir,
    elements: ir.elements.map((el) =>
      el.elementName === 'headlineMain'
        ? { ...el, default: 'PUSH PAST EVERY LIMIT', sourceOf: 'prompt' }
        : el,
    ),
  };
}

// ---------------------------------------------------------------------
// doneWhen, first half — a structured-output call succeeds when a key is set.
// ---------------------------------------------------------------------

test('doneWhen — a structured-output call against the IR schema succeeds and its IR is used', async () => {
  const saved = process.env.LLM_API_KEY;
  process.env.LLM_API_KEY = 'test-key-not-a-real-credential';

  try {
    let seen = null;
    const callModel = async (args) => {
      seen = args;
      return { ok: true, value: goodModelIr(), meta: { purpose: args.purpose, model: 'stub', ms: 12, attempts: 1, ok: true } };
    };

    const { ir, usedPath, reason, meta } = await promptToIrHostedWithMeta(PROMPT, { callModel });

    assert.equal(usedPath, 'hosted', 'the hosted IR must be used when the call succeeds');
    assert.equal(reason, null);
    assert.equal(validateIr(ir).valid, true);
    assert.equal(ir.elements.find((e) => e.elementName === 'headlineMain').default, 'PUSH PAST EVERY LIMIT');

    // §16.2 — the call is a structured-output call: the caller's schema goes with it.
    assert.equal(seen.purpose, PURPOSE);
    assert.equal(seen.input, PROMPT);
    assert.ok(seen.schema && seen.schema.properties, 'the IR schema must be passed to the orchestrator');
    assert.equal(typeof seen.timeoutMs, 'number');

    // §16.2 trace shape, surfaced for the stage-5 record.
    assert.deepEqual(Object.keys(meta).sort(), ['attempts', 'model', 'ms', 'ok', 'purpose']);
  } finally {
    if (saved === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = saved;
  }
});

// ---------------------------------------------------------------------
// doneWhen, second half — ANY failure falls through to the keyless path
// rather than erroring the request.
// ---------------------------------------------------------------------

test('doneWhen — every failure mode falls through to the keyless path, never throws', async () => {
  const failures = {
    'ok:false': async () => ({ ok: false, error: 'upstream 500' }),
    timeout: async () => ({ ok: false, error: 'timeout after 30000ms' }),
    'thrown exception': async () => {
      throw new Error('socket hang up');
    },
    'rejected promise': async () => Promise.reject(new Error('ECONNRESET')),
    'malformed output — not an object': async () => ({ ok: true, value: 'here is your IR!' }),
    'malformed output — null': async () => ({ ok: true, value: null }),
    'malformed output — array': async () => ({ ok: true, value: [] }),
    // T-123 (docs/corrections/REGISTER.md): variations is now one of the
    // fields promptToIrHosted PINS to the caller's own value before
    // validation, same as pageName/sectionName/platform, so a numeric
    // variations from the model no longer reaches validateIr at all — it is
    // repaired, not rejected. This mutation targets a field pinning cannot
    // touch, so it still exercises a genuine, un-repairable schema failure.
    'schema-invalid — elements not an array': async () => ({ ok: true, value: { ...goodModelIr(), elements: 'not-an-array' } }),
    'schema-invalid — missing contentPolicy': async () => {
      const ir = goodModelIr();
      delete ir.idPolicy.contentPolicy;
      return { ok: true, value: ir };
    },
    'schema-invalid — empty object': async () => ({ ok: true, value: {} }),
    'undefined response': async () => undefined,
    'null response': async () => null,
  };

  for (const [label, callModel] of Object.entries(failures)) {
    const { ir, usedPath, reason } = await promptToIrHostedWithMeta(PROMPT, { callModel });
    assert.equal(usedPath, 'keyless', `${label} must fall back to the keyless path`);
    assert.ok(reason && reason.length > 0, `${label} must record why it fell back`);
    assert.equal(validateIr(ir).valid, true, `${label} must still yield a schema-valid IR`);
    // The keyless path still did its job: the prompt's four stats survive.
    assert.equal(ir.cards.count, 4, `${label} must still honour the prompt`);
  }
});

test('the plain form resolves to a valid IR on failure and never rejects', async () => {
  const callModel = async () => {
    throw new Error('provider exploded');
  };
  const ir = await promptToIrHosted(PROMPT, { callModel });
  assert.equal(validateIr(ir).valid, true);
  assert.equal(ir.cards.count, 4);
});

// ---------------------------------------------------------------------
// §16.2 — the no-key state, and the retry budget.
// ---------------------------------------------------------------------

test('with LLM_API_KEY unset the default orchestrator returns ok:false with no network attempt', async () => {
  const saved = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;

  const savedFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => {
    networkCalls += 1;
    throw new Error('hosted path attempted a network call with no key');
  };

  try {
    const { ir, usedPath, reason } = await promptToIrHostedWithMeta(PROMPT);
    assert.equal(usedPath, 'keyless');
    assert.match(reason, /LLM_API_KEY is unset/);
    assert.equal(networkCalls, 0, '§16.2: no network attempt when the key is unset');
    assert.equal(validateIr(ir).valid, true);
  } finally {
    globalThis.fetch = savedFetch;
    if (saved !== undefined) process.env.LLM_API_KEY = saved;
  }
});

test('exactly ONE orchestrator call is made — the retry belongs to the orchestrator (§16.2)', async () => {
  let calls = 0;
  const callModel = async () => {
    calls += 1;
    return { ok: false, error: 'timeout' };
  };
  await promptToIrHostedWithMeta(PROMPT, { callModel });
  assert.equal(calls, 1, 'this module must not add a retry; §16.2 + §18.2 would compose into four attempts');
});

test('the timeout is clamped to §16.2 ceiling and defaults when unusable', async () => {
  const seen = [];
  const callModel = async (args) => {
    seen.push(args.timeoutMs);
    return { ok: false, error: 'x' };
  };

  await promptToIrHostedWithMeta(PROMPT, { callModel });
  await promptToIrHostedWithMeta(PROMPT, { callModel, timeoutMs: 5_000 });
  await promptToIrHostedWithMeta(PROMPT, { callModel, timeoutMs: 999_999 });
  await promptToIrHostedWithMeta(PROMPT, { callModel, timeoutMs: -1 });
  await promptToIrHostedWithMeta(PROMPT, { callModel, timeoutMs: 'soon' });

  assert.deepEqual(seen, [DEFAULT_TIMEOUT_MS, 5_000, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS]);
  assert.equal(MAX_TIMEOUT_MS, 60_000);
});

// ---------------------------------------------------------------------
// §6 / §16.2 — model output is untrusted input.
// ---------------------------------------------------------------------

test('a model that supplies a field ID is rejected, not repaired — §6', async () => {
  const withTopLevelId = () => {
    const ir = goodModelIr();
    ir.cards.items[0].fieldId1 = '3000000001';
    return ir;
  };
  const withNestedId = () => {
    const ir = goodModelIr();
    ir.elements[0].fieldId = '2000000001';
    return ir;
  };

  for (const build of [withTopLevelId, withNestedId]) {
    const { ir, usedPath, reason } = await promptToIrHostedWithMeta(PROMPT, {
      callModel: async () => ({ ok: true, value: build() }),
    });
    assert.equal(usedPath, 'keyless');
    assert.match(reason, /field ID/i);
    // Rejected outright — the stray ID must not survive into the returned IR.
    assert.ok(!/"fieldId\d*"/.test(JSON.stringify(ir)), 'no field ID may reach the caller');
  }
});

test('the module opens no socket of its own — the orchestrator owns every call', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const imports = [...source.matchAll(/^\s*import\s.*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  const forbidden = /^(node:)?(http|https|net|tls|dgram|undici)$|openai|anthropic|axios|node-fetch|got$/i;
  for (const spec of imports) {
    assert.ok(!forbidden.test(spec), `must not import a network-capable module, found "${spec}"`);
  }
  assert.ok(!/\bfetch\s*\(/.test(source), 'must not call fetch() — §16.2 routes every call through the orchestrator');
});

// ---------------------------------------------------------------------
// The fallback must be visible, not silent.
// ---------------------------------------------------------------------

test('a fallback records why in the IR warnings, so the Glass Box can show it', async () => {
  const { ir } = await promptToIrHostedWithMeta(PROMPT, {
    callModel: async () => ({ ok: false, error: 'upstream 503' }),
  });
  const warning = ir.warnings.find((w) => /Hosted model not used/i.test(w));
  assert.ok(warning, 'the fallback must be recorded in the IR');
  assert.match(warning, /upstream 503/);
  assert.match(warning, /keyless/i);
});

test('a successful hosted call adds no fallback warning', async () => {
  const { ir } = await promptToIrHostedWithMeta(PROMPT, {
    callModel: async () => ({ ok: true, value: goodModelIr() }),
  });
  assert.ok(!ir.warnings.some((w) => /Hosted model not used/i.test(w)));
});

test('options pass through to the keyless path on fallback', async () => {
  const { ir } = await promptToIrHostedWithMeta('hero', {
    callModel: async () => ({ ok: false, error: 'nope' }),
    pageName: 'Landing',
    sectionName: 'Feature',
    variations: 2,
  });
  assert.equal(ir.pageName, 'Landing');
  assert.equal(ir.sectionName, 'Feature');
  assert.strictEqual(ir.variations, '2');
  assert.equal(validateIr(ir).valid, true);
});
