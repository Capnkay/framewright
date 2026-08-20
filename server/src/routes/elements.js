import { STATUS, collection, document, badRequest, ok } from '../http/envelope.js';
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

const ALLOWED_TAGS = new Set(['b', 'i', 'br', 'span', 'strong', 'em']);
const VOID_TAGS = new Set(['br']);
const CONTENT_STRIP_TAGS = ['script', 'style'];
const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?>/g;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

function stripContentTags(input) {
  let out = input;
  for (const tag of CONTENT_STRIP_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'gi'), '');
  }
  return out;
}

function sanitizeHtml(input) {
  let out = input.replace(COMMENT_PATTERN, '');
  out = stripContentTags(out);

  out = out.replace(TAG_PATTERN, (match, rawTag) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return '';
    }
    const isClosing = match.startsWith('</');
    if (VOID_TAGS.has(tag)) {
      return isClosing ? '' : '<br />';
    }
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });
  return out;
}

const CSS_PATTERN = /^(\s*[a-z-]+\s*:\s*[^;{}()<>"']+;?\s*)+$/i;
const CSS_FORBIDDEN = ['url(', 'expression(', '@import', 'behavior:', '-moz-binding'];

function validateCss(css) {
  if (css === null) return true;
  if (typeof css !== 'string') return false;
  if (!CSS_PATTERN.test(css)) return false;
  const lower = css.toLowerCase();
  for (const forbidden of CSS_FORBIDDEN) {
    if (lower.includes(forbidden)) return false;
  }
  return true;
}

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

  const patch = {};

  if ('content' in body) {
    if (typeof body.content === 'string') {
      patch.content = sanitizeHtml(body.content);
    } else {
      patch.content = body.content;
    }
  }

  if ('css' in body) {
    if (!validateCss(body.css)) {
      return badRequest('Invalid css format or forbidden rule (§8).');
    }
    patch.css = body.css;
  }

  if ('loop' in body) {
    if (!Array.isArray(body.loop)) {
      return badRequest('loop must be an array.');
    }
    patch.loop = body.loop;
  }

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

      if (element.component === 'Cards') {
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
