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

  // Verify it fetches normalisation and job (T-102)
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}\/artifacts\/s2-preprocessing-normalization\.json[`']\s*\)/, 'must fetch normalisation');
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}[`']\s*\)/, 'must fetch job to get upload url');

  // Verify it renders the original upload image artifact
  assert.match(source, /<img[\s\S]*src=\{uploadUrl \|\| [`']\/api\/jobs\/\$\{jobId\}\/artifacts\/2-normalised\.png[`']\}/, 'must fall back to 2-normalised.png if uploadUrl is unavailable');
  
  // Verify it maps bbox with normalisation scale/offset and uses percentages
  assert.match(source, /className="absolute[^"]*"/, 'must have an absolute overlay');
  assert.match(source, /left:\s*`\$\{\(origX \/ origImgW\) \* 100\}%`/, 'must use normalisation mapping for left');
  assert.match(source, /top:\s*`\$\{\(origY \/ origImgH\) \* 100\}%`/, 'must use normalisation mapping for top');
  assert.match(source, /width:\s*`\$\{\(origW \/ origImgW\) \* 100\}%`/, 'must use normalisation mapping for width');
  assert.match(source, /height:\s*`\$\{\(origH \/ origImgH\) \* 100\}%`/, 'must use normalisation mapping for height');

  // Verify it renders options as inputs
  assert.match(source, /type="radio"/, 'must use radio buttons for options');
  
  // Verify submit POSTs to answers
  assert.match(source, /fetch\(\s*[`']\/api\/jobs\/\$\{jobId\}\/answers[`']/, 'must POST to answers endpoint');
});
