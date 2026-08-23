/**
 * Strips storage-specific identifiers like _id and $oid before they cross the interface.
 * CONTRACT §2.1: Neither Mongo nor JSON file store is visible above the interface.
 * _id and $oid are storage details. They never cross this interface and never appear in an API response.
 */
export function stripStorageKeys(doc) {
  if (!doc) return doc;
  
  if (Array.isArray(doc)) {
    return doc.map(stripStorageKeys);
  }
  
  if (typeof doc === 'object') {
    const out = { ...doc };
    delete out._id;
    delete out.$oid;
    return out;
  }
  
  return doc;
}

/**
 * Wraps a raw store implementation to enforce the §2.1 interface and strip storage keys.
 */
export function createAdapter(rawStore) {
  return {
    findSections: async (args) => stripStorageKeys(await rawStore.findSections(args)),
    findSection: async (sectionId) => stripStorageKeys(await rawStore.findSection(sectionId)),
    deleteSections: async (args) => await rawStore.deleteSections(args),
    insertSection: async (doc) => stripStorageKeys(await rawStore.insertSection(doc)),
    updateSection: async (sectionId, patch) => stripStorageKeys(await rawStore.updateSection(sectionId, patch)),
    findElements: async (args) => stripStorageKeys(await rawStore.findElements(args)),
    insertElement: async (doc) => stripStorageKeys(await rawStore.insertElement(doc)),
    updateElement: async (fieldId, patch) => stripStorageKeys(await rawStore.updateElement(fieldId, patch)),
    allocateId: async (range) => await rawStore.allocateId(range)
  };
}
