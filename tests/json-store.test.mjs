import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import { createJsonStore } from '../server/src/store/jsonStore.js';

test('50 concurrent allocateId calls return 50 unique, strictly increasing 10-digit IDs', async (t) => {
  const testStorePath = './server/data/test-store.json';
  
  // Setup empty store for testing
  await fs.writeFile(testStorePath, JSON.stringify({
    counters: {
      section: 1000000001,
      element: 2000000001,
      cardField: 3000000001
    },
    sections: [],
    elements: []
  }));

  const store = createJsonStore(testStorePath);

  // Fire 50 concurrent requests
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(store.allocateId('element'));
  }

  const results = await Promise.all(promises);

  // Clean up
  await fs.unlink(testStorePath);

  // Verify unique
  const uniqueSet = new Set(results);
  assert.strictEqual(uniqueSet.size, 50, 'Did not return 50 unique IDs');

  // Verify 10-digit strings
  for (const id of results) {
    assert.strictEqual(typeof id, 'string', 'ID must be a string');
    assert.strictEqual(id.length, 10, 'ID must be exactly 10 digits');
    assert.match(id, /^[0-9]{10}$/, 'ID must contain only digits');
  }

  // Verify strictly increasing
  // The results might be returned in order of resolution which is exactly the call order because of the queue
  // If Promise.all preserves order, we can just check if they are sorted
  const sorted = [...results].sort();
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(results[i], sorted[i], 'IDs were not strictly increasing');
  }
});
