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
    /-\$\{[^}]*\.sectionId\}-v\$\{[^}]*\}\.jsx/,
    'must construct the filename using sectionId and variation'
  );

  // Verify it attempts to get the default export from the discovered modules
  assert.match(
    source,
    /\[[^\]]+\]\?\.default/,
    'must extract the default export from the matched module'
  );

  // Verify it renders the Component if found
  // The requirement is that the discovered component is rendered and receives
  // pageName — not that `key` sits immediately before it. This previously
  // pinned the exact JSX including the key's position, so wrapping <Component>
  // in a container (T-069's per-section regenerate control) broke it while the
  // behaviour was unchanged. React's `key` belongs on the outermost element of
  // a mapped item, so it legitimately moves when a wrapper is introduced.
  assert.match(
    source,
    /<Component[^>]*\spageName=\{pageName\}/,
    'must render the dynamically discovered Component with the pageName prop'
  );
});
