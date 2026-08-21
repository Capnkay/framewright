import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('variation 2 selectable (T-069)', () => {
  const previewSource = read('client/src/routes/PreviewPage.jsx');
  
  // PreviewPage should have a dropdown for variation
  assert.match(previewSource, /regenerateVariation/i, 'must manage variation state');
  assert.match(previewSource, /<select[^>]*value=\{regenerateVariation\}/, 'must have select dropdown for variation');
  assert.match(previewSource, /<option value="2">/, 'must have option for variation 2');
  
  // It should send variations to POST /api/sections/:sectionId/regenerate
  assert.match(previewSource, /\/api\/sections\/\${section\.sectionId}\/regenerate/, 'must call regenerate endpoint');
  assert.match(previewSource, /variation:\s*regenerateVariation/, 'must pass variation in body');
});
