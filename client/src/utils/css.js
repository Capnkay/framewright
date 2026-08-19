// client/src/utils/css.js
//
// isSafeCssText(value) — the second injection chokepoint, CONTRACT.md §8.
//
// `el.style.cssText = cssData[id]` is not HTML, so no HTML sanitiser ever sees
// it. A css value is safe only if it matches the repeated-declaration shape
// AND contains none of the named dangerous substrings.

// Repeated "property: value;" declarations. The value class already excludes
// parentheses, angle brackets and quotes, which blocks url(...), expression(...)
// and quoted attribute-style payloads structurally — the substring checks below
// are the explicit, belt-and-suspenders version of the same rule.
const DECLARATION_PATTERN = /^(\s*[a-z-]+\s*:\s*[^;{}()<>"']+;?\s*)+$/;

const FORBIDDEN_SUBSTRINGS = ['url(', 'expression(', '@import', 'behavior:', '-moz-binding'];

export function isSafeCssText(value) {
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return false;

  const lower = value.toLowerCase();
  if (FORBIDDEN_SUBSTRINGS.some((needle) => lower.includes(needle))) {
    return false;
  }

  return DECLARATION_PATTERN.test(value);
}
