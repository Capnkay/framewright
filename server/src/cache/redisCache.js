import { createClient } from 'redis';
import { createMemoryCache } from './memoryCache.js';

export function createRedisCacheSync(url) {
  const memoryFallback = createMemoryCache();
  let client = createClient({ 
    url,
    socket: {
      reconnectStrategy: false,
      connectTimeout: 2000
    }
  });
  
  let state = 'connecting'; // 'connecting', 'connected', 'fallback'
  
  const initPromise = client.connect().then(() => {
    state = 'connected';
  }).catch((err) => {
    console.warn(`WARN: Redis at ${url} is unreachable (${err.message}). Falling back to in-process cache.`);
    state = 'fallback';
    client = null;
  });

  if (client) {
    client.on('error', (err) => {
      if (state === 'connected') {
        console.error('Redis Client Error', err);
      }
    });
  }

  async function ensureInit() {
    if (state === 'connecting') {
      await initPromise;
    }
  }

  return {
    async cacheGet(key) {
      await ensureInit();
      if (state === 'fallback') return memoryFallback.cacheGet(key);

      try {
        const data = await client.get(key);
        if (!data) return null;
        return JSON.parse(data);
      } catch (err) {
        console.error('Redis cacheGet error:', err);
        return null;
      }
    },

    async cacheSet(key, value, ttlMs) {
      validateCacheEntry(key, value);
      await ensureInit();
      if (state === 'fallback') return memoryFallback.cacheSet(key, value, ttlMs);

      try {
        const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
        await client.set(key, JSON.stringify(value), { EX: ttlSec });
      } catch (err) {
        console.error('Redis cacheSet error:', err);
      }
    },

    async cacheDel(key) {
      await ensureInit();
      if (state === 'fallback') return memoryFallback.cacheDel(key);

      try {
        await client.del(key);
      } catch (err) {
        console.error('Redis cacheDel error:', err);
      }
    },
    
    async _close() {
      await ensureInit();
      if (client) {
        await client.quit();
      }
    }
  };
}

function validateCacheEntry(key, value) {
  const isValidKey = 
    key.startsWith('ir:') ||
    key.startsWith('render:') ||
    key.startsWith('embed:') ||
    key.startsWith('perceive:');

  if (!isValidKey) {
    throw new Error(`Invalid cache key: ${key}. Only ir:, render:, embed:, and perceive: prefixes are allowed.`);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Reject section documents
    if ('sectionId' in value && 'sectionName' in value) {
      throw new Error('Caching section documents is forbidden by A 15.1');
    }
    // Reject element documents
    if ('fieldId' in value && 'elementName' in value) {
      throw new Error('Caching element documents is forbidden by A 15.1');
    }
  }
}
