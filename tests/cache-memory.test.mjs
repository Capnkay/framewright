import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCache } from '../server/src/cache/index.js';

test('cache miss returns null rather than throwing', async () => {
  const cache = createCache();
  const val = await cache.cacheGet('ir:nonexistent');
  assert.strictEqual(val, null);
});

test('cacheSet and cacheGet behave correctly for allowed keys', async () => {
  const cache = createCache();
  
  await cache.cacheSet('ir:job123', { ast: true }, 10000);
  const v1 = await cache.cacheGet('ir:job123');
  assert.deepEqual(v1, { ast: true });

  await cache.cacheSet('render:sec1:v1', '<html></html>', 10000);
  const v2 = await cache.cacheGet('render:sec1:v1');
  assert.strictEqual(v2, '<html></html>');

  await cache.cacheSet('embed:sha256abc', [0.1, 0.2], 10000);
  const v3 = await cache.cacheGet('embed:sha256abc');
  assert.deepEqual(v3, [0.1, 0.2]);

  await cache.cacheSet('perceive:sha256def', { text: 'hello' }, 10000);
  const v4 = await cache.cacheGet('perceive:sha256def');
  assert.deepEqual(v4, { text: 'hello' });
});

test('cacheDel removes an item', async () => {
  const cache = createCache();
  await cache.cacheSet('ir:todelete', { data: 1 }, 10000);
  
  const v1 = await cache.cacheGet('ir:todelete');
  assert.deepEqual(v1, { data: 1 });

  await cache.cacheDel('ir:todelete');
  
  const v2 = await cache.cacheGet('ir:todelete');
  assert.strictEqual(v2, null);
});

test('entries expire at their TTL', async () => {
  const cache = createCache();
  await cache.cacheSet('ir:expire_test', { temp: true }, 50); // 50ms TTL

  const v1 = await cache.cacheGet('ir:expire_test');
  assert.deepEqual(v1, { temp: true });

  // Wait for expiration
  await new Promise(resolve => setTimeout(resolve, 60));

  const v2 = await cache.cacheGet('ir:expire_test');
  assert.strictEqual(v2, null);
});

test('adapter rejects invalid keys', async () => {
  const cache = createCache();
  
  await assert.rejects(
    async () => await cache.cacheSet('unknown:123', { data: 1 }, 10000),
    /Invalid cache key/
  );
});

test('adapter rejects element documents', async () => {
  const cache = createCache();
  
  const elementDoc = {
    sectionId: '1000000001',
    elementName: 'headlineMain',
    fieldId: '2000000003',
    content: 'HELLO',
    contentType: 'Text'
  };

  await assert.rejects(
    async () => await cache.cacheSet('ir:elements', elementDoc, 10000),
    /Caching element documents is forbidden/
  );
});

test('adapter rejects section documents', async () => {
  const cache = createCache();
  
  const sectionDoc = {
    sectionName: 'Custom',
    sectionId: '1000000001',
    variations: '2',
    sectionStatus: 'Pending'
  };

  await assert.rejects(
    async () => await cache.cacheSet('ir:sections', sectionDoc, 10000),
    /Caching section documents is forbidden/
  );
});

test('createCache logs warning and falls back to memory if REDIS_URL is provided', async () => {
  const originalWarn = console.warn;
  let warnCalled = false;
  console.warn = (msg) => {
    if (msg.includes('Redis at redis://localhost:6379 is unreachable')) {
      warnCalled = true;
    }
  };

  try {
    const cache = createCache({ REDIS_URL: 'redis://localhost:6379' });
    
    // It should still work as a memory cache
    await cache.cacheSet('ir:fallback', 123, 10000);
    assert.strictEqual(warnCalled, true);
    assert.strictEqual(await cache.cacheGet('ir:fallback'), 123);
  } finally {
    console.warn = originalWarn;
  }
});
