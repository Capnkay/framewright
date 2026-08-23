import re

with open('server/src/generate/promptToIrKeyless.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add REFERENCE_ELEMENTS_FEATURE and REFERENCE_CARDS_FEATURE after REFERENCE_CARDS
ref_feature = """
const REFERENCE_ELEMENTS_FEATURE = [
  { elementName: 'headlineMain', contentType: 'Text', tag: 'h2', order: 1, default: 'Powerful Features', classes: 'text-3xl md:text-4xl font-bold text-center', css: null, alt: null },
  { elementName: 'description', contentType: 'Textfield', tag: 'p', order: 2, default: 'Everything you need to succeed in your fitness journey.', classes: 'text-xl text-gray-500 text-center max-w-2xl mx-auto mt-4', css: null, alt: null },
  { elementName: 'featureCards', contentType: 'Cards', tag: 'div', order: 3, default: null, classes: 'grid gap-8 mt-12 py-2', css: null, alt: null }
];
const REFERENCE_CARDS_FEATURE = [
  { field1: 'Activity Tracking', field2: 'Monitor your daily steps, distance, and calories burned with precision.' },
  { field1: 'Custom Workouts', field2: 'Get personalized workout plans tailored to your goals.' },
  { field1: 'Analytics', field2: 'Visualize your improvements with detailed insights.' },
];
"""
code = code.replace("const FILLER_CARD =", ref_feature + "\nconst FILLER_CARD =")

# 2. Add to SECTION_TYPE_PATTERNS
patterns = """const SECTION_TYPE_PATTERNS = [
  { type: 'feature-grid', pattern: /\\bfeature[\\s-]?grid\\b|\\bfeatures\\b|\\bgrid\\b/i },
  { type: 'split-hero', pattern: /\\bsplit[\\s-]?hero\\b|\\bhero\\b|\\bbanner\\b|\\bmasthead\\b/i },
];"""
code = re.sub(r'const SECTION_TYPE_PATTERNS = \[[^\]]+\];', patterns, code)

# 3. Update buildCardItems
code = code.replace('function buildCardItems(count) {', 'function buildCardItems(count, templateCards = REFERENCE_CARDS) {')
code = code.replace('i < REFERENCE_CARDS.length ? { ...REFERENCE_CARDS[i] }', 'i < templateCards.length ? { ...templateCards[i] }')

# 4. In promptToIrKeyless:
code = code.replace('const elements = REFERENCE_ELEMENTS.map((el) => {', """
  const isFeature = sectionType.value === 'feature-grid';
  const templateElements = isFeature ? REFERENCE_ELEMENTS_FEATURE : REFERENCE_ELEMENTS;
  const templateCards = isFeature ? REFERENCE_CARDS_FEATURE : REFERENCE_CARDS;
  
  const elements = templateElements.map((el) => {""")

code = code.replace('REFERENCE_CARDS.length', 'templateCards.length')

layout_orig = """    layout: {
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
          children: [
            'brandBadge',
            'headlineMain',
            'headlineSub',
            'description',
            'statBadges',
            'ctaButton',
          ],
        },
      ],
      accents: [
        { edge: 'left', width: 'w-8', colour: accent.value, fromBreakpoint: 'md' },
        { edge: 'right', width: 'w-8', colour: accent.value, fromBreakpoint: 'md' },
      ],
    },"""
layout_new = """    layout: {
      direction: isFeature ? 'col' : 'row',
      breakpoint: 'md',
      mobileBehaviour: 'stack',
      container: { maxWidth: '1920px', padding: 'px-0 md:px-12' },
      regions: isFeature ? [
        { role: 'content', side: 'center', width: 'w-full', children: ['headlineMain', 'description', 'featureCards'] }
      ] : [
        { role: 'media', side: 'left', width: '1/2', children: ['heroImage'] },
        { role: 'content', side: 'right', width: '1/2', children: ['brandBadge', 'headlineMain', 'headlineSub', 'description', 'statBadges', 'ctaButton'] },
      ],
      accents: isFeature ? [] : [
        { edge: 'left', width: 'w-8', colour: accent.value, fromBreakpoint: 'md' },
        { edge: 'right', width: 'w-8', colour: accent.value, fromBreakpoint: 'md' },
      ],
    },"""
code = code.replace(layout_orig, layout_new)

code = code.replace("of: 'statBadges',", "of: isFeature ? 'featureCards' : 'statBadges',")
code = code.replace("items: buildCardItems(cardCount.value),", "items: buildCardItems(cardCount.value, templateCards),")

with open('server/src/generate/promptToIrKeyless.js', 'w', encoding='utf-8') as f:
    f.write(code)
print("Patched promptToIrKeyless.js successfully.")
