export function createMemoryCache() {
  const store = new Map();

  return {
    async cacheGet(key) {
      const item = store.get(key);
      if (!item) return null;

      if (Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }

      return item.value;
    },

    async cacheSet(key, value, ttlMs) {
      validateCacheEntry(key, value);
      store.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
    },

    async cacheDel(key) {
      store.delete(key);
    },
    
    _clear() {
      store.clear();
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
      throw new Error('Caching section documents is forbidden by §15.1');
    }
    // Reject element documents
    if ('fieldId' in value && 'elementName' in value) {
      throw new Error('Caching element documents is forbidden by §15.1');
    }
  }
}
