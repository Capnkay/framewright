// tools/resolve-board-conflict.mjs
//
// Resolves the three files that conflict on almost every concurrent push, and
// nothing else. Run it mid-rebase, then `git rebase --continue`.
//
//     node tools/resolve-board-conflict.mjs
//
// WHY THIS EXISTS. Six pushes in one afternoon hit a conflict on the same three
// paths, because two builders work the same board continuously:
//
//   _build/STATE.md   generated from tasks.json — never hand-merge, regenerate
//   _build/TASKS.md   same
//   REGISTER.md       append-only — never pick a side, keep both
//
// The resolution is mechanical and identical every time, which makes it exactly
// the thing to automate: a mechanical step done by hand six times is a mistake
// waiting for the seventh, and the mistake here is silent — picking one side of
// an append-only register deletes somebody's finding without a trace.
//
// WHAT IT DELIBERATELY WILL NOT TOUCH. Any other conflicted file, including
// _build/tasks.json. tasks.json is a real merge: two people adding different
// tasks, or editing the same one, need a human to decide. Automating that would
// be how a task quietly disappears. If tasks.json is conflicted this script says
// so and exits non-zero.
//
// Zero dependencies.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GENERATED = ['_build/STATE.md', '_build/TASKS.md'];
const APPEND_ONLY = ['docs/corrections/REGISTER.md'];

const CONFLICT_RE = /<<<<<<< [^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g;

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function conflictedFiles() {
  return git(['diff', '--name-only', '--diff-filter=U'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Keep BOTH sides, in order: upstream's text, then ours. */
function keepBothSides(file) {
  const full = path.join(REPO_ROOT, file);
  const before = fs.readFileSync(full, 'utf8');
  let kept = 0;
  const after = before.replace(CONFLICT_RE, (_match, theirs, mine) => {
    kept += 1;
    return theirs + mine;
  });
  if (kept === 0) return 0;
  fs.writeFileSync(full, after);
  return kept;
}

const conflicted = conflictedFiles();

if (conflicted.length === 0) {
  console.log('No conflicted files. Nothing to do.');
  process.exit(0);
}

const unknown = conflicted.filter(
  (file) => !GENERATED.includes(file) && !APPEND_ONLY.includes(file),
);

if (unknown.length) {
  console.error('This script only handles the three files that conflict mechanically.\n');
  console.error('Conflicted, and NOT handled here — resolve these by hand first:');
  for (const file of unknown) console.error(`  ${file}`);
  console.error('\n_build/tasks.json in particular is a real merge: two people adding');
  console.error('different tasks, or editing the same one, needs a human. Automating it');
  console.error('is how a task quietly disappears.\n');
  process.exit(1);
}

for (const file of conflicted.filter((f) => APPEND_ONLY.includes(f))) {
  const kept = keepBothSides(file);
  console.log(`${file}: kept both sides of ${kept} conflict(s) — append-only, no side is dropped`);
}

// The generated files are rebuilt from the merged board rather than merged. Any
// hand-resolution of them is guesswork that STATE.md's own header forbids:
// "Never hand-edit this file — it is overwritten on every `baton done`."
const { loadTasks, loadClaims, regenerateBoard } = await import('./baton.mjs');
regenerateBoard(loadTasks(), loadClaims());
for (const file of conflicted.filter((f) => GENERATED.includes(f))) {
  console.log(`${file}: regenerated from the merged tasks.json + claims`);
}

git(['add', ...conflicted]);

console.log(`\nStaged ${conflicted.length} file(s). Now run:  git rebase --continue`);
