// tools/pytest.mjs — runs pytest on the PERCEPTION interpreter, not whatever
// `python` happens to be first on PATH.
//
// WHY THIS EXISTS. T-055's verify command was `python -m pytest
// perception/tests/test_normalise.py`. `baton done` ran it, `python` resolved to
// the system 3.14 which has no OpenCV, and the task could not be closed even
// though its tests pass. The perception dependencies live in perception/.venv —
// they have to, because the CUDA torch build is cp310 and the system interpreter
// is not (docs/EDGE-CASES.md EC-012).
//
// Hard-coding the venv's path into tasks.json was not an option: it differs per
// platform (Scripts/ on Windows, bin/ on POSIX) and an absolute local path in a
// tracked file is a §14 violation — it leaks a real username.
//
// So the verify command names this script and this script finds the interpreter:
//
//     node tools/pytest.mjs perception/tests/test_normalise.py
//
// IT FAILS RATHER THAN FALLING BACK to the system interpreter when the venv is
// absent. A perception test run against an interpreter with no OpenCV does not
// report "perception is broken", it reports an ImportError three frames deep, and
// the person reading it goes looking for a bug that is not there. A clear "build
// the venv, here is how" is worth more than a run that technically happened.
//
// Zero dependencies, like everything else in tools/.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENV = path.join(REPO_ROOT, 'perception', '.venv');

const CANDIDATES = [
  path.join(VENV, 'Scripts', 'python.exe'), // Windows
  path.join(VENV, 'bin', 'python'), // POSIX
];

function findInterpreter() {
  return CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

const target = process.argv.slice(2);
if (target.length === 0) {
  console.error('usage: node tools/pytest.mjs <path-to-test> [more pytest args]');
  process.exit(1);
}

const python = findInterpreter();

if (!python) {
  console.error('\nThe perception virtual environment does not exist.\n');
  console.error(`Looked for:\n  ${CANDIDATES.join('\n  ')}\n`);
  console.error('Perception tasks need OpenCV and the CUDA torch build, and those live in');
  console.error('perception/.venv on PYTHON 3.10 — the cu124 wheels are cp310 and the system');
  console.error('interpreter is not. Build it with SETUP.md section 7, then check that');
  console.error('GET /health reports cuda:0 before running anything else.\n');
  console.error('This is deliberately NOT falling back to the system interpreter: a');
  console.error('perception test there fails with an ImportError that reads like a code bug.\n');
  process.exit(1);
}

console.log(`pytest on ${path.relative(REPO_ROOT, python).split(path.sep).join('/')}`);

const result = spawnSync(python, ['-m', 'pytest', ...target], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);
