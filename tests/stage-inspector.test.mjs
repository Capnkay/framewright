import test from 'node:test';
import assert from 'node:assert/strict';

// Imported from the component's own logic module — the SAME code StageInspector
// runs. These functions were previously DEFINED here and imported by the
// component, so this suite tested its own copy and would have passed even if the
// component were empty.
import {
  buildArtifactUrl,
  extractStageInfo,
  fetchArtifactContent,
} from '../client/src/studio/StageInspector.logic.js';

test('StageInspector logic', async (t) => {
  await t.test('buildArtifactUrl extracts basename and builds correct /api URL', () => {
    const url = buildArtifactUrl('job-0000000001', 'artifacts/job-0000000001/s3-regions.json');
    assert.equal(url, '/api/jobs/job-0000000001/artifacts/s3-regions.json');
  });

  await t.test('extractStageInfo extracts confidence and warnings', () => {
    const info = extractStageInfo({
      confidence: 0.85,
      warnings: ['Low contrast']
    });
    assert.equal(info.confidence, 0.85);
    assert.deepEqual(info.warnings, ['Low contrast']);
  });

  await t.test('fetchArtifactContent fetches and formats JSON', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      assert.equal(url, '/api/jobs/job-123/artifacts/data.json');
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ foo: 'bar' })
      };
    };
    
    try {
      const content = await fetchArtifactContent('job-123', { outputRef: 'artifacts/job-123/data.json' });
      assert.equal(content, '{\n  "foo": "bar"\n}');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test('fetchArtifactContent fetches and returns text', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      assert.equal(url, '/api/jobs/job-123/artifacts/source.jsx');
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'const x = 1;'
      };
    };
    
    try {
      const content = await fetchArtifactContent('job-123', { outputRef: 'artifacts/job-123/source.jsx' });
      assert.equal(content, 'const x = 1;');
    } finally {
      global.fetch = originalFetch;
    }
  });
  await t.test('fetchArtifactContent truncates large artifacts', async () => {
    const originalFetch = global.fetch;
    const largeText = 'A'.repeat(60000);
    global.fetch = async (url) => {
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => largeText
      };
    };
    
    try {
      const content = await fetchArtifactContent('job-123', { outputRef: 'artifacts/job-123/large.txt' });
      assert.equal(content.length, 50000 + '\n\n... [Truncated for performance]'.length);
      assert.match(content, /\[Truncated for performance\]/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
