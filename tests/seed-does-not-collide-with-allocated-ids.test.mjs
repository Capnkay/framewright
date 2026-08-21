// T-111 — the seed must not hand out ids the allocator is about to issue. §1, rule 4.
//
// THE DEFECT. server/src/store/seed.js inserts the Pulse Fit section and elements from
// data/seed/*.json with hardcoded ids — section 1000000001, elements 2000000001 through
// 2000000007 — and never advanced the store's counters, which start at exactly
// 1000000001 and 2000000001. So the FIRST generated section was allocated the same
// sectionId and the same seven fieldIds as the seeded one, on every fresh store.
//
// HOW IT SURFACED, which is worth recording because it pointed the wrong way for a
// while. T-109 tried to add §3's required `pageName` to generated element documents and
// the §9 store-liveness assertion started failing at step 4: "TOP-LEVEL rendered text
// did not change after PATCH". That reads like a hydration bug, and `hydrateElements`
// does filter on `el.pageName === pageName`, so the obvious conclusion was that two
// sections on one page collide in the flat map. They do not. The duplicate IDS collide.
// `pageName` only made the duplicates visible to the reducer. Fixing the seed fixed the
// assertion, and §3's fields went in unchanged.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { createStore } from '../server/src/store/index.js';
import { seedStore } from '../server/src/store/seed.js';
import { postGenerate } from '../server/src/routes/generate.js';

async function seededEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  const env = {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
  await seedStore(createStore(env));
  return env;
}

test('the first allocated id is past everything the seed inserted', async () => {
  const env = await seededEnv('seed-ids');
  const store = createStore(env);

  const sectionId = Number(await store.allocateId('section'));
  const elementId = Number(await store.allocateId('element'));

  assert.ok(sectionId > 1000000001, `sectionId ${sectionId} collides with the seeded section`);
  assert.ok(elementId > 2000000007, `fieldId ${elementId} collides with a seeded element`);
});

test('a generated section shares no id with the seed', async () => {
  // The behaviour that matters, rather than the counter that produces it.
  const env = await seededEnv('seed-generate');
  const store = createStore(env);

  const seededSection = await store.findSection('1000000001');
  assert.ok(seededSection, 'the seed did not run');
  // From the elements themselves: the seed's section document carries no fieldIds
  // array, which is its own small divergence from what generate.js writes.
  const seeded = await store.findElements({ sectionId: '1000000001' });
  assert.ok(seeded.length, 'the seed inserted no elements');
  const seededFieldIds = new Set(seeded.map((e) => String(e.fieldId)));

  const { status, body } = await postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'Home', sectionName: 'Generated', prompt: 'a hero with stats' },
    files: {},
  });
  assert.equal(status, 200, JSON.stringify(body));

  assert.notEqual(String(body.job.sectionId), '1000000001', 'the generated section reused the seeded sectionId');

  const generated = await store.findSection(body.job.sectionId);
  for (const fieldId of generated.fieldIds) {
    assert.equal(
      seededFieldIds.has(String(fieldId)),
      false,
      `fieldId ${fieldId} was issued twice — once by the seed, once by the allocator (rule 4, §1)`
    );
  }
});

test('two sections on one page both survive in the store', async () => {
  // What the §9 assertion exercises through the client: the golden section and a
  // generated one share pageName "Home", and neither may overwrite the other.
  const env = await seededEnv('seed-two-sections');
  const store = createStore(env);

  const { body } = await postGenerate({
    env,
    body: { mode: 'prompt', pageName: 'Home', sectionName: 'Generated', prompt: 'a hero with stats' },
    files: {},
  });

  const onHome = await store.findElements({ pageName: 'Home' });
  const ids = onHome.map((e) => String(e.fieldId));

  assert.equal(new Set(ids).size, ids.length, 'a fieldId appears twice on page Home');
  assert.ok(ids.includes('2000000003'), 'the seeded headlineMain is gone from page Home');
  assert.ok(
    onHome.length > 7,
    `expected both sections on Home, found ${onHome.length} element(s)`
  );
  assert.ok(body.job.sectionId, 'no section was generated');
});

test('seeding twice does not burn ids or duplicate rows', async () => {
  // seedStore returns early when the section is already there. If that guard ever goes,
  // the counters advance again on every boot and ids drift for no reason.
  const env = await seededEnv('seed-twice');
  const store = createStore(env);

  const before = Number(await store.allocateId('element'));
  await seedStore(store);
  const after = Number(await store.allocateId('element'));

  assert.equal(after, before + 1, 're-seeding advanced the allocator');
  const home = await store.findElements({ pageName: 'Home' });
  assert.equal(new Set(home.map((e) => String(e.fieldId))).size, home.length, 'the seed duplicated rows');
});
