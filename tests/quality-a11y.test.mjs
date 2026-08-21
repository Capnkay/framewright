import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAccessibility } from '../server/src/quality/accessibility.js';
import { scorePerformance } from '../server/src/quality/performance.js';

test('Accessibility gate counts violations by impact', async () => {
  const badHtml = `
    <img src="test.jpg" /> <!-- missing alt -->
    <button></button> <!-- missing name/aria-label -->
    <p class="text-gray-400">Low contrast text</p> <!-- A 7 rule -->
    <div data-field-id=""></div> <!-- A 7 rule: empty card id -->
  `;

  const result = await scoreAccessibility(badHtml);
  
  assert.equal(result.ok, true);
  assert.ok(result.violations.critical >= 1, 'Should find critical violations (empty card id / button)');
  assert.ok(result.violations.serious >= 1, 'Should find serious violations (gray-400 body copy)');
  assert.ok(result.violations.minor !== undefined);
  assert.ok(result.violations.moderate !== undefined);
});

test('Performance gate measures bytes and ms', async () => {
  const source = 'export default function Test() { return <div>Hello</div>; }';
  
  let called = false;
  const result = await scorePerformance(source, async () => {
    called = true;
    // simulate render
    await new Promise(r => setTimeout(r, 10));
  });

  assert.equal(result.ok, true);
  assert.equal(result.bytes, Buffer.byteLength(source, 'utf8'));
  assert.ok(result.ms >= 10, 'Should measure ms correctly');
  assert.equal(called, true);
});
