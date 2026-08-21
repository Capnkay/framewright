import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createStorage } from '../server/src/storage/index.js';

test('local disk adapter satisfies §15.2', async (t) => {
  const env = { VITE_STORAGE_URL: 'http://localhost:5000/storage/' };
  const storage = createStorage(env);

  const testKey = 'uploads/test-job-001.txt';
  const testData = Buffer.from('hello world');

  // Ensure cleanup from previous runs
  await storage.deleteObject(testKey);

  // 1. putObject
  const putResult = await storage.putObject(testKey, testData, 'text/plain');
  assert.equal(putResult.key, testKey);
  assert.equal(putResult.url, 'http://localhost:5000/storage/uploads/test-job-001.txt');

  // Verify it actually wrote to disk
  const absPath = path.resolve(process.cwd(), testKey);
  const diskData = await fs.readFile(absPath);
  assert.deepEqual(diskData, testData, 'putObject must write exact bytes to disk');

  // 2. getObject
  const getResult = await storage.getObject(testKey);
  assert.ok(getResult !== null, 'getObject must return the object if it exists');
  assert.deepEqual(getResult.bytes, testData, 'getObject must return the exact bytes');
  assert.equal(getResult.contentType, 'text/plain', 'getObject must infer or return contentType');

  // 3. deleteObject
  await storage.deleteObject(testKey);
  
  // Verify it's gone
  const getResultAfterDelete = await storage.getObject(testKey);
  assert.equal(getResultAfterDelete, null, 'getObject must return null for missing objects');
  
  try {
    await fs.stat(absPath);
    assert.fail('File should have been deleted from disk');
  } catch (err) {
    assert.equal(err.code, 'ENOENT');
  }

  // deleteObject on non-existent object shouldn't throw
  await storage.deleteObject(testKey);
});

test('local disk adapter with no env uses default VITE_STORAGE_URL and is selected by default', async (t) => {
  const storage = createStorage({});
  const testKey = 'artifacts/test-job-002.png';
  const testData = Buffer.from('fake-png-data');
  
  const putResult = await storage.putObject(testKey, testData, 'image/png');
  assert.equal(putResult.url, 'http://localhost:5000/storage/artifacts/test-job-002.png');
  
  await storage.deleteObject(testKey);
});

// The key shapes are fixed by §15.2 rule 2. Everything else must be rejected:
// without this, path.resolve(repoRoot, key) turns any job-derived key into a
// read/write/unlink primitive anywhere on the machine.
test('local disk adapter rejects keys outside the §15.2 key shapes', async (t) => {
  const storage = createStorage({});
  const rejected = [
    '../../../etc/passwd',
    'uploads/../../../etc/passwd',
    'artifacts/../../secrets.json',
    '/etc/passwd',
    'uploads/',
    'uploads//x.png',
    'uploads/./x.png',
    'notuploads/x.png',
    'docs/CONTRACT.md',
    '',
  ];

  for (const key of rejected) {
    await assert.rejects(
      () => storage.putObject(key, Buffer.from('x'), 'text/plain'),
      /storage: key/,
      `putObject should reject ${JSON.stringify(key)}`,
    );
    await assert.rejects(
      () => storage.getObject(key),
      /storage: key/,
      `getObject should reject ${JSON.stringify(key)}`,
    );
    await assert.rejects(
      () => storage.deleteObject(key),
      /storage: key/,
      `deleteObject should reject ${JSON.stringify(key)}`,
    );
  }

  // A backslash is not a path separator in a key, and must not become one.
  const backslashKey = 'uploads' + String.fromCharCode(92) + '..' + String.fromCharCode(92) + 'x.png';
  await assert.rejects(() => storage.getObject(backslashKey), /storage: key/);

  // The two legal shapes still work.
  const ok = await storage.putObject('uploads/job-1.png', Buffer.from('a'), 'image/png');
  assert.equal(ok.key, 'uploads/job-1.png');
  await storage.deleteObject('uploads/job-1.png');

  const ok2 = await storage.putObject('artifacts/job-1/3-regions.json', Buffer.from('{}'), 'application/json');
  assert.equal(ok2.key, 'artifacts/job-1/3-regions.json');
  await storage.deleteObject('artifacts/job-1/3-regions.json');
  // deleteObject removes the object, not the per-job directory it lived in.
  // Leaving that directory behind is what makes a later rmdir in another suite
  // fail with ENOTEMPTY, so this suite takes its own directory with it.
  await fs.rm('artifacts/job-1', { recursive: true, force: true });
});
