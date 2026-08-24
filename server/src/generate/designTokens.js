// server/src/generate/designTokens.js
//
// DEFAULT_TOKENS and the token rules — CONTRACT.md §6.1.
//
// §6.1 says DEFAULT_TOKENS "is checked in beside the emitter", which is why
// this sits in server/src/generate/ rather than in a directory of its own.
//
// The whole point of this file is a non-event: `designTokens` is OPTIONAL,
// and an IR that omits it must produce byte-identical output to an IR that
// carries DEFAULT_TOKENS explicitly. That equivalence — asserted by T-093
// against the real emitter, and by this module's own tests against
// resolveTokens — is what stops an "enhancement" quietly changing the
// deterministic path. If the two ever diverge, the field has become a
// behaviour change wearing the costume of a default.
//
// Two rules from §6.1 do real work here:
//
//   Rule 1 — every value is a Tailwind utility class, never a raw CSS value.
//            `text-4xl`, not `36px`. A raw value forces the emitter either to
//            invent a class name or to inline a style, and inlining collides
//            with R10's `cssText` overlay and with §8's CSS allow-list.
//   Rule 2 — tokens never carry colour literals. `red-500`, not `#ef4444`.
//            §8's allow-list and §14's "no real identifiers" both assume the
//            palette is symbolic.
//
// Rule 4 is the reason nothing here throws on unknown input: "A token the
// emitter does not recognise is ignored, not an error." Perception and a
// hosted model can both propose tokens, and an unknown key must never fail a
// generation. So resolveTokens DROPS what it does not know and carries on.

/**
 * DEFAULT_TOKENS — the object printed in §6.1, verbatim.
 *
 * This is the Pulse Fit reference set, and it reproduces the golden
 * component's current classes. Changing a value here changes the
 * deterministic path's output for every generation that does not override it,
 * so treat it as contract text rather than configuration.
 */
export const DEFAULT_TOKENS = Object.freeze({
  colors: Object.freeze({
    accent: 'red-500',
    // orange-500 desaturates toward a washed-out yellow-beige at the light
    // shades (-50/-100) the gradient/glow actually use -- read as a
    // coffee-stained-paper look, not a deliberate second colour. A hue on
    // the other side of red (rose/violet) stays warm without drifting
    // yellow at any shade.
    accentAlt: 'rose-600',
    accentDark: 'gray-900',
    accentContrast: 'white',
    surface: 'white',
    surfaceAlt: 'gray-50',
    text: 'gray-800',
    textMuted: 'gray-500',
  }),
  typography: Object.freeze({
    headingFamily: 'font-sans',
    bodyFamily: 'font-sans',
    headingWeight: 'font-extrabold',
    bodyWeight: 'font-normal',
    headingTracking: 'tracking-tight',
    eyebrowTracking: 'tracking-widest',
    scale: Object.freeze({
      h1: 'text-5xl md:text-6xl',
      h2: 'text-xl md:text-2xl',
      body: 'text-base',
      eyebrow: 'text-sm',
      stat: 'text-2xl',
    }),
  }),
  spacing: Object.freeze({
    sectionY: 'py-10 md:py-20',
    gap: 'gap-6',
    heroGap: 'gap-8',
    containerX: 'px-0 md:px-12',
  }),
  shadows: Object.freeze({ card: 'shadow-md', button: 'shadow-sm' }),
  borderRadius: Object.freeze({
    button: 'rounded-md',
    card: 'rounded-xl',
    image: 'rounded-xl',
  }),
  breakpoints: Object.freeze({ stack: 'md' }),
  components: Object.freeze({
    button: 'inline-flex items-center justify-center font-semibold',
  }),
});

// The recognised shape, derived from DEFAULT_TOKENS itself so the two can
// never drift apart. `scale` is the one nested group.
const NESTED_GROUPS = { typography: ['scale'] };

// --- §6.1 rules 1 and 2 ----------------------------------------------------

// A colour literal in any of the forms a model or a designer might emit.
const COLOUR_LITERAL = /^#[0-9a-f]{3,8}$|^(rgba?|hsla?|color|lab|lch|oklch|oklab)\s*\(/i;

// A raw CSS length/size. `36px`, `1.5rem`, `100%`, `12pt`.
const RAW_CSS_VALUE = /(^|\s)\d*\.?\d+(px|rem|em|ex|ch|vh|vw|vmin|vmax|pt|pc|cm|mm|in|%)(\s|$)/i;

// A function call or a statement separator is CSS, never a utility class —
// `url(...)`, `calc(...)`, `a; b`. NOTE: the colon is deliberately NOT in
// this set. Tailwind's variant syntax is built on colons (`md:text-5xl`,
// `hover:bg-red-600`), and §6.1's own reference tokens use it — banning the
// character outright rejects the contract's own example values.
const CSS_SHAPED = /[(){};]/;

// A CSS declaration, which does use a colon: `font-weight: bold`. The space
// after the colon is what separates it from a Tailwind variant prefix.
const CSS_DECLARATION = /:\s/;

// Tailwind variant prefixes — the segments legitimately allowed before a
// colon. Anything else in that position (`font-weight:bold`) is a CSS
// declaration wearing a variant's clothes, and is rejected.
const VARIANT_PREFIXES = new Set([
  'sm', 'md', 'lg', 'xl', '2xl',
  'hover', 'focus', 'focus-within', 'focus-visible', 'active', 'visited', 'target',
  'disabled', 'enabled', 'checked', 'required', 'invalid',
  'group-hover', 'group-focus', 'peer-hover', 'peer-focus', 'peer-checked',
  'first', 'last', 'only', 'odd', 'even', 'first-of-type', 'last-of-type',
  'dark', 'light',
  'motion-safe', 'motion-reduce',
  'print', 'rtl', 'ltr',
  'before', 'after', 'placeholder', 'file', 'marker', 'selection',
  'aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled',
]);

/** One whitespace-separated class: optional variant prefixes, then a utility. */
function isUtilityClass(token) {
  const segments = token.split(':');
  const utility = segments.pop();
  for (const prefix of segments) {
    if (!VARIANT_PREFIXES.has(prefix.toLowerCase())) return false;
  }
  // A utility may be negative (`-mt-4`) and may carry `/` or `.` (`w-1/2`).
  return /^-?[a-z0-9][a-z0-9./-]*$/i.test(utility);
}

/**
 * isColourLiteral(value) — §6.1 rule 2.
 *
 * Note what is NOT a literal here: `white`, `black`, `gray-800`. Tailwind's
 * palette names are symbolic, and §6.1's own example uses `"white"` for
 * `accentContrast` and `surface`. Rejecting bare colour words would reject
 * the contract's own reference tokens.
 */
export function isColourLiteral(value) {
  return typeof value === 'string' && COLOUR_LITERAL.test(value.trim());
}

/**
 * isTailwindTokenValue(value) — §6.1 rule 1.
 *
 * A token value is a Tailwind utility class, or a space-separated set of them
 * (`text-4xl md:text-5xl`, `py-8 md:py-16`). It is never a raw CSS value and
 * never a colour literal.
 */
export function isTailwindTokenValue(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (isColourLiteral(trimmed)) return false;
  if (CSS_SHAPED.test(trimmed)) return false;
  if (CSS_DECLARATION.test(trimmed)) return false;
  if (RAW_CSS_VALUE.test(trimmed)) return false;
  return trimmed.split(/\s+/).every(isUtilityClass);
}

/**
 * validateTokens(tokens) -> { valid, errors: [{ path, message }] }
 *
 * Asserts §6.1 rules 1 and 2 over every leaf value. This is an ASSERTION
 * helper, not a gate on generation — rule 4 says an unrecognised key is
 * ignored, and a bad value is reported here so a test or a review can catch
 * it, while resolveTokens below simply declines to adopt it.
 */
export function validateTokens(tokens, basePath = '$') {
  const errors = [];
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    return { valid: false, errors: [{ path: basePath, message: 'designTokens must be an object' }] };
  }

  const walk = (node, path) => {
    for (const [key, value] of Object.entries(node)) {
      const here = `${path}.${key}`;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, here);
        continue;
      }
      if (isColourLiteral(value)) {
        errors.push({ path: here, message: `must not be a colour literal (§6.1 rule 2), got ${JSON.stringify(value)}` });
      } else if (!isTailwindTokenValue(value)) {
        errors.push({ path: here, message: `must be a Tailwind utility class, not a raw CSS value (§6.1 rule 1), got ${JSON.stringify(value)}` });
      }
    }
  };

  walk(tokens, basePath);
  return { valid: errors.length === 0, errors };
}

// --- resolution ------------------------------------------------------------

function mergeGroup(defaults, override, groupName) {
  const out = { ...defaults };
  if (!override || typeof override !== 'object' || Array.isArray(override)) return out;

  const nested = NESTED_GROUPS[groupName] || [];

  for (const [key, value] of Object.entries(override)) {
    // Rule 4 — a token the emitter does not recognise is ignored, not an error.
    if (!(key in defaults)) continue;

    if (nested.includes(key)) {
      out[key] = mergeGroup(defaults[key], value, key);
      continue;
    }
    // Rules 1 and 2 — a value that is not a Tailwind class is not adopted.
    // Declining it keeps the deterministic default rather than failing the
    // generation, which rule 4's spirit requires.
    if (isTailwindTokenValue(value)) out[key] = value;
  }
  return out;
}

/**
 * resolveTokens(designTokens) -> tokens
 *
 * The emitter's entry point. Returns a complete, plain (unfrozen) token set:
 * DEFAULT_TOKENS with any recognised, rule-compliant overrides applied.
 *
 * resolveTokens(undefined) and resolveTokens(DEFAULT_TOKENS) return deeply
 * equal objects. That is §6.1's equivalence requirement in its smallest form,
 * and T-093 asserts the same thing end to end against the emitter's output.
 */
export function resolveTokens(designTokens) {
  const out = {};
  for (const groupName of Object.keys(DEFAULT_TOKENS)) {
    out[groupName] = mergeGroup(
      DEFAULT_TOKENS[groupName],
      designTokens ? designTokens[groupName] : undefined,
      groupName,
    );
  }
  return out;
}

/**
 * tokensFromIr(ir) — resolveTokens against an IR, keeping §6.1 rule 3.
 *
 * Rule 3: `theme` stays and is not deprecated, and `theme.accent` and
 * `designTokens.colors.accent` must agree. When an IR carries a theme accent
 * and no explicit token accent, the theme's value wins — the API sets both
 * from one source, and honouring only the token would silently drop a prompt
 * that moved the accent.
 */
export function tokensFromIr(ir) {
  const tokens = resolveTokens(ir && ir.designTokens);
  const themeAccent = ir && ir.theme && ir.theme.accent;
  const explicitTokenAccent = ir && ir.designTokens && ir.designTokens.colors && ir.designTokens.colors.accent;

  if (themeAccent && !explicitTokenAccent && isTailwindTokenValue(themeAccent)) {
    tokens.colors = { ...tokens.colors, accent: themeAccent };
  }
  return tokens;
}

export default DEFAULT_TOKENS;
