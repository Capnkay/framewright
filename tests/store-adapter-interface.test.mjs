import { test } from 'node:test';
import assert from 'node:assert';
import { createStore } from '../server/src/store/index.js';

test('store-adapter-interface exports the exact seven functions', async (t) => {
  const store = createStore({ STORE_TYPE: 'memory' });

  const requiredMethods = [
    'findSections',
    'findSection',
    'insertSection',
    'updateSection',
    'findElements',
    'updateElement',
    'allocateId'
  ];

  for (const method of requiredMethods) {
    assert.strictEqual(typeof store[method], 'function', `Store is missing method: ${method}`);
  }

  const keys = Object.keys(store);
  for (const key of keys) {
    assert.ok(requiredMethods.includes(key), `Store exported unexpected method: ${key}`);
  }
});
