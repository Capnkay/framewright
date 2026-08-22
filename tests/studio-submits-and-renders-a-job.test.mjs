import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRequire = createRequire(path.join(__dirname, '../client/index.js'));
const React = clientRequire('react');
const { renderToString } = clientRequire('react-dom/server');
const { MemoryRouter } = clientRequire('react-router-dom');

import esbuild from '../client/node_modules/esbuild/lib/main.js';

// App and DB
import { createApp } from '../server/src/app.js';
import { createStore as createDbStore } from '../server/src/store/index.js';
import { seedStore } from '../server/src/store/seed.js';

const tempBundle = path.join(__dirname, '_temp_generate_page.mjs');
const tempMock = path.join(__dirname, '_temp_mock_mode_selector.jsx');
const scratchStorePath = path.join(__dirname, '_store_scratch_generate.json');
const scratchJobsPath = path.join(__dirname, '_jobs_scratch_generate.json');

async function shutdown(server, code) {
  await new Promise((resolve) => server.close(resolve));
  try { await esbuild.stop(); } catch {}
  try { await fs.unlink(tempBundle); } catch {}
  try { await fs.unlink(tempMock); } catch {}
  try { await fs.unlink(scratchStorePath); } catch {}
  try { await fs.unlink(scratchJobsPath); } catch {}
  if (code !== undefined) process.exitCode = code;
}

test('T-114: The Studio submits a wireframe and drives the timeline from the response', async () => {
  try { await fs.unlink(scratchStorePath); } catch (e) {}
  try { await fs.unlink(scratchJobsPath); } catch (e) {}

  const appEnv = {
    ...process.env,
    STORE_PATH: scratchStorePath,
    JOB_STORE_PATH: scratchJobsPath,
    STORE_TYPE: 'json',
  };
  const app = createApp({ env: appEnv });
  const dbStore = createDbStore(appEnv);
  await seedStore(dbStore);

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const baseUrl = `http://localhost:${server.address().port}`;
    
    // 1. Create a mock ModeSelector that captures onSubmit
    await fs.writeFile(tempMock, `
      import React from 'react';
      export default function ModeSelector({ onSubmit }) {
        if (typeof global !== 'undefined' && onSubmit) {
          global.__TEST_SUBMIT__ = onSubmit;
        }
        return <div id="mock-mode-selector">ModeSelector Mock</div>;
      }
    `);

    // 2. Build GeneratePage via esbuild, aliasing ModeSelector to our mock
    const SHARED = /^(react|react-dom|react-router-dom|react-redux|@reduxjs\/toolkit)(\/.*)?$/;
    const shareReactRuntime = {
      name: 'share-react-runtime',
      setup(build) {
        build.onResolve({ filter: SHARED }, (args) => ({
          path: pathToFileURL(clientRequire.resolve(args.path)).href,
          external: true,
        }));
        
        build.onResolve({ filter: /\/ModeSelector\.jsx$/ }, (args) => {
          return { path: tempMock };
        });
      },
    };

    await esbuild.build({
      entryPoints: [path.join(__dirname, '../client/src/routes/GeneratePage.jsx')],
      bundle: true,
      format: 'esm',
      outfile: tempBundle,
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [shareReactRuntime],
    });

    const { default: GeneratePage } = await import('./_temp_generate_page.mjs');

    // 3. Render once to capture the submit handler
    global.__TEST_SUBMIT__ = null;
    const initialHtml = renderToString(React.createElement(MemoryRouter, null, React.createElement(GeneratePage)));
    
    assert.ok(initialHtml.includes('mock-mode-selector'), 'GeneratePage must mount the aliased ModeSelector');
    assert.equal(typeof global.__TEST_SUBMIT__, 'function', 'GeneratePage must pass an onSubmit function (handleSubmit) to ModeSelector');

    // 4. Submit the real form data (wireframe mode)
    const formData = new FormData();
    formData.append('mode', 'wireframe');
    formData.append('pageName', 'Home');
    formData.append('sectionName', 'Custom');
    formData.append('wireframe', new Blob(['dummy image content'], { type: 'image/png' }), 'wireframe.png');
    
    // Override global fetch to prepend the baseUrl so the client component hits the test server
    const originalFetch = global.fetch;
    global.fetch = async function(url, options) {
      if (typeof url === 'string' && url.startsWith('/api/')) {
        return originalFetch(baseUrl + url, options);
      }
      return originalFetch(url, options);
    };

    // Execute handleSubmit (from GeneratePage)
    try {
      await global.__TEST_SUBMIT__(formData);
    } catch (e) {
      // It's normal for setJob inside an unmounted component to fail.
    }
    
    // Fetch the job record from the job store backend directly, because we just created it!
    let jobDataRaw = '{}';
    try {
      jobDataRaw = await fs.readFile(scratchJobsPath, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const storeData = JSON.parse(jobDataRaw || '{}');
    const jobsArr = storeData.jobs || [];
    assert.ok(jobsArr.length > 0, 'handleSubmit must have POSTed to /api/generate and created a job');
    const createdJob = jobsArr[0];
    
    // Clean up fetch mock
    global.fetch = originalFetch;

    // 5. Render AGAIN with the created job to assert it reaches the timeline
    const finalHtml = renderToString(React.createElement(MemoryRouter, null, React.createElement(GeneratePage, { initialJob: createdJob })));
    
    assert.ok(finalHtml.includes('Job Timeline'), 'Must render JobTimeline when a job is present');
    assert.ok(finalHtml.includes('input acquisition'), 'Timeline must display stage names from the job');
    assert.ok(finalHtml.includes('Generation Progress'), 'GenerationProgress must render the initial job status');

    await shutdown(server);
  } catch (err) {
    await shutdown(server);
    throw err;
  }
});
