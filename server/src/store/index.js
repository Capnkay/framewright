import { createAdapter } from './adapter.js';

export function createStore(env = {}) {
  const type = env.STORE_TYPE || 'json';
  
  if (type === 'mongo') {
    // To be implemented in T-005
    return createAdapter(createStubStore('mongo'));
  } else if (type === 'json') {
    // To be implemented in T-004
    return createAdapter(createStubStore('json'));
  }
  
  return createAdapter(createStubStore(type));
}

function createStubStore(type) {
  return {
    findSections: () => { throw new Error('Not implemented'); },
    findSection: () => { throw new Error('Not implemented'); },
    insertSection: () => { throw new Error('Not implemented'); },
    updateSection: () => { throw new Error('Not implemented'); },
    findElements: () => { throw new Error('Not implemented'); },
    updateElement: () => { throw new Error('Not implemented'); },
    allocateId: () => { throw new Error('Not implemented'); }
  };
}
