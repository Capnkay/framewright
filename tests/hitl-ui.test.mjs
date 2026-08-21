import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('QuestionPrompt UI satisfies FR-G11 (T-066)', () => {
  const source = read('client/src/studio/QuestionPrompt.jsx');

  // Verify it exports QuestionPrompt
  assert.match(source, /export default function QuestionPrompt/, 'must export QuestionPrompt');

  // Verify it conditionally fetches based on 'awaiting-input'
  assert.match(source, /status !== ['`]awaiting-input['`]/, 'must check status === awaiting-input');
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}\/questions[`']\s*\)/, 'must fetch questions');

  // Verify it fetches normalisation (T-102)
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}\/artifacts\/s2-preprocessing-normalization\.json[`']\s*\)/, 'must fetch normalisation');

  // Verify it renders the normalised image artifact (T-112)
  assert.match(source, /<img[\s\S]*src=\{[`']\/api\/jobs\/\$\{jobId\}\/artifacts\/s2-normalised\.jpg[`']\}/, 'must use s2-normalised.jpg');
  
  // Verify it maps bbox with simple normalisation scale/offset percentages (T-102)
  assert.match(source, /className="absolute[^"]*"/, 'must have an absolute overlay');
  assert.match(source, /left:\s*`\$\{\(q\.bbox\[0\] \/ normalisation\.width\) \* 100\}%`/, 'must use simple width percentage for left');
  assert.match(source, /top:\s*`\$\{\(q\.bbox\[1\] \/ normalisation\.height\) \* 100\}%`/, 'must use simple height percentage for top');
  assert.match(source, /width:\s*`\$\{\(q\.bbox\[2\] \/ normalisation\.width\) \* 100\}%`/, 'must use simple width percentage for width');
  assert.match(source, /height:\s*`\$\{\(q\.bbox\[3\] \/ normalisation\.height\) \* 100\}%`/, 'must use simple height percentage for height');

  // Verify it renders options as inputs
  assert.match(source, /type="radio"/, 'must use radio buttons for options');
  
  // Verify submit POSTs to answers
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}\/answers[`']/, 'must POST to answers endpoint');
});
