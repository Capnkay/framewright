import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConflicts } from '../server/src/generate/resolveConflicts.js';

test('Prompt wins copy, colour, CTA, card count', () => {
  const promptIr = {
    theme: { accent: 'red-500' },
    designTokens: { colors: { accent: 'red-500' } },
    cards: { count: 4, items: [1,2,3,4] },
    elements: [
      { elementName: 'headlineMain', default: 'Prompt Copy' },
      { elementName: 'ctaButton', default: 'Prompt CTA', classes: 'prompt-cta-class' }
    ]
  };
  const wireframeIr = {
    theme: { accent: 'blue-500' },
    designTokens: { colors: { accent: 'blue-500' } },
    cards: { count: 3, items: [1,2,3] },
    elements: [
      { elementName: 'headlineMain', default: 'Wireframe Copy' },
      { elementName: 'ctaButton', default: 'Wireframe CTA', classes: 'wireframe-cta-class' }
    ]
  };
  const codeIr = {
    theme: { accent: 'green-500' },
    designTokens: { colors: { accent: 'green-500' } },
    cards: { count: 2, items: [1,2] },
    elements: [
      { elementName: 'headlineMain', default: 'Code Copy' },
      { elementName: 'ctaButton', default: 'Code CTA', classes: 'code-cta-class' }
    ]
  };

  const resolved = resolveConflicts({ promptIr, wireframeIr, codeIr });
  
  // Prompt wins over wireframe and code
  assert.equal(resolved.theme.accent, 'red-500');
  assert.equal(resolved.designTokens.colors.accent, 'red-500');
  assert.equal(resolved.cards.count, 4);
  
  const headline = resolved.elements.find(e => e.elementName === 'headlineMain');
  assert.equal(headline.default, 'Prompt Copy');
  
  const cta = resolved.elements.find(e => e.elementName === 'ctaButton');
  assert.equal(cta.default, 'Prompt CTA');
  assert.equal(cta.classes, 'prompt-cta-class'); // CTA behaviour from prompt overrides code

  // Warnings check
  assert.ok(resolved.warnings.includes('Prompt wins for copy'));
  assert.ok(resolved.warnings.includes('Prompt wins for colour'));
  assert.ok(resolved.warnings.includes('Prompt wins for CTA behaviour'));
  assert.ok(resolved.warnings.includes('Prompt wins for card count'));
});

test('Wireframe wins spatial layout', () => {
  const wireframeIr = {
    layout: { regions: ['wf-region1', 'wf-region2'], direction: 'column' },
    elements: [
      { elementName: 'img1', order: 1, bbox: [10, 10, 100, 100] }
    ]
  };
  const codeIr = {
    layout: { regions: ['code-region'], direction: 'row' },
    elements: [
      { elementName: 'img1', order: 5, bbox: [0, 0, 50, 50] }
    ]
  };

  const resolved = resolveConflicts({ wireframeIr, codeIr });

  assert.deepEqual(resolved.layout.regions, ['wf-region1', 'wf-region2']);
  assert.equal(resolved.layout.direction, 'column');
  
  const img = resolved.elements.find(e => e.elementName === 'img1');
  assert.equal(img.order, 1);
  assert.deepEqual(img.bbox, [10, 10, 100, 100]);
  
  assert.ok(resolved.warnings.includes('Wireframe wins for spatial layout'));
});

test('Code wins technical patterns', () => {
  const codeIr = {
    designTokens: { typography: { headingFamily: 'font-mono' } },
    elements: [
      { elementName: 'headlineMain', classes: 'code-classes', tag: 'h2' }
    ]
  };
  const wireframeIr = {
    designTokens: { typography: { headingFamily: 'font-sans' } },
    elements: [
      { elementName: 'headlineMain', classes: 'wf-classes', tag: 'h1' }
    ]
  };

  const resolved = resolveConflicts({ codeIr, wireframeIr });
  
  assert.equal(resolved.designTokens.typography.headingFamily, 'font-mono');
  
  const headline = resolved.elements.find(e => e.elementName === 'headlineMain');
  assert.equal(headline.classes, 'code-classes');
  assert.equal(headline.tag, 'h2');

  assert.ok(resolved.warnings.includes('Code wins for technical patterns'));
});

test('Base inheritance handles missing inputs', () => {
  const codeIr = {
    theme: { accent: 'code-accent' },
    elements: [{ elementName: 'title', default: 'Code Title' }]
  };
  
  // Only code provided, should return code values without conflict warnings
  const resolved = resolveConflicts({ codeIr });
  assert.equal(resolved.theme.accent, 'code-accent');
  assert.equal(resolved.elements.find(e => e.elementName === 'title').default, 'Code Title');
  assert.equal(resolved.warnings.length, 0);
});
