import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('Preview shell hosts generated sections by fetching SectionDocs and rendering matches (T-050)', () => {
  const source = read('client/src/routes/PreviewPage.jsx');

  // Verify fetch call includes pageName
  assert.match(
    source,
    /fetch\(\s*[`'"]\/api\/sections\?pageName=\$\{?[^`'"]+\}?[`'"]\s*\)/,
    'PreviewPage must fetch /api/sections?pageName=...'
  );

  // Verify it handles the response and extracts the array
  assert.match(
    source,
    /setSectionDocs\(\s*Array\.isArray\([^)]+\)\s*\?\s*[^:]+\s*:\s*\[\]\s*\)/,
    'PreviewPage must safely extract the returned array'
  );

  // Verify it maps over sectionDocs
  assert.match(
    source,
    /sectionDocs\.map\(/,
    'PreviewPage must map over fetched section documents'
  );

  // Verify filename construction uses sectionId and variation
  assert.match(
    source,
    /-\$\{[^}]*\.sectionId\}-v\$\{[^}]*\}\.jsx/,
    'must construct the filename using sectionId and variation/variations'
  );

  // Verify it renders the dynamically discovered Component with pageName prop
  assert.match(
    source,
    /<Component\s+key=\{[^}]+\}\s+pageName=\{pageName\}\s*\/>/,
    'must render the dynamically discovered Component with pageName prop'
  );

  // Verify fallback UI is rendered if the component is missing
  assert.match(
    source,
    /Missing component file:/,
    'must render a fallback if the component is missing'
  );
});
