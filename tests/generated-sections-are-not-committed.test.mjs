import test from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const GENERATED_DIR = path.join('client', 'src', 'sections', 'generated');

function isIgnored(filePath) {
  const gitPath = filePath.split(path.sep).join('/');
  const result = spawnSync('git', ['check-ignore', gitPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });
  return result.status === 0;
}

test('generated sections are ignored by git', () => {
  const dummyFile = path.join(GENERATED_DIR, 'Custom-9999999999-v1.jsx');
  assert.strictEqual(
    isIgnored(dummyFile),
    true,
    `${dummyFile} should be ignored by git`
  );
});

test('golden files are explicitly NOT ignored by git', () => {
  const goldenFiles = [
    'HeroSection.jsx',
    'HeroSection.logic.js',
    'reference/HeroSection-reference.jsx'
  ];

  for (const file of goldenFiles) {
    const fullPath = path.join(GENERATED_DIR, file);
    assert.strictEqual(
      isIgnored(fullPath),
      false,
      `${fullPath} should NOT be ignored by git`
    );
  }
});
