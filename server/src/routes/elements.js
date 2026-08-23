import { STATUS, collection, document, badRequest, ok } from '../http/envelope.js';
import { createStore } from '../store/index.js';
import { sanitiseElementPatch } from '../sanitise/sanitiseWrite.js';

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

// §8's tag/attribute allow-list and CSS rules are NOT re-implemented here.
// They live in one place — server/src/sanitise/sanitiseWrite.js — because a
// security rule with two copies has two behaviours the moment one is edited.

function isFieldId(id) {
  if (typeof id !== 'string') return false;
  return /^[23]\d{9}$/.test(id);
}

export async function patchElement(ctx = {}) {
  const { fieldId } = ctx.params || {};
  const body = ctx.body || {};

  if (!isFieldId(fieldId)) {
    return badRequest('fieldId must be a 10-digit string in the 2… or 3… range (§1).');
  }

  const provided = ['content', 'css', 'loop'].filter((key) => key in body);
  if (provided.length === 0) {
    return badRequest('At least one of content, css, or loop is required (§13.2).');
  }

  // §8's write-side chokepoint. content, css and the §4 card loop are all
  // cleaned in one call, so no field can be added to this route later without
  // passing through the allow-lists.
  const cleaned = sanitiseElementPatch(body);
  if (!cleaned.ok) return badRequest(cleaned.reason);
  const { patch } = cleaned;

  const store = createStore(ctx.env);
  try {
    const isNested = fieldId.startsWith('3');
    
    if (isNested) {
      const allElements = await store.findElements({});
      let parentElement = null;
      let loopItem = null;
      let fieldKey = null;

      for (const el of allElements) {
        if (Array.isArray(el.loop)) {
          for (const item of el.loop) {
            for (const key of Object.keys(item)) {
              if (key.startsWith('fieldId') && item[key] === fieldId) {
                parentElement = el;
                loopItem = item;
                fieldKey = key.replace('fieldId', 'field');
                break;
              }
            }
            if (parentElement) break;
          }
        }
        if (parentElement) break;
      }

      if (!parentElement) {
        return document(null, 'Nested fieldId');
      }

      if ('content' in patch) {
        loopItem[fieldKey] = patch.content;
      }
      
      const updatedParent = await store.updateElement(parentElement.fieldId, { loop: parentElement.loop });
      return { status: STATUS.OK, body: ok({ fieldId: updatedParent.fieldId, element: updatedParent }) };

    } else {
      const elements = await store.findElements({ fieldIds: [fieldId] });
      if (elements.length === 0) {
        return document(null, 'fieldId');
      }
      const element = elements[0];

      if (element.contentType === 'Cards') {
        delete patch.content;
      }

      if (patch.loop) {
        const existingNestedIds = new Set();
        if (Array.isArray(element.loop)) {
          for (const item of element.loop) {
            for (const key of Object.keys(item)) {
              if (key.startsWith('fieldId')) {
                existingNestedIds.add(item[key]);
              }
            }
          }
        }

        for (const item of patch.loop) {
          for (const key of Object.keys(item)) {
            if (key.startsWith('fieldId')) {
              if (!existingNestedIds.has(item[key])) {
                return badRequest(`Unknown nested fieldId ${item[key]} in loop (§13.2).`);
              }
            }
          }
        }
      }

      const updated = await store.updateElement(fieldId, patch);
      return { status: STATUS.OK, body: ok({ fieldId: updated.fieldId, element: updated }) };
    }
  } finally {
    if (store && typeof store.close === 'function') {
      await store.close();
    }
  }
}
