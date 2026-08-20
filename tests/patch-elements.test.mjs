import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { patchElement } from '../server/src/routes/elements.js';

const mockData = {
  sections: [],
  elements: [
    { fieldId: '2000000001', component: 'HeroSection', content: 'Old content' },
    { fieldId: '2000000002', component: 'Cards', loop: [{ fieldId1: '3000000001', field1: 'Card 1' }] }
  ]
};

const mockEnv = { STORE_TYPE: 'json' };

mock.method(fs, 'readFile', async () => JSON.stringify(mockData));
mock.method(fs, 'writeFile', async () => {});

test('patchElement requires valid fieldId', async () => {
  const res = await patchElement({ params: { fieldId: 'invalid' }, body: { content: 'test' } });
  assert.equal(res.status, 400);
});

test('patchElement requires at least one field', async () => {
  const res = await patchElement({ params: { fieldId: '2000000001' }, body: {} });
  assert.equal(res.status, 400);
});

test('patchElement strips forbidden HTML from content', async () => {
  const res = await patchElement({ 
    params: { fieldId: '2000000001' }, 
    body: { content: '<script>alert(1)</script><b onclick="foo()">Bold</b>' },
    env: mockEnv
  });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.element.content, '<b>Bold</b>');
});

test('patchElement rejects invalid CSS', async () => {
  const res = await patchElement({ 
    params: { fieldId: '2000000001' }, 
    body: { css: 'url(http://example.com)' }
  });
  assert.equal(res.status, 400);
});

test('patchElement returns 404 for unknown fieldId', async () => {
  const res = await patchElement({ params: { fieldId: '2000000999' }, body: { content: 'test' }, env: mockEnv });
  assert.equal(res.status, 404);
});

test('patchElement ignores content for Cards element', async () => {
  const res = await patchElement({ 
    params: { fieldId: '2000000002' }, 
    body: { content: 'Ignore me', loop: [{ fieldId1: '3000000001', field1: 'New Card 1' }] },
    env: mockEnv
  });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.element.content, undefined);
  assert.equal(res.body.element.loop[0].field1, 'New Card 1');
});

test('patchElement patches nested fieldId and returns parent', async () => {
  const res = await patchElement({ 
    params: { fieldId: '3000000001' }, 
    body: { content: 'Updated Card' },
    env: mockEnv
  });
  
  assert.equal(res.status, 200);
  assert.equal(res.body.element.fieldId, '2000000002');
  assert.equal(res.body.element.loop[0].field1, 'Updated Card');
});

test('patchElement rejects unknown nested fieldId in loop', async () => {
  const res = await patchElement({ 
    params: { fieldId: '2000000002' }, 
    body: { loop: [{ fieldId1: '3000000999', field1: 'Bad Card' }] },
    env: mockEnv
  });
  
  assert.equal(res.status, 400);
});
