import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createS3Storage } from '../server/src/storage/s3.js';
import { createStorage } from '../server/src/storage/index.js';

test('S3 adapter satisfies A 15.2', async () => {
  const env = { 
    VITE_STORAGE_URL: 'http://cdn.example.com/storage/',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'test-bucket',
    S3_ACCESS_KEY_ID: 'fake-access',
    S3_SECRET_ACCESS_KEY: 'fake-secret'
  };
  
  let sendCalls = [];
  const fakeClient = {
    send: async (command) => {
      sendCalls.push(command);
      if (command.constructor.name === 'GetObjectCommand') {
        if (command.input.Key === 'uploads/notfound.txt') {
          const err = new Error('Not Found');
          err.name = 'NoSuchKey';
          throw err;
        }
        return {
          ContentType: 'text/plain',
          Body: {
            transformToByteArray: async () => new Uint8Array([104, 101, 108, 108, 111]) // "hello"
          }
        };
      }
      return {};
    }
  };

  const storage = createS3Storage(env, fakeClient);

  // 1. putObject
  const testKey = 'uploads/test-job-001.txt';
  const testData = Buffer.from('hello');
  const putResult = await storage.putObject(testKey, testData, 'text/plain');
  
  assert.equal(putResult.key, testKey);
  assert.equal(putResult.url, 'http://cdn.example.com/storage/uploads/test-job-001.txt');
  
  assert.equal(sendCalls[0].constructor.name, 'PutObjectCommand');
  assert.equal(sendCalls[0].input.Bucket, 'test-bucket');
  assert.equal(sendCalls[0].input.Key, testKey);

  // 2. getObject
  const getResult = await storage.getObject(testKey);
  assert.ok(getResult !== null);
  assert.deepEqual(getResult.bytes, Buffer.from('hello'));
  assert.equal(getResult.contentType, 'text/plain');

  // 3. getObject (missing)
  const missingResult = await storage.getObject('uploads/notfound.txt');
  assert.equal(missingResult, null);

  // 4. deleteObject
  await storage.deleteObject(testKey);
  assert.equal(sendCalls[sendCalls.length - 1].constructor.name, 'DeleteObjectCommand');
});

test('S3 adapter rejects invalid keys', async () => {
  const env = { 
    VITE_STORAGE_URL: 'http://cdn.example.com/storage/',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'test-bucket',
    S3_ACCESS_KEY_ID: 'fake',
    S3_SECRET_ACCESS_KEY: 'fake'
  };
  const storage = createS3Storage(env, { send: async () => {} });
  
  await assert.rejects(
    async () => await storage.putObject('../../../etc/passwd', Buffer.from('a'), 'text/plain'),
    /must start with uploads\/ or artifacts\//
  );
  
  await assert.rejects(
    async () => await storage.putObject('uploads/../test', Buffer.from('a'), 'text/plain'),
    /must not contain traversal segments/
  );
});
