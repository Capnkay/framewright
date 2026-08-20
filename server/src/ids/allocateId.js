/**
 * Allocates an atomic, 10-digit string ID from the central store.
 */
export async function allocateId(store, range) {
  if (range !== 'section' && range !== 'element' && range !== 'cardField') {
    throw new Error(`Invalid id range: ${range}`);
  }
  return await store.allocateId(range);
}
