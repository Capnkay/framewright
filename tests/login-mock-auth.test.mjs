import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../client/src/studio/auth/mockAuth.js';

test('login resolves with user for valid credentials', async () => {
  const result = await login({ email: 'a@b.com', password: 'x' });
  assert.deepEqual(result, { user: { email: 'a@b.com' } });
});

test('login rejects with Error for empty email or password', async () => {
  await assert.rejects(
    login({ email: '', password: 'x' }),
    (err) => {
      assert.strictEqual(err.message, 'Email and password are required.');
      return true;
    }
  );

  await assert.rejects(
    login({ email: 'a@b.com', password: '' }),
    (err) => {
      assert.strictEqual(err.message, 'Email and password are required.');
      return true;
    }
  );

  await assert.rejects(
    login({ email: '   ', password: '   ' }),
    (err) => {
      assert.strictEqual(err.message, 'Email and password are required.');
      return true;
    }
  );
});
