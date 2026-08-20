import { test } from 'node:test';
import assert from 'node:assert';
import { validateIr } from '../server/src/validate/irValidator.js';

// The §6 example IR document, verbatim.
function makeReferenceIr() {
  return {
    irVersion: '1.0',
    sectionType: 'split-hero',
    platform: 'Website',
    pageName: 'Home',
    sectionName: 'Custom',

    source: {
      mode: 'combined',
      inputs: ['wireframe', 'prompt'],
      wireframeRef: 'uploads/job-0000000001.png',
    },

    layout: {
      direction: 'row',
      breakpoint: 'md',
      mobileBehaviour: 'stack',
      container: { maxWidth: '1920px', padding: 'px-0 md:px-12' },
      regions: [
        { role: 'media', side: 'left', width: '1/2', children: ['heroImage'] },
        {
          role: 'content',
          side: 'right',
          width: '1/2',
          children: ['brandBadge', 'headlineMain', 'headlineSub', 'description', 'statBadges', 'ctaButton'],
        },
      ],
      accents: [
        { edge: 'left', width: 'w-8', colour: 'red-500', fromBreakpoint: 'md' },
        { edge: 'right', width: 'w-8', colour: 'red-500', fromBreakpoint: 'md' },
      ],
    },

    theme: { accent: 'red-500', surface: 'white', text: 'gray-800', textMode: 'auto' },

    cards: {
      of: 'statBadges',
      count: 3,
      gridColumns: 3,
      layoutMode: 'grid',
      fieldsPerItem: 2,
      items: [
        { field1: '1000+', field2: 'Community<br />Members' },
        { field1: '40+', field2: 'Fitness<br />Programmes' },
        { field1: '150+', field2: 'Fitness<br />Channels' },
      ],
    },

    elements: [
      {
        elementName: 'headlineMain',
        contentType: 'Text',
        tag: 'h1',
        order: 2,
        default: 'CHALLENGE YOUR LIMITS',
        classes: 'text-4xl md:text-5xl font-extrabold tracking-tight text-gray-800 leading-tight',
        css: null,
        alt: null,
        confidence: 0.94,
        sourceOf: 'wireframe',
        bbox: [500, 80, 350, 60],
      },
    ],

    idPolicy: {
      mode: 'allocate',
      contentPolicy: 'overwrite',
      preserve: {
        elements: { headlineMain: '2000000003' },
        cards: { statBadges: [['3000000001', '3000000002']] },
      },
    },

    variations: '1',
    warnings: [],
  };
}

test('the §6 example IR document validates clean', () => {
  const result = validateIr(makeReferenceIr());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('an IR missing idPolicy.contentPolicy fails validation', () => {
  const ir = makeReferenceIr();
  delete ir.idPolicy.contentPolicy;
  const result = validateIr(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('contentPolicy')));
});

test('an IR carrying a numeric variations fails validation', () => {
  const ir = makeReferenceIr();
  ir.variations = 1;
  const result = validateIr(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === '$.variations'));
});

test('an IR whose cards.items carries a field ID is rejected — §6 field notes: no field IDs appear in the IR at all', () => {
  const ir = makeReferenceIr();
  ir.cards.items[0].fieldId1 = '3000000001';
  const result = validateIr(ir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('field ID')));
});

test('an IR with no designTokens validates clean — §6.1, absence is the deterministic default', () => {
  const ir = makeReferenceIr();
  assert.equal('designTokens' in ir, false);
  const result = validateIr(ir);
  assert.equal(result.valid, true);
});

test('an IR carrying designTokens explicitly still validates clean', () => {
  const ir = makeReferenceIr();
  ir.designTokens = {
    colors: { accent: 'red-500', accentContrast: 'white', surface: 'white', surfaceAlt: 'gray-50', text: 'gray-800', textMuted: 'gray-500' },
    typography: {
      headingFamily: 'font-sans',
      bodyFamily: 'font-sans',
      headingWeight: 'font-extrabold',
      bodyWeight: 'font-normal',
      scale: { h1: 'text-4xl md:text-5xl', h2: 'text-xl md:text-2xl', body: 'text-base', eyebrow: 'text-sm', stat: 'text-2xl' },
    },
    spacing: { sectionY: 'py-8 md:py-16', gap: 'gap-4', containerX: 'px-0 md:px-12' },
    shadows: { card: 'shadow-none', button: 'shadow-none' },
    borderRadius: { button: 'rounded-md', card: 'rounded-lg', image: 'rounded-none' },
    breakpoints: { stack: 'md' },
    components: { button: 'inline-flex items-center justify-center font-semibold' },
  };
  const result = validateIr(ir);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('an IR whose element confidence is out of the 0.0-1.0 band fails validation', () => {
  const ir = makeReferenceIr();
  ir.elements[0].confidence = 1.5;
  const result = validateIr(ir);
  assert.equal(result.valid, false);
});

test('an IR whose element confidence is null (non-visual source) validates clean', () => {
  const ir = makeReferenceIr();
  ir.elements[0].confidence = null;
  ir.elements[0].bbox = null;
  ir.elements[0].sourceOf = 'prompt';
  const result = validateIr(ir);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('an IR whose idPolicy.contentPolicy is outside overwrite|keep fails validation', () => {
  const ir = makeReferenceIr();
  ir.idPolicy.contentPolicy = 'merge';
  const result = validateIr(ir);
  assert.equal(result.valid, false);
});
