import test from 'node:test';
import assert from 'node:assert/strict';
import { postRegenerate } from '../server/src/routes/regenerate.js';
import { createStore } from '../server/src/store/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('POST /api/sections/:sectionId/regenerate card-slot growth/shrink', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fw-test-regen-cards-'));
  const jobsFile = path.join(tmpDir, 'jobs.json');
  const storeFile = path.join(tmpDir, 'store.json');
  const env = { 
    JOB_STORE_PATH: jobsFile,
    STORE_PATH: storeFile,
    MONGODB_URI: '',
  };
  
  const store = createStore(env);
  
  // Seed a section
  const sectionId = await store.allocateId('section');
  await store.insertSection({
    sectionName: 'Custom',
    sectionId: sectionId,
    pageName: 'Home',
    platform: 'Website',
    status: 'Pending',
    jobId: 'job-0000000001',
    prompt: 'Original prompt',
    variation: '1',
    designTokens: {},
    fieldIds: []
  });

  // Seed top-level text element
  const headlineId = await store.allocateId('element');
  await store.insertElement({
    fieldId: headlineId,
    sectionId: sectionId,
    jobId: 'job-0000000001',
    elementName: 'headlineMain',
    contentType: 'Text',
    tag: 'h1',
    order: 1,
    content: 'Original Headline',
    css: null
  });

  // Seed cards element with 3 items
  const cardsId = await store.allocateId('element');
  const cardFieldId1 = await store.allocateId('cardField');
  const cardFieldId2 = await store.allocateId('cardField');
  const cardFieldId3 = await store.allocateId('cardField');
  const cardFieldId4 = await store.allocateId('cardField');
  const cardFieldId5 = await store.allocateId('cardField');
  const cardFieldId6 = await store.allocateId('cardField');

  await store.insertElement({
    fieldId: cardsId,
    sectionId: sectionId,
    jobId: 'job-0000000001',
    elementName: 'statBadges',
    contentType: 'Cards',
    tag: 'div',
    order: 2,
    content: null,
    css: null,
    loop: [
      { field1: 'A1', fieldId1: cardFieldId1, field2: 'A2', fieldId2: cardFieldId2 },
      { field1: 'B1', fieldId1: cardFieldId3, field2: 'B2', fieldId2: cardFieldId4 },
      { field1: 'C1', fieldId1: cardFieldId5, field2: 'C2', fieldId2: cardFieldId6 }
    ]
  });

  // Grow from 3 to 4 cards
  const ctxGrow = {
    env,
    params: { sectionId },
    body: {
      mode: 'prompt',
      prompt: 'four stats',
      variation: '2'
    },
    files: {}
  };

  const { status: statusGrow, body: bodyGrow } = await postRegenerate(ctxGrow);
  assert.equal(statusGrow, 200);
  assert.equal(bodyGrow.ok, true);
  
  assert.equal(bodyGrow.preservedIds['headlineMain'], headlineId);
  assert.equal(bodyGrow.preservedIds['statBadges'], cardsId);
  
  // Growing to 4 cards should allocate exactly 2 new nested IDs (field1 and field2 for the new 4th card)
  // because promptToIrKeyless yields 2 fields per item.
  // Plus, other elements like heroImage, ctaButton etc might be added since they weren't seeded.
  // Wait, the keyless IR outputs all elements for split-hero.
  // So there will be more newIds. But we can just verify the length is > 2.
  assert.ok(bodyGrow.newIds.length >= 2, 'Should allocate at least 2 new nested IDs');

  // Let's verify the 4th card item has new IDs
  const allElementsGrow = await store.findElements({ sectionId });
  const cardsElGrow = allElementsGrow.find(e => e.elementName === 'statBadges');
  assert.equal(cardsElGrow.loop.length, 4);
  assert.equal(cardsElGrow.loop[0].fieldId1, cardFieldId1);
  assert.equal(cardsElGrow.loop[1].fieldId1, cardFieldId3);
  assert.equal(cardsElGrow.loop[2].fieldId1, cardFieldId5);
  
  const newCardId1 = cardsElGrow.loop[3].fieldId1;
  const newCardId2 = cardsElGrow.loop[3].fieldId2;
  assert.ok(newCardId1);
  assert.ok(newCardId2);
  assert.ok(bodyGrow.newIds.includes(newCardId1));
  assert.ok(bodyGrow.newIds.includes(newCardId2));

  // Shrink from 4 to 2 cards
  const ctxShrink = {
    env,
    params: { sectionId },
    body: {
      mode: 'prompt',
      prompt: 'two cards',
      variation: '3'
    },
    files: {}
  };

  const { status: statusShrink, body: bodyShrink } = await postRegenerate(ctxShrink);
  assert.equal(statusShrink, 200);
  assert.equal(bodyShrink.ok, true);
  
  assert.equal(bodyShrink.preservedIds['headlineMain'], headlineId);
  assert.equal(bodyShrink.preservedIds['statBadges'], cardsId);
  
  // Shrinking should not allocate any new IDs for the cards, though it might for other things 
  // if some elements were added. But actually we generated from prompt 4 -> 2, so it's a subset.
  // We just verify the loop length is 2.
  const allElementsShrink = await store.findElements({ sectionId });
  const finalCardsEl = allElementsShrink.find(e => e.elementName === 'statBadges');
  assert.equal(finalCardsEl.loop.length, 2);
  assert.equal(finalCardsEl.loop[0].fieldId1, cardFieldId1);
  assert.equal(finalCardsEl.loop[1].fieldId1, cardFieldId3);

  // Clean up
  await fs.rm(tmpDir, { recursive: true, force: true });
});
