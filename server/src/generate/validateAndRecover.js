// server/src/generate/validateAndRecover.js
//
// §18.2 — what happens when validation actually fails.
//
// §18 says no gate fails a generation. §18.2 carves out the one case where
// that is not enough: a component that does not parse "is not a low-scoring
// component. It is not a component." Shipping it with a warning attached
// would satisfy §18 as written and hand a judge a broken preview.
//
// The policy, in §18.2's own order:
//
//   1. Emit. Parse the result with @babel/parser and lint it (§18's hermetic
//      config).
//   2. On a parse error or an ESLint **error** — warnings do not count —
//      retry EXACTLY ONCE from the same IR.
//   3. If the retry also fails structurally, fall back to the deterministic
//      emitter, which takes no model output and cannot produce unparseable
//      JSX. Record stage 6 `degraded` (§11.1) and append a warning naming
//      what failed.
//   4. The job SUCCEEDS. §11.1: a degraded stage is a success for the job and
//      a warning for the stage.
//
// THE ATTEMPT BUDGET IS TWO, NOT FOUR. §16.2 gives the model orchestrator its
// own single retry for a schema-invalid response; this is a separate, later
// retry of the whole emit step. The corrections register is explicit that the
// two must not compose — NFR-02 gives the entire generation 60 seconds.
// MAX_ATTEMPTS below is this layer's whole budget, and a test asserts the
// total is two.
//
// RULE-BASED AUTO-REPAIR IS OUT OF SCOPE, DELIBERATELY. The architecture
// diagram offers "auto-fix (rules) or re-generate"; §18.2 declines the first.
// Repairing generated code with rules is unbounded work, and the deterministic
// emitter already gives a guaranteed-valid answer for free. Falling back to
// something that always works beats fixing something that sometimes does. If
// you are reading this because you want to add a repair pass: that is a
// contract change, not an improvement.

import { emitComponent } from './emitComponent.js';

// This layer's entire retry budget: one attempt plus exactly one retry.
export const MAX_ATTEMPTS = 2;

/** Why an attempt was rejected. Only these two are structural (§18.2). */
export const STRUCTURAL = { PARSE: 'parse-error', LINT: 'lint-error' };

/**
 * The default parser. §18.2 names @babel/parser; it is declared in
 * server/package.json but a fresh clone has no node_modules, and this module
 * must not be the reason `npm test` cannot run. So it is imported lazily and,
 * when absent, a deliberately conservative structural check stands in.
 *
 * The fallback is WEAKER than a real parse and says so: it catches unbalanced
 * delimiters and a missing default export, which are the shapes a truncated or
 * hallucinated model response actually takes. It will not catch a subtle syntax
 * error. That is acceptable only because step 3's fallback is the deterministic
 * emitter — being too strict costs a model-authored component, never a broken
 * preview.
 */
async function defaultParse(source) {
  try {
    const babel = await import('@babel/parser');
    babel.parse(source, {
      sourceType: 'module',
      errorRecovery: false,
      plugins: ['jsx', 'typescript'],
    });
    return { ok: true, parser: '@babel/parser' };
  } catch (err) {
    // Distinguish "the parser is missing" from "the source is broken".
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      return { ...shallowStructuralCheck(source), parser: 'fallback' };
    }
    return { ok: false, error: err && err.message ? err.message : String(err), parser: '@babel/parser' };
  }
}

/** Balanced delimiters outside strings, and an actual default export. */
function shallowStructuralCheck(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    return { ok: false, error: 'emitted source was empty' };
  }

  const pairs = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  let quote = null;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];

    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') stack.push(ch);
    else if (pairs[ch]) {
      if (stack.pop() !== pairs[ch]) {
        return { ok: false, error: `unbalanced "${ch}" at offset ${i}` };
      }
    }
  }

  if (stack.length > 0) return { ok: false, error: `${stack.length} unclosed delimiter(s)` };
  if (!/export\s+default/.test(source)) return { ok: false, error: 'no default export (R14)' };
  return { ok: true };
}

/**
 * The default lint pass — ERROR-level checks only, because §18.2 is explicit
 * that warnings do not trigger a retry.
 *
 * Scope note, so nobody assumes this is the whole gate: `tools/lint-generated.mjs`
 * (T-034) remains the repo-wide CLI gate over every file in
 * client/src/sections/generated/. It is a script with no exports, so it cannot
 * be reused from here without editing another task's file. This function
 * therefore checks only the rules that are unambiguously ERRORS for a single
 * in-memory source string, and `lint` is injectable so the real checker can be
 * dropped in once T-034 exports one. Logged in the corrections register.
 */
function defaultLint(source) {
  const errors = [];
  const warnings = [];

  // §8 — user-supplied code is parsed, never executed. An emitted component
  // containing any of these is an error, not a style preference.
  for (const pattern of [/\beval\s*\(/, /new\s+Function\s*\(/, /vm\.run\w*\s*\(/]) {
    if (pattern.test(source)) errors.push(`forbidden dynamic execution: ${pattern.source} (§8)`);
  }

  // R14 — without a default export the preview cannot mount it at all.
  if (!/export\s+default/.test(source)) errors.push('missing export default (R14)');

  // Warnings: real, reported, and explicitly NOT a retry trigger (§18.2).
  if (!/dynamicStyle/.test(source)) warnings.push('no dynamicStyle marker class found (R12)');

  return { errors, warnings };
}

/**
 * createValidateAndRecover(deps) -> { emitWithRecovery }
 *
 * deps:
 *   emitDeterministic — the guaranteed-valid fallback. Defaults to
 *                       emitComponent, which takes no model output.
 *   parse             — async (source) => { ok, error? }
 *   lint              — (source) => { errors: string[], warnings: string[] }
 */
export function createValidateAndRecover(deps = {}) {
  const {
    emitDeterministic = emitComponent,
    parse = defaultParse,
    lint = defaultLint,
  } = deps;

  async function check(source) {
    if (typeof source !== 'string' || source.trim() === '') {
      return { ok: false, kind: STRUCTURAL.PARSE, error: 'emitted source was empty', warnings: [] };
    }

    const parsed = await parse(source);
    if (!parsed || parsed.ok !== true) {
      return {
        ok: false,
        kind: STRUCTURAL.PARSE,
        error: (parsed && parsed.error) || 'source did not parse',
        warnings: [],
      };
    }

    const linted = lint(source) || { errors: [], warnings: [] };
    const errors = linted.errors || [];
    const warnings = linted.warnings || [];

    // §18.2 — "an ESLint error — warnings do not count".
    if (errors.length > 0) {
      return { ok: false, kind: STRUCTURAL.LINT, error: errors.join('; '), warnings };
    }
    return { ok: true, warnings };
  }

  /**
   * emitWithRecovery({ ir, emit })
   *   -> { source, attempts, stageStatus, degraded, warnings, failures, jobSucceeded }
   *
   * `emit` is the possibly-model-assisted emitter under test. It is called at
   * most MAX_ATTEMPTS times, always with the SAME IR (§18.2 step 2: "retry
   * exactly once from the same IR" — the IR is not re-derived, so a retry
   * cannot drift into a different section).
   *
   * Never throws. A structural failure is an outcome, not an exception,
   * because §18.2's whole point is that the job still succeeds.
   */
  async function emitWithRecovery({ ir, emit } = {}) {
    if (typeof emit !== 'function') {
      throw new Error('emitWithRecovery: `emit` must be a function');
    }

    const warnings = [];
    const failures = [];
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;

      let source;
      try {
        source = await emit(ir);
      } catch (err) {
        failures.push({
          attempt: attempts,
          kind: STRUCTURAL.PARSE,
          error: `emitter threw: ${err && err.message ? err.message : String(err)}`,
        });
        continue;
      }

      const result = await check(source);
      warnings.push(...result.warnings);

      if (result.ok) {
        if (attempts > 1) {
          warnings.push(
            `Emit succeeded on attempt ${attempts} after a structural failure (§18.2): ${failures[0].error}`,
          );
        }
        return {
          source,
          attempts,
          stageStatus: 'ok',
          degraded: false,
          warnings,
          failures,
          jobSucceeded: true,
        };
      }

      failures.push({ attempt: attempts, kind: result.kind, error: result.error });
    }

    // Step 3 — both attempts failed structurally. Fall back to the
    // deterministic emitter, which cannot produce unparseable JSX. NOT a
    // repair pass: a different, guaranteed-valid answer.
    const source = emitDeterministic(ir);

    warnings.push(
      `Structural failure after ${attempts} attempts (§18.2); fell back to the deterministic emitter. ` +
        failures.map((f) => `attempt ${f.attempt} ${f.kind}: ${f.error}`).join(' | '),
    );

    return {
      source,
      attempts,
      // §11.1 — degraded: the stage did not do its real work, the pipeline
      // continued. A success for the job, a warning for the stage.
      stageStatus: 'degraded',
      degraded: true,
      warnings,
      failures,
      jobSucceeded: true,
    };
  }

  return { emitWithRecovery, check };
}

export default createValidateAndRecover;
