import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSection } from '../server/src/validate/sectionValidator.js';

test('validates a correct section document', () => {
  const doc = {
    sectionName: 'Hero',
    sectionId: '1000000001',
    pageName: 'Home',
    variations: '1',
    sectionStatus: 'Pending',
    cardLayoutMode: 'grid',
    sectionTextMode: 'auto',
    _id: 'some-mongo-id'
  };
  const result = validateSection(doc);
  assert.equal(result.valid, true);
});

test('rejects sectionStatus outside enumeration', () => {
  const doc = {
    sectionName: 'Hero', sectionId: '1000000001', pageName: 'Home', variations: '1',
    sectionStatus: 'Unknown'
  };
  const result = validateSection(doc);
  assert.equal(result.valid, false);
});

test('rejects cardLayoutMode outside enumeration', () => {
  const doc = {
    sectionName: 'Hero', sectionId: '1000000001', pageName: 'Home', variations: '1',
    cardLayoutMode: 'flex'
  };
  const result = validateSection(doc);
  assert.equal(result.valid, false);
});

test('rejects sectionTextMode outside enumeration', () => {
  const doc = {
    sectionName: 'Hero', sectionId: '1000000001', pageName: 'Home', variations: '1',
    sectionTextMode: 'rainbow'
  };
  const result = validateSection(doc);
  assert.equal(result.valid, false);
});

test('rejects variations if numeric', () => {
  const doc = {
    sectionName: 'Hero', sectionId: '1000000001', pageName: 'Home',
    variations: 1
  };
  const result = validateSection(doc);
  assert.equal(result.valid, false);
});

test('rejects invalid sectionId format', () => {
  const doc = {
    sectionName: 'Hero', pageName: 'Home', variations: '1',
    sectionId: '2000000001'
  };
  const result = validateSection(doc);
  assert.equal(result.valid, false);
  
  const doc2 = {
    sectionName: 'Hero', pageName: 'Home', variations: '1',
    sectionId: '1000'
  };
  assert.equal(validateSection(doc2).valid, false);
});
