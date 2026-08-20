import { STATUS, collection, document, badRequest } from '../http/envelope.js';
import { createStore } from '../store/index.js';

const TEN_DIGITS = /^[0-9]{10}$/;

function isSectionId(value) {
  return typeof value === 'string' && TEN_DIGITS.test(value) && value.startsWith('1');
}

/** GET /api/sections?pageName= - §13.4. Bare array, [] if none. */
export async function getSections(ctx = {}) {
  const env = ctx.env || {};
  const store = createStore(env);
  const query = ctx.query || {};
  const pageName = query.pageName;
  
  const sections = await store.findSections({ pageName });
  return { status: STATUS.OK, body: collection(sections) };
}

/** GET /api/sections/:sectionId - §13.4. Bare document, or 404. */
export async function getSection(ctx = {}) {
  const { sectionId } = ctx.params || {};
  if (!isSectionId(sectionId)) {
    return badRequest('sectionId must be a 10-digit string in the 1… range (§1).');
  }

  const env = ctx.env || {};
  const store = createStore(env);
  
  const section = await store.findSection(sectionId);
  return document(section, `section ${sectionId}`);
}
