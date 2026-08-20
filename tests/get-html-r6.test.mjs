import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('getHtml helper strips forbidden tags (R6 / §8)', async () => {
  const { getHtml } = await import('../client/src/utils/getHtml.js');
  
  const bad = 'Before <script>alert("xss")</script> After';
  const clean = getHtml(bad, 'DEFAULT');
  // stripContentTags replaces <script>...</script> with ''
  assert.equal(clean, 'Before  After', 'Script tag must be stripped completely');

  const empty = getHtml(null, 'FALLBACK');
  assert.equal(empty, 'FALLBACK', 'Null must return fallback');
  
  const allowed = getHtml('<b>bold</b> <i>italic</i>', 'FALLBACK');
  assert.equal(allowed, '<b>bold</b> <i>italic</i>', 'Allowed tags must survive');
});

test('HeroSection uses getHtml for text nodes (R6)', () => {
  let source;
  try {
    source = read('client/src/sections/HeroSection.jsx');
  } catch (err) {
    try {
      source = read('client/src/sections/generated/HeroSection.jsx');
    } catch (e) {
      assert.fail('HeroSection.jsx not found');
    }
  }

  assert.match(source, /import \{\s*getHtml\s*\} from ['"].*getHtml(?:\.js)?['"]/, 'Must import getHtml');
  assert.match(source, /dangerouslySetInnerHTML=\{\{\s*__html:\s*getHtml\(/, 'Must use dangerouslySetInnerHTML with getHtml');
});
