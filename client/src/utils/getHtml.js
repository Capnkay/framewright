// client/src/utils/html.js
//
// getHtml(value, fallback) — the read-side sanitisation chokepoint, CONTRACT.md §8.
// Replaces the raw data-or-fallback pattern used throughout the
// generated component.
//
// Allow-list (CONTRACT.md §8):
//   ALLOWED_TAGS      b, i, br, span, strong, em
//   ALLOWED_ATTR      none — every attribute is stripped, on every tag
//   ALLOW_DATA_ATTR   false
//   ALLOW_ARIA_ATTR   false
//   Forbidden         script, style, iframe, object, embed, svg, math, form,
//                     template, a, and HTML comments
//
// This is a small, hand-written sanitiser — no dependency is added, because
// npm install has not been run yet and this file must work standalone. It is
// deliberately narrow: a regex-based tag scanner, not a real HTML parser, so
// it does not attempt to handle every malformed-HTML edge case a full parser
// would (e.g. a ">" character inside a quoted attribute value can confuse the
// tag boundary). That is an accepted limitation for a fixed, six-tag,
// zero-attribute allow-list. PRODUCTION CODE SHOULD USE A VETTED LIBRARY
// (e.g. DOMPurify) INSTEAD OF THIS HAND-ROLLED SANITISER — this file exists
// only because that dependency is not installed yet (Phase 0).

const ALLOWED_TAGS = new Set(['b', 'i', 'br', 'span', 'strong', 'em']);
const VOID_TAGS = new Set(['br']);

// Tags whose entire content must be discarded, not merely unwrapped — the
// text between <script>...</script> or <style>...</style> is code, never
// display copy, so keeping it as stray text would be its own kind of leak.
const CONTENT_STRIP_TAGS = ['script', 'style'];

const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?>/g;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

function stripContentTags(input) {
  let out = input;
  for (const tag of CONTENT_STRIP_TAGS) {
    // Matched pairs, including any attributes on the opening tag.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    // Defensive: an unmatched/unclosed opening tag of the same kind — drop
    // it and everything after it, rather than leaving raw code on the page.
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
      // Forbidden or unknown tag: drop the tag markup itself (zero
      // attributes survive either way); any surrounding text is untouched.
      return '';
    }

    const isClosing = match.startsWith('</');
    if (VOID_TAGS.has(tag)) {
      // <br> never carries a matching closing tag in the allow-list output.
      return isClosing ? '' : '<br />';
    }
    return isClosing ? `</${tag}>` : `<${tag}>`;
  });

  return out;
}

export function getHtml(value, fallback = '') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return sanitizeHtml(String(value));
}

// Replaces the raw `data-access-or-fallback` pattern used throughout the

// ... (leave the rest untouched except the bottom) ...
export function getStoreValue(data, fieldId, fallback) {
  return data?.[fieldId] || fallback;
}

export function getTextValue(data, fieldId, fallback) {
  return getStoreValue(data, fieldId, fallback);
}

export function getCardFieldValue(data, item, fieldIdKey, fieldValueKey) {
  const fieldId = item && item[fieldIdKey];
  return getStoreValue(data, fieldId, item && item[fieldValueKey]);
}
