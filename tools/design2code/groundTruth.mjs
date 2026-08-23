// tools/design2code/groundTruth.mjs
//
// Extract the visible text of a Design2Code page from its HTML — T-160.
//
// This is the reference side of the text-fidelity measurement: the strings a
// perfect run would have recovered from the screenshot. Everything the scorer
// says about recall and hallucination is relative to what this function
// returns, so its exclusions are the measurement's definition, not tidying.
//
// WHY A HAND-ROLLED PARSER RATHER THAN cheerio/jsdom. `npm install` is not a
// precondition of `npm test` in this repository — tools/test.mjs runs on a
// fresh clone with no node_modules, which is why the store, the envelope, the
// schemas, the sanitiser and quality/visual.js are all dependency-free. A
// benchmark that cannot run on a clean checkout is a benchmark nobody re-runs.
//
// WHAT IS EXCLUDED, and why each one would corrupt the score:
//
//   <script>, <style>  — their contents never render. Counting them as ground
//                        truth would demand the pipeline "recover" JavaScript.
//   <head> entirely    — <title> and <meta> are not on the screenshot. The
//                        model cannot see them, so scoring them measures
//                        clairvoyance.
//   comments           — invisible by definition.
//   attributes         — alt/placeholder/aria text is sometimes rendered and
//                        sometimes not, and we cannot tell which from source.
//                        Excluded as the conservative direction: a string we
//                        wrongly demand costs recall we did not really lose.
//
// WHITESPACE IS COLLAPSED because HTML collapses it. `Hello\n   world` renders
// as `Hello world`, and a scorer that compared the raw form would report a
// miss on a string the pipeline got exactly right.

/** Tags whose text content never reaches the rendered page. */
const INVISIBLE = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link']);

/**
 * Decode the entity forms that actually appear in this corpus.
 *
 * Deliberately small. A full entity table is a dependency; these five plus the
 * numeric forms cover what the pages use, and an undecoded entity shows up as a
 * visible miss in the report rather than as a silent wrong answer.
 */
export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Ampersand LAST: decoding it first would let `&amp;lt;` become `<`.
    .replace(/&amp;/g, '&');
}

/** HTML's own whitespace rule: any run of whitespace renders as one space. */
export function collapse(text) {
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
}

/**
 * visibleStrings(html) -> string[]
 *
 * The page's rendered text, in document order, one entry per text node that
 * survives collapsing. Order is preserved because it is the only structural
 * signal this measurement keeps — §6 puts ordering in the IR, and a pipeline
 * that recovers every string in the wrong order is a different failure from one
 * that recovers none.
 */
export function visibleStrings(html) {
  const source = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];

  let i = 0;
  let skipDepth = 0;
  let skipTag = null;

  while (i < source.length) {
    const lt = source.indexOf('<', i);

    if (lt === -1) {
      if (!skipDepth) {
        const text = collapse(source.slice(i));
        if (text) out.push(text);
      }
      break;
    }

    if (lt > i && !skipDepth) {
      const text = collapse(source.slice(i, lt));
      if (text) out.push(text);
    }

    const gt = source.indexOf('>', lt);
    if (gt === -1) break;

    const raw = source.slice(lt + 1, gt);
    const closing = raw.startsWith('/');
    const name = (closing ? raw.slice(1) : raw).match(/^[a-zA-Z][a-zA-Z0-9]*/)?.[0]?.toLowerCase();
    const selfClosing = raw.endsWith('/');

    if (name && INVISIBLE.has(name) && !selfClosing) {
      // Nesting is tracked against the OPENING tag only. A <style> inside a
      // skipped <head> must not end the skip when it closes — otherwise the
      // rest of <head> leaks into the ground truth.
      if (!closing) {
        if (!skipDepth) skipTag = name;
        if (name === skipTag) skipDepth += 1;
      } else if (name === skipTag) {
        skipDepth -= 1;
        if (skipDepth <= 0) {
          skipDepth = 0;
          skipTag = null;
        }
      }
    }

    i = gt + 1;
  }

  return out;
}

/**
 * groundTruth(html) -> { strings, joined }
 *
 * `joined` is the whole page as one normalised lowercase blob, which is what a
 * substring check runs against. Precomputed here because the scorer asks for it
 * once per sample and would otherwise rebuild it per candidate string.
 */
export function groundTruth(html) {
  const strings = visibleStrings(html);
  return {
    strings,
    joined: strings.join('  ').toLowerCase(),
  };
}

export default groundTruth;
