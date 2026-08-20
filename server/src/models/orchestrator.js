// server/src/models/orchestrator.js
//
// The model orchestrator — CONTRACT.md §16.2.
//
// "Every hosted-model call in the system goes through one orchestrator.
// Stage 5 does not call a provider directly, and neither does anything else."
//
// This file is that one call site. It is the ONLY place in the repository
// permitted to read LLM_API_KEY / LLM_BASE_URL or to open a socket to a model
// provider, and tests/model-orchestrator.test.mjs greps the tree to keep it
// that way. The reason is not tidiness: a direct provider call bypasses the
// single-retry budget, the schema check, and the stage-5 trace, all three of
// which are contract requirements rather than conveniences.
//
// §16.2's table, implemented line by line:
//
//   Timeout    — default 30 s, hard ceiling 60 s (NFR-02's budget).
//   Retries    — EXACTLY ONE, on timeout or a schema-validation failure.
//                Never on a 4xx.
//   Validation — the response is validated against the CALLER's schema before
//                it is returned. An invalid response is a failure, not a value.
//   Fallback   — on final failure this returns { ok: false }. It never throws,
//                because the caller's job is to fall back to the deterministic
//                path, not to catch an exception.
//   Trace      — every call appends { purpose, model, ms, attempts, ok } to the
//                job's stage-5 record. §11's append-only rule applies: a retry
//                appends, it never overwrites.
//   Keys       — LLM_API_KEY unset returns { ok: false } immediately, with NO
//                network attempt. §16.2 calls this "a supported state, not an
//                error", and it is the normal state of the deterministic demo.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not sanitise. §16.2 says model
// output "is validated against a schema, and any string that reaches an
// element's content is sanitised write-side per §8" — write-side sanitisation
// is the API's chokepoint (T-030), at the moment content is persisted, not
// here. Sanitising in two places would produce two allow-lists that drift.
// Nor does it reject field IDs: that rule is IR-specific (§6) and belongs to
// the IR-shaped caller, which already enforces it. This module is schema-
// agnostic on purpose.

import { validateAgainstSchema } from '../validate/irValidator.js';

// §16.2 — default 30 s, hard ceiling 60 s, inherited from NFR-02.
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 60_000;

// One initial attempt plus EXACTLY ONE retry. §18.2 adds a separate, later
// retry of the whole emit step; the corrections register is explicit that the
// two must not compose into four attempts. This constant is the whole budget
// for this layer.
export const MAX_ATTEMPTS = 2;

export const DEFAULT_MODEL = 'unspecified-model';

/** Why an attempt failed, and whether §16.2 permits retrying it. */
export const FAILURE = {
  NO_KEY: 'no-key',
  TIMEOUT: 'timeout',
  SCHEMA: 'schema',
  CLIENT_ERROR: 'client-error', // 4xx
  SERVER_ERROR: 'server-error', // 5xx
  TRANSPORT: 'transport', // socket died, DNS, malformed JSON
};

/**
 * §16.2 names exactly two retryable conditions: "Exactly one, on timeout or a
 * schema-validation failure. Never on a 4xx."
 *
 * A 5xx and a transport error are therefore NOT retried. That is the literal
 * reading, and it is also the right one for this system: the fallback is the
 * deterministic keyless path, which is instant and always works, so spending
 * another 30-second timeout window to maybe avoid it is a bad trade against
 * NFR-02's 60-second budget for the entire generation. Recorded here because
 * "never on a 4xx" could be misread as "retry everything else".
 */
function isRetryable(kind) {
  return kind === FAILURE.TIMEOUT || kind === FAILURE.SCHEMA;
}

function clampTimeout(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(ms, MAX_TIMEOUT_MS);
}

/**
 * Races a promise against a timer, aborting the in-flight request on expiry.
 *
 * The `timedOut` flag is load-bearing, not defensive styling. `abort()`
 * dispatches synchronously, so a transport that rejects on its abort signal
 * settles the race BEFORE the timer's own rejection runs — and the error that
 * surfaces is then the transport's generic AbortError, not the timeout. Left
 * to `Promise.race` alone, a genuine timeout gets classified as a transport
 * error and §16.2's "exactly one retry on timeout" silently never fires.
 * Whatever error wins the race, if the timer fired, this was a timeout.
 */
async function withTimeout(fn, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;

  const makeTimeoutError = () => {
    const err = new Error(`model call timed out after ${timeoutMs}ms`);
    err.isTimeout = true;
    return err;
  };

  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(makeTimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } catch (err) {
    throw timedOut ? makeTimeoutError() : err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The default transport: an OpenAI-compatible structured-output call.
 *
 * This is the ONLY function in the repository that opens a socket to a model
 * provider. It is injectable so that every test in this suite drives the
 * orchestrator's logic without a network, and so that swapping providers is a
 * change to one function rather than to every call site.
 */
async function defaultTransport({ baseUrl, apiKey, model, input, schema, signal, fetchImpl }) {
  const response = await fetchImpl(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: String(input) }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'structured_output', strict: true, schema },
      },
    }),
  });

  if (!response.ok) {
    const err = new Error(`model provider returned ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('model response carried no message content');
  }
  return JSON.parse(content);
}

function classify(err) {
  if (err && err.isTimeout) return FAILURE.TIMEOUT;
  if (err && typeof err.status === 'number') {
    if (err.status >= 400 && err.status < 500) return FAILURE.CLIENT_ERROR;
    return FAILURE.SERVER_ERROR;
  }
  return FAILURE.TRANSPORT;
}

/**
 * createOrchestrator(deps) -> { callModel }
 *
 * deps (all optional, all injectable so tests never touch a network):
 *   env         — defaults to process.env. LLM_API_KEY, LLM_BASE_URL, LLM_MODEL.
 *   fetchImpl   — defaults to global fetch.
 *   transport   — defaults to the OpenAI-compatible call above.
 *   appendTrace — ({ purpose, model, ms, attempts, ok }) => void. Defaults to a
 *                 no-op; T-023's stage-trace writer supplies the real one, and
 *                 §11's append-only rule is that writer's contract, not ours —
 *                 we only ever hand it one finished record per call.
 *   now         — () => ms, for deterministic timing in tests.
 */
export function createOrchestrator(deps = {}) {
  const {
    env = process.env,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
    transport = defaultTransport,
    appendTrace = () => {},
    now = () => Date.now(),
  } = deps;

  /**
   * callModel({ purpose, input, schema, timeoutMs })
   *   -> { ok: true, value, meta } | { ok: false, error, meta }
   *
   * Never throws. §16.2: "On final failure the orchestrator returns
   * { ok: false }. The caller falls back to the deterministic path — it never
   * propagates the failure to the user as a crash."
   */
  async function callModel({ purpose, input, schema, timeoutMs } = {}) {
    const started = now();
    const model = env.LLM_MODEL || DEFAULT_MODEL;

    const finish = (result, attempts) => {
      const meta = { purpose, model, ms: now() - started, attempts, ok: result.ok };
      // The trace must never be able to fail the call it is describing.
      try {
        appendTrace({ ...meta });
      } catch {
        /* a broken trace sink is not a model failure */
      }
      return { ...result, meta };
    };

    // §16.2 Keys — unset means { ok: false } immediately, no network attempt.
    // Checked before anything else so no transport is even constructed.
    const apiKey = env.LLM_API_KEY;
    if (!apiKey) {
      return finish({ ok: false, error: 'LLM_API_KEY is unset', kind: FAILURE.NO_KEY }, 0);
    }
    if (typeof fetchImpl !== 'function' && transport === defaultTransport) {
      return finish({ ok: false, error: 'no fetch implementation available', kind: FAILURE.TRANSPORT }, 0);
    }

    const budget = clampTimeout(timeoutMs);
    const baseUrl = env.LLM_BASE_URL || '';
    let last = { ok: false, error: 'model call was never attempted', kind: FAILURE.TRANSPORT };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let value;
      try {
        value = await withTimeout(
          (signal) => transport({ baseUrl, apiKey, model, input, schema, signal, fetchImpl, purpose }),
          budget,
        );
      } catch (err) {
        const kind = classify(err);
        last = { ok: false, error: err && err.message ? err.message : String(err), kind };
        if (!isRetryable(kind) || attempt === MAX_ATTEMPTS) return finish(last, attempt);
        continue;
      }

      // §16.2 Validation — an invalid response is a failure, not a value.
      if (schema) {
        const result = validateAgainstSchema(value, schema);
        if (!result.valid) {
          const first = result.errors[0];
          last = {
            ok: false,
            error: `model output failed schema validation (${first ? `${first.path}: ${first.message}` : 'unknown'})`,
            kind: FAILURE.SCHEMA,
          };
          if (attempt === MAX_ATTEMPTS) return finish(last, attempt);
          continue;
        }
      }

      return finish({ ok: true, value }, attempt);
    }

    return finish(last, MAX_ATTEMPTS);
  }

  return { callModel };
}

// The process-wide default instance. Callers that do not need to inject
// anything import this directly — one orchestrator, per §16.2.
export const { callModel } = createOrchestrator();

export default callModel;
