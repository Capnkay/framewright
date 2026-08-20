// client/src/sections/generated/HeroSection.jsx
//
// The golden reference component (deliverable 0.6). Every generated section
// derives from this file's shape: the `ids` map, the mount-time fetch, the
// store-only read path, the sanitised text nodes, the image helpers, the
// PrimeReact-shaped button, the R9 length-trap guard, and the CSS overlay
// effect.
//
// Data-selection logic (the `ids` map, defaults, the R9 guard, the card
// value getters) lives in the sibling ./HeroSection.logic.js — a
// zero-dependency module — so it is unit-testable with a bare `node --test`
// run before React/react-redux/PrimeReact are installed (Phase 1). Only
// this file, the actual component, imports React and friends.
//
// PrimeReact is NOT installed yet (Phase 1 installs it — see
// client/package.json). R8 calls for PrimeReact's <Button>; until that
// package exists in node_modules, importing it here would break the build
// for everyone. This file therefore renders a plain semantic <button> that
// carries the exact same id, classes, aria-label and label contract
// PrimeReact's <Button> will receive once it swaps in — a one-line import
// change, not a rewrite.

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { fetchElementsByIds } from '../../redux/fetchElementsByIds.js';
import { getHtml } from '../../utils/getHtml.js';
import { getImage, errorImage } from '../../utils/image.js';
import { getSectionTextContrastClass } from '../../utils/sectionContrast.js';
import {
  ids,
  DEFAULTS,
  getStatItems,
  getTextValue,
  getCardFieldValue,
  getAllMountFieldIds,
} from './HeroSection.logic.js';

export default function HeroSection({ pageName = 'Home', section = {} }) {
  const dispatch = useDispatch();

  // R4 — read live values from state.cms.allSections[pageName], and nothing
  // else. Fetching inside JSX without going through the store is a contract
  // failure, not a shortcut.
  const data = useSelector((state) => state.cms.allSections[pageName] || {});
  const cssData = useSelector((state) => state.cms.allSectionsCss[pageName] || {});

  // R3 — on mount, dispatch fetchElementsByIds with every field ID in the
  // tree, nested card IDs included.
  useEffect(() => {
    dispatch(fetchElementsByIds({ elementIds: getAllMountFieldIds(), pageName }));
    // pageName is the only thing that should re-trigger a fresh mount fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageName]);

  // R10 — apply allSectionsCss onto matching DOM ids after cssData changes.
  useEffect(() => {
    Object.entries(cssData).forEach(([fieldId, cssText]) => {
      const node = document.getElementById(fieldId);
      if (node && cssText) {
        node.style.cssText = cssText;
      }
    });
  }, [cssData]);

  const textContrastClass = getSectionTextContrastClass(section);
  const items = getStatItems(data); // R9 — never a fixed-length guard.

  return (
    <section className="w-full max-w-[1920px] mx-auto px-0 md:px-12 flex flex-col md:flex-row">
      {/* Media region */}
      <div className="w-full md:w-1/2">
        <img
          id={ids.heroImage}
          className="dynamicStyle2 w-full h-auto object-cover"
          src={getImage(getTextValue(data, ids.heroImage, DEFAULTS[ids.heroImage]))}
          onError={errorImage}
          alt="Pulse Fit member mid-workout"
        />
      </div>

      {/* Content region */}
      <div className={`w-full md:w-1/2 flex flex-col gap-4 py-8 md:py-16 ${textContrastClass}`}>
        <span
          id={ids.brandBadge}
          className="dynamicStyle text-sm font-semibold tracking-widest text-red-500"
          dangerouslySetInnerHTML={{
            __html: getHtml(
              getTextValue(data, ids.brandBadge, DEFAULTS[ids.brandBadge]),
              DEFAULTS[ids.brandBadge],
            ),
          }}
        />

        <h1
          id={ids.headlineMain}
          className="dynamicStyle text-4xl md:text-5xl font-extrabold tracking-tight leading-tight"
          dangerouslySetInnerHTML={{
            __html: getHtml(
              getTextValue(data, ids.headlineMain, DEFAULTS[ids.headlineMain]),
              DEFAULTS[ids.headlineMain],
            ),
          }}
        />

        <h2
          id={ids.headlineSub}
          className="dynamicStyle text-xl md:text-2xl font-medium text-gray-600"
          dangerouslySetInnerHTML={{
            __html: getHtml(
              getTextValue(data, ids.headlineSub, DEFAULTS[ids.headlineSub]),
              DEFAULTS[ids.headlineSub],
            ),
          }}
        />

        <p
          id={ids.description}
          className="dynamicStyle text-base text-gray-500 max-w-prose"
          dangerouslySetInnerHTML={{
            __html: getHtml(
              getTextValue(data, ids.description, DEFAULTS[ids.description]),
              DEFAULTS[ids.description],
            ),
          }}
        />

        <div id={ids.statBadges} className="grid grid-cols-3 gap-4 py-2">
          {items.map((item, index) => (
            <div key={item.fieldId1 || index} className="flex flex-col">
              <span
                id={item.fieldId1}
                className="dynamicStyle text-2xl font-bold text-gray-800"
                dangerouslySetInnerHTML={{
                  __html: getHtml(getCardFieldValue(data, item, 'fieldId1', 'field1'), item.field1),
                }}
              />
              <span
                id={item.fieldId2}
                className="dynamicStyle text-sm text-gray-500"
                dangerouslySetInnerHTML={{
                  __html: getHtml(getCardFieldValue(data, item, 'fieldId2', 'field2'), item.field2),
                }}
              />
            </div>
          ))}
        </div>

        {/* R8 — PrimeReact's <Button> swaps in here at Phase 1, once
            "primereact" exists in node_modules (see client/package.json).
            Same id, same classes, same aria-label, same label, same
            onClick contract — only the tag/import changes. */}
        <button
          id={ids.ctaButton}
          type="button"
          className="dynamicStyle inline-flex items-center justify-center rounded-md bg-red-500 px-6 py-3 text-white font-semibold w-fit"
          aria-label={getTextValue(data, ids.ctaButton, DEFAULTS[ids.ctaButton])}
          onClick={() => {
            // Stub — Phase 2 wires real CTA behaviour from the IR's cta config.
          }}
        >
          {getTextValue(data, ids.ctaButton, DEFAULTS[ids.ctaButton])}
        </button>
      </div>
    </section>
  );
}
