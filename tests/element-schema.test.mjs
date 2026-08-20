import { test } from 'node:test';
import assert from 'node:assert';
import { validateElement } from '../server/src/validate/elementValidator.js';

test('element-schema validates valid element', () => {
  const data = {
    sectionId: "1000000001",
    elementName: "headlineMain",
    fieldId: "2000000003",
    content: "CHALLENGE YOUR LIMITS",
    contentType: "Text",
    css: "font-weight: bold; text-align: left;",
    loop: null,
    projectName: "sample-brand",
    pageName: "Home"
  };
  const result = validateElement(data);
  assert.strictEqual(result.valid, true, 'Valid element should pass');
});

test('element-schema enforces loop requirement for Cards', () => {
  const noLoopCard = {
    sectionId: "1000000001",
    elementName: "statBadges",
    fieldId: "2000000006",
    content: null,
    contentType: "Cards",
    css: null,
    loop: null,
    projectName: "sample-brand",
    pageName: "Home"
  };
  let result = validateElement(noLoopCard);
  assert.strictEqual(result.valid, false, 'Cards without loop must be rejected');

  const validCard = { ...noLoopCard, loop: [
    {
      field1: "1000+",
      fieldType1: "Text",
      fieldId1: "3000000001",
      field2: "Community",
      fieldType2: "Text",
      fieldId2: "3000000002"
    }
  ]};
  result = validateElement(validCard);
  assert.strictEqual(result.valid, true, 'Cards with loop array must pass');
});

test('element-schema rejects loop for non-Cards', () => {
  const textWithLoop = {
    sectionId: "1000000001",
    elementName: "headlineMain",
    fieldId: "2000000003",
    content: "CHALLENGE YOUR LIMITS",
    contentType: "Text",
    css: null,
    loop: [], // Invalid for Text
    projectName: "sample-brand",
    pageName: "Home"
  };
  const result = validateElement(textWithLoop);
  assert.strictEqual(result.valid, false, 'Text with non-null loop must be rejected');
});

test('element-schema enforces ID ranges', () => {
  const badSectionId = {
    sectionId: "2000000001", // Section IDs must start with 1
    elementName: "headlineMain",
    fieldId: "2000000003",
    content: "Text",
    contentType: "Text",
    css: null,
    loop: null,
    projectName: "sample-brand",
    pageName: "Home"
  };
  assert.strictEqual(validateElement(badSectionId).valid, false);

  const badFieldId = {
    ...badSectionId,
    sectionId: "1000000001",
    fieldId: "3000000003" // Element field IDs must start with 2
  };
  assert.strictEqual(validateElement(badFieldId).valid, false);

  const badNestedFieldId = {
    sectionId: "1000000001",
    elementName: "statBadges",
    fieldId: "2000000006",
    content: null,
    contentType: "Cards",
    css: null,
    projectName: "sample-brand",
    pageName: "Home",
    loop: [{
      field1: "1000+",
      fieldType1: "Text",
      fieldId1: "2000000001" // Nested field IDs must start with 3
    }]
  };
  assert.strictEqual(validateElement(badNestedFieldId).valid, false);
});
