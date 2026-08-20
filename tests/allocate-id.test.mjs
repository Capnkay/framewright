import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allocateId } from '../server/src/ids/allocateId.js';

test('allocate-id wraps store correctly and uses no forbidden globals', async (t) => {
  // 1. Check file contents
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fileContent = await fs.readFile(path.join(__dirname, '../server/src/ids/allocateId.js'), 'utf8');
  
  const forbidden = ['Math.random', 'Date.now', 'uuid', 'nanoid'];
  for (const f of forbidden) {
    assert.ok(!fileContent.includes(f), `File contains forbidden string: ${f}`);
  }

  // 2. Check logic with a mock store
  const mockStore = {
    allocateId: async (r) => {
      if (r === 'section') return '1000000001';
      if (r === 'element') return '2000000001';
      if (r === 'cardField') return '3000000001';
      throw new Error('mock err');
    }
  };

  assert.strictEqual(await allocateId(mockStore, 'section'), '1000000001');
  assert.strictEqual(await allocateId(mockStore, 'element'), '2000000001');
  assert.strictEqual(await allocateId(mockStore, 'cardField'), '3000000001');

  await assert.rejects(
    async () => allocateId(mockStore, 'invalid'),
    /Invalid id range: invalid/
  );
});
