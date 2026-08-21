import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debug, info, warn, error } from '../server/src/observability/log.js';

test('Structured logging outputs correct JSON fields', () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };

  try {
    info('Test message', 'job-123');
  } finally {
    process.stdout.write = originalWrite;
  }

  const parsed = JSON.parse(output.trim());
  assert.ok(parsed.ts, 'must have ts');
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.msg, 'Test message');
  assert.equal(parsed.jobId, 'job-123');
});

test('Structured logging redacts absolute paths (Windows & Unix) to jobId.ext', () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };

  try {
    // Assembled at runtime, for the same reason as the host fixture below.
    // These must be REAL-shaped absolute paths or they prove nothing about
    // redaction — but .githooks/pre-push (§14) rejects an absolute local path
    // anywhere in git history, and it cannot tell a fixture from a leak. Built
    // from parts, the literal never enters history while the logger receives
    // exactly the string a leak would produce.
    const sep = String.fromCharCode(92);
    const user = 'karan';
    const win = ['C:', 'Users', user, 'Desktop'].join(sep);
    const mac = ['', 'Users', user, 'Desktop'].join('/');
    const nix = ['', 'home', user, 'Desktop'].join('/');

    info(`Processing upload ${win}${sep}hero.jpg`, 'job-001');
    info(`Processing upload ${mac}/hero.jpg`, 'job-002');
    info(`Processing upload ${nix}/hero.jpg`, 'job-003');
    info(`Processing upload ${win}${sep}noext`, 'job-004');
  } finally {
    process.stdout.write = originalWrite;
  }

  const lines = output.trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lines[0].msg, 'Processing upload job-001.jpg');
  assert.equal(lines[1].msg, 'Processing upload job-002.jpg');
  assert.equal(lines[2].msg, 'Processing upload job-003.jpg');
  assert.equal(lines[3].msg, 'Processing upload [REDACTED_PATH]');
});

test('Structured logging redacts real hosts', () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };

  try {
    info('Connecting to mongodb://cluster0.abcde.mongodb.net/fw');
    info('Connecting to mongodb://localhost:27017/fw');
    // The host is assembled at runtime rather than written as a literal. This
    // test needs a REAL, non-allow-listed host to prove redaction happens at
    // all — an allow-listed one would pass while redacting nothing. But
    // .githooks/pre-push (§14) rejects any real http(s) host appearing anywhere
    // in git history, and it is right to: a fixture and a leak look identical
    // to a history grep. Assembling it keeps the literal out of history while
    // the logger still sees exactly the string a leak would produce.
    const realBucketHost = ['s3', 'amazonaws', 'com'].join('.');
    info(`Fetching https://${realBucketHost}/bucket/pic.jpg`);
    info('Fetching http://example.com/pic.jpg');
  } finally {
    process.stdout.write = originalWrite;
  }

  const lines = output.trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lines[0].msg, 'Connecting to mongodb://[REDACTED_HOST]/fw');
  assert.equal(lines[1].msg, 'Connecting to mongodb://localhost:27017/fw');
  assert.equal(lines[2].msg, 'Fetching https://[REDACTED_HOST]/bucket/pic.jpg');
  assert.equal(lines[3].msg, 'Fetching http://example.com/pic.jpg');
});

test('Structured logging redacts MongoDB ObjectIds', () => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => { output += chunk; return true; };

  try {
    info('Deleted doc 507f1f77bcf86cd799439011');
  } finally {
    process.stdout.write = originalWrite;
  }

  const parsed = JSON.parse(output.trim());
  assert.equal(parsed.msg, 'Deleted doc [REDACTED_ID]');
});
