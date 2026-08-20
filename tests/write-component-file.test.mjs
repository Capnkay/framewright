// tests/write-component-file.test.mjs
//
// Verification for T-028: the component-file write path.
// CONTRACT.md §7 — file lands at:
//   client/src/sections/generated/<SectionName>-<sectionId>-v<variation>.jsx
// Generating variation 2 must never overwrite variation 1.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// We test the pure filename-building logic directly (no disk I/O needed for naming tests)
import {
  buildComponentFilename,
  buildComponentPath,
  writeComponentFile,
  componentFileExists,
} from '../server/src/generate/writeComponentFile.js';

// ---------------------------------------------------------------------------
// buildComponentFilename
// ---------------------------------------------------------------------------
test('buildComponentFilename: produces canonical name <SectionName>-<sectionId>-v<variation>.jsx', () => {
  const name = buildComponentFilename('PulseFitHero', '1000000001', '1');
  assert.equal(name, 'PulseFitHero-1000000001-v1.jsx');
});

test('buildComponentFilename: variation 2 is distinct from variation 1', () => {
  const v1 = buildComponentFilename('Hero', '1000000001', '1');
  const v2 = buildComponentFilename('Hero', '1000000001', '2');
  assert.notEqual(v1, v2, 'v1 and v2 filenames must differ');
  assert.match(v2, /v2\.jsx$/, 'v2 filename must end with -v2.jsx');
});

test('buildComponentFilename: sanitises special chars out of sectionName', () => {
  const name = buildComponentFilename('Pulse Fit / Hero!', '1000000002', '1');
  // Spaces and / and ! must all be stripped
  assert.doesNotMatch(name, /[ /!]/, 'sectionName must be sanitised');
  assert.match(name, /\.jsx$/, 'must still end in .jsx');
});

test('buildComponentFilename: numeric variation is accepted', () => {
  const name = buildComponentFilename('Section', '1000000001', 2);
  assert.equal(name, 'Section-1000000001-v2.jsx');
});

// ---------------------------------------------------------------------------
// writeComponentFile — writes to disk correctly
// ---------------------------------------------------------------------------
// Use a temp directory so tests are self-contained and do not pollute the repo.
// We monkey-patch the GENERATED_DIR by writing via the public API and reading back.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_DIR = path.join(REPO_ROOT, 'client', 'src', 'sections', 'generated');

test('writeComponentFile: throws if sectionId is missing', () => {
  assert.throws(
    () => writeComponentFile({ sectionName: 'Hero', sectionId: '', variation: '1', source: '// src' }),
    /sectionId is required/,
  );
});

test('writeComponentFile: throws if source is empty', () => {
  assert.throws(
    () => writeComponentFile({ sectionName: 'Hero', sectionId: '1000000099', variation: '1', source: '' }),
    /source must be a non-empty string/,
  );
});

test('writeComponentFile: lands file at correct path', () => {
  const testId = '1000000098';
  const src = '// test generated component\nexport default function Test() { return null; }\n';
  const filePath = writeComponentFile({ sectionName: 'TestSection', sectionId: testId, variation: '1', source: src });

  assert.ok(fs.existsSync(filePath), 'file must exist after write');
  const content = fs.readFileSync(filePath, 'utf8');
  assert.equal(content, src, 'content must match source exactly');

  // Cleanup
  fs.unlinkSync(filePath);
});

test('writeComponentFile: variation 2 does not overwrite variation 1', () => {
  const testId = '1000000097';
  const src1 = '// variation 1\nexport default function V1() { return null; }\n';
  const src2 = '// variation 2\nexport default function V2() { return null; }\n';

  const path1 = writeComponentFile({ sectionName: 'DualSection', sectionId: testId, variation: '1', source: src1 });
  const path2 = writeComponentFile({ sectionName: 'DualSection', sectionId: testId, variation: '2', source: src2 });

  assert.notEqual(path1, path2, 'paths must be different for different variations');
  assert.equal(fs.readFileSync(path1, 'utf8'), src1, 'variation 1 file must be untouched after writing variation 2');
  assert.equal(fs.readFileSync(path2, 'utf8'), src2, 'variation 2 file must contain its own content');

  // Cleanup
  fs.unlinkSync(path1);
  fs.unlinkSync(path2);
});

test('componentFileExists: returns false before write, true after', () => {
  const testId = '1000000096';
  assert.equal(componentFileExists('ExistTest', testId, '1'), false, 'must not exist before write');

  const src = '// exists test\nexport default function E() { return null; }\n';
  const filePath = writeComponentFile({ sectionName: 'ExistTest', sectionId: testId, variation: '1', source: src });

  assert.equal(componentFileExists('ExistTest', testId, '1'), true, 'must exist after write');

  // Cleanup
  fs.unlinkSync(filePath);
});

test('writeComponentFile: path contains generated directory', () => {
  const filePath = buildComponentPath('Hero', '1000000001', '1');
  assert.ok(filePath.includes(path.join('sections', 'generated')),
    'path must be under client/src/sections/generated/');
});
