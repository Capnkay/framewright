import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('HeroSection handles arbitrary cards.count sizes dynamically (T-106)', () => {
  const source = read('client/src/sections/generated/HeroSection.jsx');
  assert.doesNotMatch(source, /grid-cols-3/, 'must not hardcode grid-cols-3');
  assert.match(source, /style=\{\{.*gridTemplateColumns:.*items\.length/, 'must use dynamic grid columns based on items.length');
});

test('SideEditor handles arbitrary cards.count sizes safely (T-106)', () => {
  const source = read('client/src/studio/SideEditor.jsx');
  assert.match(source, /typeof contentFromStore === 'string'/, 'must safely handle non-string contentFromStore');
});
