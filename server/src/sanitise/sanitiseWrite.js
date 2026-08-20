// server/src/sanitise/sanitiseWrite.js
//
// The WRITE-SIDE sanitisation chokepoint — CONTRACT.md §8.
//
// §8 requires two chokepoints and says why both: "Write-side alone is
// insufficient because seed JSON and the database can be populated out of
// band; read-side alone is insufficient because stored content should never
// be dirty in the first place." This file is the write half. The read half is
// client/src/utils/getHtml.js.
//
// It is a CHOKEPOINT, singular, which is the whole point of the task. Before
// this file existed, T-016 carried its own private copy of the tag scanner and
// the CSS test inside routes/elements.js, and a third variant lived in the
// client. Three copies of a security rule is three chances for one of them to
// drift, and the one that drifts is the one an attacker finds. Every write path
// now imports from here. Nothing re-implements it.
//
// THE TWO CALL SITES §8 NAMES:
//   POST  /api/generate            -> sanitiseGenerateBody
//   PATCH /api/elements/:fieldId   -> sanitiseElementPatch
//
// ---------------------------------------------------------------------------
// Allow-lists, copied from §8 and not widened anywhere in this file:
//
//   ALLOWED_TAGS      b, i, br, span, strong, em
//   ALLOWED_ATTR      EMPTY — every attribute on every tag is dropped
//   ALLOW_DATA_ATTR   false
//   ALLOW_ARIA_ATTR   false
//   Forbidden         script, style, iframe, object, embed, svg, math, form,
//                     template, a, and HTML comments
//
// The empty attribute list is doing more work than it looks like. §8: "An empty
// attribute list eliminates onerror, onload, style, href, src, srcset and
// formaction in one rule, and costs nothing — no element in the reference set
// uses an attribute inside its content string." Because attributes are never
// preserved, this file never needs to *parse* an attribute value for badness —
// it only needs to find where the tag ends. That is a much smaller problem, and
// a much smaller problem is a much smaller attack surface.
//
// WHY A HAND-WRITTEN SCANNER AND NOT DOMPURIFY. `npm install` is not a
// precondition of `npm test` in this repo — tools/test.mjs runs against a fresh
// clone with no node_modules, and the store, the envelope and the schemas are
// all dependency-free for the same reason. A vetted library is the right answer
// for production and this file should be replaced by one the moment a bundler
// and a lockfile are in play. What follows is deliberately conservative to earn
// its place in the meantime: it is a real tokenizer rather than a single regex,
// it fails closed on anything it cannot classify, and it is idempotent.
//
// It improves on the read-side scanner in one specific way, and the difference
// is the reason this is not a copy-paste of getHtml.js: a regex of the shape
// /<\/?([a-z]+)\b[^>]*?\/?>/ ends the tag at the first ">" ANYWHERE, including
// one inside a quoted attribute value. Given
//
//     <span title="a>b" onerror=alert(1)>
//
// that regex matches only up to `"a>`, leaving ` onerror=alert(1)>` behind as
// text — and the next pass sees no tag there at all. The scanner below tracks
// quote state, so the tag ends where the tag actually ends.

/** §8's ALLOWED_TAGS, verbatim. Nothing is added to this set. */
export const ALLOWED_TAGS = Object.freeze(['b', 'i', 'br', 'span', 'strong', 'em']);

/** §8's forbidden list, verbatim. Kept for the error messages and the tests. */
export const FORBIDDEN_TAGS = Object.freeze([
  'script', 'style', 'iframe', 'object', 'embed',
  'svg', 'math', 'form', 'template', 'a',
]);

const ALLOWED = new Set(ALLOWED_TAGS);
const VOID_TAGS = new Set(['br']);

// Tags whose CONTENT is discarded, not merely unwrapped. Everywhere else a
// forbidden tag is unwrapped — the markup goes, the human-readable text between
// it stays, which is what you want for <a> and <form>. But the bytes between
// <script>…</script> and <style>…</style> are code, never display copy. Keeping
// them as stray text would move the payload from the markup into the text node
// and call it sanitised. So for these two, the content goes with the tag.
//
// This matches the read-side helper's behaviour deliberately. If write-side
// unwrapped where read-side stripped, a stored string would render as something
// other than what was persisted, and §9's "change a value, watch it move"
// assertion would be measuring the difference between two sanitisers.
const CONTENT_STRIP = new Set(['script', 'style']);

/**
 * Find the index just past the tag that starts at "<" on input[start],
 * honouring quoted attribute values. Returns -1 when the tag never closes,
 * which the caller treats as "the rest of the input is a malformed tag" and
 * drops — failing closed.
 */
function endOfTag(input, start) {
  let quote = null;
  for (let i = start + 1; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return -1;
}

/** The tag name at "<", lowercased, plus whether it was a closing tag. */
function readTagName(input, start) {
  let i = start + 1;
  let closing = false;
  if (input[i] === '/') {
    closing = true;
    i += 1;
  }
  const from = i;
  while (i < input.length && /[a-zA-Z0-9]/.test(input[i])) i += 1;
  return { name: input.slice(from, i).toLowerCase(), closing };
}

/**
 * Skip the matched closing tag of a content-strip element, and everything
 * between. An UNCLOSED <script> swallows the remainder of the input rather than
 * releasing it as text — the defensive case, and the one that matters, because
 * an attacker controls whether they close their tag.
 */
function skipStrippedContent(input, from, name) {
  const close = new RegExp(`</${name}\\s*>`, 'i');
  const rest = input.slice(from);
  const m = close.exec(rest);
  return m ? from + m.index + m[0].length : input.length;
}

/**
 * sanitiseHtml(input) -> string
 *
 * The §8 allow-list applied to one content string. Total, never throws, and
 * idempotent: sanitiseHtml(sanitiseHtml(x)) === sanitiseHtml(x), which is what
 * lets the same string survive a write, a read, and a re-write unchanged.
 */
export function sanitiseHtml(input) {
  const text = String(input ?? '');
  let out = '';
  let i = 0;

  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);

    // HTML comments are forbidden outright by §8 — including the conditional
    // and malformed spellings, which is why an unterminated comment eats the
    // rest of the input instead of being emitted as text.
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    // <!DOCTYPE …>, <![CDATA[…]]> and friends: never content, always dropped.
    if (text.startsWith('<!', lt) || text.startsWith('<?', lt)) {
      const end = endOfTag(text, lt);
      i = end === -1 ? text.length : end;
      continue;
    }

    const { name, closing } = readTagName(text, lt);

    // A "<" that begins no tag at all is literal text. Encoding it rather than
    // passing it through keeps the output from re-parsing as markup later, and
    // "&lt;" is a fixed point of this function, so idempotency holds.
    if (name === '') {
      out += '&lt;';
      i = lt + 1;
      continue;
    }

    const end = endOfTag(text, lt);
    if (end === -1) {
      // An unterminated tag. Fail closed: drop it and everything after it.
      break;
    }

    if (CONTENT_STRIP.has(name)) {
      i = closing ? end : skipStrippedContent(text, end, name);
      continue;
    }

    if (!ALLOWED.has(name)) {
      // Forbidden or simply unknown: unwrap. The markup goes, the text between
      // it survives and is sanitised by the loop like any other text.
      i = end;
      continue;
    }

    // Allowed. The tag is REBUILT from its name alone rather than trimmed —
    // this is where ALLOWED_ATTR being empty is enforced, and rebuilding means
    // there is no code path in which an attribute can survive.
    if (VOID_TAGS.has(name)) out += closing ? '' : '<br />';
    else out += closing ? `</${name}>` : `<${name}>`;
    i = end;
  }

  return out;
}

// ---------------------------------------------------------------------------
// CSS — §8's second injection channel
// ---------------------------------------------------------------------------
//
// §8: "el.style.cssText = cssData[id] is not HTML, so an HTML sanitiser never
// sees it." The shape and the forbidden list below are §8's, unmodified.

/** §8's declaration-shape pattern, verbatim. */
export const CSS_PATTERN = /^(\s*[a-z-]+\s*:\s*[^;{}()<>"']+;?\s*)+$/i;

/** §8's forbidden substrings, verbatim. */
export const CSS_FORBIDDEN = Object.freeze([
  'url(', 'expression(', '@import', 'behavior:', '-moz-binding',
]);

/**
 * isCleanCss(css) -> boolean
 *
 * CSS is VALIDATED, not rewritten — the caller returns 400 on false. §13.2
 * says a css value failing the allow-list makes the request a 400, so silently
 * repairing it would both disobey that and hide from the author that their
 * declaration was dropped. `null` is clean: §13.2 uses it to clear an overlay.
 */
export function isCleanCss(css) {
  if (css === null || css === undefined) return true;
  if (typeof css !== 'string') return false;
  if (css.trim() === '') return true;
  if (!CSS_PATTERN.test(css)) return false;
  const lower = css.toLowerCase();
  return !CSS_FORBIDDEN.some((bad) => lower.includes(bad));
}

// ---------------------------------------------------------------------------
// Call site 1 — PATCH /api/elements/:fieldId  (§13.2)
// ---------------------------------------------------------------------------

/** A §1 field ID: the 2… range (elements) or the 3… range (card fields). */
function isFieldId(id) {
  return typeof id === 'string' && /^[23]\d{9}$/.test(id);
}

/**
 * sanitiseLoop(loop) -> { ok, loop } | { ok: false, reason }
 *
 * §4's card loop items. Their display fields are user content that lands in the
 * store exactly like `content` does, so they get exactly the same treatment —
 * before this chokepoint existed, a patched loop was persisted verbatim and
 * <img src=x onerror=…> in field1 went straight to disk. The read-side helper
 * caught it at render, which is precisely the "stored content should never be
 * dirty in the first place" case §8 opens by rejecting.
 *
 * fieldIdN keys are identifiers, not copy: validated, never rewritten, because
 * sanitising an ID would silently repoint a card field at nothing.
 */
export function sanitiseLoop(loop) {
  if (!Array.isArray(loop)) {
    return { ok: false, reason: 'loop must be an array (§4).' };
  }

  const clean = [];
  for (const item of loop) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'Every loop item must be an object (§4).' };
    }
    const next = {};
    for (const [key, value] of Object.entries(item)) {
      if (/^fieldId\d+$/.test(key)) {
        if (!isFieldId(value)) {
          return {
            ok: false,
            reason: `loop item ${key} must be a 10-digit field ID in the 2… or 3… range (§1).`,
          };
        }
        next[key] = value;
      } else if (typeof value === 'string') {
        next[key] = sanitiseHtml(value);
      } else {
        next[key] = value;
      }
    }
    clean.push(next);
  }
  return { ok: true, loop: clean };
}

/**
 * sanitiseElementPatch(body) -> { ok, patch } | { ok: false, reason }
 *
 * The whole §13.2 write body, cleaned in one call. Returns a REASON rather than
 * an HTTP response so this module stays free of the transport — the route turns
 * a reason into badRequest(). It does not enforce §13.2's "at least one field"
 * rule; that is request shape, not sanitisation, and it stays in the route.
 */
export function sanitiseElementPatch(body = {}) {
  const patch = {};

  if ('content' in body) {
    patch.content = typeof body.content === 'string'
      ? sanitiseHtml(body.content)
      : body.content;
  }

  if ('css' in body) {
    if (!isCleanCss(body.css)) {
      return { ok: false, reason: 'Invalid css format or forbidden rule (§8).' };
    }
    patch.css = body.css;
  }

  if ('loop' in body) {
    const result = sanitiseLoop(body.loop);
    if (!result.ok) return result;
    patch.loop = result.loop;
  }

  return { ok: true, patch };
}

// ---------------------------------------------------------------------------
// Call site 2 — POST /api/generate  (§13.1)
// ---------------------------------------------------------------------------

/**
 * sanitiseGenerateBody(body) -> { ok, body } | { ok: false, reason }
 *
 * §8's closing rule is the one this exists to hold: "User strings may land only
 * in the content field of element documents — as data. Never in a JSX
 * expression position, an import specifier, or an attribute name."
 *
 * A prompt is a user string that travels a long way — through the IR, into the
 * emitter, and out the other side as element content. Cleaning it at the door
 * means the emitter downstream is never the first thing to see a script tag.
 *
 * pageName and sectionName are NOT sanitised as HTML, because they are not
 * copy — they become file names and route segments, where the dangerous
 * characters are path separators rather than angle brackets. They are
 * constrained to a conservative identifier shape instead. §9 names a pageName
 * case mismatch as a store-liveness killer, so the value is passed through
 * unchanged when it is valid and rejected when it is not; it is never silently
 * rewritten into a different string than the caller asked for.
 *
 * `code` is deliberately untouched. §8: pasted JSX "is parsed to an AST with
 * @babel/parser … never eval". Stripping tags out of source before parsing it
 * would corrupt the input to a parser that is already the safe boundary.
 */
export function sanitiseGenerateBody(body = {}) {
  const clean = { ...body };

  if (typeof body.prompt === 'string') {
    clean.prompt = sanitiseHtml(body.prompt);
  }

  for (const key of ['pageName', 'sectionName']) {
    if (body[key] === undefined || body[key] === null) continue;
    if (typeof body[key] !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(body[key])) {
      return {
        ok: false,
        reason: `${key} must start with a letter and contain only letters, digits, "-" or "_" (§13.1).`,
      };
    }
  }

  return { ok: true, body: clean };
}

export default sanitiseHtml;
