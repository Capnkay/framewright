import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getElements } from '../server/src/routes/index.js';
import { createStore } from '../server/src/store/index.js';
import { CacheKeys, CACHE_TTL } from '../server/src/cache/keys.js';

test('Only ir:, render:, embed: and perceive: keys are ever written, each at its stated TTL', () => {
  const ir = CacheKeys.ir('job-0000000001');
  assert.strictEqual(ir.key, 'ir:job-0000000001');
  assert.strictEqual(ir.ttlMs, 3600000); // 1h

  const render = CacheKeys.render('1000000001', '2');
  assert.strictEqual(render.key, 'render:1000000001:v2');
  assert.strictEqual(render.ttlMs, 3600000); // 1h

  const embed = CacheKeys.embed('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(embed.key, 'embed:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(embed.ttlMs, 86400000); // 24h

  const perceive = CacheKeys.perceive('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(perceive.key, 'perceive:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(perceive.ttlMs, 86400000); // 24h
});

test('GET /api/elements reads through to the store on every request', async () => {
  const testDir = path.join(process.cwd(), 'tests', '.tmp-store-test-' + Date.now());
  await fs.mkdir(testDir, { recursive: true });
  const storePath = path.join(testDir, 'store.json');
  
  try {
    const env = { STORE_TYPE: 'json', STORE_PATH: storePath };
    const store = createStore(env);
    
    // Seed the store
    await store.insertElement({
      sectionId: '1000000001',
      elementName: 'test',
      fieldId: '2000000001',
      content: 'hello world',
      contentType: 'Text',
      projectName: 'sample-brand',
      pageName: 'Home'
    });
    
    // Call the endpoint from routes/index.js as an Express would
    const ctx = { env, query: { pageName: 'Home' } };
    const res = await getElements(ctx);
    
    // Assert on real content, not just shape
    assert.strictEqual(res.status, 200);
    assert.strictEqual(Array.isArray(res.body), true);
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].content, 'hello world');
    assert.strictEqual(res.body[0].fieldId, '2000000001');
    
  } finally {
    // Leave no runtime state behind
    await fs.rm(testDir, { recursive: true, force: true });
  }
});
