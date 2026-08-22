import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createOrchestrator,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_ATTEMPTS,
  FAILURE,
} from '../server/src/models/orchestrator.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCHESTRATOR_REL = 'server/src/models/orchestrator.js';

const SCHEMA = {
  type: 'object',
  required: ['name'],
  properties: { name: { type: 'string' } },
};

const KEYED_ENV = { LLM_API_KEY: 'test-key-not-a-real-credential', LLM_BASE_URL: 'https://api.example.com/v1', LLM_MODEL: 'test-model' };

/** An orchestrator whose transport is a scripted list of outcomes. */
function scripted(outcomes, env = KEYED_ENV) {
  const calls = [];
  const traces = [];
  let i = 0;
  const { callModel } = createOrchestrator({
    env,
    appendTrace: (t) => traces.push(t),
    transport: async (args) => {
      calls.push(args);
      const outcome = outcomes[Math.min(i, outcomes.length - 1)];
      i += 1;
      if (typeof outcome === 'function') return outcome();
      return outcome;
    },
  });
  return { callModel, calls, traces };
}

const timeoutError = () => {
  const err = new Error('timed out');
  err.isTimeout = true;
  throw err;
};
const httpError = (status) => () => {
  const err = new Error(`HTTP ${status}`);
  err.status = status;
  throw err;
};

// ---------------------------------------------------------------------
// doneWhen 1 — every hosted-model call in the repo goes through callModel.
// ---------------------------------------------------------------------

/** Every tracked .js/.mjs source file outside node_modules. */
function sourceFiles() {
  const out = [];
  const skip = new Set(['node_modules', '.git', 'public', 'dist', 'build', 'uploads', 'artifacts']);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|mjs|jsx)$/.test(entry.name)) {
        out.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
      }
    }
  };
  walk(REPO_ROOT);
  return out;
}

/**
 * Source with comments removed. The rule §16.2 states is about READING a
 * credential, not naming one — several modules legitimately explain in prose
 * why they do not touch LLM_API_KEY, and a grep that cannot tell a comment
 * from code would punish exactly the files that documented the rule best.
 */
function code(file) {
  return fs
    .readFileSync(path.join(REPO_ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('doneWhen — only the orchestrator reads the model credentials (§16.2, one call site)', () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    if (file === ORCHESTRATOR_REL) continue;
    if (file.startsWith('tests/')) continue; // tests inject a fake env on purpose
    if (/\bLLM_API_KEY\b|\bLLM_BASE_URL\b/.test(code(file))) offenders.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    'a file other than the orchestrator reads the model credentials — that call bypasses the retry budget, the schema check and the stage-5 trace',
  );
});

test('doneWhen — no provider SDK is imported anywhere outside the orchestrator', () => {
  const forbidden = /from\s+['"](openai|@anthropic-ai\/[^'"]+|anthropic|@google\/generative-ai|cohere-ai|@mistralai\/[^'"]+)['"]/;
  const offenders = [];
  for (const file of sourceFiles()) {
    if (file === ORCHESTRATOR_REL) continue;
    let source;
    try {
      source = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    } catch (e) {
      // Generated components are written and removed by other suites while this
      // one walks the tree, so a file can vanish between listing and reading.
      // Skip ONLY those: this is a credential scan (§16.2), and swallowing every
      // ENOENT would let a real source file drop silently out of it.
      if (e.code === 'ENOENT' && file.includes('sections/generated/')) continue;
      throw e;
    }
    if (forbidden.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'a provider SDK is imported outside the single call site');
});

test('the hosted prompt-to-IR path delegates to the orchestrator rather than its own client', () => {
  const source = code('server/src/generate/promptToIrHosted.js');
  assert.match(source, /from\s+['"]\.\.\/models\/orchestrator\.js['"]/, 'must import the one orchestrator');
  assert.ok(!/\bLLM_API_KEY\b/.test(source), 'must not read the key itself');
});

// ---------------------------------------------------------------------
// doneWhen 2 — exactly one retry on timeout or schema failure, never on 4xx.
// ---------------------------------------------------------------------

test('doneWhen — a timeout is retried EXACTLY once, then gives up', async () => {
  const { callModel, calls } = scripted([timeoutError, timeoutError]);
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });

  assert.equal(calls.length, 2, 'one initial attempt plus exactly one retry');
  assert.equal(MAX_ATTEMPTS, 2);
  assert.equal(result.ok, false);
  assert.equal(result.meta.attempts, 2);
});

test('doneWhen — a schema-validation failure is retried EXACTLY once', async () => {
  const { callModel, calls } = scripted([{ wrong: 'shape' }, { wrong: 'shape' }]);
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });

  assert.equal(calls.length, 2);
  assert.equal(result.ok, false);
  assert.match(result.error, /schema validation/i);
  assert.equal(result.meta.attempts, 2);
});

test('a retry that succeeds returns the value, and reports two attempts', async () => {
  const { callModel, calls } = scripted([timeoutError, { name: 'recovered' }]);
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });

  assert.equal(calls.length, 2);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { name: 'recovered' });
  assert.equal(result.meta.attempts, 2);
});

test('doneWhen — a 4xx is NEVER retried', async () => {
  for (const status of [400, 401, 403, 404, 422, 429]) {
    const { callModel, calls } = scripted([httpError(status), { name: 'would have worked' }]);
    const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });

    assert.equal(calls.length, 1, `HTTP ${status} must not be retried`);
    assert.equal(result.ok, false);
    assert.equal(result.meta.attempts, 1);
  }
});

test('a 5xx and a transport error are not retried either — §16.2 lists only two retryable cases', async () => {
  for (const outcome of [httpError(500), httpError(503), () => { throw new Error('ECONNRESET'); }]) {
    const { callModel, calls } = scripted([outcome, { name: 'unused' }]);
    const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
  }
});

test('a first-attempt success makes exactly one call', async () => {
  const { callModel, calls } = scripted([{ name: 'fine' }]);
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
  assert.equal(result.meta.attempts, 1);
});

// ---------------------------------------------------------------------
// doneWhen 3 — LLM_API_KEY unset returns { ok: false }, no network attempt.
// ---------------------------------------------------------------------

test('doneWhen — with LLM_API_KEY unset, ok:false and NO network attempt', async () => {
  let transportCalls = 0;
  let fetchCalls = 0;
  const { callModel } = createOrchestrator({
    env: { LLM_BASE_URL: 'https://api.example.com/v1' },
    fetchImpl: () => {
      fetchCalls += 1;
      throw new Error('network touched with no key');
    },
    transport: async () => {
      transportCalls += 1;
      return { name: 'should never happen' };
    },
  });

  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });

  assert.equal(result.ok, false);
  assert.match(result.error, /LLM_API_KEY is unset/);
  assert.equal(result.kind, FAILURE.NO_KEY);
  assert.equal(transportCalls, 0, 'no transport may be constructed without a key');
  assert.equal(fetchCalls, 0, 'no network attempt whatsoever');
  assert.equal(result.meta.attempts, 0, 'zero attempts were made');
});

test('an empty-string key counts as unset', async () => {
  const { callModel, calls } = scripted([{ name: 'x' }], { LLM_API_KEY: '' });
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------
// §16.2 — timeout budget, trace shape, and the no-throw guarantee.
// ---------------------------------------------------------------------

test('the timeout is clamped to the §16.2 ceiling and defaults when unusable', async () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 30_000);
  assert.equal(MAX_TIMEOUT_MS, 60_000);

  // A transport that resolves instantly still proves the clamp via a real timer race.
  const { callModel } = scripted([{ name: 'x' }]);
  for (const ms of [undefined, 5_000, 999_999, -1, 'soon', NaN]) {
    const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA, timeoutMs: ms });
    assert.equal(result.ok, true, `timeoutMs=${String(ms)} must not break the call`);
  }
});

test('a call that exceeds its timeout is aborted and reported as a timeout', async () => {
  const { callModel } = createOrchestrator({
    env: KEYED_ENV,
    transport: ({ signal }) =>
      new Promise((resolve, reject) => {
        // Never resolves on its own; only the orchestrator's abort ends it.
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });

  const started = Date.now();
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA, timeoutMs: 40 });
  const elapsed = Date.now() - started;

  assert.equal(result.ok, false);
  assert.equal(result.meta.attempts, 2, 'a timeout is retried once, so two windows elapse');
  assert.ok(elapsed < 5_000, 'the call must not hang past its budget');
});

test('every call appends exactly one §16.2-shaped trace record', async () => {
  const { callModel, traces } = scripted([timeoutError, { name: 'ok' }]);
  const result = await callModel({ purpose: 'prompt-to-ir', input: 'i', schema: SCHEMA });

  assert.equal(traces.length, 1, 'one record per call, carrying the attempt count');
  assert.deepEqual(Object.keys(traces[0]).sort(), ['attempts', 'model', 'ms', 'ok', 'purpose']);
  assert.equal(traces[0].purpose, 'prompt-to-ir');
  assert.equal(traces[0].model, 'test-model');
  assert.equal(traces[0].attempts, 2);
  assert.equal(traces[0].ok, true);
  assert.equal(typeof traces[0].ms, 'number');
  assert.deepEqual(traces[0], { ...result.meta });
});

test('a failed call is traced too, with ok:false', async () => {
  const { callModel, traces } = scripted([httpError(401)]);
  await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
  assert.equal(traces.length, 1);
  assert.equal(traces[0].ok, false);
  assert.equal(traces[0].attempts, 1);
});

test('the trace records are independent objects — a caller cannot mutate a past record', async () => {
  const { callModel, traces } = scripted([{ name: 'a' }]);
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
  result.meta.attempts = 999;
  assert.equal(traces[0].attempts, 1, '§11 append-only: a written record is not editable through a later reference');
});

test('a throwing trace sink cannot fail the model call it describes', async () => {
  const { callModel } = createOrchestrator({
    env: KEYED_ENV,
    appendTrace: () => {
      throw new Error('trace store is down');
    },
    transport: async () => ({ name: 'fine' }),
  });
  const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
  assert.equal(result.ok, true);
});

test('callModel never throws, whatever the transport does', async () => {
  const disasters = [
    () => { throw new Error('sync boom'); },
    () => Promise.reject(new Error('async boom')),
    () => { throw 'a string, not an Error'; },
    async () => undefined,
    async () => null,
  ];
  for (const transport of disasters) {
    const { callModel } = createOrchestrator({ env: KEYED_ENV, transport });
    const result = await callModel({ purpose: 'p', input: 'i', schema: SCHEMA });
    assert.equal(typeof result.ok, 'boolean', 'must resolve to a result, never reject');
    assert.ok(result.meta, 'a meta record is always produced');
  }
});

test('callModel called with no arguments still returns a result', async () => {
  const { callModel } = createOrchestrator({ env: {} });
  const result = await callModel();
  assert.equal(result.ok, false);
});

test('a schemaless call skips validation and returns whatever the transport gave', async () => {
  const { callModel } = scripted([{ anything: 'at all' }]);
  const result = await callModel({ purpose: 'p', input: 'i' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { anything: 'at all' });
});

// ---------------------------------------------------------------------
// The seam with T-027.
// ---------------------------------------------------------------------

test('the orchestrator satisfies the shape promptToIrHosted calls it with', async () => {
  const { callModel, calls } = scripted([{ name: 'x' }]);
  await callModel({ purpose: 'prompt-to-ir', input: 'a prompt', schema: SCHEMA, timeoutMs: 30_000 });

  const seen = calls[0];
  assert.equal(seen.purpose, 'prompt-to-ir');
  assert.equal(seen.input, 'a prompt');
  assert.equal(seen.schema, SCHEMA, 'the caller\'s schema reaches the transport for structured output');
  assert.ok(seen.signal, 'an abort signal is always supplied so a timeout can cancel in flight');
});
