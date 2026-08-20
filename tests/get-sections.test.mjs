import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import { getSections, getSection } from '../server/src/routes/sections.js';
import { STATUS } from '../server/src/http/envelope.js';
import { createStore } from '../server/src/store/index.js';

// We will test the routes directly. Since they call createStore(ctx.env), we can mock the store.
// But wait, createStore in index.js checks ctx.env.STORE_TYPE. If we set it to 'stub', it throws.
// Instead of messing with real files or databases, we can use require/import hacking, 
// OR we can just inject a mocked store into ctx.env and modify createStore to accept an injected instance?
// Contract says: "The route table and its handlers are dependency-free by design."
// Let's just create a custom env variable or mock the import.
// Even better: since this is a unit test, we can use a temporary real JSON store.

const STORE_PATH = './server/data/store.json';
const BACKUP_PATH = './server/data/store.json.bak';

before(async () => {
  try {
    await fs.copyFile(STORE_PATH, BACKUP_PATH);
  } catch (err) {
    // ignore if it doesn't exist
  }

  await fs.writeFile(STORE_PATH, JSON.stringify({
    counters: { section: 1000000003, element: 2000000001, cardField: 3000000001 },
    sections: [
      { sectionId: "1000000001", pageName: "Home", sectionName: "Hero" },
      { sectionId: "1000000002", pageName: "About", sectionName: "Team" }
    ],
    elements: []
  }));
});

after(async () => {
  try {
    await fs.copyFile(BACKUP_PATH, STORE_PATH);
    await fs.rm(BACKUP_PATH);
  } catch (err) {
    await fs.rm(STORE_PATH, { force: true });
  }
});

test('getSections returns a bare array of sections', async () => {
  const ctx = { env: { STORE_TYPE: 'json' }, query: {} };
  const res = await getSections(ctx);
  
  assert.strictEqual(res.status, STATUS.OK);
  assert.strictEqual(Array.isArray(res.body), true, 'Must return a bare array');
  assert.strictEqual(res.body.length, 2);
  assert.strictEqual(res.body[0].sectionId, "1000000001");
});

test('getSections returns a bare array filtered by pageName', async () => {
  const ctx = { env: { STORE_TYPE: 'json' }, query: { pageName: 'About' } };
  const res = await getSections(ctx);
  
  assert.strictEqual(res.status, STATUS.OK);
  assert.strictEqual(res.body.length, 1);
  assert.strictEqual(res.body[0].sectionId, "1000000002");
});

test('getSection returns a bare document', async () => {
  const ctx = { env: { STORE_TYPE: 'json' }, params: { sectionId: '1000000001' } };
  const res = await getSection(ctx);
  
  assert.strictEqual(res.status, STATUS.OK);
  assert.strictEqual(res.body.sectionId, "1000000001", 'Must return bare document');
  assert.strictEqual(res.body.pageName, "Home");
});

test('getSection returns 404 for non-existent document', async () => {
  const ctx = { env: { STORE_TYPE: 'json' }, params: { sectionId: '1000000009' } };
  const res = await getSection(ctx);
  
  assert.strictEqual(res.status, STATUS.NOT_FOUND);
});

test('getSection validates sectionId shape', async () => {
  const ctx = { env: { STORE_TYPE: 'json' }, params: { sectionId: 'invalid-id' } };
  const res = await getSection(ctx);
  
  assert.strictEqual(res.status, STATUS.BAD_REQUEST);
});
