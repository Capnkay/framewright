// tools/check-verify-files.mjs
//
// Asserts that every task whose `verify` command names a test file also DECLARES
// that file in its `files` list.
//
// WHY THIS EXISTS. Four tasks in a row — T-002, T-003, T-005, T-054 — each
// declared a verify command naming a test file its own `files` list omitted.
// Two different builders hit it independently within one afternoon. AGENTS.md
// tells an executor that needs an undeclared file to STOP, so the defect turns
// every affected task into a scope violation before it can be verified at all.
//
// Fixing it one task at a time costs the whole team the same twenty minutes over
// and over. This retires it: run the sweep, patch every mismatch once.
//
//   node tools/check-verify-files.mjs          report only, exits 1 on any mismatch
//   node tools/check-verify-files.mjs --fix    patch _build/tasks.json in place
//
// Zero dependencies, like everything else under tools/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASKS = path.join(REPO_ROOT, '_build', 'tasks.json');

/**
 * The test file a verify command implies, or null when it implies none.
 *
 *   npm test -- api-skeleton                      -> tests/api-skeleton.test.mjs
 *   python -m pytest perception/tests/test_x.py   -> perception/tests/test_x.py
 *
 * Anything else (a lint run, a curl, a manual check) returns null and is skipped
 * rather than guessed at — a false positive here would train people to ignore it.
 */
export function impliedTestFile(verify) {
  if (typeof verify !== 'string' || !verify.trim()) return null;

  const npm = verify.match(/npm\s+test\s+--\s+([\w-]+)/);
  if (npm) return `tests/${npm[1]}.test.mjs`;

  // Any command that mentions pytest — including `node tools/pytest.mjs <path>`,
  // which is how perception tasks invoke it so the venv interpreter is used
  // rather than whatever `python` resolves to (see tools/pytest.mjs).
  if (/pytest/.test(verify)) {
    const target = verify.match(/([\w./-]+\.py)\b/);
    if (target) return target[1];
  }

  return null;
}

function main() {
  const fix = process.argv.includes('--fix');
  const board = JSON.parse(fs.readFileSync(TASKS, 'utf8'));

  const missing = [];
  const absent = [];

  for (const task of board.tasks) {
    const implied = impliedTestFile(task.verify);
    if (!implied) continue;

    const files = Array.isArray(task.files) ? task.files : [];
    if (!files.includes(implied)) {
      missing.push({ task, implied });
      if (fix) task.files = [...files, implied];
    }

    // Separately: does the file exist on disk yet? Only meaningful for tasks
    // already marked done — an open task legitimately has no test written.
    if (!fs.existsSync(path.join(REPO_ROOT, implied))) absent.push({ task, implied });
  }

  if (missing.length === 0) {
    console.log(`OK — every task with a verify declares its test file (${board.tasks.length} tasks checked).`);
  } else {
    console.log(`${missing.length} task(s) name a test their files list omits:\n`);
    for (const { task, implied } of missing) {
      console.log(`  ${task.id}  verify: ${task.verify}`);
      console.log(`         missing from files: ${implied}\n`);
    }
  }

  // Listed only when nothing is FAILING, or when explicitly asked. When the
  // pre-commit hook denies a commit, the operator needs one actionable line —
  // not 75 lines of "no test written yet" scrolling the real message off the
  // screen. An unreadable hook message is how a hook stops being read at all.
  const verbose = process.argv.includes('--verbose');
  if (absent.length) {
    if (missing.length === 0 || verbose) {
      console.log(`\n${absent.length} implied test file(s) do not exist on disk yet.`);
      console.log('That is expected for an unclaimed task and a failure for a done one:');
      for (const { task, implied } of absent) console.log(`  ${task.id}  ${implied}`);
    } else {
      console.log(
        `\n(${absent.length} implied test files also do not exist on disk yet — ` +
          'expected for unclaimed tasks. Re-run with --verbose to list them.)',
      );
    }
  }

  if (fix && missing.length) {
    // Preserve the founding file's ASCII-escaped encoding so the diff stays small.
    const out = JSON.stringify(board, null, 2).replace(
      /[-￿]/g,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    fs.writeFileSync(TASKS, out + '\n');
    console.log(`\nPatched ${missing.length} task(s) in _build/tasks.json.`);
    console.log('Regenerate the board: node -e "import(\'./tools/baton.mjs\').then(m=>m.regenerateBoard(m.loadTasks(),m.loadClaims()))"');
    return 0;
  }

  return missing.length ? 1 : 0;
}

process.exit(main());
