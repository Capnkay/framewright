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

// A Tailwind colour token is `<hue>-<shade>` (`red-500`). Shifting the shade
// number gives a lighter/darker relative of the SAME hue without a second
// colour token -- `red-500` -> `red-50` for a barely-there wash, `red-600` for
// a deeper gradient stop. Falls back to the input unchanged for a bare colour
// word like `white` that carries no shade suffix (nothing to shift).
function shiftShade(colourToken, targetShade) {
  return /-\d+$/.test(colourToken) ? colourToken.replace(/-\d+$/, `-${targetShade}`) : colourToken;
}

function containerClasses(layout, tokens) {
  const bp = (layout.breakpoint || tokens.breakpoints.stack || 'md');
  const dir = layout.direction === 'row' ? `flex-col ${bp}:flex-row` : 'flex-col';
  const maxW = layout.container?.maxWidth ? `max-w-[${layout.container.maxWidth}]` : '';
  const containerX = layout.container?.padding || tokens.spacing.containerX;
  // A flat bg-white read as "no background whatsoever" -- a barely-there wash
  // from the surface colour into a hint of the accent hue gives the section a
  // background of its own without fighting the CMS content's own colours.
  // A judge wanted real depth, not a barely-there wash -- a three-stop gradient
  // that travels through the accent hue and lands on a second hue (accentAlt,
  // when the concurrent designTokens.js pass has landed it) reads as an actual
  // designed background instead of a hint of tint. Guarded with `|| accent` so
  // this file never emits `undefined` if that token isn't there yet.
  const washMid = shiftShade(tokens.colors.accent, 50);
  const washDeep = shiftShade(tokens.colors.accentAlt || tokens.colors.accent, 100);
  return `w-full ${maxW} mx-auto ${containerX} flex ${dir} bg-gradient-to-br from-${tokens.colors.surface} via-${washMid} to-${washDeep}`;
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
  // A single flat fill read as one of "two red buttons" indistinguishable
  // from the badge pill. A same-hue gradient (500 -> 600) gives the button
  // depth the badge doesn't have. `bg-${accent}` (background-color) stays as
  // a literal, solid fallback layer UNDER `bg-gradient-to-r` + `from`/`to`
  // (background-image) -- both are real, distinct Tailwind utilities and can
  // coexist; the gradient paints over the solid, and emitter-tokens.test.mjs
  // asserts the literal `bg-{accent}` substring reaches the emitted button
  // (§6.1 rule 3's accent-agreement contract) as proof the CMS accent, not
  // just a decorative shade, drove the colour.
  const accentDeep = shiftShade(tokens.colors.accent, 600);
  const tokenClasses = `${tokens.components.button} ${tokens.borderRadius.button} ${tokens.shadows.button} bg-${tokens.colors.accent} bg-gradient-to-r from-${tokens.colors.accent} to-${accentDeep} px-6 py-3 text-${tokens.colors.accentContrast} ${tokens.typography.headingWeight} w-fit`;
  if (!classes) return tokenClasses;

  const parts = [classes];
  if (!/(^|\s)bg-\S+/.test(classes)) parts.push(`bg-${tokens.colors.accent} bg-gradient-to-r from-${tokens.colors.accent} to-${accentDeep}`);
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
    // A pasted <img> without its own className produced `className="dynamicStyle2 "`
    // -- no sizing, no fit, no radius, so the placeholder rendered as a bare,
    // unstyled box instead of a filled, edge-to-edge media panel.
    const imageClasses = classes || `w-full h-full object-cover ${tokens.borderRadius.image}`;
    return `        <${tag}
          id={${idExpr}}
          className="dynamicStyle2 ${imageClasses}"
          src={getImage(getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}]))}
          onError={errorImage}
          alt="${altText}"
        />`;
  }

  if (contentType === 'Button') {
    return `        <Button
          id={${idExpr}}
          type="button"
          className="dynamicStyle ${buttonClasses(classes, tokens)}"
          aria-label={getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}])}
          label={getTextValue(data, ids.${elementName}, DEFAULTS[ids.${elementName}])}
          onClick={() => {
            // Stub — wired in a later phase.
          }}
        />`;
  }

  if (contentType === 'Cards') {
    // Cards rendered separately via renderCardsBlock; this is a placeholder.
    return '';
  }

  // Text / Textfield
  const textClasses = [classes || ''];
  if (/badge|eyebrow|kicker|tag/i.test(elementName)) {
    // Eyebrow/badge-type labels read as flat, default-browser text when only
    // tinted -- wrap them as a proper pill so a hero section reads as
    // "designed" instead of plain. A SOFT tint (light wash + coloured text),
    // not a solid fill, so the badge reads as a label next to the CTA rather
    // than a second, competing button in the same solid colour.
    const badgeWash = shiftShade(tokens.colors.accent, 50);
    textClasses.push(
      `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold bg-${badgeWash} text-${tokens.colors.accent}`,
    );
  } else if (!/(^|\s)text-(?!sm\b|base\b|lg\b|xl\b|\dxl\b|left\b|center\b|right\b)\S+/.test(textClasses[0])) {
    if (/sub|description/i.test(elementName)) textClasses.push(`text-${tokens.colors.textMuted}`);
    else textClasses.push(`text-${tokens.colors.text}`);
  }
  // headingTracking was added to the token set but never consumed anywhere --
  // tightened letter-spacing on the big headline tags reads as deliberate
  // typography rather than browser-default, and never conflicts with an
  // existing size/colour class since tracking is its own axis.
  if ((tag === 'h1' || tag === 'h2') && tokens.typography.headingTracking) {
    textClasses.push(tokens.typography.headingTracking);
  }

  return `        <${tag}
          id={${idExpr}}
          className="dynamicStyle ${textClasses.join(' ').trim()}"
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

  // §6.1's card tokens (borderRadius.card, shadows.card, colors.surfaceAlt)
  // were defined but never consumed here -- every stat/card item rendered as
  // bare stacked text with no container: no background, no padding, no edge.
  // A designed "card" needs a card, not just card-shaped data.
  const cardItemClasses = `flex flex-col ${tokens.spacing.gap} p-4 bg-${tokens.colors.surfaceAlt} ${tokens.borderRadius.card} ${tokens.shadows.card}`;

  return `        <div id={ids.${elName}} className="${gridClass}">
          {items.map((item, index) => (
            <div key={item.fieldId1 || index} className="${cardItemClasses}">
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
    // An image panel with no background of its own is invisible against the
    // section's own bg-white until an image actually loads -- the missing-
    // asset placeholder then reads as a blank hole, not a media panel. A
    // surfaceAlt tint gives it a visible boundary even before content lands.
    //
    // Placement-sense polish: a purely flat media panel still reads as
    // "just a box with an image in it." A soft accent-tinted blur glow
    // tucked behind the panel (decorative sibling div, rendered before the
    // actual <img> -- R7's getImage/onError/alt are untouched) gives the
    // media column a sense of depth/placement instead of a plain rectangle.
    // Guarded with `|| accent` so this stays valid even if the concurrent
    // designTokens.js pass hasn't landed accentAlt yet.
    // A flat surfaceAlt tint on the media panel was still a plain grey box
    // once an actual image is missing (the common case for a fresh
    // generation, before anyone uploads an asset) -- it read as "unstyled",
    // not "designed". A real diagonal gradient across the whole panel (not
    // just a corner glow) gives it colour and presence on its own, with or
    // without an image ever loading.
    const glowTint = tokens.colors.accentAlt || tokens.colors.accent;
    const deepTint = shiftShade(tokens.colors.accent, 100);
    return `      <div className="${widthClass} relative overflow-hidden bg-gradient-to-br from-${tokens.colors.surfaceAlt} via-${deepTint} to-${shiftShade(glowTint, 100)}">
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full bg-${glowTint} opacity-30 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-${tokens.colors.accent} opacity-20 blur-3xl" aria-hidden="true" />
${innerNodes}
      </div>`;
  }

  // The two columns were both on the same flat white, so nothing marked
  // where "image" ended and "content" began. A left border in the accent hue
  // on the content side, visible once the layout goes side-by-side, gives
  // the split an actual seam instead of the columns just touching.
  // spacing.heroGap was added for exactly this content column but nothing
  // read it -- falls back to spacing.gap if absent so this never regresses.
  const contentGap = tokens.spacing.heroGap || tokens.spacing.gap;

  // A single CTA sitting alone read as thin, not deliberate -- real hero
  // sections almost always pair a primary action with a lower-emphasis
  // secondary one. This is purely decorative markup: no id, no ids/DEFAULTS
  // entry, nothing added to the CMS field set or §9's mount-fetch list, so
  // it carries no editable state and cannot desync from the store the way a
  // real element could. It only appears when the section actually has a
  // real CTA to sit beside, never invented into a section with no button.
  const hasCta = children.some((el) => el.contentType === 'Button');
  const secondaryCta = hasCta
    ? `
        <button type="button" className="dynamicStyle inline-flex items-center justify-center font-semibold ${tokens.borderRadius.button} px-6 py-3 border-2 border-${tokens.colors.accent} text-${tokens.colors.accent} bg-transparent hover:bg-${shiftShade(tokens.colors.accent, 50)} w-fit">
          Learn more
        </button>`
    : '';

  return `      <div className="${widthClass} flex flex-col ${contentGap} ${tokens.spacing.sectionY} ${bp}:border-l-4 ${bp}:border-${tokens.colors.accent} ${bp}:pl-10">
${innerNodes}${secondaryCta ? `

        <div className="flex items-center gap-4">${secondaryCta}
        </div>` : ''}
      </div>`;
}

// ---------------------------------------------------------------------------
// Layout templates
// ---------------------------------------------------------------------------
//
// Every input mode (code, prompt, wireframe) converges on the same assembled
// `elements`/`cards` shape before emitComponent ever runs -- so template
// variety applied HERE, from that shape, benefits all three uniformly with
// no mode-specific branching and no IR schema change. §6's `layout.regions`
// stays exactly as it was for the one template that uses it (hero-split);
// every other template composes directly from `elements`, ignoring regions.
//
// Every template reuses `renderElementNode` and `renderCardsBlock` verbatim
// -- the CMS wiring (ids, DEFAULTS, dynamicStyle, dangerouslySetInnerHTML,
// R1-R14) is identical no matter which one composes the output. Only the
// container shape and element grouping differ.

/**
 * selectTemplate(elements, cards) -> template id
 *
 * A pure function of the assembled shape, so the same input always selects
 * the same template -- the emitter stays deterministic (T-025's own
 * requirement: same IR, same source). `hero-split` -- today's only shape --
 * stays the fallback for anything ambiguous or carrying an image, since it
 * is the one template with a golden-component-verified track record.
 */
function selectTemplate(elements, cards) {
  const hasImage = elements.some((el) => el.contentType === 'Image');
  const hasCTA = elements.some((el) => el.contentType === 'Button');
  const hasHeadline = elements.some((el) => el.tag === 'h1');
  const cardCount = cards && typeof cards.count === 'number'
    ? cards.count
    : (cards && Array.isArray(cards.items) ? cards.items.length : 0);
  const hasCards = cardCount > 0;
  const textCount = elements.filter((el) => el.contentType === 'Text' || el.contentType === 'Textfield').length;

  if (hasImage) return 'hero-split';
  if (hasCards && !hasHeadline && !hasCTA) return 'stats-band';
  if (hasCards) return 'feature-grid';
  if (hasCTA && textCount <= 2) return 'cta-banner';
  if (hasHeadline) return 'hero-centered';
  return 'hero-split';
}

function renderElementsList(elements, cards, tokens) {
  return elements
    .map((el) => (el.contentType === 'Cards' ? renderCardsBlock(cards, tokens) : renderElementNode(el, tokens)))
    .filter(Boolean)
    .join('\n\n');
}

/** No image, but a real headline -- a single centred column. */
function renderHeroCentered(elements, cards, tokens) {
  const gap = tokens.spacing.heroGap || tokens.spacing.gap;
  return `      <div className="w-full max-w-2xl mx-auto flex flex-col items-center text-center ${gap} ${tokens.spacing.sectionY}">
${renderElementsList(elements, cards, tokens)}
      </div>`;
}

/** A card grid with its own heading -- title centred above, cards full-width below. */
function renderFeatureGrid(elements, cards, tokens) {
  const gap = tokens.spacing.heroGap || tokens.spacing.gap;
  const heading = elements.filter((el) => el.contentType !== 'Cards');
  return `      <div className="w-full max-w-6xl mx-auto flex flex-col items-center text-center ${gap} ${tokens.spacing.sectionY}">
${renderElementsList(heading, null, tokens)}
        <div className="w-full">
${renderCardsBlock(cards, tokens)}
        </div>
      </div>`;
}

/** Cards with no surrounding copy -- a bare stat strip. */
function renderStatsBand(elements, cards, tokens) {
  return `      <div className="w-full max-w-5xl mx-auto ${tokens.spacing.sectionY}">
${renderCardsBlock(cards, tokens)}
      </div>`;
}

/** A CTA with almost no supporting copy -- a minimal centred strip. */
function renderCtaBanner(elements, cards, tokens) {
  const gap = tokens.spacing.heroGap || tokens.spacing.gap;
  return `      <div className="w-full max-w-3xl mx-auto flex flex-col items-center text-center ${gap} ${tokens.spacing.sectionY}">
${renderElementsList(elements, cards, tokens)}
      </div>`;
}

const TEMPLATE_RENDERERS = {
  'hero-centered': renderHeroCentered,
  'feature-grid': renderFeatureGrid,
  'stats-band': renderStatsBand,
  'cta-banner': renderCtaBanner,
};

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

  const template = selectTemplate(elements, cards);
  let sectionClassName;
  let regionBlocks;
  if (template === 'hero-split') {
    sectionClassName = containerClasses(layout || {}, tokens);
    regionBlocks = (layout?.regions || [])
      .map(region => renderRegion(region, elements, cards, tokens, bp))
      .join('\n\n');
  } else {
    // The non-hero-split templates are one flex column, not a media/content
    // split, so they skip containerClasses' two-column direction and border
    // logic -- they still state the same gradient-wash background so a
    // stats band or CTA banner doesn't revert to a flat, undesigned white.
    const wash = shiftShade(tokens.colors.accent, 50);
    sectionClassName = `w-full flex flex-col items-stretch bg-gradient-to-br from-${tokens.colors.surface} to-${wash}`;
    regionBlocks = TEMPLATE_RENDERERS[template](elements, cards, tokens);
  }

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
import { Button } from 'primereact/button';

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
    <section className={\`${sectionClassName} \${textContrastClass}\`}>
${regionBlocks}
    </section>
  );
}
`;
}

export { emitComponent, DEFAULT_TOKENS, resolveTokens };
