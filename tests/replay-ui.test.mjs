import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('JobTimeline UI supports replay from stage (T-064)', () => {
  const source = read('client/src/studio/JobTimeline.jsx');

  // Verify it fetches POST /api/jobs/:jobId/replay
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{job\.jobId\}\/replay[`']/, 'must POST to replay endpoint');
  assert.match(source, /method:\s*['"]POST['"]/, 'must be POST');
  
  // Verify it handles 422 with plain language
  assert.match(source, /422/, 'must handle 422 error explicitly');
  assert.match(source, /Perception service/, 'must provide plain language for 422 error');

  // Verify it renders a button
  assert.match(source, /<button[\s\S]*Replay/, 'must render replay button');
});
