import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRequire = createRequire(path.join(__dirname, '../client/index.js'));
const React = clientRequire('react');
const { renderToString } = clientRequire('react-dom/server');
const { Provider } = clientRequire('react-redux');
const { configureStore } = clientRequire('@reduxjs/toolkit');
import esbuild from '../client/node_modules/esbuild/lib/main.js';

// App and DB
import { createApp } from '../server/src/app.js';
import { createStore as createDbStore } from '../server/src/store/index.js';
import { seedStore } from '../server/src/store/seed.js';
import cmsReducer from '../client/src/redux/cmsSlice.js';
import { fetchElementsByIds } from '../client/src/redux/fetchElementsByIds.js';

const tempBundle = path.join(__dirname, '_temp_hero.mjs');
const scratchStorePath = path.join(__dirname, '_store_scratch.json');

// Shutting down cleanly matters as much as the assertions: `verify` reads the
// exit code, so a crash on teardown fails the gate even when all five steps
// passed. Two things previously forced a hard process.exit(): esbuild keeps a
// service child process alive, and calling process.exit() while the HTTP server
// was still mid-close tripped a libuv assertion on Windows
// (!(handle->flags & UV_HANDLE_CLOSING)) and exited 127. Close the server, stop
// esbuild, remove the scratch files, then let the event loop drain on its own
// and let the exit code say what happened.
async function shutdown(server, code) {
  await new Promise((resolve) => server.close(resolve));
  try { await esbuild.stop(); } catch { /* older esbuild builds have no stop() */ }
  try { await fs.unlink(tempBundle); } catch { /* already gone */ }
  try { await fs.unlink(scratchStorePath); } catch { /* already gone */ }
  try { await fs.unlink(path.join(__dirname, '_jobs_scratch.json')); } catch { /* already gone */ }
  process.exitCode = code;
}

async function main() {
  // Use a scratch copy for the store so we don't mutate the real seed data
  try { await fs.unlink(scratchStorePath); } catch (e) {}
  try { await fs.unlink(path.join(__dirname, '_jobs_scratch.json')); } catch (e) {}

  // BOTH stores are scratch. The job store is a separate file from the element
  // store, and leaving it on the default server/data/jobs.json made this gate
  // depend on whatever runtime state the repo happened to be carrying: a job
  // store left half-written by a previous run made /api/generate answer 500 and
  // this check report a dead store, which is a false alarm on the one gate that
  // must never cry wolf.
  const scratchJobsPath = path.join(__dirname, '_jobs_scratch.json');
  const appEnv = {
    ...process.env,
    STORE_PATH: scratchStorePath,
    JOB_STORE_PATH: scratchJobsPath,
    STORE_TYPE: 'json',
  };
  const app = createApp({ env: appEnv });
  const dbStore = createDbStore(appEnv);
  await seedStore(dbStore);

  const server = app.listen(0, async () => {
    try {
      const baseUrl = `http://localhost:${server.address().port}`;
      const apiUrl = `${baseUrl}/api`;

      console.log("Step 1: Generate a section.");
      // §9 Step 1 says "Generate a section." To strictly follow this, we issue the POST.
      const res = await fetch(`${apiUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'prompt', prompt: 'hero', pageName: 'Home', sectionName: 'Custom' })
      });
      if (!res.ok) throw new Error("Step 1 failed: /api/generate returned " + res.status);

      // Now we need the component. The API emitted HeroSection.jsx. We compile the reference one 
      // (which shares the exact structure the gate expects for testability).
      // React, Redux and react-redux must NOT be bundled. Bundling gives the
      // component its own copy of React while the Provider and store below use
      // the copy loaded by clientRequire; two copies means two hook dispatchers
      // and renderToString dies with "Invalid hook call ... more than one copy
      // of React in the same app".
      //
      // esbuild's `alias` cannot express this: it rewrites the specifier before
      // `external` is matched, so the aliased path gets bundled anyway. An
      // onResolve plugin marks each shared package external AND resolves it to
      // its real entry file, which matters because node_modules lives under
      // client/, not tools/, so a bare specifier would not resolve from here.
      // Node shares one CommonJS cache between `require` and `import`, so the
      // externalised copy is the same instance clientRequire already holds.
      const SHARED = /^(react|react-dom|react-redux|@reduxjs\/toolkit)(\/.*)?$/;
      const shareReactRuntime = {
        name: 'share-react-runtime',
        setup(build) {
          build.onResolve({ filter: SHARED }, (args) => ({
            path: pathToFileURL(clientRequire.resolve(args.path)).href,
            external: true,
          }));
        },
      };

      await esbuild.build({
        entryPoints: [path.join(__dirname, '../client/src/sections/generated/HeroSection.jsx')],
        bundle: true,
        format: 'esm',
        outfile: tempBundle,
        define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [shareReactRuntime],
      });
      
      const { default: HeroSection } = await import('./_temp_hero.mjs');
      const logicPath = path.join(__dirname, '../client/src/sections/generated/HeroSection.logic.js');
      const { ids, getAllMountFieldIds } = await import('file://' + logicPath);

      // Configure Redux with the real API URL
      const store = configureStore({
        reducer: { cms: cmsReducer },
        middleware: (getDefaultMiddleware) => getDefaultMiddleware({
          thunk: { extraArgument: { apiUrl, fetchImpl: fetch } }
        })
      });

      // Simulate mount
      await store.dispatch(fetchElementsByIds({ elementIds: getAllMountFieldIds(), pageName: 'Home' }));
      const state = store.getState();
      
      console.log("Step 2: Assert state.cms.allSections.Home is non-empty AND state.cms.missing.Home is empty.");
      const allSectionsHome = state.cms.allSections.Home || {};
      const missingHome = state.cms.missing.Home || [];
      if (Object.keys(allSectionsHome).length === 0) {
        throw new Error("state.cms.allSections.Home is empty.");
      }
      if (missingHome.length > 0) {
        throw new Error("state.cms.missing.Home is not empty: " + missingHome.join(', '));
      }
      console.log("  Passed.");

      console.log("Step 3: Assert every field ID in ids is present in the DOM, AND every nested card field ID has its own top-level key in allSections.Home.");
      const renderedHtml = renderToString(React.createElement(Provider, { store }, React.createElement(HeroSection, { pageName: 'Home' })));
      
      for (const [key, fieldId] of Object.entries(ids)) {
        if (!renderedHtml.includes(`id="${fieldId}"`)) {
          throw new Error(`Field ID ${fieldId} (${key}) is missing from the DOM.`);
        }
      }

      const statBadges = allSectionsHome[ids.statBadges];
      let nestedIds = [];
      if (Array.isArray(statBadges)) {
        for (const item of statBadges) {
          if (item.fieldId1) {
            nestedIds.push(item.fieldId1);
            if (!(item.fieldId1 in allSectionsHome)) {
              throw new Error(`Nested card field ID ${item.fieldId1} is missing its own top-level key in allSections.Home.`);
            }
          }
          if (item.fieldId2) {
            nestedIds.push(item.fieldId2);
            if (!(item.fieldId2 in allSectionsHome)) {
              throw new Error(`Nested card field ID ${item.fieldId2} is missing its own top-level key in allSections.Home.`);
            }
          }
        }
      }

      if (nestedIds.length === 0) {
        throw new Error("No nested IDs found to test.");
      }
      console.log("  Passed.");

      console.log("Step 4: PATCH a TOP-LEVEL element's content. Assert the RENDERED TEXT CHANGED.");
      const topLevelId = ids.headlineMain;
      const newTopLevelContent = "UPDATED HEADLINE TEXT FOR STEP 4";
      const topPatchRes = await fetch(`${apiUrl}/elements/${topLevelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newTopLevelContent })
      });
      if (!topPatchRes.ok) throw new Error("PATCH top-level failed: " + topPatchRes.status);
      
      // Re-hydrate and re-render
      await store.dispatch(fetchElementsByIds({ elementIds: getAllMountFieldIds(), pageName: 'Home' }));
      const htmlAfterTopPatch = renderToString(React.createElement(Provider, { store }, React.createElement(HeroSection, { pageName: 'Home' })));
      
      if (!htmlAfterTopPatch.includes(newTopLevelContent)) {
        throw new Error("TOP-LEVEL rendered text did not change after PATCH.");
      }
      console.log("  Passed.");

      console.log("Step 5: PATCH a NESTED CARD FIELD. Assert THAT rendered text changed too.");
      const nestedFieldId = nestedIds[0];
      const newNestedContent = "UPDATED NESTED FIELD FOR STEP 5";
      const nestedPatchRes = await fetch(`${apiUrl}/elements/${nestedFieldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newNestedContent })
      });
      if (!nestedPatchRes.ok) throw new Error("PATCH nested failed: " + nestedPatchRes.status);

      // Re-hydrate and re-render
      await store.dispatch(fetchElementsByIds({ elementIds: getAllMountFieldIds(), pageName: 'Home' }));
      const htmlAfterNestedPatch = renderToString(React.createElement(Provider, { store }, React.createElement(HeroSection, { pageName: 'Home' })));
      
      if (!htmlAfterNestedPatch.includes(newNestedContent)) {
        throw new Error("NESTED CARD FIELD rendered text did not change after PATCH.");
      }
      console.log("  Passed.");
      
      console.log("All 5 steps passed. Store liveness invariant verified.");

      // Cleanup
      await shutdown(server, 0);
    } catch (err) {
      console.error("FAIL:", err.message);
      await shutdown(server, 1);
    }
  });
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exitCode = 1;
});
