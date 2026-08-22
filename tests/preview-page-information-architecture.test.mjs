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

test('a section whose file is absent reads as an explanation, not an alarm', async () => {
  // It is the normal state for a section generated on another machine, or one
  // whose file was cleaned while its document stayed in the store. A red error
  // box for a routine condition trains everyone to ignore red.
  const code = await userFacingSource();

  assert.equal(
    /Missing component file/.test(code),
    false,
    'the raw "Missing component file" alarm is still there',
  );
  assert.equal(
    /Vite eager-glob/.test(code),
    false,
    'the fallback explains itself in terms of the bundler',
  );
  assert.match(code, /isn’t built on this machine yet|is not built on this machine yet/, 'no plain-language explanation');
  // And it must not be styled as an error.
  assert.equal(/text-red-600/.test(code), false, 'the fallback is still red');
});

test('the empty state tells someone what to do rather than what is unbuilt', async () => {
  const code = await userFacingSource();

  assert.match(code, /No sections on/, 'there is no empty state for a page with nothing on it');
  assert.match(code, /Studio/, 'the empty state does not say where to go');
});
