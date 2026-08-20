import { test } from 'node:test';
import assert from 'node:assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMongoStore } from '../server/src/store/mongoStore.js';

test('mongo-store allocateId is atomic under concurrent calls', async (t) => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  
  const store = createMongoStore(uri);

  // Fire 50 concurrent requests
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(store.allocateId('element'));
  }

  const results = await Promise.all(promises);

  // Clean up
  await store.close();
  await mongod.stop();

  // Verify unique
  const uniqueSet = new Set(results);
  assert.strictEqual(uniqueSet.size, 50, 'Did not return 50 unique IDs');

  // Verify 10-digit strings
  for (const id of results) {
    assert.strictEqual(typeof id, 'string', 'ID must be a string');
    assert.strictEqual(id.length, 10, 'ID must be exactly 10 digits');
    assert.match(id, /^[0-9]{10}$/, 'ID must contain only digits');
  }
});
