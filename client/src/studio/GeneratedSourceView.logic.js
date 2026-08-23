// client/src/studio/GeneratedSourceView.logic.js
//
// A self-contained JSX tokeniser for the Studio's source view.
//
// WHY THIS EXISTS RATHER THAN `react-syntax-highlighter`. That package was added for the
// IDE look and it cannot be loaded here. Its import chain — `refractor` → `parse-entities`
// → `decode-named-character-reference/index.dom.js` — touches `document` at MODULE INIT,
// so the bundle throws before a single test body runs. It took eight tests in
// `studio-information-architecture` and `studio-submits-and-renders-a-job` down with it,
// none of which are about the source view: they import the Studio page, the Studio page
// imports this component, and the whole bundle dies at load. A module that cannot be
// evaluated outside a browser cannot be reached from any test that renders the page it
// sits on, which is most of them.
//
// It also cost FR-G06. The requirement is that generated source renders READ-ONLY, and
// T-049's test reads that off a `<pre><code>` block. SyntaxHighlighter emits one at
// runtime, so the requirement was still met and the evidence for it was gone — and
// "the assertion moved, the behaviour didn't" is not a thing to discover on demo day.
//
// So: no dependency, `<pre><code>` back in the source, and colour from a scanner small
// enough to read in one sitting. It is a HIGHLIGHTER, not a parser — it never has to be
// right about grammar, only about which run of characters gets which colour.

/** The token kinds the view knows how to colour. `plain` is everything else. */
export const TOKEN_KINDS = ['comment', 'string', 'keyword', 'number', 'tag', 'plain'];

const KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function', 'return',
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new',
  'typeof', 'instanceof', 'in', 'of', 'class', 'extends', 'super', 'this', 'null',
  'undefined', 'true', 'false', 'async', 'await', 'try', 'catch', 'finally', 'throw',
  'delete', 'void', 'yield', 'static', 'get', 'set',
]);

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

/**
 * tokenize(source) -> [{ text, kind }]
 *
 * One left-to-right pass, no backtracking and no regex over the whole document — a
 * generated component is a few hundred lines and this runs on every render, so the cost
 * has to be linear and obviously so.
 *
 * Strings and comments are scanned as whole runs BEFORE anything else looks at the
 * characters inside them, which is the only thing a highlighter really has to get right:
 * a `//` inside a string literal, or the word `return` inside a comment, are the two
 * mistakes that make coloured code look broken rather than merely imperfect.
 */
export function tokenize(source) {
  const text = typeof source === 'string' ? source : '';
  const tokens = [];
  let plain = '';

  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, kind: 'plain' });
      plain = '';
    }
  };
  const push = (value, kind) => {
    flush();
    tokens.push({ text: value, kind });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    // Line comment, to the end of the line but not including the newline — the newline
    // belongs to the line splitter, and swallowing it merges two rendered lines.
    if (ch === '/' && next === '/') {
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      push(text.slice(i, end), 'comment');
      i = end;
      continue;
    }

    // Block comment. Unterminated runs to the end rather than throwing: this is a view.
    if (ch === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      push(text.slice(i, end), 'comment');
      i = end;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === ch) { j += 1; break; }
        // A single- or double-quoted string does not span lines; stopping at the newline
        // keeps one unbalanced quote from colouring the rest of the file.
        if (text[j] === '\n' && ch !== '`') break;
        j += 1;
      }
      push(text.slice(i, j), 'string');
      i = j;
      continue;
    }

    // A JSX tag name, and only immediately after its angle bracket: `<div`, `</Button`.
    if (ch === '<' && (IDENT_START.test(next || '') || next === '/')) {
      let j = i + 1;
      if (text[j] === '/') j += 1;
      while (j < text.length && (IDENT_PART.test(text[j]) || text[j] === '.' || text[j] === '-')) j += 1;
      push(text.slice(i, j), 'tag');
      i = j;
      continue;
    }

    if (DIGIT.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9._a-fA-FxX]/.test(text[j])) j += 1;
      push(text.slice(i, j), 'number');
      i = j;
      continue;
    }

    if (IDENT_START.test(ch)) {
      let j = i;
      while (j < text.length && IDENT_PART.test(text[j])) j += 1;
      const word = text.slice(i, j);
      if (KEYWORDS.has(word)) push(word, 'keyword');
      else plain += word;
      i = j;
      continue;
    }

    plain += ch;
    i += 1;
  }

  flush();
  return tokens;
}

/**
 * toLines(tokens) -> [[{ text, kind }]]
 *
 * Splits tokens across newlines so the view can number lines without giving up the
 * colouring. A comment or template literal that spans lines becomes one token per line,
 * each keeping its kind — which is what lets the gutter be a sibling of the code rather
 * than something drawn on top of it.
 *
 * A trailing newline does NOT produce a final empty line. Every generated file ends with
 * one, and rendering it would put a numbered blank row at the bottom of every view.
 */
export function toLines(tokens) {
  const lines = [[]];
  for (const token of tokens) {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, kind: token.kind });
    });
  }
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

/** The one call the view makes. */
export function highlight(source) {
  return toLines(tokenize(source));
}

/**
 * Colours, as literal hex rather than Tailwind classes.
 *
 * The IDE panel is painted in raw `#1e1e1e` VS Code greys already, deliberately — it is
 * meant to read as an editor rather than as part of the Studio's own surface, and
 * `docs/UI-SYSTEM.md`'s `studio-*` tokens describe the Studio. Naming six new tokens for
 * a pastiche of somebody else's colour scheme would put them in the design system, where
 * the next person would reasonably use them somewhere real.
 */
export const TOKEN_COLOURS = {
  comment: '#6a9955',
  string: '#ce9178',
  keyword: '#569cd6',
  number: '#b5cea8',
  tag: '#4ec9b0',
  plain: '#d4d4d4',
};
