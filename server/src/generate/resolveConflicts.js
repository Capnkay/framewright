// server/src/generate/resolveConflicts.js

/**
 * Resolves conflicts across prompt, wireframe, and code inputs per CONTRACT.md §6.
 * 
 * Conflict resolution order:
 * 1. Prompt wins for copy, colour, CTA behaviour and card count.
 * 2. Wireframe wins for spatial layout — regions, order, alignment.
 * 3. Code wins for technical patterns — selector shape, helper names, class conventions.
 */
export function resolveConflicts({ promptIr, wireframeIr, codeIr }) {
  if (!promptIr && !wireframeIr && !codeIr) return null;

  const resolved = { warnings: [] };

  // Helper to deep copy
  const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Take root properties from base (code > wireframe > prompt)
  const base = codeIr || wireframeIr || promptIr;
  Object.keys(base).forEach(k => {
    if (!['elements', 'layout', 'theme', 'designTokens', 'cards', 'warnings'].includes(k)) {
      resolved[k] = clone(base[k]);
    }
  });

  // Keep warnings from inputs if present
  [codeIr, wireframeIr, promptIr].forEach(ir => {
    if (ir && ir.warnings) resolved.warnings.push(...ir.warnings);
  });

  // Initialize objects
  resolved.theme = {};
  resolved.layout = {};
  resolved.cards = {};
  resolved.elements = [];
  resolved.designTokens = {};

  // Gather all element names
  const elementNames = new Set();
  [codeIr, wireframeIr, promptIr].forEach(ir => {
    if (ir && ir.elements) ir.elements.forEach(e => elementNames.add(e.elementName));
  });

  const getEl = (ir, name) => ir?.elements?.find(e => e.elementName === name) || {};

  let codeFired = false;
  let wireframeFired = false;
  let promptCopyFired = false;
  let promptColourFired = false;
  let promptCtaFired = false;
  let promptCardCountFired = false;

  // --- RULE 3: Code wins technical patterns ---
  // Design Tokens (except colors)
  const tokenKeys = new Set();
  [codeIr, wireframeIr, promptIr].forEach(ir => {
    if (ir?.designTokens) Object.keys(ir.designTokens).forEach(k => tokenKeys.add(k));
  });
  
  tokenKeys.forEach(k => {
    if (k === 'colors') return; // handled by Prompt wins
    
    const cVal = codeIr?.designTokens?.[k];
    const wVal = wireframeIr?.designTokens?.[k];
    const pVal = promptIr?.designTokens?.[k];
    
    if (cVal !== undefined) {
      resolved.designTokens[k] = clone(cVal);
      if ((wVal !== undefined && !eq(wVal, cVal)) || (pVal !== undefined && !eq(pVal, cVal))) {
        codeFired = true;
      }
    } else {
      resolved.designTokens[k] = clone(wVal !== undefined ? wVal : pVal);
    }
  });

  // --- RULE 2: Wireframe wins spatial layout ---
  // Layout object
  const layoutKeys = new Set();
  [codeIr, wireframeIr, promptIr].forEach(ir => {
    if (ir?.layout) Object.keys(ir.layout).forEach(k => layoutKeys.add(k));
  });

  layoutKeys.forEach(k => {
    const wVal = wireframeIr?.layout?.[k];
    const cVal = codeIr?.layout?.[k];
    const pVal = promptIr?.layout?.[k];
    
    if (wVal !== undefined) {
      resolved.layout[k] = clone(wVal);
      if ((cVal !== undefined && !eq(cVal, wVal)) || (pVal !== undefined && !eq(pVal, wVal))) {
        wireframeFired = true;
      }
    } else {
      resolved.layout[k] = clone(cVal !== undefined ? cVal : pVal);
    }
  });

  // --- RULE 1: Prompt wins copy/colour/CTA/card count ---
  // Theme (Colour)
  const themeKeys = new Set();
  [codeIr, wireframeIr, promptIr].forEach(ir => {
    if (ir?.theme) Object.keys(ir.theme).forEach(k => themeKeys.add(k));
  });

  themeKeys.forEach(k => {
    const pVal = promptIr?.theme?.[k];
    const wVal = wireframeIr?.theme?.[k];
    const cVal = codeIr?.theme?.[k];
    
    if (pVal !== undefined) {
      resolved.theme[k] = clone(pVal);
      if ((wVal !== undefined && !eq(wVal, pVal)) || (cVal !== undefined && !eq(cVal, pVal))) {
        promptColourFired = true;
      }
    } else {
      resolved.theme[k] = clone(wVal !== undefined ? wVal : cVal);
    }
  });

  // DesignTokens Colors
  const pColors = promptIr?.designTokens?.colors;
  const wColors = wireframeIr?.designTokens?.colors;
  const cColors = codeIr?.designTokens?.colors;
  
  if (pColors !== undefined) {
    resolved.designTokens.colors = clone(pColors);
    if ((wColors !== undefined && !eq(wColors, pColors)) || (cColors !== undefined && !eq(cColors, pColors))) {
      promptColourFired = true;
    }
  } else if (wColors !== undefined || cColors !== undefined) {
    resolved.designTokens.colors = clone(wColors !== undefined ? wColors : cColors);
  }

  // Cards
  const pCards = promptIr?.cards;
  const wCards = wireframeIr?.cards;
  const cCards = codeIr?.cards;
  
  if (pCards !== undefined) {
    resolved.cards = clone(pCards);
    if ((wCards !== undefined && !eq(wCards.count, pCards.count)) || 
        (cCards !== undefined && !eq(cCards.count, pCards.count))) {
      promptCardCountFired = true;
    }
  } else if (wCards !== undefined || cCards !== undefined) {
    resolved.cards = clone(wCards !== undefined ? wCards : cCards);
  }

  // ELEMENTS LOOP
  elementNames.forEach(name => {
    const cEl = getEl(codeIr, name);
    const wEl = getEl(wireframeIr, name);
    const pEl = getEl(promptIr, name);
    
    const resolvedEl = { elementName: name };

    // Common fields that don't have explicit conflict resolution, take code > wireframe > prompt
    const otherKeys = new Set([...Object.keys(cEl), ...Object.keys(wEl), ...Object.keys(pEl)]);
    otherKeys.delete('elementName');
    
    const resolveField = (key, pVal, wVal, cVal, winnerName) => {
      let val, fired = false;
      if (winnerName === 'prompt' && pVal !== undefined) {
        val = pVal;
        if ((wVal !== undefined && !eq(wVal, pVal)) || (cVal !== undefined && !eq(cVal, pVal))) fired = true;
      } else if (winnerName === 'wireframe' && wVal !== undefined) {
        val = wVal;
        if ((cVal !== undefined && !eq(cVal, wVal)) || (pVal !== undefined && !eq(pVal, wVal))) fired = true;
      } else if (winnerName === 'code' && cVal !== undefined) {
        val = cVal;
        if ((wVal !== undefined && !eq(wVal, cVal)) || (pVal !== undefined && !eq(pVal, cVal))) fired = true;
      } else {
        // Fallback code > wireframe > prompt
        if (cVal !== undefined) val = cVal;
        else if (wVal !== undefined) val = wVal;
        else val = pVal;
      }
      return { val, fired };
    };

    otherKeys.forEach(k => {
      let winnerName = null;
      
      // Determine winner rule
      if (k === 'default') {
        winnerName = 'prompt'; // Copy
      } else if (k === 'order' || k === 'bbox') {
        winnerName = 'wireframe'; // Spatial layout
      } else if (k === 'classes' || k === 'tag') {
        winnerName = 'code'; // Technical patterns
      }

      // CTA behaviour - if prompt explicitly provides properties for ctaButton, it wins
      if (name === 'ctaButton' && k === 'classes') {
        winnerName = 'prompt';
      }

      const res = resolveField(k, pEl[k], wEl[k], cEl[k], winnerName);
      if (res.val !== undefined) resolvedEl[k] = clone(res.val);

      if (res.fired) {
        if (winnerName === 'code') codeFired = true;
        if (winnerName === 'wireframe') wireframeFired = true;
        if (winnerName === 'prompt') {
          if (name === 'ctaButton') promptCtaFired = true;
          else if (k === 'default') promptCopyFired = true;
        }
      }
    });

    resolved.elements.push(resolvedEl);
  });

  if (codeFired) resolved.warnings.push('Code wins for technical patterns');
  if (wireframeFired) resolved.warnings.push('Wireframe wins for spatial layout');
  if (promptCopyFired) resolved.warnings.push('Prompt wins for copy');
  if (promptColourFired) resolved.warnings.push('Prompt wins for colour');
  if (promptCtaFired) resolved.warnings.push('Prompt wins for CTA behaviour');
  if (promptCardCountFired) resolved.warnings.push('Prompt wins for card count');

  // Clean up empty objects if they were empty in base
  if (Object.keys(resolved.theme).length === 0 && !base.theme) delete resolved.theme;
  if (Object.keys(resolved.layout).length === 0 && !base.layout) delete resolved.layout;
  if (Object.keys(resolved.cards).length === 0 && !base.cards) delete resolved.cards;
  if (Object.keys(resolved.designTokens).length === 0 && !base.designTokens) delete resolved.designTokens;

  return resolved;
}
