// tools/test.mjs — the test runner behind `npm test`.
//
// WHY THIS FILE EXISTS. The root test script used to be:
//
//     node --test tests/**/*.mjs
//
// and every task on the board declares a verify command of the shape
// `npm test -- <filter>`. That filter was a no-op. npm appends the extra
// argument, the shell had already expanded the glob, and `node --test` either
// ignored it or was handed a path that changed nothing — so
// `npm test -- zzz-does-not-exist` ran all 13 golden tests and exited 0.
//
// That made every verify command on the board indistinguishable from every
// other one. `baton done T-002` would have passed with no server/ directory and
// no test written, because the golden component's tests pass. BATON.md says the
// verification "cannot be skipped" and that it "decides"; it could not decide
// anything, and a verification nobody trusts is worse than none, because people
// route around it.
//
// So:
//   npm test                 -> runs every tests/**/*.test.mjs
//   npm test -- api-skeleton -> runs only tests matching that filter
//   npm test -- nonsense     -> EXITS NON-ZERO, naming the file it expected
//
// That last line is the whole point. A task whose verify names a test file that
// nobody has written yet must FAIL, not pass by inheriting someone else's green
// suite.
//
// Zero dependencies, on purpose: `npm test` works on a fresh clone with no
// `npm install`, and this file must not be the thing that breaks that.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_DIR = path.join(REPO_ROOT, 'tests');

/** Every *.test.mjs under tests/, recursively, as repo-relative paths. */
function collectTestFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectTestFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      found.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

const filter = process.argv[2];
const all = collectTestFiles(TESTS_DIR);

if (all.length === 0) {
  console.error('No test files found under tests/. Expected at least one *.test.mjs.');
  process.exit(1);
}

let selected = all;

if (filter) {
  // A filter matches on the file's basename with the .test.mjs suffix removed,
  // so `api-skeleton` selects tests/api-skeleton.test.mjs. Substring rather than
  // exact match, so `store` selects both store-adapter and store-json suites.
  selected = all.filter((file) => path.basename(file, '.test.mjs').includes(filter));

  if (selected.length === 0) {
    console.error(`\nNo test file matches "${filter}".`);
    console.error(`Expected something like: tests/${filter}.test.mjs\n`);
    console.error('This is a real failure, not a runner quirk. A task whose verify');
    console.error('command names a test that does not exist is not done — see');
    console.error('docs/BATON.md and docs/VERIFICATION.md.\n');
    console.error(`Test files that do exist (${all.length}):`);
    for (const file of all) console.error(`  ${file}`);
    process.exit(1);
  }

  console.log(`Filter "${filter}" selected ${selected.length} of ${all.length} test files:`);
  for (const file of selected) console.log(`  ${file}`);
  console.log('');
}

const result = spawnSync(process.execPath, ['--test', ...selected], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);
