// server/src/generate/codeToIr.js
//
// mode=code — pasted React to IR v1.0. §6, §13. T-124.
//
// THE INPUT IS UNTRUSTED AND IS NEVER EXECUTED. It is parsed to an AST by
// @babel/parser and read. AGENTS.md is explicit and so is §14: never `eval`,
// never `new Function`, never `vm` — Node's `vm` is not a security boundary. A
// component that renders a login form and posts to somebody else's host is a
// string here and stays a string. `parse` with `errorRecovery` cannot run code;
// the worst a hostile input can do is fail to parse.
//
// WHAT THIS MODULE READS, AND WHY IT IS NARROWER THAN "React".
// It recognises the shape §7 mandates for a CMS section:
//
//   const ids = { heroImage: '2000000778', ... }        R1
//   const DEFAULTS = { ['2000000778']: "PULSE FIT" }    R6's fallbacks
//   <h1 id={ids.headlineMain} className="dynamicStyle ..."
//       dangerouslySetInnerHTML={{ __html: getHtml(..., DEFAULTS[ids.headlineMain]) }} />
//
// That is a real limit and it is stated rather than hidden: an arbitrary React
// component from anywhere on the internet does not carry `id={ids.x}`, so this
// finds nothing in it and says so. §13's `code` mode exists to round-trip and
// re-key OUR OWN sections — regenerate one with a new variation, lift one out of
// another project that already follows §7 — not to import strangers' JSX. A
// parser that pretended otherwise would return a confident, empty IR.
//
// WHY IT BUILDS ON THE KEYLESS SCAFFOLD. §6 requires layout, theme, designTokens,
// variations, a complete `cards` object and six fields on every element. Pasted
// JSX supplies almost none of that — a `className` is not a `layout.regions`
// array and no amount of AST walking makes it one. Reconstructing §6 here would
// be a second implementation of the reference IR that drifts from
// promptToIrKeyless within a day. So the scaffold comes from there, the code's
// own contribution is overlaid on top, and EVERY field the code could not supply
// is named in `warnings`. A reader can then tell what was read from their
// component from what was assumed on their behalf, which is the whole difference
// between a parser and a template with extra steps.

import { parse } from '@babel/parser';

import { promptToIrKeyless } from './promptToIrKeyless.js';

/** Walk the AST and collect every node the predicate accepts. */
function findNodes(ast, predicate) {
  const results = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (predicate(node)) results.push(node);
    for (const key in node) {
      if (key === 'loc' || key === 'range' || key === 'comments' || key === 'tokens') continue;
      walk(node[key]);
    }
  }
  walk(ast);
  return results;
}

/** A literal string, or '' for anything that is not one. */
function extractString(node) {
  if (!node) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.raw).join('');
  return '';
}

/**
 * Read `const ids = {...}` and `const DEFAULTS = {...}` off the AST.
 *
 * WHY BOTH ARE NEEDED TOGETHER. §7 writes a default as `DEFAULTS[ids.brandBadge]`,
 * so the literal "PULSE FIT" is two lookups away from the JSX that uses it:
 * `ids.brandBadge` gives the id string, and DEFAULTS is keyed by that string.
 * Reading only the JSX — which is what this module did before T-124 — finds a
 * MemberExpression where a string was expected and yields `""` for every element
 * on the page. It produced seven correctly named elements with no content at all,
 * and nothing failed.
 */
function readConstantMaps(ast) {
  const ids = {};
  const defaults = {};

  const declarations = findNodes(ast, (n) => n.type === 'VariableDeclarator');

  // TWO PASSES, AND THE ORDER IS NOT COSMETIC. §7 writes DEFAULTS with computed
  // keys that reference the other map — `{ [ids.heroImage]: '...' }` in the
  // golden component, `{ ['2000000778']: '...' }` in emitted ones. Reading
  // DEFAULTS before `ids` exists resolves the first shape to nothing.
  for (const decl of declarations) {
    if ((decl.id && decl.id.name) !== 'ids') continue;
    if (!decl.init || decl.init.type !== 'ObjectExpression') continue;
    for (const property of decl.init.properties) {
      if (property.type !== 'ObjectProperty') continue;
      const key = property.computed
        ? extractString(property.key)
        : property.key.name || extractString(property.key);
      const value = extractString(property.value);
      if (key && value) ids[key] = value;
    }
  }

  for (const decl of declarations) {
    if ((decl.id && decl.id.name) !== 'DEFAULTS') continue;
    if (!decl.init || decl.init.type !== 'ObjectExpression') continue;
    for (const property of decl.init.properties) {
      if (property.type !== 'ObjectProperty') continue;

      let key = '';
      if (property.computed) {
        key = extractString(property.key);
        // `[ids.heroImage]: '...'` — the key is itself a lookup into the map above.
        if (!key && property.key.type === 'MemberExpression' && property.key.object.name === 'ids') {
          key = ids[property.key.property.name] || '';
        }
      } else {
        key = property.key.name || extractString(property.key);
      }

      const value = extractString(property.value);
      if (key && value) defaults[key] = value;
    }
  }

  return { ids, defaults };
}

/**
 * The default content for one element, resolved through the constant maps.
 *
 * Order matters: a literal in the JSX beats the DEFAULTS table, because if
 * somebody hand-edited the rendered text that is the more recent statement of
 * intent.
 */
function extractDefaultContent(node, maps) {
  const literalChildren = (node.children || [])
    .filter((c) => c.type === 'JSXText')
    .map((c) => c.value.trim())
    .filter(Boolean);
  if (literalChildren.length > 0) return literalChildren.join(' ');

  // RESOLVE BY SEARCHING A SUBTREE, NOT BY MATCHING ONE SHAPE. §7 writes the same
  // default four different ways in one component:
  //
  //   getHtml(getTextValue(data, ids.x, DEFAULTS[ids.x]), DEFAULTS[ids.x])   nested
  //   getImage(getTextValue(data, ids.x, DEFAULTS[ids.x]))                   one arg
  //   {getTextValue(data, ids.x, DEFAULTS[ids.x])}                           a child
  //   aria-label={...}                                                       an attribute
  //
  // Matching them individually is a list that is wrong the moment the emitter
  // changes. What every one of them has in common is a `DEFAULTS[...]` lookup
  // somewhere inside, so that is what this looks for.
  const resolve = (root) => {
    if (!root) return '';
    const literal = extractString(root);
    if (literal) return literal;

    for (const ref of findNodes(root, (n) => n.type === 'MemberExpression' && n.object && n.object.name === 'DEFAULTS')) {
      // DEFAULTS[ids.brandBadge]
      if (ref.property.type === 'MemberExpression' && ref.property.object.name === 'ids') {
        const idValue = maps.ids[ref.property.property.name];
        const found = idValue ? maps.defaults[idValue] : '';
        if (found) return found;
        continue;
      }
      // DEFAULTS['2000000779'] or DEFAULTS.someName
      const key = ref.computed ? extractString(ref.property) : ref.property.name;
      const found = key ? maps.defaults[key] : '';
      if (found) return found;
    }

    // No DEFAULTS table — `getHtml(value, 'Hello World')` puts the fallback
    // inline, which is what a hand-written section looks like before it has been
    // through the emitter. The search is already scoped to this element's own
    // text-bearing attributes and children, so the first literal in it is the
    // default rather than some unrelated string.
    for (const literalNode of findNodes(root, (n) => n.type === 'StringLiteral' || n.type === 'TemplateLiteral')) {
      const value = extractString(literalNode);
      if (value) return value;
    }
    return '';
  };

  const attributes = node.openingElement.attributes || [];

  // The element's OWN attributes and its DIRECT expression children only. A
  // search over the whole subtree would let a container swallow the default
  // belonging to a child element nested inside it.
  const candidates = [];
  for (const name of ['dangerouslySetInnerHTML', 'src', 'alt', 'aria-label']) {
    const attr = attributes.find((a) => a.name && a.name.name === name);
    if (attr && attr.value && attr.value.type === 'JSXExpressionContainer') {
      candidates.push(attr.value.expression);
    }
  }
  for (const child of node.children || []) {
    if (child.type === 'JSXExpressionContainer') candidates.push(child.expression);
  }

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (resolved) return resolved;
  }

    return '';
}

function extractCss(node) {
  const cls = (node.openingElement.attributes || []).find((a) => a.name && a.name.name === 'className');
  if (!cls || !cls.value) return '';
  if (cls.value.type === 'StringLiteral') return cls.value.value;
  if (cls.value.type === 'JSXExpressionContainer') return extractString(cls.value.expression);
  return '';
}

/** Does this element wrap a `.map(...)` — i.e. is it §3's Cards container? */
function isLoopContainer(node) {
  return (node.children || []).some(
    (c) =>
      c.type === 'JSXExpressionContainer' &&
      c.expression &&
      c.expression.type === 'CallExpression' &&
      c.expression.callee &&
      c.expression.callee.property &&
      c.expression.callee.property.name === 'map',
  );
}

/** How many `item.fieldIdN` slots the loop body reads. §3.1. */
function fieldsPerItem(node) {
  const mapChild = (node.children || []).find(
    (c) => c.type === 'JSXExpressionContainer' && c.expression && c.expression.type === 'CallExpression',
  );
  if (!mapChild) return 0;
  const arrow = (mapChild.expression.arguments || [])[0];
  if (!arrow) return 0;

  let max = 0;
  for (const inner of findNodes(arrow, (n) => n.type === 'JSXElement')) {
    const idAttr = (inner.openingElement.attributes || []).find((a) => a.name && a.name.name === 'id');
    if (!idAttr || !idAttr.value || idAttr.value.type !== 'JSXExpressionContainer') continue;
    const expr = idAttr.value.expression;
    if (expr.type !== 'MemberExpression' || expr.object.name !== 'item') continue;
    const match = String(expr.property.name || '').match(/^fieldId(\d+)$/);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return max;
}

/** Every `<tag id={ids.name}>` in the tree, in source order. */
function readElements(ast, maps) {
  const found = [];
  let order = 1;

  for (const node of findNodes(ast, (n) => n.type === 'JSXElement')) {
    const idAttr = (node.openingElement.attributes || []).find((a) => a.name && a.name.name === 'id');
    if (!idAttr || !idAttr.value || idAttr.value.type !== 'JSXExpressionContainer') continue;

    const expr = idAttr.value.expression;
    if (expr.type !== 'MemberExpression' || expr.object.name !== 'ids') continue;

    const elementName = expr.property.name;
    if (!elementName) continue;

    const tag = node.openingElement.name.name;
    const loop = isLoopContainer(node);

    found.push({
      elementName,
      contentType: loop ? 'Cards' : tag === 'img' ? 'Image' : 'Text',
      tag,
      order: order++,
      default: loop ? null : extractDefaultContent(node, maps),
      css: extractCss(node),
      fieldsPerItem: loop ? fieldsPerItem(node) : 0,
    });
  }

  return found;
}

/**
 * Raised when the input parses but carries nothing this mode can read.
 *
 * NOT a degradation. §12's degraded states are for OUR infrastructure being
 * unavailable — the perception service down, no model key — where continuing on
 * the deterministic path still answers the user's question. A component we
 * cannot read is not that: silently returning the Pulse Fit template would hand
 * back a section that has nothing to do with what was pasted, report success,
 * and look completely correct. §13 has a status for this and it is 422.
 */
export class CodeNotUnderstood extends Error {
  constructor(message) {
    super(message);
    this.name = 'CodeNotUnderstood';
  }
}

/**
 * codeToIr(jsxString, options) -> IR v1.0
 *
 * Throws CodeNotUnderstood when the source cannot be parsed, or parses and
 * contains no §7-shaped element.
 */
export async function codeToIr(jsxString, options = {}) {
  const {
    pageName = 'Home',
    sectionName = 'Custom',
    platform = 'Website',
    variations = '1',
  } = options;

  const source = typeof jsxString === 'string' ? jsxString : '';
  if (!source.trim()) {
    throw new CodeNotUnderstood('mode=code requires a React component in `code` (§13).');
  }

  let ast;
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      // Recover rather than stop: a section pasted out of an editor often loses
      // an import line, and everything below it is still readable.
      errorRecovery: true,
    });
  } catch (err) {
    throw new CodeNotUnderstood(`The pasted code could not be parsed as JSX: ${err.message}`);
  }

  const maps = readConstantMaps(ast);
  const found = readElements(ast, maps);

  if (found.length === 0) {
    throw new CodeNotUnderstood(
      'No CMS elements were found in the pasted code. §7 sections carry `const ids = {...}` ' +
        'and mark each editable node with `id={ids.<name>}`; this component has neither, so ' +
        'there is nothing to lift out of it. Pasting an arbitrary React component is not ' +
        'supported — §13’s code mode round-trips sections this system emits.',
    );
  }

  // §6's scaffold, from the one place that already builds a complete one. The
  // empty prompt is deliberate: nothing here came from a prompt, and every value
  // it supplies is either overwritten below or named in a warning.
  const scaffold = promptToIrKeyless('', { pageName, sectionName, platform, variations });
  const warnings = [];

  // THE ELEMENTS ARE THE CODE'S, NOT THE REFERENCE SET'S. §6 types `elementName`
  // as a plain string, so a component with its own names — `mainTitle`, `heroImg`
  // — is valid IR, and forcing it onto §3's seven would silently discard what was
  // pasted and hand back the Pulse Fit template wearing the caller's section name.
  //
  // What §6's schema does NOT enforce, and what actually bites: emitComponent
  // renders `layout.regions[].children`, so an element no region names is dropped
  // from the output. Keeping the code's element list therefore means REBUILDING
  // the regions around it, below. Skipping that step is how you get a valid IR
  // that emits an empty section.
  const elements = found.map((el, index) => {
    const resolved = el.contentType !== 'Cards' && Boolean(el.default);
    if (!resolved && el.contentType !== 'Cards') {
      warnings.push(
        `Element "${el.elementName}" was found in the pasted code but no default content could be resolved from it; it will render from the store or from an empty fallback.`,
      );
    }
    return {
      elementName: el.elementName,
      contentType: el.contentType,
      tag: el.tag,
      order: index + 1,
      default: el.contentType === 'Cards' ? null : el.default || '',
      classes: el.css || '',
      css: el.css || null,
      // §6 field notes: confidence is null when the element did not come from an
      // image, and bbox is null for non-visual sources. Pasted code is neither.
      confidence: null,
      sourceOf: 'code',
      bbox: null,
    };
  });

  // Regions rebuilt from what was actually found: images to the media side, the
  // rest to the content side, in source order. This is an assumption and it is
  // recorded as one — a className cannot tell us the author's column layout.
  const imageNames = elements.filter((el) => el.contentType === 'Image').map((el) => el.elementName);
  const otherNames = elements.filter((el) => el.contentType !== 'Image').map((el) => el.elementName);

  const regions = (scaffold.layout.regions || []).map((region) => ({
    ...region,
    children: region.role === 'media' ? imageNames : otherNames,
  }));

  const cardsElement = found.find((el) => el.contentType === 'Cards');
  let cards;
  if (cardsElement) {
    // §6 requires `cards.items` and pasted JSX carries none — the loop body reads
    // `item.fieldIdN`, it does not contain the rows. The reference items are the
    // only content available, and saying so is the difference between a default
    // and a fabrication.
    cards = {
      ...scaffold.cards,
      of: cardsElement.elementName,
      fieldsPerItem: cardsElement.fieldsPerItem || scaffold.cards.fieldsPerItem,
    };
    warnings.push(
      `The pasted loop "${cardsElement.elementName}" reads ${cards.fieldsPerItem} field(s) per item; its ROW CONTENT is not in the source (a .map body reads item.fieldIdN rather than carrying the rows), so the reference items were used.`,
    );
  } else {
    // No loop in the source. §6 makes `cards` required, so it stays, but nothing
    // references it and `count` is honest at zero rather than claiming three.
    cards = { ...scaffold.cards, count: 0, items: [] };
  }

  warnings.push(
    'layout regions, theme and designTokens were not read from the pasted code — a className does not carry §6’s regions, theme or token scale. Images were placed in the media region and everything else in the content region, and the theme and tokens come from the deterministic reference.',
  );

  return {
    ...scaffold,
    sectionName,
    pageName,
    platform,
    source: { mode: 'code', inputs: ['code'], wireframeRef: null },
    // §13.3's regenerate path needs ids preserved; a code round-trip is the
    // canonical case for it. Spread the scaffold's policy rather than replacing
    // it — §6 requires `contentPolicy` and `preserve` beside `mode`.
    idPolicy: { ...scaffold.idPolicy, mode: 'preserve' },
    layout: { ...scaffold.layout, regions },
    elements,
    cards,
    warnings,
  };
}

export default codeToIr;
