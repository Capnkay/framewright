import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeToIr } from '../server/src/generate/codeToIr.js';

test('codeToIr parses JSX into IR without execution (T-060)', async () => {
  const jsx = `
    import React from 'react';
    export default function MySection() {
      return (
        <div className="container">
          <h1 id={ids.mainTitle} className="text-2xl font-bold" dangerouslySetInnerHTML={{ __html: getHtml(val, 'Hello World') }}></h1>
          <img id={ids.heroImg} className="w-full" src={getImage(val, 'hero.jpg')} />
          <button id={ids.ctaBtn} className="bg-blue-500">Click Me</button>
          
          <div id={ids.featuresList} className="grid">
            {items.map(item => (
              <div key={item.fieldId1}>
                <span id={item.fieldId1} dangerouslySetInnerHTML={{ __html: getHtml(val, 'Feature 1') }}></span>
                <span id={item.fieldId2} dangerouslySetInnerHTML={{ __html: getHtml(val, 'Detail 1') }}></span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  `;

  const ir = await codeToIr(jsx, { pageName: 'Test', sectionName: 'MySection' });

  assert.equal(ir.irVersion, '1.0');
  assert.equal(ir.source.mode, 'code');
  assert.equal(ir.idPolicy.mode, 'preserve');
  assert.equal(ir.pageName, 'Test');
  assert.equal(ir.sectionName, 'MySection');

  // elements
  assert.ok(Array.isArray(ir.elements), 'must return elements array');
  
  const mainTitle = ir.elements.find(e => e.elementName === 'mainTitle');
  assert.ok(mainTitle, 'should extract mainTitle element');
  assert.equal(mainTitle.tag, 'h1');
  assert.equal(mainTitle.contentType, 'Text');
  assert.equal(mainTitle.default, 'Hello World');
  assert.match(mainTitle.css, /text-2xl font-bold/);

  const heroImg = ir.elements.find(e => e.elementName === 'heroImg');
  assert.ok(heroImg, 'should extract heroImg element');
  assert.equal(heroImg.tag, 'img');
  assert.equal(heroImg.contentType, 'Image');
  assert.equal(heroImg.default, 'hero.jpg');

  const ctaBtn = ir.elements.find(e => e.elementName === 'ctaBtn');
  assert.ok(ctaBtn, 'should extract ctaBtn element');
  assert.equal(ctaBtn.tag, 'button');
  assert.equal(ctaBtn.contentType, 'Text');
  assert.equal(ctaBtn.default, 'Click Me');

  // Loop container
  const featuresList = ir.elements.find(e => e.elementName === 'featuresList');
  assert.ok(featuresList, 'should extract featuresList element');
  assert.equal(featuresList.contentType, 'Cards');
  
  // Cards object
  assert.ok(ir.cards, 'should populate cards object for loops');
  assert.equal(ir.cards.fieldsPerItem, 2);
});
