// T-128 — what the preview page shows, and in what order. §9, §13.4.
//
// This is the page a judge is shown. It opened with a build note —
// "Section mounting arrives with T-011 and T-029. This shell exists now so the
// store's state is observable from the first hour (§9)" — above a definition
// list of Hydration status / Keys in allSections / Missing IDs, above the actual
// rendered sections. The empty state named T-015 and T-011.
//
// THE DIAGNOSTICS ARE NOT DELETED, and that is the whole judgement in this task.
// AGENTS.md rule 2: a completely dead store looks pixel-identical to a working
// one, and those three numbers are the only thing on screen that can tell them
// apart. T-127 was exactly that failure, and it was those numbers that showed
// it. Tidying them away to make the page pretty would remove the one instrument
// that catches the thing the §9 assertion exists for. They move; they stay.
//
// Checked on the SOURCE rather than by rendering, because this page is driven by
// `import.meta.glob` and a Redux store, and standing both up server-side buys
// nothing for the questions being asked here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, '../client/src/routes/PreviewPage.jsx');

/** The file with comments stripped — comments may discuss the old copy by name. */
async function userFacingSource() {
  const source = await fs.readFile(SOURCE, 'utf8');
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, ''); // line comments
}

// ---------------------------------------------------------------------

test('no task id or contract section mark appears in what a visitor reads', async () => {
  const code = await userFacingSource();

  for (const pattern of [/\bT-\d{3}\b/, /§\s?\d/, /\bFR-G\d{2}\b/]) {
    const match = code.match(pattern);
    assert.equal(match, null, `internal vocabulary is in the page copy: ${match && match[0]}`);
  }
});

test('§13.4 — the sections response is read as a bare array', async () => {
  // It was `const extracted = data.data || data`, which accommodates precisely
  // the wrapped shape §13.4 forbids. §9 names that accommodation as how a
  // reducer ends up empty behind a page that renders perfectly, and T-127 was
  // that failure arriving by a different route.
  const code = await userFacingSource();

  assert.equal(/data\.data/.test(code), false, 'the response is still being unwrapped from `data`');
  assert.match(code, /Array\.isArray\(data\)/, 'the response is not checked as an array');
});

test('the §9 diagnostics still exist — all three of them', async () => {
  // The failure mode this guards is a future tidy-up, not today's code.
  const code = await userFacingSource();

  assert.match(code, /Hydration status/, 'the hydration status readout is gone');
  assert.match(code, /Keys in allSections/, 'the key count is gone');
  assert.match(code, /Missing IDs/, 'the missing-id count is gone');

  // And they must still be READ FROM THE STORE, not from local state — a
  // hardcoded "succeeded" would satisfy the strings above and nothing else.
  assert.match(code, /state\.cms\.status/, 'status no longer comes from the store');
  assert.match(code, /state\.cms\.allSections/, 'allSections no longer comes from the store');
  assert.match(code, /state\.cms\.missing/, 'missing no longer comes from the store');
});

test('the rendered sections come before the diagnostics in the document', async () => {
  const code = await userFacingSource();

  const sections = code.indexOf('renderedSections}');
  const diagnostics = code.indexOf('Hydration status');

  assert.notEqual(sections, -1, 'the sections are never rendered');
  assert.notEqual(diagnostics, -1, 'the diagnostics are never rendered');
  assert.ok(
    sections < diagnostics,
    'the diagnostics table is still above the content a visitor came to see',
  );
});

test('sections this machine cannot build are counted, not listed one card each', async () => {
  // THIS ASSERTION USED TO REQUIRE THE CARD, and the change is deliberate.
  //
  // T-128 replaced a red "Missing component file" error with a plain-language
  // card, because a section generated on another machine is a routine condition
  // and a red alarm for routine conditions trains everyone to ignore red. That
  // was right when there were three of them.
  //
  // Measured on a store with a few weeks of runs in it: 163 sections on `Home`,
  // 54 with a component file and 109 without. The page opened with a hundred
  // identical cards and the real sections were somewhere past them. An
  // explanation repeated a hundred times is not an explanation, it is the page.
  //
  // So the state is COUNTED rather than hidden — one line beside the other §9
  // diagnostics — which keeps the fact available and gives the page back.
  const code = await userFacingSource();

  // The original alarm stays gone.
  assert.equal(/Missing component file/.test(code), false, 'the raw alarm is back');
  assert.equal(/Vite eager-glob/.test(code), false, 'the fallback explains itself in bundler terms');
  assert.equal(/text-red-600/.test(code), false, 'the fallback is styled as an error');

  // Nothing is rendered per unbuilt section...
  assert.match(code, /unbuilt\.push\(section\)/, 'unbuilt sections are not being collected');
  // ...and the count is reported once, in words, with the diagnostics.
  assert.match(code, /Not built here/, 'the count is not reported at all');
  assert.match(code, /unbuilt\.length/, 'the count is never read back');
});

test('the empty state tells someone what to do rather than what is unbuilt', async () => {
  const code = await userFacingSource();

  assert.match(code, /No sections on/, 'there is no empty state for a page with nothing on it');
  assert.match(code, /Studio/, 'the empty state does not say where to go');
});
