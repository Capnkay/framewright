import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('GeneratePage mounts all 14 studio components (T-107)', () => {
  const source = read('client/src/routes/GeneratePage.jsx');

  const directMounts = [
    'ModeSelector',
    'SectionFields',
    'GenerationProgress',
    'JobTimeline',
    'QuestionPrompt',
    'StageInspector',
    'JobHistory',
    'GeneratedSourceView',
    'ResponsiveToggle',
    'SideEditor',
    'ErrorBanner',
    'CodePromptInputs'
  ];

  for (const comp of directMounts) {
    assert.match(source, new RegExp('import ' + comp + ' from'), 'must import ' + comp);
    assert.match(source, new RegExp('<' + comp + '[\\s>]'), 'must render ' + comp);
  }
});
