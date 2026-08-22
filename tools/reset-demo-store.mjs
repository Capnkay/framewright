// Reset the local demo store to a clean seed.
//
// WHY THIS EXISTS. A store that has been running for weeks accumulates every test
// run. Measured before this was written: 163 sections on `Home`, of which 54 had a
// component file on this machine and 109 did not — so the preview page opened with
// a hundred sections that could not render, and the real ones were somewhere past
// them.
//
// That is test residue, not a product defect, and the fix is data rather than code.
//
// NOT DESTRUCTIVE WITHOUT A COPY. The current store and job store are moved aside
// with a timestamp rather than deleted, because "reset the demo store" is exactly
// the command someone runs an hour before a demo on the wrong machine.
//
//     node tools/reset-demo-store.mjs            # back up, reseed
//     node tools/reset-demo-store.mjs --dry-run  # say what it would do
//
// The generated components under client/src/sections/generated/ are NOT touched.
// They are gitignored machine output and stale ones are simply not rendered now,
// but deleting other people's files is a decision this script does not get to make.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStore } from '../server/src/store/index.js';
import { seedStore } from '../server/src/store/seed.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(REPO_ROOT, 'server', 'data');
const STORE = path.join(DATA_DIR, 'store.json');
const JOBS = path.join(DATA_DIR, 'jobs.json');

const dryRun = process.argv.includes('--dry-run');

async function describe(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    const sections = data.sections?.length ?? 0;
    const elements = data.elements?.length ?? 0;
    const jobs = data.jobs?.length ?? 0;
    return { sections, elements, jobs };
  } catch {
    return null;
  }
}

const before = { store: await describe(STORE), jobs: await describe(JOBS) };
console.log('current store:');
console.log(`  sections : ${before.store?.sections ?? '-'}`);
console.log(`  elements : ${before.store?.elements ?? '-'}`);
console.log(`  jobs     : ${before.jobs?.jobs ?? '-'}`);

if (dryRun) {
  console.log('\n--dry-run: nothing was changed.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const file of [STORE, JOBS]) {
  try {
    await fs.rename(file, `${file}.${stamp}.bak`);
    console.log(`\nmoved aside: ${path.basename(file)} -> ${path.basename(file)}.${stamp}.bak`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

const store = createStore({ STORE_PATH: STORE, MONGODB_URI: '' });
await seedStore(store);

const after = await describe(STORE);
console.log('\nreseeded:');
console.log(`  sections : ${after?.sections ?? 0}`);
console.log(`  elements : ${after?.elements ?? 0}`);
console.log('\nRestart the API so it reads the new file.');
