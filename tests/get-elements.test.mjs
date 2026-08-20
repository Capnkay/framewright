import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { getElements } from '../server/src/routes/elements.js';

test('getElements rejects unfiltered requests with 400', async () => {
  const result = await getElements({ query: {}, env: { STORE_TYPE: 'json' } });
  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
});

test('getElements accepts pageName and returns bare array', async (t) => {
  t.mock.method(fs, 'readFile', async () => '{"sections":[],"elements":[]}');
  const result = await getElements({ query: { pageName: 'Home' }, env: { STORE_TYPE: 'json' } });
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body), 'response must be a bare array');
});

test('getElements accepts sectionId and returns bare array', async (t) => {
  t.mock.method(fs, 'readFile', async () => '{"sections":[],"elements":[]}');
  const result = await getElements({ query: { sectionId: '1000000001' }, env: { STORE_TYPE: 'json' } });
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body), 'response must be a bare array');
});

test('getElements accepts fieldIds string and returns bare array', async (t) => {
  t.mock.method(fs, 'readFile', async () => '{"sections":[],"elements":[]}');
  const result = await getElements({ query: { fieldIds: '2000000001,2000000002' }, env: { STORE_TYPE: 'json' } });
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body), 'response must be a bare array');
});

test('getElements accepts fieldIds array and returns bare array', async (t) => {
  t.mock.method(fs, 'readFile', async () => '{"sections":[],"elements":[]}');
  const result = await getElements({ query: { fieldIds: ['2000000001'] }, env: { STORE_TYPE: 'json' } });
  assert.equal(result.status, 200);
  assert.ok(Array.isArray(result.body), 'response must be a bare array');
});
