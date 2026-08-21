import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Imported directly — the SAME module the component imports. The logic lives in
// client/src/studio/CodePromptInputs.logic.js so this import works without React,
// matching UploadForm.logic.js and HeroSection.logic.js.
import { buildFormData } from '../client/src/studio/CodePromptInputs.logic.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('CodePromptInputs logic exercises exact field names from §13.1', async () => {
  // Previously this matched a `// --- LOGIC START ---` comment marker, wrote the
  // slice to a temp file and imported that — testing a copy rather than the real
  // thing, and breaking the moment anyone edited or removed the marker.
    // 1. Code only
    const resCode = buildFormData({ code: 'const x = 1;', prompt: '', pageName: 'Home', sectionName: 'Custom' });
    assert.equal(resCode.error, null);
    assert.equal(resCode.formData.get('code'), 'const x = 1;', 'must post exact "code" field per §13.1');
    assert.equal(resCode.formData.get('mode'), 'code');
    assert.equal(resCode.formData.has('prompt'), false, 'should not post empty prompt field');
    
    // 2. Prompt only
    const resPrompt = buildFormData({ code: '', prompt: 'Make it blue', pageName: 'Home', sectionName: 'Custom' });
    assert.equal(resPrompt.error, null);
    assert.equal(resPrompt.formData.get('prompt'), 'Make it blue', 'must post exact "prompt" field per §13.1');
    assert.equal(resPrompt.formData.get('mode'), 'prompt');
    assert.equal(resPrompt.formData.has('code'), false, 'should not post empty code field');
    
    // 3. Combined
    const resCombined = buildFormData({ code: 'const x = 1;', prompt: 'Make it blue', pageName: 'Home', sectionName: 'Custom' });
    assert.equal(resCombined.error, null);
    assert.equal(resCombined.formData.get('code'), 'const x = 1;');
    assert.equal(resCombined.formData.get('prompt'), 'Make it blue');
    assert.equal(resCombined.formData.get('mode'), 'combined');
    assert.equal(resCombined.formData.get('pageName'), 'Home');
    assert.equal(resCombined.formData.get('sectionName'), 'Custom');
    
    // 4. Neither
    const resNone = buildFormData({ code: '', prompt: '', pageName: 'Home', sectionName: 'Custom' });
    assert.ok(resNone.error, 'must return error if both code and prompt are empty');
    assert.equal(resNone.formData, null);
});

test('CodePromptInputs component structure matches contract', () => {
  const source = read('client/src/studio/CodePromptInputs.jsx');
  
  assert.match(source, /export default function CodePromptInputs/, 'must export CodePromptInputs component');
  
  // Verify multipart field names from §13.1 are in the DOM markup
  assert.match(source, /name=["']code["']/, 'must include code textarea');
  assert.match(source, /name=["']prompt["']/, 'must include prompt textarea');
  assert.match(source, /name=["']pageName["']/, 'must include pageName input');
  assert.match(source, /name=["']sectionName["']/, 'must include sectionName input');
  
  assert.match(source, /\.preventDefault\(\)/, 'must prevent default form submission');
  assert.match(source, /buildFormData/, 'must use the shared logic module, not its own copy');
});
