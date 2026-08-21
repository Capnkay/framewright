import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('GeneratedSourceView UI satisfies FR-G06 (T-049)', () => {
  const source = read('client/src/studio/GeneratedSourceView.jsx');

  // Verify it exports GeneratedSourceView
  assert.match(source, /export default function GeneratedSourceView/, 'must export GeneratedSourceView');

  // Verify it fetches the component
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}\/component[`']\s*\)/, 'must fetch component');

  // Verify it renders read-only (using a <pre><code> block)
  assert.match(source, /<pre[\s\S]*<code/, 'must render in read-only pre/code block');

  // Verify it provides a link to preview
  assert.match(source, /<Link[^>]*to=\{[`']\/preview\/\$\{pageName\}[`']\}/, 'must link to preview route');
  assert.doesNotMatch(source, /href=["']?\/client\/src\/.*\.jsx["']?/, 'must not link to raw file directly');
});
