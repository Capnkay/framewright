// server/src/sanitise/cssAllowList.js

// CSS Allow-list validator for the second injection chokepoint (CONTRACT.md A 8)

const DECLARATION_PATTERN = /^(\s*[a-z-]+\s*:\s*[^;{}()<>"']+;?\s*)+$/;
const FORBIDDEN_SUBSTRINGS = ['url(', 'expression(', '@import', 'behavior:', '-moz-binding'];

export function isSafeCssText(value) {
  if (typeof value !== 'string') return false;
  if (value.trim() === '') return false; // wait, if it's empty, is it valid? "must match a repeated declaration shape" -> empty doesn't match the regex.

  const lower = value.toLowerCase();
  if (FORBIDDEN_SUBSTRINGS.some((needle) => lower.includes(needle))) {
    return false;
  }

  return DECLARATION_PATTERN.test(value);
}
