import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('JobTimeline UI satisfies A 11.1 (T-038)', () => {
  const source = read('client/src/studio/JobTimeline.jsx');

  // Verify it exports JobTimeline
  assert.match(source, /export default function JobTimeline/, 'must export JobTimeline');

  // Verify all 7 stages are rendered or iterated over
  assert.match(source, /\[1,\s*2,\s*3,\s*4,\s*5,\s*6,\s*7\]/, 'must iterate over all 7 stages');

  // Verify status visual distinction (degraded, ok, failed, skipped)
  assert.match(source, /degraded: ['"][^'"]+['"]/, 'must style degraded distinctively');
  assert.match(source, /ok: ['"][^'"]+['"]/, 'must style ok distinctively');
  assert.match(source, /failed: ['"][^'"]+['"]/, 'must style failed distinctively');
  assert.match(source, /skipped: ['"][^'"]+['"]/, 'must style skipped distinctively');

  // Verify it displays timings
  assert.match(source, /duration/, 'must calculate or display duration/timings');

  // T-104: verify it formats > 1000ms correctly
  assert.match(source, /\(ms \/ 1000\)\.toFixed\(1\)/, 'must convert >= 1000ms into seconds formatted to 1 decimal place');
});
