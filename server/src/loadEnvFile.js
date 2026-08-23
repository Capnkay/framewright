// server/src/loadEnvFile.js — read `.env` at the repo root into process.env.
//
// Why this exists: `npm run server` starts a bare Node process, so a key sitting in
// `.env` never reached it. Every hosted path (promptToIrHosted, the VLM region reader)
// checks process.env and silently fell back to the deterministic path — correct
// behaviour when there is genuinely no key, and completely invisible when there is one
// sitting on disk. The result was that the API always emitted the reference template
// while the identical call made in-process with the key produced a real, varied IR.
//
// Deliberately dependency-free: `dotenv` is installed in neither package, and a
// twenty-line parser is cheaper than a new dependency. Deliberately non-destructive: a
// variable already present in the real environment always wins, so a shell export, CI
// and the test harness override the file rather than fight it.
//
// AGENTS.md rule 5 is unaffected. A missing file is not an error, and a missing key
// still lands on the deterministic path exactly as before.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_ENV_PATH = path.resolve(HERE, '..', '..', '.env');

/** Parse `.env` text. Returns a plain object; never throws on a malformed line. */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    // Strip one matched pair of surrounding quotes, if present.
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load `.env` into `env` (defaults to process.env) without overwriting anything already
 * set. Returns the names of the keys it applied — names only, so a caller can log what
 * was loaded without logging a secret.
 */
export function loadEnvFile({ envPath = DEFAULT_ENV_PATH, env = process.env } = {}) {
  let text;
  try {
    text = fs.readFileSync(envPath, 'utf8');
  } catch {
    return [];               // no file is the normal case, not a failure
  }
  const applied = [];
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}

export default loadEnvFile;
