// tests/embedding-rerank.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmbeddingService } from '../server/src/models/embedding.js';
import { lexicalOverlapScore, rerank } from '../server/src/models/rerank.js';

test('embed() returns null when no service configured', async () => {
  const { embed } = createEmbeddingService({ env: {} });
  const result = await embed(['test']);
  assert.equal(result, null);
});

test('embed() calls fetch and caches results', async () => {
  let fetchCalls = 0;
  const fakeFetch = async (url, options) => {
    fetchCalls++;
    const body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        data: body.input.map((t, i) => ({ index: i, embedding: [1, 2, 3] }))
      })
    };
  };

  const map = new Map();
  const fakeCache = {
    cacheGet: async (k) => map.get(k),
    cacheSet: async (k, v) => map.set(k, v)
  };

  const { embed } = createEmbeddingService({
    env: { EMBEDDING_API_KEY: 'test', EMBEDDING_BASE_URL: 'https://embeddings.example.com' },
    fetchImpl: fakeFetch,
    cache: fakeCache
  });

  const res1 = await embed(['test1', 'test2']);
  assert.equal(fetchCalls, 1);
  assert.deepEqual(res1, [[1, 2, 3], [1, 2, 3]]);

  const res2 = await embed(['test1', 'test3']);
  assert.equal(fetchCalls, 2);
  assert.deepEqual(res2, [[1, 2, 3], [1, 2, 3]]);
});

test('lexicalOverlapScore() calculates basic overlap count', () => {
  const score = lexicalOverlapScore('hello beautiful world', 'world is big and beautiful');
  // "beautiful" and "world" overlap -> 2
  assert.equal(score, 2);
});

test('rerank() uses lexical overlap when no embedding service', async () => {
  // We don't have to mock `embed` globally if we just make sure EMBEDDING_API_KEY is not set.
  // The singleton instance reads `process.env`.
  const oldKey = process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_API_KEY;

  try {
    const candidates = ['world is big', 'hello beautiful world', 'nothing'];
    const result = await rerank('hello world', candidates);
    
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 3);
    assert.equal(result[0].index, 1); // "hello beautiful world" (score 2)
    assert.equal(result[1].index, 0); // "world is big" (score 1)
    assert.equal(result[2].index, 2); // "nothing" (score 0)
    
    assert.equal(result[0].score, 2);
    assert.equal(result[1].score, 1);
    assert.equal(result[2].score, 0);
  } finally {
    if (oldKey !== undefined) {
      process.env.EMBEDDING_API_KEY = oldKey;
    }
  }
});
