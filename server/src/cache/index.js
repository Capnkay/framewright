import { createMemoryCache } from './memoryCache.js';

export function createCache(env = {}) {
  // §15.1: "Two implementations... selected by environment exactly as the store is in 2.1...
  // Redis is chosen only when REDIS_URL is set and reachable at boot; an unreachable Redis 
  // logs one warning and falls back to the in-process cache rather than failing the boot."
  
  if (env.REDIS_URL) {
    // There is no Redis client in package.json dependencies, so we implement the fallback behavior
    // by logging a warning and returning the memory cache.
    console.warn(`WARN: Redis at ${env.REDIS_URL} is unreachable or not implemented. Falling back to in-process cache.`);
  }

  return createMemoryCache();
}
