import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs/promises';
import { acquireInput } from '../server/src/pipeline/stage1InputAcquisition.js';

test('stage1 input acquisition accepts valid images and enforces limits', async (t) => {
  // Spin up an ephemeral HTTP server to parse the request natively
  const server = http.createServer(async (req, res) => {
    const result = await acquireInput(req, res, 'job-test-123');
    res.writeHead(result.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Test missing file
    let fd = new FormData();
    fd.append('other', 'thing');
    let res = await fetch(baseUrl, { method: 'POST', body: fd });
    assert.strictEqual(res.status, 400, 'Missing file should return 400');

    // 2. Test invalid file type (e.g. text)
    fd = new FormData();
    fd.append('image', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt');
    res = await fetch(baseUrl, { method: 'POST', body: fd });
    assert.strictEqual(res.status, 400, 'Invalid file type should return 400');

    // 3. Test file too large (over 8MB)
    fd = new FormData();
    const largeBuffer = Buffer.alloc(9 * 1024 * 1024); // 9MB
    fd.append('image', new Blob([largeBuffer], { type: 'image/jpeg' }), 'large.jpg');
    res = await fetch(baseUrl, { method: 'POST', body: fd });
    assert.strictEqual(res.status, 413, 'File over 8MB should return 413');

    // 4. Test valid JPEG
    fd = new FormData();
    const tinyBuffer = Buffer.from('ffd8ffe000104a46494600010101004800480000', 'hex');
    fd.append('image', new Blob([tinyBuffer], { type: 'image/jpeg' }), 'valid.jpg');
    res = await fetch(baseUrl, { method: 'POST', body: fd });
    assert.strictEqual(res.status, 200, 'Valid JPEG should return 200');
    let data = await res.json();
    assert.strictEqual(data.path, 'uploads/job-test-123.jpg');
    
    // Verify file was written
    const stat = await fs.stat(data.path);
    assert.ok(stat.size > 0, 'File should have been written to uploads/');

    // 5. Test valid PNG
    fd = new FormData();
    fd.append('image', new Blob([tinyBuffer], { type: 'image/png' }), 'valid.png');
    res = await fetch(baseUrl, { method: 'POST', body: fd });
    assert.strictEqual(res.status, 200, 'Valid PNG should return 200');
    data = await res.json();
    assert.strictEqual(data.path, 'uploads/job-test-123.png');
    
  } finally {
    server.close();
    // Clean up test uploads
    await fs.rm('uploads/job-test-123.jpg', { force: true });
    await fs.rm('uploads/job-test-123.png', { force: true });
  }
});
