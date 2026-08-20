import { parse } from '@babel/parser';

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

function extractString(node) {
  if (!node) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map(q => q.value.raw).join('');
  }
  return '';
}

function extractDefaultContent(node) {
  // If it has children, combine JSXText
  if (node.children && node.children.length > 0) {
    const texts = node.children
      .filter(c => c.type === 'JSXText')
      .map(c => c.value.trim())
      .filter(Boolean);
    if (texts.length > 0) return texts.join(' ');
  }

  // If it has dangerouslySetInnerHTML={{ __html: getHtml(..., 'Fallback') }}
  const danger = node.openingElement.attributes.find(a => a.name && a.name.name === 'dangerouslySetInnerHTML');
  if (danger && danger.value && danger.value.type === 'JSXExpressionContainer') {
    const expr = danger.value.expression;
    if (expr.type === 'ObjectExpression') {
      const htmlProp = expr.properties.find(p => p.key && p.key.name === '__html');
      if (htmlProp && htmlProp.value && htmlProp.value.type === 'CallExpression') {
        const args = htmlProp.value.arguments;
        if (args && args.length >= 2) {
          return extractString(args[1]);
        }
      }
    }
  }

  // If it is an img with src={getImage(..., 'Fallback')}
  const src = node.openingElement.attributes.find(a => a.name && a.name.name === 'src');
  if (src && src.value && src.value.type === 'JSXExpressionContainer') {
    const expr = src.value.expression;
    if (expr.type === 'CallExpression') {
      const args = expr.arguments;
      if (args && args.length >= 2) {
        return extractString(args[1]);
      }
    }
  }

  return '';
}

function extractCss(node) {
  const cls = node.openingElement.attributes.find(a => a.name && a.name.name === 'className');
  if (!cls) return '';
  if (cls.value.type === 'StringLiteral') return cls.value.value;
  if (cls.value.type === 'JSXExpressionContainer') return extractString(cls.value.expression);
  return '';
}

export async function codeToIr(jsxString, options = {}) {
  const ir = {
    irVersion: '1.0',
    sectionType: options.sectionType || 'custom',
    platform: options.platform || 'Website',
    pageName: options.pageName || 'Home',
    sectionName: options.sectionName || 'Custom',
    source: {
      mode: 'code',
      inputs: ['code'],
    },
    idPolicy: { mode: 'preserve' },
    elements: [],
    warnings: [],
  };

  let ast;
  try {
    ast = parse(jsxString, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true
    });
  } catch (err) {
    ir.warnings.push(`AST parsing failed: ${err.message}`);
    return ir;
  }

  const jsxElements = findNodes(ast, n => n.type === 'JSXElement');

  const elements = [];
  let cards = null;
  let orderCounter = 1;

  for (const node of jsxElements) {
    const idAttr = node.openingElement.attributes.find(a => a.name && a.name.name === 'id');
    if (!idAttr || !idAttr.value || idAttr.value.type !== 'JSXExpressionContainer') continue;

    const expr = idAttr.value.expression;
    if (expr.type !== 'MemberExpression') continue;

    const objName = expr.object.name;
    const propName = expr.property.name;

    const tag = node.openingElement.name.name;
    const contentType = tag === 'img' ? 'Image' : 'Text';
    const css = extractCss(node);
    const content = extractDefaultContent(node);

    if (objName === 'ids') {
      // Regular element or Cards container
      
      // Is it a loop container?
      const isLoop = node.children.some(c => 
        c.type === 'JSXExpressionContainer' && 
        c.expression.type === 'CallExpression' && 
        c.expression.callee && c.expression.callee.property && 
        c.expression.callee.property.name === 'map'
      );

      elements.push({
        elementName: propName,
        contentType: isLoop ? 'Cards' : contentType,
        tag: tag,
        order: orderCounter++,
        default: isLoop ? undefined : content,
        css: css || undefined
      });

      if (isLoop) {
        // Find fieldsPerItem inside the map
        const mapExpr = node.children.find(c => c.type === 'JSXExpressionContainer').expression;
        if (mapExpr.arguments && mapExpr.arguments[0]) {
          const arrowFn = mapExpr.arguments[0];
          const innerJsx = findNodes(arrowFn, n => n.type === 'JSXElement');
          
          let maxField = 0;
          for (const inner of innerJsx) {
            const innerId = inner.openingElement.attributes.find(a => a.name && a.name.name === 'id');
            if (innerId && innerId.value && innerId.value.type === 'JSXExpressionContainer') {
              const innerExpr = innerId.value.expression;
              if (innerExpr.type === 'MemberExpression' && innerExpr.object.name === 'item') {
                const innerProp = innerExpr.property.name;
                const match = innerProp.match(/^fieldId(\d+)$/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (num > maxField) maxField = num;
                }
              }
            }
          }
          
          if (maxField > 0) {
            cards = { fieldsPerItem: maxField };
          }
        }
      }
    }
  }

  ir.elements = elements;
  if (cards) {
    ir.cards = cards;
  }

  return ir;
}
