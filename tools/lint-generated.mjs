#!/usr/bin/env node
// tools/lint-generated.mjs
//
// T-034: Hermetic lint gate for generated components — CONTRACT.md §7.
//
// What this checks (without needing ESLint installed):
//
//   1. Every relative import in every generated .jsx / .logic.js file
//      resolves to a real file that exists in this repo.
//
//   2. The two mandatory hand-written helpers that every generated component
//      depends on are importable:
//        - client/src/utils/getHtml.js
//        - client/src/utils/image.js    (getImage + errorImage)
//
//   3. No generated file imports a non-existent path.
//
//   4. No generated file uses eval, new Function, or vm.runInNewContext
//      (a simple text scan, per CONTRACT.md §8 "never eval").
//
// Exit 0 = all clear. Exit 1 = failures found (list printed to stdout).
//
// The contract says "hermetic" — this tool runs on a bare `node tools/lint-generated.mjs`
// with no npm install, no network, no model key.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join(REPO_ROOT, 'client', 'src', 'sections', 'generated');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRelativeImport(fromDir, importPath) {
  // Only check relative imports (starting with . or ..)
  if (!importPath.startsWith('.')) return null; // external/bare specifier — skip
  const candidates = [
    path.resolve(fromDir, importPath),
    path.resolve(fromDir, importPath + '.js'),
    path.resolve(fromDir, importPath + '.jsx'),
    path.resolve(fromDir, importPath + '.mjs'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return false; // not found
}

function extractImports(source) {
  const importPaths = [];
  // Match: import ... from 'path' or import ... from "path"
  const staticImport = /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = staticImport.exec(source)) !== null) {
    importPaths.push(m[1]);
  }
  return importPaths;
}

const FORBIDDEN_PATTERNS = [
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /new\s+Function\s*\(/, label: 'new Function()' },
  { pattern: /vm\.runInNewContext\s*\(/, label: 'vm.runInNewContext()' },
  { pattern: /vm\.runInContext\s*\(/, label: 'vm.runInContext()' },
  { pattern: /require\s*\(\s*['"]child_process['"]/, label: 'require("child_process")' },
];

// ---------------------------------------------------------------------------
// Mandatory helpers check
// ---------------------------------------------------------------------------
const MANDATORY_HELPERS = [
  path.join(REPO_ROOT, 'client', 'src', 'utils', 'getHtml.js'),
  path.join(REPO_ROOT, 'client', 'src', 'utils', 'image.js'),
  path.join(REPO_ROOT, 'client', 'src', 'utils', 'sectionContrast.js'),
  path.join(REPO_ROOT, 'client', 'src', 'redux', 'fetchElementsByIds.js'),
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let failures = 0;
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failures++;
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log('\nFramewright — generated-component lint gate (T-034)\n');

// 1. Check mandatory helpers exist
console.log('1. Mandatory helpers:');
for (const helperPath of MANDATORY_HELPERS) {
  const rel = path.relative(REPO_ROOT, helperPath);
  if (fs.existsSync(helperPath)) {
    ok(rel);
  } else {
    fail(`${rel} — NOT FOUND (hand-written helper is missing)`);
  }
}

// 2. Scan generated files
console.log('\n2. Generated components:');

if (!fs.existsSync(GENERATED_DIR)) {
  console.log('  (generated directory does not exist yet — nothing to lint)');
  console.log('\nResult: PASS (no generated files)\n');
  process.exit(0);
}

const files = fs.readdirSync(GENERATED_DIR).filter(f => f.endsWith('.jsx') || f.endsWith('.js'));

if (files.length === 0) {
  console.log('  (no generated files found — nothing to lint)');
  console.log('\nResult: PASS (no generated files)\n');
  process.exit(0);
}

for (const file of files) {
  const filePath = path.join(GENERATED_DIR, file);
  const source = fs.readFileSync(filePath, 'utf8');
  const rel = path.relative(REPO_ROOT, filePath);

  console.log(`\n  ${rel}:`);

  // a) Import path resolution
  const imports = extractImports(source);
  let importsFailed = false;
  for (const importPath of imports) {
    const result = resolveRelativeImport(path.dirname(filePath), importPath);
    if (result === null) {
      // Bare specifier (react, redux, etc.) — not our problem to resolve
      continue;
    }
    if (result === false) {
      fail(`  import '${importPath}' — does not resolve to a file in this repo`);
      importsFailed = true;
    }
  }
  if (!importsFailed) {
    ok(`  all relative imports resolve`);
  }

  // b) Forbidden patterns
  let forbidden = false;
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) {
      fail(`  contains forbidden pattern: ${label}`);
      forbidden = true;
    }
  }
  if (!forbidden) {
    ok(`  no forbidden patterns (eval, new Function, etc.)`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '─'.repeat(60));
if (failures === 0) {
  console.log(`Result: PASS — ${files.length} file(s) checked, 0 failures.\n`);
  process.exit(0);
} else {
  console.log(`Result: FAIL — ${failures} issue(s) found across ${files.length} file(s).\n`);
  process.exit(1);
}
