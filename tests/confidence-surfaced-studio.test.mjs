import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('confidence surfaced (T-068)', () => {
  const badgeSource = read('client/src/studio/ConfidenceBadge.jsx');
  
  // A 10 bands
  assert.match(badgeSource, /0\.85/, 'must check 0.85 band');
  assert.match(badgeSource, /0\.60/, 'must check 0.60 band');
  assert.match(badgeSource, /bg-red-/, 'must have red style');
  assert.match(badgeSource, /bg-green-/, 'must have green style');
  assert.match(badgeSource, /bg-amber-/, 'must have amber style');
  
  const sideEditor = read('client/src/studio/SideEditor.jsx');
  assert.match(sideEditor, /<ConfidenceBadge/, 'must use badge in SideEditor');
});
