import { createMemoryCache } from './memoryCache.js';
import { createRedisCacheSync } from './redisCache.js';

export function createCache(env = {}) {
  // A 15.1: "Two implementations... selected by environment exactly as the store is in 2.1...
  // Redis is chosen only when REDIS_URL is set and reachable at boot; an unreachable Redis 
  // logs one warning and falls back to the in-process cache rather than failing the boot."
  
  if (env.REDIS_URL) {
    return createRedisCacheSync(env.REDIS_URL);
  }

  return createMemoryCache();
}
