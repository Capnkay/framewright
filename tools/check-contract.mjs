// tools/check-contract.mjs — validate tracked data against the contract's schemas.
//
//     node tools/check-contract.mjs seed     # T-074: the seed JSON
//     node tools/check-contract.mjs          # same, plus anything added later
//
// WHY THIS FILE EXISTS AT ALL. T-074 declares `node tools/check-contract.mjs seed` as
// its verify command and the file had never been written, so the task could not be
// closed by running its own verification. Logged in docs/corrections/REGISTER.md.
//
// WHY IT DOES NOT IMPORT ajv. `npm test` runs on a fresh clone with no `node_modules` —
// that is a deliberate property of this repository, and the store, the envelope, the
// sanitiser and the IR validator are all dependency-free to preserve it. T-019's
// `irValidator.js` exports `validateAgainstSchema(value, schema)` for exactly this
// case: its own comment says §16.2 needs "the caller's Ajv schema — a caller that is
// not always the IR". So the evaluator is reused rather than a second one added.
//
// This matters more than it looks. `server/src/validate/elementValidator.js` DOES
// import `ajv`, which is not in any manifest, so it throws ERR_MODULE_NOT_FOUND on a
// clean checkout and takes `tests/element-schema.test.mjs` down with it. A verification
// tool that inherited that dependency would fail for a reason having nothing to do with
// the data it is checking — which is the opposite of what a gate is for.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAgainstSchema } from '../server/src/validate/irValidator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** §3's closed set. The doneWhen requires at least one seed element of each. */
const CONTENT_TYPES = ['Image', 'Text', 'Textfield', 'Button', 'Cards'];

function readJson(relative) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) return { missing: true, path: relative };
  try {
    return { value: JSON.parse(fs.readFileSync(full, 'utf8')), path: relative };
  } catch (err) {
    return { unreadable: err.message, path: relative };
  }
}

/** Seed files may be a bare array or an object wrapping one. Accept both. */
function asList(value, key) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value[key])) return value[key];
  return [];
}

function checkSeed() {
  const failures = [];
  const notes = [];

  const elementSchema = readJson('server/src/schemas/element.schema.json');
  const sectionSchema = readJson('server/src/schemas/section.schema.json');
  const elements = readJson('server/data/seed/elements.json');
  const sections = readJson('server/data/seed/sections.json');

  for (const file of [elementSchema, sectionSchema, elements, sections]) {
    if (file.missing) failures.push(`${file.path}: missing`);
    if (file.unreadable) failures.push(`${file.path}: ${file.unreadable}`);
  }
  if (failures.length > 0) return { failures, notes };

  const elementList = asList(elements.value, 'elements');
  const sectionList = asList(sections.value, 'sections');

  if (elementList.length === 0) failures.push('server/data/seed/elements.json: no elements');
  if (sectionList.length === 0) failures.push('server/data/seed/sections.json: no sections');

  // --- schema validation, the doneWhen's "zero errors" ---
  for (const [index, element] of elementList.entries()) {
    const result = validateAgainstSchema(element, elementSchema.value);
    if (!result.valid) {
      const name = element?.elementName ?? `#${index}`;
      for (const e of result.errors.slice(0, 4)) {
        failures.push(`element ${name}: ${e.path} ${e.message}`);
      }
    }
  }
  for (const [index, section] of sectionList.entries()) {
    const result = validateAgainstSchema(section, sectionSchema.value);
    if (!result.valid) {
      const name = section?.sectionId ?? `#${index}`;
      for (const e of result.errors.slice(0, 4)) {
        failures.push(`section ${name}: ${e.path} ${e.message}`);
      }
    }
  }

  // --- completeness, the doneWhen's second half ---
  // The point of the coverage rule is that the seed EXERCISES every branch the
  // emitter and the CMS have to handle. A seed missing Cards would let the §9
  // step-5 assertion pass vacuously, because there would be no card field to patch.
  const present = new Set(elementList.map((e) => e?.contentType));
  for (const type of CONTENT_TYPES) {
    if (!present.has(type)) failures.push(`no seed element of contentType "${type}" (§3)`);
  }
  const unknown = [...present].filter((t) => !CONTENT_TYPES.includes(t));
  for (const type of unknown) failures.push(`unknown contentType "${type}" (§3 is a closed set)`);

  // --- §1 ranges and §14's duplicate-ID rule, over the same data ---
  const seen = new Map();
  const record = (id, where) => {
    if (id === undefined || id === null) return;
    if (!/^[123]\d{9}$/.test(String(id))) {
      failures.push(`${where}: "${id}" is outside §1's 1…/2…/3… ranges`);
      return;
    }
    if (seen.has(id)) failures.push(`duplicate id "${id}" (${seen.get(id)} and ${where})`);
    else seen.set(id, where);
  };

  for (const section of sectionList) record(section?.sectionId, 'section');
  for (const element of elementList) {
    record(element?.fieldId, `element ${element?.elementName}`);
    for (const item of Array.isArray(element?.loop) ? element.loop : []) {
      for (const [key, value] of Object.entries(item || {})) {
        if (/^fieldId\d*$/.test(key)) record(value, `${element?.elementName}.${key}`);
      }
    }
  }

  // --- every element points at a section that exists ---
  const sectionIds = new Set(sectionList.map((s) => String(s?.sectionId)));
  for (const element of elementList) {
    if (element?.sectionId && !sectionIds.has(String(element.sectionId))) {
      failures.push(
        `element ${element.elementName}: sectionId "${element.sectionId}" matches no seeded section`,
      );
    }
  }

  notes.push(`${sectionList.length} section(s), ${elementList.length} element(s)`);
  notes.push(`contentTypes: ${CONTENT_TYPES.filter((t) => present.has(t)).join(', ')}`);
  notes.push(`${seen.size} unique id(s), no duplicates`);

  return { failures, notes };
}

const CHECKS = { seed: checkSeed };

function main(argv) {
  const requested = argv.length > 0 ? argv : Object.keys(CHECKS);
  let failed = 0;

  for (const name of requested) {
    const check = CHECKS[name];
    if (!check) {
      console.error(`check-contract: unknown check "${name}". Known: ${Object.keys(CHECKS).join(', ')}`);
      return 2;
    }
    const { failures, notes } = check();
    if (failures.length === 0) {
      console.log(`✔ ${name}`);
      for (const note of notes) console.log(`    ${note}`);
    } else {
      failed += failures.length;
      console.error(`✖ ${name} — ${failures.length} problem(s)`);
      for (const failure of failures) console.error(`    ${failure}`);
    }
  }

  return failed === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
