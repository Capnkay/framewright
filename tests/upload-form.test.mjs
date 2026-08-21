import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// Imported directly from the logic module — the SAME code the component runs.
// This previously sliced validateFile out of the .jsx source and rebuilt it with
// `new Function`, which tests a reconstruction rather than the real thing and
// breaks on any reordering of that file. client/src/studio/UploadForm.logic.js
// exists so this import is possible without React installed, matching
// client/src/sections/generated/HeroSection.logic.js.
import { validateFile } from '../client/src/studio/UploadForm.logic.js';

test('UploadForm validation logic accepts and rejects correctly', () => {
  // Accepted files
  const validPng = { type: 'image/png', size: 1024 };
  assert.equal(validateFile(validPng), null, 'Valid PNG should be accepted');

  const validJpeg = { type: 'image/jpeg', size: 5 * 1024 * 1024 };
  assert.equal(validateFile(validJpeg), null, 'Valid JPEG should be accepted');
  
  const validWebp = { type: 'image/webp', size: 8 * 1024 * 1024 };
  assert.equal(validateFile(validWebp), null, 'Valid WebP at exact limit should be accepted');

  // Rejected file (type)
  const rejectedGif = { type: 'image/gif', size: 1024 };
  const typeError = validateFile(rejectedGif);
  assert.ok(typeError, 'Should return error for .gif');
  assert.match(typeError, /PNG|JPEG|WebP/i, 'Plain-language error should mention valid types');

  // Rejected file (size)
  const oversizePng = { type: 'image/png', size: (8 * 1024 * 1024) + 1 };
  const sizeError = validateFile(oversizePng);
  assert.ok(sizeError, 'Should return error for >8MB file');
  assert.match(sizeError, /8\s*MB/i, 'Plain-language error should mention 8 MB limit');

  // Missing file
  const missingError = validateFile(undefined);
  assert.ok(missingError, 'Should return error for missing file');
});

test('UploadForm component source matches contract expectations', () => {
  const source = read('client/src/studio/UploadForm.jsx');

  // Verify component structure
  assert.match(source, /export default function UploadForm/, 'must export UploadForm component');

  // Verify multipart field names from §13.1
  assert.match(source, /name=["']wireframe["']/, 'must include wireframe file input');
  assert.match(source, /name=["']pageName["']/, 'must include pageName input');
  assert.match(source, /name=["']sectionName["']/, 'must include sectionName input');

  // Verify form handling logic
  assert.match(source, /\.preventDefault\(\)/, 'must prevent default form submission');
  assert.match(source, /validateFile\(/, 'must call validation function client-side');
  
  // Verify plain language rejection text in the UI
  assert.match(source, /\{error\}/, 'must display the error message in the UI');
});
