import { JSDOM } from 'jsdom';
import axe from 'axe-core';

/**
 * Run axe-core against a rendered HTML string.
 * A 18: "Accessibility | axe-core against the rendered preview | violation count by impact"
 * A 7: "image alt, CTA aria-label, no gray-400 body copy, no empty nested card id"
 */
export async function scoreAccessibility(html) {
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'HTML string required', violations: {} };
  }

  // Create JSDOM instance
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  
  // axe-core requires some browser globals to be present on global object if run outside of browser
  // But axe.run supports passing a document or node directly if the environment is somewhat shimmed.
  // Actually, axe-core can run on a JSDOM instance if we configure it correctly.
  
  // To avoid polluting global scope or issues with axe-core in node, we can run it within the DOM:
  // But wait, axe is imported in Node, not in the JSDOM window.
  // It works if global.window and global.document are present.
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalNode = global.Node;

  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;

  try {
    const results = await axe.run(dom.window.document.documentElement, {
      rules: {
        // Enforce specific A 7 rules by ensuring relevant standard rules are enabled
        'image-alt': { enabled: true },
        'button-name': { enabled: true },
        'color-contrast': { enabled: true },
      }
    });

    const violationsByImpact = {
      minor: 0,
      moderate: 0,
      serious: 0,
      critical: 0
    };

    let gray400BodyViolations = 0;
    let emptyCardIdViolations = 0;

    for (const violation of results.violations) {
      if (violationsByImpact[violation.impact] !== undefined) {
        violationsByImpact[violation.impact] += violation.nodes.length;
      }
    }
    
    // Check specific A 7 rules that axe-core might not catch out-of-the-box perfectly:
    // "no gray-400 body copy"
    const grayTextNodes = dom.window.document.querySelectorAll('p.text-gray-400, span.text-gray-400');
    if (grayTextNodes.length > 0) {
      violationsByImpact.serious += grayTextNodes.length;
    }

    // "no empty nested card id"
    const emptyCards = dom.window.document.querySelectorAll('[data-field-id=""]');
    if (emptyCards.length > 0) {
      violationsByImpact.critical += emptyCards.length;
    }
    
    return {
      ok: true,
      violations: violationsByImpact,
      raw: results.violations
    };
  } catch (err) {
    return { ok: false, error: err.message, violations: {} };
  } finally {
    global.window = originalWindow;
    global.document = originalDocument;
    global.Node = originalNode;
  }
}
