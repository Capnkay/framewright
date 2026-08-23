// tools/design2code/fetch.mjs
//
// Fetch a deterministic subset of the Design2Code corpus — T-160.
//
// WHAT THE CORPUS IS, stated plainly because it decides how the results may be
// read. Design2Code (SALT-NLP/Design2Code, ODC-BY) is 484 pairs of a RENDERED
// WEBPAGE SCREENSHOT and the HTML that produced it. It is not a wireframe
// corpus. The screenshots carry real type, real buttons and real colour, with a
// solid blue rectangle standing in for every image.
//
// WHY WE USE IT ANYWAY, and for exactly one thing. Framewright's claim under
// test is §18's: that the critic loop stops the generator inventing copy. That
// needs many (image, known-text) pairs, and this corpus is 484 of them for free
// — the ground truth is recoverable from the paired .html. What it is NOT is a
// measure of whether Framewright builds the right page: the pipeline emits ONE
// CMS section from a fixed template family (§3's seven slots), and these are
// full pages. T-153 already records that a wireframe of anything comes back as
// the reference section's slots. Read the structural numbers as template
// coverage, and the text numbers as the thing being measured.
//
// DETERMINISM IS THE POINT OF THIS FILE. A benchmark whose corpus changes
// between runs cannot show a delta, and the delta is the entire deliverable —
// critic on versus critic off. So the subset is chosen by a seeded shuffle over
// the SORTED file list, which makes `--n 50 --seed 1` the same fifty samples on
// every machine and every day.
//
// THE CACHE IS GITIGNORED AND THE NETWORK IS ONLY HERE. Nothing downstream
// fetches: scoring reads the cache. That keeps AGENTS.md rule 5's posture — no
// step of the measurement requires a network once the corpus is on disk — and
// keeps a few hundred megabytes of someone else's data out of the history.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CACHE_DIR = path.join(ROOT, '.cache/design2code');

const REPO = 'SALT-NLP/Design2Code';
const API = `https://huggingface.co/api/datasets/${REPO}`;
const FILE = (name) => `https://huggingface.co/datasets/${REPO}/resolve/main/${name}`;

/**
 * A seeded PRNG — mulberry32.
 *
 * Deliberately NOT Math.random(): the subset must be reproducible from the seed
 * alone, so that a number in BENCHMARK-RESULTS.md can be re-derived by someone
 * who has only the seed and this file.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, driven by the seeded PRNG. */
function seededShuffle(items, seed) {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The sample ids the corpus offers, sorted.
 *
 * Sorted BEFORE the shuffle because the API's own ordering is not promised to
 * be stable; seeding a shuffle over an unstable list would produce a different
 * subset from the same seed, which is the one thing this must not do.
 */
export async function listSampleIds({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(API);
  if (!res.ok) throw new Error(`Design2Code index returned ${res.status}`);
  const meta = await res.json();

  const ids = new Set();
  for (const sibling of meta.siblings || []) {
    const m = /^(\d+)\.png$/.exec(sibling.rfilename || '');
    if (m) ids.add(m[1]);
  }
  return [...ids].sort((a, b) => Number(a) - Number(b));
}

/** One sample's on-disk paths. Pure — no IO, so scoring can resolve without fetching. */
export function samplePaths(id, cacheDir = CACHE_DIR) {
  return {
    id,
    png: path.join(cacheDir, `${id}.png`),
    html: path.join(cacheDir, `${id}.html`),
  };
}

async function exists(p) {
  try {
    const st = await fs.stat(p);
    return st.size > 0;
  } catch {
    return false;
  }
}

async function download(url, dest, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

/**
 * fetchSubset({ n, seed }) -> [{ id, png, html }]
 *
 * Resumable by construction: a sample whose two files are already on disk is
 * skipped. A 50-sample run interrupted at 30 costs 20 downloads, not 50.
 */
export async function fetchSubset({
  n = 50,
  seed = 1,
  cacheDir = CACHE_DIR,
  fetchImpl = fetch,
  log = () => {},
} = {}) {
  await fs.mkdir(cacheDir, { recursive: true });

  const all = await listSampleIds({ fetchImpl });
  const chosen = seededShuffle(all, seed).slice(0, n);
  log(`corpus ${all.length} samples; taking ${chosen.length} at seed ${seed}`);

  const out = [];
  let fetched = 0;
  let cached = 0;

  for (const id of chosen) {
    const paths = samplePaths(id, cacheDir);
    const have = (await exists(paths.png)) && (await exists(paths.html));
    if (have) {
      cached += 1;
    } else {
      // Sequential on purpose. This is a courtesy fetch against someone else's
      // free bandwidth, and fifty files do not need a thundering herd.
      await download(FILE(`${id}.png`), paths.png, fetchImpl);
      await download(FILE(`${id}.html`), paths.html, fetchImpl);
      fetched += 1;
      if (fetched % 10 === 0) log(`  fetched ${fetched}…`);
    }
    out.push(paths);
  }

  log(`ready: ${out.length} samples (${cached} cached, ${fetched} downloaded)`);
  return out;
}

// --- CLI -------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetch.mjs')) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : Number(process.argv[i + 1]);
  };
  fetchSubset({ n: arg('n', 50), seed: arg('seed', 1), log: (m) => console.log(m) }).catch((err) => {
    console.error('fetch failed:', err.message);
    process.exitCode = 1;
  });
}

export default fetchSubset;
