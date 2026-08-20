import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getExportZip } from '../server/src/routes/exportZip.js';

test('GET /api/sections/:sectionId/export returns a zip stream (T-042)', async () => {
  let piped = false;
  let headers = {};
  
  const mockRes = {
    status: (code) => mockRes,
    send: () => {},
    setHeader: (k, v) => headers[k] = v
  };
  // Simulate stream pipe
  mockRes.on = () => mockRes;
  mockRes.once = () => mockRes;
  mockRes.emit = () => mockRes;
  mockRes.write = () => true;
  mockRes.end = () => {};

  const ctx = {
    params: { sectionId: '1000000001' },
    store: {
      findSection: async () => ({ sectionId: '1000000001', sectionName: 'Hero' }),
      findElements: async () => ([{ fieldId: '2000000001' }])
    }
  };
  
  const result = await getExportZip(ctx);
  
  assert.equal(result.stream, true);
  assert.equal(result.contentType, 'application/zip');
  assert.match(result.headers['Content-Disposition'], /filename="section-1000000001.zip"/);
  assert.equal(typeof result.handler, 'function');
});
