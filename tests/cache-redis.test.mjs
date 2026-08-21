import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisCacheSync } from '../server/src/cache/redisCache.js';

test('createRedisCacheSync falls back gracefully if connection fails', async () => {
  const cache = createRedisCacheSync('redis://invalid-host:9999');
  // At this point it's connecting.
  
  // Set something. ensureInit will wait for connect to fail, then fallback
  await cache.cacheSet('ir:fallback_test', { a: 1 }, 10000);
  
  const val = await cache.cacheGet('ir:fallback_test');
  assert.deepEqual(val, { a: 1 });
  
  await cache.cacheDel('ir:fallback_test');
  const val2 = await cache.cacheGet('ir:fallback_test');
  assert.strictEqual(val2, null);
});
