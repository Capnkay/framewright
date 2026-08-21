import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('SideEditor UI validates CSS against A 8 (T-053)', () => {
  const source = read('client/src/studio/SideEditor.jsx');

  // Verify it exports SideEditor
  assert.match(source, /export default function SideEditor/, 'must export SideEditor');

  // Verify client-side CSS parsing
  assert.match(source, /\.split\(['`"];['`"]\)/, 'must split CSS by semicolon');
  assert.match(source, /\.split\(['`"]:['`"]\)/, 'must split declarations by colon');
  
  // Verify allow-list
  const expectedProps = ['color', 'background-color', 'font-size', 'font-weight', 'text-align', 'margin', 'padding', 'border', 'border-radius'];
  for (const prop of expectedProps) {
    assert.match(source, new RegExp(`['"\`]${prop}['"\`]`), `must allow ${prop}`);
  }

  // Verify rejection message
  assert.match(source, /setError\([^)]*not allowed/, 'must set error when property is not allowed');
});
