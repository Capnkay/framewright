// server/src/generate/emitComponent.js
// @format
//
// Deterministic IR-to-component emitter — T-025, CONTRACT.md §6 and §7.
//
// Takes a finalised IR (field IDs already attached by the allocator) and
// returns a JSX source string. No network call, no model key, no randomness.
// The same IR always produces the same output — that is the contract.
//
// Rules enforced here:
//   R1  — const ids = { ... }
//   R2  — pageName prop, default "Home"
//   R3  — mount-time fetchElementsByIds with every field ID incl. nested card IDs
//   R4  — read from state.cms.allSections[pageName]
//   R5  — id={ids.x} or id={item.fieldIdN}
//   R6  — text nodes via getHtml + dangerouslySetInnerHTML
//   R7  — images via getImage + onError={errorImage}
//   R8  — button with id, aria-label, onClick stub (PrimeReact comment)
//   R9  — Array.isArray + length>0 guard; never fixed-count compare
//   R10 — apply allSectionsCss via getElementById in a useEffect
//   R11 — Tailwind layout: two cols on desktop, stacked on mobile, max-width
//   R12 — dynamicStyle on text/button nodes, dynamicStyle2 on images
//   R13 — no real secrets, no real bucket URLs
//   R14 — export default
//
// §6.1 — designTokens: optional; absent → DEFAULT_TOKENS used
// §6.1 — DEFAULT_TOKENS byte-identical path enforced via merge

// ES module — server package.json has "type": "module"

// ---------------------------------------------------------------------------
// Design tokens (§6.1) — ONE definition, in ./designTokens.js
// ---------------------------------------------------------------------------
//
// T-093 consolidated this. Until then, DEFAULT_TOKENS and resolveTokens were
// defined BOTH here and in ./designTokens.js (T-092). The two values happened
// to be identical, so nothing failed — but three behaviours differed, and each
// one is a §6.1 rule this file was getting wrong:
//
//   Rule 4, unknown keys "ignored, not an error" — the local resolveTokens used
//     Object.assign, which COPIED an unrecognised key into the resolved set.
//     Its own comment claimed the opposite. An unknown token then reached the
//     emitted className.
//   Rules 1 and 2, Tailwind classes only, never a colour literal or raw CSS —
//     the local version validated nothing, so `accent: '#ef4444'` emitted
//     `bg-#ef4444` and `gap: '16px'` emitted `16px` as a class name. That is
//     precisely the failure §6.1 rule 1 names: "a raw value forces the emitter
//     to invent a class name or inline a style".
//   Shared mutable default — `resolveTokens(undefined)` returned the module
//     object ITSELF, so one caller mutating the result silently changed the
//     default for every later generation in the process.
//
// designTokens.js gets all three right and is unit-tested for them, so this
// file now imports rather than restates. DEFAULT_TOKENS and resolveTokens stay
// re-exported at the bottom: T-025's test and other callers import them from
// here, and moving the definition should not move the import site.
//
// tokensFromIr rather than resolveTokens(ir.designTokens) is deliberate — it
// applies §6.1 rule 3, keeping theme.accent and designTokens.colors.accent in
// agreement. Without it a prompt that moved the accent moved `theme` only, and
// the emitted classes kept the default colour.
import { DEFAULT_TOKENS, resolveTokens, tokensFromIr } from './designTokens.js';

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function regionWidthClass(width) {
  // "1/2" → "md:w-1/2 w-full"
  if (!width) return 'w-full';
  return `w-full md:w-${width}`;
}

function containerClasses(layout, tokens) {
  const bp = (layout.breakpoint || tokens.breakpoints.stack || 'md');
  const dir = layout.direction === 'row' ? `flex-col ${bp}:flex-row` : 'flex-col';
  const maxW = layout.container?.maxWidth ? `max-w-[${layout.container.maxWidth}]` : '';
  const containerX = layout.container?.padding || tokens.spacing.containerX;
  return `w-full ${maxW} mx-auto ${containerX} flex ${dir}`;
}

// ---------------------------------------------------------------------------
// Element JSX renderers
// ---------------------------------------------------------------------------

/**
 * The CTA's class list, with the token accent applied (§6.1).
 *
 * The accent has to come from the tokens even when the element carries its own
 * `classes`. The golden component's button is
 * `... rounded-md bg-red-500 px-6 py-3 text-white ...` — the accent lives in
 * the button's classes, so a class list that omits a background renders a CTA
 * with no colour at all. Before T-093 this branch was `classes || <tokens>`:
 * any element carrying utility classes silently lost the accent, and the
 * "prompt sets the accent" beat produced an uncoloured button.
 *
 * A colour the element states explicitly still wins — an IR that says
 * `bg-blue-600` means it, and §6's conflict order does not let a default
 * override a stated value.
 */
function buttonClasses(classes, tokens) {
  const tokenClasses = `${tokens.components.button} ${tokens.borderRadius.button} bg-${tokens.colors.accent} px-6 py-3 text-${tokens.colors.accentContrast} ${tokens.typography.headingWeight} w-fit`;
  if (!classes) return tokenClasses;

  const parts = [classes];
  if (!/(^|\s)bg-\S+/.test(classes)) parts.push(`bg-${tokens.colors.accent}`);
  if (!/(^|\s)text-(?!sm\b|base\b|lg\b|xl\b|\dxl\b|left\b|center\b|right\b)\S+/.test(classes)) {
    parts.push(`text-${tokens.colors.accentContrast}`);
  }
  return parts.join(' ');
}

function renderElementNode(el, tokens) {
  const { elementName, contentType, tag, classes, css, alt } = el;
  const idExpr = `ids.${elementName}`;

  if (contentType === 'Image') {
    const altText = alt || `${elementName} image`;
    return `        <${tag}
          id={${idExpr}}
          className="dynamicStyle2 ${classes || ''}"
          src={getImage(getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}]))}
          onError={errorImage}
          alt="${altText}"
        />`;
  }

  if (contentType === 'Button') {
    return `        {/* R8 — PrimeReact <Button> swaps in here once "primereact" is installed. */}
        <button
          id={${idExpr}}
          type="button"
          className="dynamicStyle ${buttonClasses(classes, tokens)}"
          aria-label={getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}])}
          onClick={() => {
            // Stub — wired in a later phase.
          }}
        >
          {getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}])}
        </button>`;
  }

  if (contentType === 'Cards') {
    // Cards rendered separately via renderCardsBlock; this is a placeholder.
    return '';
  }

  // Text / Textfield
  return `        <${tag}
          id={${idExpr}}
          className="dynamicStyle ${classes || ''}"
          dangerouslySetInnerHTML={{
            __html: getHtml(
              getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}]),
              DEFAULTS[ids.${elementName}],
            ),
          }}
        />`;
}

function renderCardsBlock(cards, tokens) {
  if (!cards) return '';
  const { of: elName, gridColumns = 3, layoutMode = 'grid', fieldsPerItem = 2 } = cards;
  const gridClass = layoutMode === 'grid'
    ? `grid grid-cols-${gridColumns} ${tokens.spacing.gap} py-2`
    : `flex flex-col ${tokens.spacing.gap}`;

  const fieldRenderers = [];
  for (let f = 1; f <= fieldsPerItem; f++) {
    if (f === 1) {
      fieldRenderers.push(`              <span
                id={item.fieldId${f}}
                className="dynamicStyle ${tokens.typography.scale.stat} ${tokens.typography.headingWeight} text-${tokens.colors.text}"
                dangerouslySetInnerHTML={{
                  __html: getHtml(getCardFieldValue(data, item, 'fieldId${f}', 'field${f}'), item.field${f}),
                }}
              />`);
    } else {
      fieldRenderers.push(`              <span
                id={item.fieldId${f}}
                className="dynamicStyle ${tokens.typography.scale.eyebrow} text-${tokens.colors.textMuted}"
                dangerouslySetInnerHTML={{
                  __html: getHtml(getCardFieldValue(data, item, 'fieldId${f}', 'field${f}'), item.field${f}),
                }}
              />`);
    }
  }

  return `        <div id={ids.${elName}} className="${gridClass}">
          {items.map((item, index) => (
            <div key={item.fieldId1 || index} className="flex flex-col">
${fieldRenderers.join('\n')}
            </div>
          ))}
        </div>`;
}

// ---------------------------------------------------------------------------
// Region renderer
// ---------------------------------------------------------------------------

function renderRegion(region, elements, cards, tokens, bp) {
  const widthClass = regionWidthClass(region.width);
  const isMedia = region.role === 'media';

  // Sort children by element order
  const children = (region.children || [])
    .map(name => elements.find(e => e.elementName === name))
    .filter(Boolean)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const innerNodes = children.map(el => {
    if (el.contentType === 'Cards') {
      return renderCardsBlock(cards, tokens);
    }
    return renderElementNode(el, tokens);
  }).filter(Boolean).join('\n\n');

  if (isMedia) {
    return `      <div className="${widthClass}">
${innerNodes}
      </div>`;
  }

  return `      <div className="${widthClass} flex flex-col ${tokens.spacing.gap} ${tokens.spacing.sectionY}">
${innerNodes}
      </div>`;
}

// ---------------------------------------------------------------------------
// ids map builder
// ---------------------------------------------------------------------------

function buildIdsMap(elements, cards) {
  const lines = [];
  for (const el of elements) {
    if (el.fieldId) {
      lines.push(`  ${el.elementName}: '${el.fieldId}',`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DEFAULTS map builder
// ---------------------------------------------------------------------------

function buildDefaultsMap(elements, tokens) {
  const lines = [];
  for (const el of elements) {
    if (!el.fieldId) continue;
    let defaultVal = el.default || '';
    if (el.contentType === 'Image') {
      defaultVal = el.default || 'default/images/hero-placeholder.jpg';
    }
    lines.push(`  ['${el.fieldId}']: ${JSON.stringify(defaultVal)},`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DEFAULT_STAT_CARDS builder
// ---------------------------------------------------------------------------

function buildDefaultStatCards(cards) {
  if (!cards || !cards.items) return 'export const DEFAULT_STAT_CARDS = [];';
  const items = cards.items.map((item, i) => {
    const fields = [];
    for (let f = 1; f <= (cards.fieldsPerItem || 2); f++) {
      const key = `field${f}`;
      const typeKey = `fieldType${f}`;
      const idKey = `fieldId${f}`;
      fields.push(
        `    ${key}: ${JSON.stringify(item[key] || '')},`,
        `    ${typeKey}: 'Text',`,
        `    ${idKey}: ${JSON.stringify(item[idKey] || '')},`,
      );
    }
    return `  {\n${fields.join('\n')}\n  }`;
  });
  return `export const DEFAULT_STAT_CARDS = [\n${items.join(',\n')},\n];`;
}

// ---------------------------------------------------------------------------
// Mount field IDs collector
// ---------------------------------------------------------------------------

function collectAllMountFieldIds(elements, cards) {
  const ids = elements.filter(e => e.fieldId).map(e => `'${e.fieldId}'`);
  if (cards && cards.items) {
    for (const item of cards.items) {
      for (let f = 1; f <= (cards.fieldsPerItem || 2); f++) {
        const idKey = `fieldId${f}`;
        if (item[idKey]) ids.push(`'${item[idKey]}'`);
      }
    }
  }
  return ids.join(', ');
}

// ---------------------------------------------------------------------------
// Main emitter
// ---------------------------------------------------------------------------

/**
 * emitComponent(ir) → JSX source string
 *
 * @param {object} ir  Finalised IR with fieldId attached to every element and
 *                     fieldId1/fieldId2/… on every card item (done by the API
 *                     allocator before calling here).
 * @returns {string}   JSX file contents, ready to write.
 */
function emitComponent(ir) {
  // §6.1 rule 3 — theme.accent and designTokens.colors.accent must agree.
  // tokensFromIr applies that, so a prompt that moved theme.accent moves the
  // emitted colour with it.
  const tokens = tokensFromIr(ir);
  const { sectionName, pageName = 'Home', layout, theme, cards } = ir;
  const elements = ir.elements || [];
  const bp = layout?.breakpoint || tokens.breakpoints.stack || 'md';

  const sectionClassName = containerClasses(layout || {}, tokens);

  // Build each region
  const regionBlocks = (layout?.regions || [])
    .map(region => renderRegion(region, elements, cards, tokens, bp))
    .join('\n\n');

  const idsMapLines = buildIdsMap(elements, cards);
  const defaultsMapLines = buildDefaultsMap(elements, tokens);
  const defaultStatCardsBlock = buildDefaultStatCards(cards);
  const allMountIds = collectAllMountFieldIds(elements, cards);
  const cardsElName = cards?.of;
  const hasCards = Boolean(cards && cardsElName);

  const componentName = (sectionName || 'GeneratedSection')
    .replace(/[^a-zA-Z0-9]/g, '') || 'GeneratedSection';

  return `// Generated by emitComponent.js — do not edit by hand.
// SOURCE IR: sectionName="${sectionName}", pageName="${pageName}", irVersion="${ir.irVersion || '1.0'}"
// CONTRACT.md §6 and §7 — all R1-R14 rules enforced.

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { fetchElementsByIds } from '../../redux/fetchElementsByIds.js';
import { getHtml, getTextValue${hasCards ? ', getCardFieldValue' : ''} } from '../../utils/getHtml.js';
import { getImage, errorImage } from '../../utils/image.js';
import { getSectionTextContrastClass } from '../../utils/sectionContrast.js';

// R1 — const ids: every editable field, keyed by semantic name.
export const ids = {
${idsMapLines}
};

// Hard-coded default fallbacks for every non-Cards element (R6 / §9).
export const DEFAULTS = {
${defaultsMapLines}
};

${hasCards ? defaultStatCardsBlock : ''}

  ${hasCards ? `export function getStatItems(data) {
  const value = data && data[ids.${cardsElName}];
  return Array.isArray(value) && value.length > 0 ? value : DEFAULT_STAT_CARDS;
}` : ''}

export function getAllMountFieldIds() {
  ${hasCards ? `const cardFieldIds = DEFAULT_STAT_CARDS.flatMap((item) => [${
    Array.from({ length: cards.fieldsPerItem || 2 }, (_, i) => `item.fieldId${i + 1}`).join(', ')
  }]);
  return [...Object.values(ids), ...cardFieldIds];` : `return Object.values(ids);`}
}

// R14 — export default
export default function ${componentName}({ pageName = '${pageName}', section = {} }) {
  const dispatch = useDispatch();

  // R4 — read live values from state.cms.allSections[pageName]
  const data = useSelector((state) => state.cms.allSections[pageName] || {});
  const cssData = useSelector((state) => state.cms.allSectionsCss[pageName] || {});

  // R3 — dispatch fetchElementsByIds on mount with every field ID incl. nested card IDs
  useEffect(() => {
    dispatch(fetchElementsByIds({ elementIds: getAllMountFieldIds(), pageName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageName]);

  // R10 — apply allSectionsCss onto matching DOM ids after cssData changes
  useEffect(() => {
    Object.entries(cssData).forEach(([fieldId, cssText]) => {
      const node = document.getElementById(fieldId);
      if (node && cssText) {
        node.style.cssText = cssText;
      }
    });
  }, [cssData]);

  const textContrastClass = getSectionTextContrastClass(section);
  ${hasCards ? `const items = getStatItems(data); // R9 — never a fixed-length guard` : ''}

  return (
    <section className="${sectionClassName}">
${regionBlocks}
    </section>
  );
}
`;
}

export { emitComponent, DEFAULT_TOKENS, resolveTokens };
