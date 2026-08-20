import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('PreviewPage wires Vite eager-glob discovery of generated sections (T-029)', () => {
  const source = read('client/src/routes/PreviewPage.jsx');

  // Verify import.meta.glob usage for eager discovery
  assert.match(
    source,
    /import\.meta\.glob\(['"]\.\.\/sections\/generated\/\*\.jsx['"],\s*\{\s*eager:\s*true\s*\}\)/,
    'import.meta.glob must be used with eager: true to discover generated JSX components'
  );

  // Verify that it selects the module matching the section document's sectionId and variation
  assert.match(
    source,
    /-\$\{[^}]*\.sectionId\}-v\$\{[^}]*\.variation\}\.jsx/,
    'must construct the filename using sectionId and variation'
  );

  // Verify it attempts to get the default export from the discovered modules
  assert.match(
    source,
    /\[[^\]]+\]\?\.default/,
    'must extract the default export from the matched module'
  );

  // Verify it renders the Component if found
  assert.match(
    source,
    /<Component\s+key=\{[^}]+\}\s+pageName=\{pageName\}\s*\/>/,
    'must render the dynamically discovered Component with pageName prop'
  );
});
