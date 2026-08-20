import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/src/store/index.js';
import { createJsonStore } from '../server/src/store/jsonStore.js';
import { createAdapter } from '../server/src/store/adapter.js';
import { seedStore } from '../server/src/store/seed.js';

test('seedStore loads Pulse Fit data without duplicating', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framewright-seed-test-'));
  const storePath = path.join(tmpDir, 'store.json');

  // Bypass createStore to point to a temporary file
  const rawStore = createJsonStore(storePath);
  const store = createAdapter(rawStore);

  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // First run
  await seedStore(store);

  const sections = await store.findSections();
  assert.strictEqual(sections.length, 1, 'One section seeded');
  
  const section = await store.findSection('1000000001');
  assert.ok(section, 'Pulse Fit section exists');
  assert.strictEqual(section.sectionName, 'Custom');

  const elements = await store.findElements({ sectionId: '1000000001' });
  assert.strictEqual(elements.length, 7, '7 elements seeded');

  const statBadges = elements.find(e => e.elementName === 'statBadges');
  assert.ok(statBadges, 'statBadges exists');
  assert.strictEqual(statBadges.contentType, 'Cards');
  assert.ok(Array.isArray(statBadges.loop), 'statBadges has a loop array');
  assert.strictEqual(statBadges.loop.length, 3, 'statBadges loop has 3 items');
  
  const firstCard = statBadges.loop[0];
  assert.ok(firstCard.fieldId1, 'First card has fieldId1 per §4');
  assert.ok(firstCard.fieldId2, 'First card has fieldId2 per §4');
  assert.strictEqual(firstCard.fieldId1, '3000000001');

  // Second run
  await seedStore(store);

  const finalSections = await store.findSections();
  assert.strictEqual(finalSections.length, 1, 'Restarting the server does not duplicate the seed rows');
});
