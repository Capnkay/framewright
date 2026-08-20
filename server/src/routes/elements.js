import { STATUS, collection, badRequest } from '../http/envelope.js';
import { createStore } from '../store/index.js';

export async function getElements(ctx = {}) {
  const query = ctx.query || {};
  const filters = ['pageName', 'sectionId', 'fieldIds'].filter((key) => query[key]);

  if (filters.length === 0) {
    return badRequest(
      'At least one of pageName, sectionId, or fieldIds is required (§13.4). ' +
        'An unfiltered request would return the whole store.',
    );
  }

  const args = {};
  if (query.pageName) args.pageName = query.pageName;
  if (query.sectionId) args.sectionId = query.sectionId;
  if (query.fieldIds) {
    args.fieldIds = typeof query.fieldIds === 'string' ? query.fieldIds.split(',') : query.fieldIds;
  }

  const store = createStore(ctx.env);
  try {
    const elements = await store.findElements(args);
    return { status: STATUS.OK, body: collection(elements) };
  } finally {
    if (store && typeof store.close === 'function') {
      await store.close();
    }
  }
}
