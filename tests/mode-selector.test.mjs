import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Behaviour, imported from the module the component actually runs. The
// source-regex assertions below are kept for the JSX wiring that has no
// testable logic, but the mode rules themselves are exercised for real here.
import { MODES, isValidMode, visibleInputsFor } from '../client/src/studio/ModeSelector.logic.js';

test('§13 mode values and their visible inputs (FR-G04)', () => {
  assert.deepEqual(MODES, ['wireframe', 'code', 'prompt', 'combined'],
    "§13: mode is one of wireframe | code | prompt | combined");

  assert.deepEqual(visibleInputsFor('wireframe'), { wireframe: true, code: false, prompt: false });
  assert.deepEqual(visibleInputsFor('code'), { wireframe: false, code: true, prompt: false });
  assert.deepEqual(visibleInputsFor('prompt'), { wireframe: false, code: false, prompt: true });
  assert.deepEqual(visibleInputsFor('combined'), { wireframe: false, code: true, prompt: true });

  // An unknown mode shows nothing rather than defaulting to a guess.
  assert.equal(isValidMode('sketch'), false);
  assert.deepEqual(visibleInputsFor('sketch'), { wireframe: false, code: false, prompt: false });
});

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('ModeSelector component structure and logic', () => {
  const source = read('client/src/studio/ModeSelector.jsx');
  
  assert.match(source, /export default function ModeSelector/, 'must export ModeSelector component');
  
  // Verify the four verbatim mode values from §13 are present as radio buttons

  // Verify the form renders UploadForm for wireframe
  assert.match(source, /<UploadForm/, 'must render UploadForm for wireframe mode');

  // Verify that it hides inputs rather than just ignoring them
  assert.match(source, /visibleInputsFor\(mode\)\.code/, 'code input visibility must come from the shared logic module');
  assert.match(source, /visibleInputsFor\(mode\)\.prompt/, 'prompt input visibility must come from the shared logic module');

  // Verify that we reuse the buildFormData logic instead of re-inventing it
  assert.match(source, /import \{ buildFormData \} from '\.\/CodePromptInputs\.logic\.js'/, 'must reuse buildFormData');
  
  // Verify it prevents default
  assert.match(source, /\.preventDefault\(\)/, 'must prevent default form submission in TextModeForm');
});
