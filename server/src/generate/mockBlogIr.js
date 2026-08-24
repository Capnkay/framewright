export function getMockBlogIr(pageName = 'Blog', sectionName = 'Blog') {
  const elements = [
    {
      elementName: 'blog_title',
      contentType: 'Text',
      tag: 'h1',
      default: 'BLOG',
      order: 0,
      css: 'position: absolute; left: 40px; top: 20px; width: 680px; text-align: center; font-size: 36px; font-weight: bold;',
    },
    {
      elementName: 'blog_pagination',
      contentType: 'Text',
      tag: 'p',
      default: '1 2 3 [Next Page]',
      order: 100,
      css: 'position: absolute; left: 40px; top: 1020px; width: 680px; text-align: center; font-size: 14px;',
    }
  ];

  const cols = [40, 275, 510];
  const rows = [100, 410, 720];
  
  const tags = ['[DESIGN]', '[DEV]', '[UX]', '[TIPS]', '[TIPS]', '[NEWS]', '[DESIGN]', '[DEV]', '[STYLE]'];
  const titles = [
    'Design Patterns', 'React Performance', 'UX Principles',
    'Framer Motion Tips', 'Tailwind Tricks', 'Tech News',
    'Color Theory', 'Node.js Backend', 'Modern CSS'
  ];

  let order = 1;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const X = cols[c];
      const Y = rows[r];

      // Image
      elements.push({
        elementName: `card_${idx + 1}_image`,
        contentType: 'Image',
        tag: 'div',
        default: 'default/images/hero-placeholder.jpg',
        order: order++,
        css: `position: absolute; left: ${X}px; top: ${Y}px; width: 210px; height: 120px; background: #e5e7eb; border-radius: 8px;`,
      });

      // Tag
      elements.push({
        elementName: `card_${idx + 1}_tag`,
        contentType: 'Text',
        tag: 'span',
        default: tags[idx],
        order: order++,
        css: `position: absolute; left: ${X + 150}px; top: ${Y + 10}px; width: 50px; font-size: 12px; font-weight: bold; text-align: right;`,
      });

      // Title
      elements.push({
        elementName: `card_${idx + 1}_title`,
        contentType: 'Text',
        tag: 'h3',
        default: titles[idx],
        order: order++,
        css: `position: absolute; left: ${X}px; top: ${Y + 130}px; width: 210px; font-size: 18px; font-weight: bold;`,
      });

      // Author
      elements.push({
        elementName: `card_${idx + 1}_author`,
        contentType: 'Text',
        tag: 'p',
        default: 'Author Name | Jan 01',
        order: order++,
        css: `position: absolute; left: ${X}px; top: ${Y + 160}px; width: 210px; font-size: 12px; color: #6b7280;`,
      });

      // Excerpt
      elements.push({
        elementName: `card_${idx + 1}_excerpt`,
        contentType: 'Text',
        tag: 'p',
        default: 'Lorem ipsum dolor sit amet, consectetuer adipiscing elit. ---Excerpt Lines---',
        order: order++,
        css: `position: absolute; left: ${X}px; top: ${Y + 185}px; width: 210px; font-size: 14px; color: #4b5563;`,
      });
    }
  }

  return {
    sectionName,
    pageName,
    variations: '1',
    designTokens: {},
    elements
  };
}
