import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function seedStore(store) {
  // Restarting the server must not duplicate seed rows
  const existingSection = await store.findSection('1000000001');
  if (existingSection) {
    return;
  }

  const sectionsPath = path.join(__dirname, '../../data/seed/sections.json');
  const elementsPath = path.join(__dirname, '../../data/seed/elements.json');

  const sectionsData = await fs.readFile(sectionsPath, 'utf8');
  const elementsData = await fs.readFile(elementsPath, 'utf8');

  const sections = JSON.parse(sectionsData);
  const elements = JSON.parse(elementsData);

  for (const sec of sections) {
    await store.insertSection(sec);
  }

  for (const el of elements) {
    await store.insertElement(el);
  }

  await advanceCountersPast(store, sections, elements);
}

/**
 * Burn allocator ids until the next one issued is past everything the seed inserted.
 *
 * WHY THIS IS NOT OPTIONAL. The seed writes ids straight from data/seed/*.json --
 * section 1000000001, elements 2000000001 through 2000000007 -- and the counters start
 * at exactly those numbers. So without this, the FIRST generated section is allocated
 * the same sectionId and the same seven fieldIds as the seeded one. Rule 4 and §1 make
 * ids "allocated centrally, persisted" and unique, and the pre-submit gate's
 * duplicate-ID check exists for precisely this case.
 *
 * It is also how the §9 store-liveness assertion came to fail at step 4 once §3's
 * `pageName` was added to generated elements: hydrateElements filters on
 * `el.pageName === pageName`, so the duplicates became visible and overwrote the
 * seeded values in allSections.Home. A PATCH then moved the seeded document while the
 * render read the generated one.
 *
 * ALLOCATES RATHER THAN SETTING THE COUNTER, because the counter is not in the store
 * adapter's interface (§2.1) and Mongo's implementation is a findOneAndUpdate, not a
 * field this code may reach into. Asking for ids until they are past the seed uses only
 * what every adapter already exposes, so both backends behave the same. It costs a
 * handful of ten-digit ids once, at boot.
 */
async function advanceCountersPast(store, sections, elements) {
  const highest = (rows, key) =>
    rows.reduce((max, row) => Math.max(max, Number(row?.[key]) || 0), 0);

  const cardFieldIds = elements.flatMap((el) =>
    (Array.isArray(el.loop) ? el.loop : []).flatMap((item) =>
      Object.entries(item || {})
        .filter(([k]) => /^fieldId[1-9][0-9]*$/.test(k))
        .map(([, v]) => Number(v) || 0)
    )
  );

  const targets = [
    ['section', highest(sections, 'sectionId')],
    ['element', highest(elements, 'fieldId')],
    ['cardField', cardFieldIds.reduce((a, b) => Math.max(a, b), 0)],
  ];

  for (const [range, seededMax] of targets) {
    if (!seededMax) continue;
    // Bounded, so a store whose counter never advances cannot spin here. The bound is
    // generous: it only has to cover the ids one seed file can contain.
    for (let i = 0; i < 10000; i += 1) {
      const next = Number(await store.allocateId(range));
      if (next > seededMax) break;
    }
  }
}
