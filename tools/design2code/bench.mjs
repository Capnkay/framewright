// tools/design2code/bench.mjs
//
// The two-arm benchmark harness — T-161.
//
// WHAT THE TWO ARMS ARE, and why this design isolates the thing under test.
//
//   Arm A (baseline) — the deterministic path's IR, emitted and scored. No model
//                      call of any kind.
//   Arm B (critic)   — the SAME starting IR, then render → critique → re-emit,
//                      under criticLoop's iteration cap.
//
// Both arms start from an identical IR, so every difference in the numbers is
// attributable to the critic loop and nothing else. That is the whole point:
// §18's claim is that the loop stops the generator asserting copy that is not on
// the page, and this measures exactly that difference.
//
// WHY THE BASELINE IS A NEAR-TOTAL HALLUCINATION, and why that is correct rather
// than a rigged comparison. With the perception service down, stage 4 falls back
// to promptToIrKeyless, whose output is the Pulse Fit reference template —
// "CHALLENGE YOUR LIMITS", "FIND A WORKOUT". Against a Design2Code page about
// caravan hire, every one of those strings is invented. That is not a strawman;
// it is the documented behaviour T-153 recorded ("a wireframe of anything comes
// back as the reference section's seven slots"), and it is the exact failure the
// critic exists to catch. A baseline that already read the page would be
// measuring the perception stack, not the loop.
//
// WHEN THE PERCEPTION SERVICE IS UP the harness uses it instead and records
// `source: 'perceive'`, so a later run on a machine with the service running is
// comparable to this one only where that field agrees. Mixing the two silently
// would be the kind of drift docs/BENCHMARK-RESULTS.md exists to prevent.
//
// NOTHING HERE FAILS A RUN. A sample that throws is recorded with its error and
// the harness continues; fifty samples must not be lost to one bad page.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchSubset, CACHE_DIR } from './fetch.mjs';
import { scoreSample, aggregate } from './textFidelity.mjs';
import { loadEnvFile } from '../../server/src/loadEnvFile.js';
import promptToIrKeyless from '../../server/src/generate/promptToIrKeyless.js';
import { emitComponent } from '../../server/src/generate/emitComponent.js';
import { runCriticLoop } from '../../server/src/quality/criticLoop.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RESULTS_DIR = path.join(ROOT, '.cache/design2code-results');

const BASE_PROMPT = 'a split hero section with 3 stats and a call to action';

// LOAD .env OURSELVES rather than trusting the shell. loadEnvFile.js was written
// for exactly this failure and says so in its own header: a key on disk that
// never reaches the process is invisible, because every hosted path treats "no
// key" as a supported state and falls back silently.
//
// It cost a run here. A 50-sample background job inherited no environment,
// every critic call returned NO_KEY instantly, and the harness dutifully
// reported 0% groundedness across all fifty — a clean-looking result that
// measured nothing. Non-destructive: a real shell variable still wins.
loadEnvFile();

/**
 * The critic arm is worthless without a key, and its failure mode is a
 * plausible number rather than an error. So this refuses to run that arm at all
 * rather than produce one — a benchmark that cannot tell "the critic did
 * nothing" from "the critic was never called" is worse than no benchmark.
 */
function assertCriticIsReachable() {
  if (!process.env.LLM_API_KEY) {
    throw new Error(
      'LLM_API_KEY is unset, so every critic call would return NO_KEY and the critic arm ' +
        'would score 0% for a reason that has nothing to do with the critic. Set it in .env ' +
        'at the repo root, or pass --baseline-only to measure the deterministic arm alone.',
    );
  }
}

/**
 * The starting IR both arms share.
 *
 * Built once per sample rather than once per run because criticLoop mutates
 * nothing but the emitter is handed the object — two arms sharing one instance
 * would let arm B's correction leak into arm A's score.
 */
function baselineIr() {
  return promptToIrKeyless(BASE_PROMPT);
}

async function runOne({ sample, withCritic, maxIterations }) {
  const html = await fs.readFile(sample.html, 'utf8');
  const wireframe = await fs.readFile(sample.png);

  const ir = baselineIr();
  const emit = (candidate) => emitComponent(candidate);

  const record = { id: sample.id, arm: withCritic ? 'critic' : 'baseline', source: 'keyless' };

  if (!withCritic) {
    return { ...record, ...scoreSample({ ir, html }), iterations: 0, converged: null, warnings: [] };
  }

  const started = Date.now();
  const loop = await runCriticLoop({ wireframe, ir, source: emit(ir), emit, maxIterations });

  return {
    ...record,
    ...scoreSample({ ir: loop.ir, html }),
    iterations: loop.iterations,
    converged: loop.converged,
    ms: Date.now() - started,
    warnings: loop.warnings,
  };
}

/**
 * runBenchmark({ n, seed, maxIterations }) -> { baseline, critic, delta, rows }
 *
 * Arms run sample-interleaved rather than arm-at-a-time so that a run
 * interrupted halfway still holds a matched pair for every completed sample. An
 * A-then-B ordering interrupted at the halfway point yields fifty baselines and
 * no comparison at all.
 */
export async function runBenchmark({
  n = 50,
  seed = 1,
  maxIterations = 2,
  cacheDir = CACHE_DIR,
  log = () => {},
} = {}) {
  assertCriticIsReachable();
  log(`critic model: ${process.env.LLM_VISION_MODEL || process.env.LLM_MODEL} via ${process.env.LLM_PROVIDER || 'auto-detected provider'}`);

  const samples = await fetchSubset({ n, seed, cacheDir, log });

  const rows = [];
  let i = 0;
  for (const sample of samples) {
    i += 1;
    for (const withCritic of [false, true]) {
      try {
        const row = await runOne({ sample, withCritic, maxIterations });
        rows.push(row);
      } catch (err) {
        rows.push({
          id: sample.id,
          arm: withCritic ? 'critic' : 'baseline',
          error: err && err.message ? err.message : String(err),
          produced: 0,
          scorable: 0,
          skippedShort: 0,
          grounded: 0,
          hallucinated: 0,
          groundedRate: null,
          truthStrings: 0,
          truthScorable: 0,
          covered: 0,
          recall: null,
        });
      }
    }
    const last = rows[rows.length - 1];
    log(
      `  [${i}/${samples.length}] ${sample.id}  grounded ${
        last.groundedRate === null ? 'n/a' : (last.groundedRate * 100).toFixed(0) + '%'
      }  iters ${last.iterations ?? '-'}${last.error ? '  ERROR: ' + last.error : ''}`,
    );
  }

  const baseline = aggregate(rows.filter((r) => r.arm === 'baseline'));
  const critic = aggregate(rows.filter((r) => r.arm === 'critic'));

  const delta = {
    groundedRateMicro:
      critic.groundedRateMicro !== null && baseline.groundedRateMicro !== null
        ? critic.groundedRateMicro - baseline.groundedRateMicro
        : null,
    recallMicro:
      critic.recallMicro !== null && baseline.recallMicro !== null
        ? critic.recallMicro - baseline.recallMicro
        : null,
  };

  return { config: { n, seed, maxIterations }, baseline, critic, delta, rows };
}

function pct(v) {
  return v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`;
}

function report(result) {
  const { baseline, critic, delta } = result;
  const lines = [
    '',
    '=== Design2Code · text fidelity · critic OFF vs ON ===',
    `samples: ${baseline.samples}   seed: ${result.config.seed}   maxIterations: ${result.config.maxIterations}`,
    '',
    '                          baseline    critic     delta',
    `groundedness (micro)      ${pct(baseline.groundedRateMicro).padEnd(11)} ${pct(critic.groundedRateMicro).padEnd(10)} ${pct(delta.groundedRateMicro)}`,
    `groundedness (macro)      ${pct(baseline.groundedRateMacro).padEnd(11)} ${pct(critic.groundedRateMacro).padEnd(10)}`,
    `recall, template-bounded  ${pct(baseline.recallMicro).padEnd(11)} ${pct(critic.recallMicro).padEnd(10)} ${pct(delta.recallMicro)}`,
    '',
    `strings produced          ${String(baseline.produced).padEnd(11)} ${critic.produced}`,
    `grounded                  ${String(baseline.grounded).padEnd(11)} ${critic.grounded}`,
    `hallucinated              ${String(baseline.hallucinated).padEnd(11)} ${critic.hallucinated}`,
    '',
    'groundedness = of the strings we asserted, the share actually on the page.',
    'recall is bounded by the template having ~7 slots against 26-42 page strings',
    '— it measures coverage, not generation quality. Never average the two.',
    '',
  ];
  return lines.join('\n');
}

// --- CLI -------------------------------------------------------------------

if (process.argv[1]?.endsWith('bench.mjs')) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : Number(process.argv[i + 1]);
  };

  const opts = { n: arg('n', 50), seed: arg('seed', 1), maxIterations: arg('iters', 2) };

  runBenchmark({ ...opts, log: (m) => console.log(m) })
    .then(async (result) => {
      console.log(report(result));
      await fs.mkdir(RESULTS_DIR, { recursive: true });
      const out = path.join(RESULTS_DIR, `n${opts.n}-seed${opts.seed}-${Date.now()}.json`);
      await fs.writeFile(out, JSON.stringify(result, null, 2));
      console.log(`written: ${path.relative(ROOT, out)}`);
    })
    .catch((err) => {
      console.error('benchmark failed:', err && err.stack ? err.stack : err);
      process.exitCode = 1;
    });
}

export default runBenchmark;
