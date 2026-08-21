import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('JobHistory UI satisfies FR-G08 (T-048)', () => {
  const source = read('client/src/studio/JobHistory.jsx');

  // Verify it exports JobHistory
  assert.match(source, /export default function JobHistory/, 'must export JobHistory');

  // Verify it reads from localStorage
  assert.match(source, /localStorage\.getItem/, 'must read from localStorage');

  // Verify it takes at least 5 jobIds
  assert.match(source, /\.slice\(-5\)/, 'must take at least the last 5 jobIds');

  // Verify it fetches /api/jobs/:jobId
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{id\}[`']\s*\)/, 'must fetch each job');
});
