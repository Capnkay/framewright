// T-117 — the generated component must land inside the repository. §7.
//
// THE DEFECT, and it was found by running the demo rather than by reading code.
// writeComponentFile.js resolved REPO_ROOT with four `..` from server/src/generate,
// which lands on the PARENT of the repository. Its own comment on the line above said
// "up 3 levels". The comment was right.
//
// So every component this project ever generated was written to a sibling of the repo,
// while PreviewPage.jsx discovers sections with
// `import.meta.glob('../sections/generated/*.jsx')` — which cannot see outside the
// tree. No generated section has ever been previewable. Every one of them rendered the
// "the file was not found by Vite eager-glob" branch.
//
// NOTHING FAILED. The write succeeded, stage 7 recorded success, the job reported ok,
// and the file existed — one directory too high.
//
// THE TEST ASSERTS A RELATIONSHIP, NOT A PATH. Pinning an absolute path would pass on
// this machine and mean nothing on another, and pinning the literal string of `..`s
// would re-encode the bug as the expectation.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeComponentFile, buildComponentFilename } from '../server/src/generate/writeComponentFile.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_DIR = path.join(REPO_ROOT, 'client', 'src', 'sections', 'generated');

const SOURCE = 'export default function T117Probe() { return null; }\n';

async function cleanup(filename) {
  await fs.rm(path.join(GENERATED_DIR, filename), { force: true });
}

test('the component is written inside the repository', async () => {
  const args = { sectionName: 'T117Probe', sectionId: '1000009117', variation: '1', source: SOURCE };
  const filename = buildComponentFilename(args.sectionName, args.sectionId, args.variation);

  try {
    await writeComponentFile(args);

    const written = path.join(GENERATED_DIR, filename);
    const contents = await fs.readFile(written, 'utf8');
    assert.equal(contents, SOURCE, 'the file is not where the preview looks for it');
  } finally {
    await cleanup(filename);
  }
});

test('the component is NOT written to the repository’s parent', async () => {
  // The exact shape of the bug: one directory too high, where everything still
  // "works" and nothing can ever find the result.
  const args = { sectionName: 'T117Parent', sectionId: '1000009118', variation: '1', source: SOURCE };
  const filename = buildComponentFilename(args.sectionName, args.sectionId, args.variation);
  const outside = path.join(path.resolve(REPO_ROOT, '..'), 'client', 'src', 'sections', 'generated', filename);

  try {
    await writeComponentFile(args);

    const leaked = await fs.access(outside).then(() => true, () => false);
    assert.equal(leaked, false, `the component was written outside the repo at ${outside}`);
  } finally {
    await cleanup(filename);
    await fs.rm(outside, { force: true });
  }
});

test('the written file is discoverable by the glob the preview uses', async () => {
  // PreviewPage.jsx: import.meta.glob('../sections/generated/*.jsx'). The property that
  // matters is not "a file exists" but "that glob would match it".
  const args = { sectionName: 'T117Glob', sectionId: '1000009119', variation: '2', source: SOURCE };
  const filename = buildComponentFilename(args.sectionName, args.sectionId, args.variation);

  try {
    await writeComponentFile(args);

    const entries = await fs.readdir(GENERATED_DIR);
    const matched = entries.filter((e) => e.endsWith('.jsx'));
    assert.ok(matched.includes(filename), `${filename} is not in ${GENERATED_DIR}`);
  } finally {
    await cleanup(filename);
  }
});

test('a second variation does not overwrite the first', async () => {
  // §7's reason for the non-fixed filename, re-asserted here because this task moved
  // the directory and a move is exactly when a naming rule quietly breaks.
  const one = { sectionName: 'T117Var', sectionId: '1000009120', variation: '1', source: '// v1\n' };
  const two = { sectionName: 'T117Var', sectionId: '1000009120', variation: '2', source: '// v2\n' };
  const f1 = buildComponentFilename(one.sectionName, one.sectionId, one.variation);
  const f2 = buildComponentFilename(two.sectionName, two.sectionId, two.variation);

  try {
    await writeComponentFile(one);
    await writeComponentFile(two);

    assert.notEqual(f1, f2, 'two variations share a filename');
    assert.equal(await fs.readFile(path.join(GENERATED_DIR, f1), 'utf8'), '// v1\n');
    assert.equal(await fs.readFile(path.join(GENERATED_DIR, f2), 'utf8'), '// v2\n');
  } finally {
    await cleanup(f1);
    await cleanup(f2);
  }
});
