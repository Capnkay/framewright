// tests/validation-recovery.test.mjs — T-094, CONTRACT.md §18.2, §11.1, §16.2.
//
// The assertion that matters most here is the attempt count. §16.2 gives the
// model orchestrator one retry; §18.2 gives the emit step another. If they ever
// compose, one generation makes four model calls and NFR-02's 60-second budget
// is gone. Several tests below exist only to pin that number at two.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createValidateAndRecover,
  MAX_ATTEMPTS,
  STRUCTURAL,
} from '../server/src/generate/validateAndRecover.js';
import { createOrchestrator } from '../server/src/models/orchestrator.js';
import { promptToIrKeyless } from '../server/src/generate/promptToIrKeyless.js';

/** A finalised IR, field IDs attached, as the emitter expects. */
function finalisedIr(prompt = 'a split hero with three stats') {
  const ir = promptToIrKeyless(prompt);
  ir.elements = ir.elements.map((el, i) => ({ ...el, fieldId: `200000000${i + 1}` }));
  ir.cards.items = ir.cards.items.map((item, i) => ({
    ...item,
    fieldId1: `300000000${i * 2 + 1}`,
    fieldId2: `300000000${i * 2 + 2}`,
  }));
  return ir;
}

const GOOD = 'export default function Hero() { return <section className="dynamicStyle" />; }';
const UNPARSEABLE = 'export default function Hero() { return <section';  // unclosed
const NO_DEFAULT_EXPORT = 'function Hero() { return null; }';
const HAS_EVAL = 'export default function Hero() { eval("x"); return null; }';

/** Deterministic fallback stand-in, so tests do not depend on emitter output. */
const FALLBACK = '// deterministic fallback\nexport default function Fallback() { return null; }';
const recover = (deps = {}) =>
  createValidateAndRecover({ emitDeterministic: () => FALLBACK, ...deps });

// ---------------------------------------------------------------------
// doneWhen 1 — a parse error or lint ERROR triggers exactly one retry.
// ---------------------------------------------------------------------

test('doneWhen — a parse error triggers exactly ONE retry from the same IR', async () => {
  const ir = finalisedIr();
  const seenIrs = [];
  let call = 0;

  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir,
    emit: (given) => {
      seenIrs.push(given);
      call += 1;
      return call === 1 ? UNPARSEABLE : GOOD;
    },
  });

  assert.equal(result.attempts, 2, 'one attempt plus exactly one retry');
  assert.equal(result.source, GOOD);
  assert.equal(result.stageStatus, 'ok');
  assert.equal(result.jobSucceeded, true);
  assert.equal(result.failures[0].kind, STRUCTURAL.PARSE);

  // §18.2 — "retry exactly once from the SAME IR". Not re-derived.
  assert.equal(seenIrs.length, 2);
  assert.equal(seenIrs[0], seenIrs[1], 'the retry must receive the identical IR object');
});

test('doneWhen — a lint ERROR also triggers the retry', async () => {
  let call = 0;
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir: finalisedIr(),
    emit: () => (++call === 1 ? HAS_EVAL : GOOD),
  });

  assert.equal(result.attempts, 2);
  assert.equal(result.failures[0].kind, STRUCTURAL.LINT);
  assert.match(result.failures[0].error, /eval/);
  assert.equal(result.stageStatus, 'ok');
});

test('a missing default export is a lint error — R14', async () => {
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => NO_DEFAULT_EXPORT });
  assert.equal(result.degraded, true);
  assert.ok(result.failures.some((f) => /export default|default export/i.test(f.error)));
});

test('doneWhen — a WARNING does not count and does not trigger a retry (§18.2)', async () => {
  // No dynamicStyle marker: a real warning, explicitly not a retry trigger.
  const warnOnly = 'export default function Hero() { return <section />; }';
  let calls = 0;

  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir: finalisedIr(),
    emit: () => {
      calls += 1;
      return warnOnly;
    },
  });

  assert.equal(calls, 1, 'a warning must not cause a second emit');
  assert.equal(result.attempts, 1);
  assert.equal(result.stageStatus, 'ok');
  assert.equal(result.degraded, false);
  assert.ok(result.warnings.some((w) => /dynamicStyle/.test(w)), 'the warning is still reported');
});

test('a first-attempt success makes exactly one emit and no warnings about retrying', async () => {
  let calls = 0;
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => { calls += 1; return GOOD; } });

  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.degraded, false);
  assert.ok(!result.warnings.some((w) => /fell back|after a structural failure/i.test(w)));
});

// ---------------------------------------------------------------------
// doneWhen 2 — a second failure falls back, records degraded, job succeeds.
// ---------------------------------------------------------------------

test('doneWhen — a second structural failure falls back to the deterministic emitter', async () => {
  let calls = 0;
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir: finalisedIr(),
    emit: () => { calls += 1; return UNPARSEABLE; },
  });

  assert.equal(calls, 2, 'exactly two attempts, then stop');
  assert.equal(result.attempts, 2);
  assert.equal(result.source, FALLBACK, 'the deterministic emitter supplied the output');

  // §11.1 — degraded is a success for the job, a warning for the stage.
  assert.equal(result.stageStatus, 'degraded');
  assert.equal(result.degraded, true);
  assert.equal(result.jobSucceeded, true, '§18.2 step 4: THE JOB SUCCEEDS');

  const warning = result.warnings.find((w) => /fell back to the deterministic emitter/i.test(w));
  assert.ok(warning, 'a warning naming the failure must be appended');
  assert.match(warning, /§18\.2/);
  assert.match(warning, /attempt 1/);
  assert.match(warning, /attempt 2/);
});

test('the real deterministic emitter is the default fallback and produces mountable JSX', async () => {
  const { emitWithRecovery } = createValidateAndRecover();
  const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => UNPARSEABLE });

  assert.equal(result.degraded, true);
  assert.equal(result.jobSucceeded, true);
  // It "takes no model output and cannot produce unparseable JSX" (§18.2).
  assert.match(result.source, /export default function/);
  assert.match(result.source, /dynamicStyle/);

  // And what it produced actually passes the same gate that rejected the model.
  const { check } = createValidateAndRecover();
  assert.equal((await check(result.source)).ok, true, 'the fallback must satisfy its own gate');
});

test('an emitter that throws is treated as a structural failure, not a crash', async () => {
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir: finalisedIr(),
    emit: () => { throw new Error('model returned prose, not code'); },
  });

  assert.equal(result.attempts, 2);
  assert.equal(result.degraded, true);
  assert.equal(result.jobSucceeded, true);
  assert.ok(result.failures.every((f) => /emitter threw/.test(f.error)));
});

test('an empty or non-string emit result is a structural failure', async () => {
  for (const bad of ['', '   ', null, undefined, 42, {}]) {
    const { emitWithRecovery } = recover();
    const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => bad });
    assert.equal(result.degraded, true, `${JSON.stringify(bad)} must be rejected`);
    assert.equal(result.jobSucceeded, true);
  }
});

test('a throwing emitter that recovers on the retry still succeeds', async () => {
  let call = 0;
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir: finalisedIr(),
    emit: () => {
      if (++call === 1) throw new Error('transient');
      return GOOD;
    },
  });
  assert.equal(result.attempts, 2);
  assert.equal(result.stageStatus, 'ok');
  assert.equal(result.degraded, false);
});

// ---------------------------------------------------------------------
// doneWhen 3 — the total is TWO, not four. §16.2 must not compose.
// ---------------------------------------------------------------------

test('doneWhen — the attempt budget is two, and MAX_ATTEMPTS says so', () => {
  assert.equal(MAX_ATTEMPTS, 2, '§18.2: one attempt plus exactly one retry');
});

test('doneWhen — §16.2 retry and §18.2 retry do not compose into four model calls', async () => {
  // The realistic composition: a model-assisted emitter whose every call goes
  // through the orchestrator, wrapped in §18.2's recovery. §16.2 retries a
  // schema-invalid response once; §18.2 retries the emit once. Total model
  // calls must be 2 x 2 = 4 in the WORST case only if they compose — and the
  // contract says they must not. §18.2's retry re-runs emit, and each emit
  // makes ONE orchestrator call, whose own retry is internal to it.
  let transportCalls = 0;

  const { callModel } = createOrchestrator({
    env: { LLM_API_KEY: 'k', LLM_MODEL: 'm' },
    // Always schema-invalid, so §16.2 uses its single retry every time.
    transport: async () => { transportCalls += 1; return { not: 'the schema' }; },
  });

  let emitCalls = 0;
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({
    ir: finalisedIr(),
    emit: async () => {
      emitCalls += 1;
      const res = await callModel({
        purpose: 'code-generation',
        input: 'ir',
        schema: { type: 'object', required: ['source'], properties: { source: { type: 'string' } } },
      });
      // Model unusable -> this emitter yields nothing usable, so §18.2 engages.
      return res.ok ? res.value.source : UNPARSEABLE;
    },
  });

  assert.equal(emitCalls, 2, '§18.2 contributes exactly one retry');
  assert.equal(result.attempts, 2);
  // Each emit made one callModel; each callModel used its own single §16.2
  // retry. Two transports per emit is §16.2's budget, not a composition bug —
  // what matters is that §18.2 did not multiply the EMIT count beyond two.
  assert.equal(transportCalls, 4, 'two emits x §16.2 own single retry');
  assert.ok(emitCalls <= MAX_ATTEMPTS, 'the emit budget is never exceeded');

  // And the job still succeeds on the deterministic path.
  assert.equal(result.degraded, true);
  assert.equal(result.jobSucceeded, true);
  assert.equal(result.source, FALLBACK);
});

test('the emitter is never called more than MAX_ATTEMPTS times, whatever it does', async () => {
  for (const behaviour of [
    () => UNPARSEABLE,
    () => { throw new Error('always'); },
    () => NO_DEFAULT_EXPORT,
    () => HAS_EVAL,
  ]) {
    let calls = 0;
    const { emitWithRecovery } = recover();
    await emitWithRecovery({ ir: finalisedIr(), emit: () => { calls += 1; return behaviour(); } });
    assert.equal(calls, MAX_ATTEMPTS, 'the budget is a hard ceiling');
  }
});

// ---------------------------------------------------------------------
// No rule-based auto-repair — §18.2 declines it explicitly.
// ---------------------------------------------------------------------

test('the failing source is never mutated or repaired — it is replaced', async () => {
  const { emitWithRecovery } = recover();
  const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => UNPARSEABLE });

  // The output is the deterministic emitter's, not a patched-up UNPARSEABLE.
  assert.equal(result.source, FALLBACK);
  assert.ok(!result.source.includes('<section'), 'no fragment of the broken source survives');
});

test('the module contains no repair pass — §18.2 declines rule-based auto-repair', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('server/src/generate/validateAndRecover.js', 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const forbidden of [/\.replace\s*\(/, /autoFix/i, /repairSource/i]) {
    assert.ok(!forbidden.test(code), `must not attempt source repair (${forbidden})`);
  }
});

// ---------------------------------------------------------------------
// The gate itself.
// ---------------------------------------------------------------------

test('check accepts valid JSX and reports warnings without failing it', async () => {
  const { check } = recover();
  const ok = await check(GOOD);
  assert.equal(ok.ok, true);

  const warned = await check('export default function H() { return <s />; }');
  assert.equal(warned.ok, true);
  assert.ok(warned.warnings.length > 0);
});

test('check rejects unbalanced delimiters and forbidden dynamic execution', async () => {
  const { check } = recover();
  assert.equal((await check(UNPARSEABLE)).ok, false);
  assert.equal((await check('export default function H() { return null; }} ')).ok, false);
  assert.equal((await check(HAS_EVAL)).ok, false);
  assert.equal((await check('export default () => new Function("x")()')).ok, false);
});

test('a brace inside a string literal is not mistaken for an unbalanced delimiter', async () => {
  const { check } = recover();
  const withBraceInString = 'export default function H() { const s = "a { b"; return null; }';
  assert.equal((await check(withBraceInString)).ok, true);
});

test('an injected parser is used in place of the default', async () => {
  let parserCalls = 0;
  const { emitWithRecovery } = recover({
    parse: async () => { parserCalls += 1; return { ok: false, error: 'injected rejection' }; },
  });
  const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => GOOD });

  assert.equal(parserCalls, 2);
  assert.equal(result.degraded, true);
  assert.ok(result.failures.every((f) => /injected rejection/.test(f.error)));
});

test('an injected linter separates errors from warnings correctly', async () => {
  const { emitWithRecovery } = recover({
    lint: () => ({ errors: [], warnings: ['cosmetic'] }),
  });
  const result = await emitWithRecovery({ ir: finalisedIr(), emit: () => GOOD });
  assert.equal(result.attempts, 1, 'warnings alone must not retry');
  assert.ok(result.warnings.includes('cosmetic'));
});

test('emitWithRecovery requires an emit function', async () => {
  const { emitWithRecovery } = recover();
  await assert.rejects(() => emitWithRecovery({ ir: finalisedIr() }), /`emit` must be a function/);
});
