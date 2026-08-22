import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('GeneratePage mounts all 14 studio components (T-107)', () => {
  const source = read('client/src/routes/GeneratePage.jsx');

  // ModeSelector + CodePromptInputs (and the UploadForm/TextModeForm split they
  // routed between) were replaced by Composer — one card, one mode-appropriate
  // input, per docs/UI-SYSTEM.md §2-3 and docs/SURFACE-INSPO.md §1-2. Composer
  // still imports ModeSelector.logic.js (MODES, visibleInputsFor) and
  // CodePromptInputs.logic.js (buildFormData) directly, so no §13 mode logic
  // was dropped — only the JSX components that used to render around it.
  const directMounts = [
    'Composer',
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
  ];

  for (const comp of directMounts) {
    assert.match(source, new RegExp('import ' + comp + ' from'), 'must import ' + comp);
    assert.match(source, new RegExp('<' + comp + '[\\s>]'), 'must render ' + comp);
  }
});
