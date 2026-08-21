// server/src/models/embedding.js
import crypto from 'node:crypto';
import { createCache } from '../cache/index.js';

export function createEmbeddingService(deps = {}) {
  const {
    env = process.env,
    fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
    cache = createCache(process.env),
  } = deps;

  async function embed(texts) {
    if (!env.EMBEDDING_API_KEY || !env.EMBEDDING_BASE_URL || !fetchImpl) {
      return null;
    }

    const inputArray = Array.isArray(texts) ? texts : [texts];
    if (inputArray.length === 0) return [];

    const results = new Array(inputArray.length).fill(null);
    const missingTexts = [];
    const missingIndices = [];

    for (let i = 0; i < inputArray.length; i++) {
      const text = inputArray[i] || '';
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      const key = `embed:${hash}`;
      const cached = await cache.cacheGet(key);
      if (cached) {
        results[i] = cached;
      } else {
        missingTexts.push(text);
        missingIndices.push(i);
      }
    }

    if (missingTexts.length === 0) {
      return results;
    }

    try {
      const url = `${env.EMBEDDING_BASE_URL.replace(/\/+$/, '')}/embeddings`;
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.EMBEDDING_API_KEY}`
        },
        body: JSON.stringify({
          input: missingTexts,
          model: env.EMBEDDING_MODEL || 'text-embedding-ada-002'
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data || !data.data || !Array.isArray(data.data)) {
        return null;
      }

      for (let i = 0; i < missingTexts.length; i++) {
        // Handle various return formats of embeddings array
        let vec = null;
        const itemWithIndex = data.data.find(d => d.index === i);
        if (itemWithIndex && itemWithIndex.embedding) {
          vec = itemWithIndex.embedding;
        } else if (data.data[i] && data.data[i].embedding) {
          vec = data.data[i].embedding;
        }

        if (vec) {
          const originalIndex = missingIndices[i];
          results[originalIndex] = vec;
          
          const hash = crypto.createHash('sha256').update(missingTexts[i]).digest('hex');
          await cache.cacheSet(`embed:${hash}`, vec, 24 * 60 * 60 * 1000);
        }
      }
    } catch (err) {
      return null;
    }

    if (results.some(r => r === null)) {
      return null;
    }

    return results;
  }

  return { embed };
}

export const { embed } = createEmbeddingService();
