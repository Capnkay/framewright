import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('ErrorBanner UI satisfies FR-G05 (T-047)', () => {
  const source = read('client/src/studio/ErrorBanner.jsx');

  // Verify it exports ErrorBanner
  assert.match(source, /export default function ErrorBanner/, 'must export ErrorBanner');

  // Verify non-technical message mapping for 400, 413, 422, 500
  assert.match(source, /400:/, 'must map 400 error');
  assert.match(source, /413:/, 'must map 413 error');
  assert.match(source, /422:/, 'must map 422 error');
  assert.match(source, /500:/, 'must map 500 error');
  
  // Verify it doesn't just show the raw code
  assert.doesNotMatch(source, /Error: \{statusCode\}/, 'must not just show raw status code');
});

test('GenerationProgress UI satisfies FR-G05 (T-047)', () => {
  const source = read('client/src/studio/GenerationProgress.jsx');

  // Verify it exports GenerationProgress
  assert.match(source, /export default function GenerationProgress/, 'must export GenerationProgress');

  // Verify it polls
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}[`']\s*\)/, 'must fetch job');
  assert.match(source, /setTimeout\(.*pollJob/, 'must poll job status');

  // Verify it shows all 7 stages
  assert.match(source, /\[1, 2, 3, 4, 5, 6, 7\]/, 'must iterate all 7 stages');
});
