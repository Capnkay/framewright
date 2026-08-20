import { createAdapter } from './adapter.js';
import { createJsonStore } from './jsonStore.js';

// NOTE: ./mongoStore.js is deliberately NOT imported statically here.
//
// It imports `mongodb` at its top level, and an ES module's imports are resolved
// when THIS file loads — before `createStore` is ever called, and regardless of
// which store the caller asks for. A static import therefore made the Mongo
// driver a hard requirement of selecting the JSON store.
//
// That is a Standing Rule 3 violation, not a packaging nuisance:
//
//   "The deterministic path always works. Any change that makes generation
//    require an API key, a GPU, or a network is rejected."
//
// The JSON file store IS the deterministic path — it is what runs with no Mongo,
// no network and no services. Filed as F-005 (BLOCKER); measured on a clean
// checkout with no node_modules anywhere: 84 passing, 2 failing, including
// store-adapter-interface, which asks for the JSON store and never touches Mongo.
//
// The dynamic import below runs only when a caller actually selects Mongo, so a
// machine without the driver can still select every other backend.

export function createStore(env = {}) {
  const type = env.STORE_TYPE || 'json';

  if (type === 'mongo') {
    return createAdapter(createLazyMongoStore(env.MONGO_URI));
  } else if (type === 'json') {
    return createAdapter(createJsonStore('./server/data/store.json'));
  }

  return createAdapter(createStubStore(type));
}

/**
 * The Mongo store, loaded on first use rather than at import time.
 *
 * `createStore` stays synchronous — its signature does not change — because every
 * method of the §2.1 interface is already async, so deferring the driver behind
 * the first call is invisible to callers. The import is memoised, so the driver
 * loads at most once per store.
 *
 * A missing driver now fails when someone asks for Mongo, with the error the
 * driver itself raises, instead of failing at load time for everyone.
 */
function createLazyMongoStore(uri) {
  let realStore = null;

  async function real() {
    if (!realStore) {
      const { createMongoStore } = await import('./mongoStore.js');
      realStore = createMongoStore(uri);
    }
    return realStore;
  }

  return {
    findSections: async (args) => (await real()).findSections(args),
    findSection: async (sectionId) => (await real()).findSection(sectionId),
    insertSection: async (doc) => (await real()).insertSection(doc),
    updateSection: async (sectionId, patch) => (await real()).updateSection(sectionId, patch),
    findElements: async (args) => (await real()).findElements(args),
    updateElement: async (fieldId, patch) => (await real()).updateElement(fieldId, patch),
    allocateId: async (range) => (await real()).allocateId(range),
    close: async () => {
      if (realStore && typeof realStore.close === 'function') return realStore.close();
    },
  };
}

function createStubStore(type) {
  return {
    findSections: () => { throw new Error('Not implemented'); },
    findSection: () => { throw new Error('Not implemented'); },
    insertSection: () => { throw new Error('Not implemented'); },
    updateSection: () => { throw new Error('Not implemented'); },
    findElements: () => { throw new Error('Not implemented'); },
    updateElement: () => { throw new Error('Not implemented'); },
    allocateId: () => { throw new Error('Not implemented'); },
  };
}
