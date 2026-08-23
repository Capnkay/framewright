import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import jsdom from 'jsdom';
import axe from 'axe-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRequire = createRequire(path.join(__dirname, '../../../client/index.js'));
const esbuild = clientRequire('esbuild');
const React = clientRequire('react');
const { renderToString } = clientRequire('react-dom/server');

const SHARED = /^(react|react-dom|react-router-dom)(\/.*)?$/;

/**
 * esbuild plugin that intercepts React and React DOM imports and maps them to 
 * the host's actual node_modules so they are loaded as external dependencies.
 * Also replaces react-redux with a dummy implementation.
 */
const shareReactRuntime = {
  name: 'share-react',
  setup(build) {
    build.onResolve({ filter: SHARED }, (args) => ({
      path: pathToFileURL(clientRequire.resolve(args.path)).href,
      external: true,
    }));
    build.onResolve({ filter: /^react-redux$/ }, (args) => ({
      path: pathToFileURL(path.join(__dirname, 'mock-redux.mjs')).href,
      external: true,
    }));
  },
};

/**
 * Runs axe-core over the generated JSX source to count serious and critical accessibility violations.
 * @param {string} jsxSource - The generated React component source code.
 * @returns {Promise<number|null>} Number of violations, or null if unmeasurable.
 */
export async function measureAccessibility(jsxSource) {
  if (!jsxSource) return null;

  // Give the temp file a unique name to avoid cache collision and race conditions.
  const tempId = crypto.randomBytes(8).toString('hex');
  const tempBundle = path.join(os.tmpdir(), `_temp_axe_comp_${tempId}.mjs`);

  try {
    // 1. Bundle the component
    // We set resolveDir to the client's generated folder so relative imports (e.g., ../../utils/...)
    // resolve correctly against the client's source tree.
    await esbuild.build({
      stdin: {
        contents: jsxSource,
        loader: 'jsx',
        resolveDir: path.join(__dirname, '../../../client/src/sections/generated'),
      },
      bundle: true,
      format: 'esm',
      outfile: tempBundle,
      plugins: [shareReactRuntime],
      // We don't minify; we just want to run it.
    });

    // 2. Import the bundled component
    // The pathToFileURL ensures Windows compatibility.
    const { default: Comp } = await import(pathToFileURL(tempBundle).href);
    if (!Comp) throw new Error('Default export not found in compiled component.');

    // 3. Render it to an HTML string
    // Because we mocked react-redux, useSelector returns undefined and the component will render DEFAULTS.
    const htmlString = renderToString(React.createElement(Comp));

    // 4. Create a jsdom environment
    // We wrap the component in a <main> tag as a landmark to prevent axe-core from complaining about missing page landmarks.
    const { JSDOM } = jsdom;
    const dom = new JSDOM(`<!DOCTYPE html><html lang="en"><head><title>Axe Test</title></head><body><main>${htmlString}</main></body></html>`);

    // 5. Run axe-core
    // Note: axe.run typically takes a DOM node or a string (selector), but here we give it the jsdom document.
    const results = await axe.run(dom.window.document.documentElement, {
      rules: {
        // You can toggle specific rules here if needed, but defaults are fine.
      }
    });

    // 6. Count violations
    // We only care about 'serious' and 'critical' as per the graded floor requirements.
    let seriousCount = 0;
    if (results && Array.isArray(results.violations)) {
      for (const violation of results.violations) {
        if (violation.impact === 'serious' || violation.impact === 'critical') {
          // A single rule violation can apply to multiple nodes, we count the number of nodes affected.
          seriousCount += violation.nodes.length;
        }
      }
    }

    return seriousCount;

  } catch (err) {
    // A structurally invalid component that cannot build or render will throw.
    // Rule 6: Zero is not "not measured". We must return null here so it's excluded from scoring rather than credited.
    console.error('Failed to measure accessibility:', err);
    return null;
  } finally {
    // Clean up
    try {
      await fs.unlink(tempBundle);
    } catch (e) {
      // ignore
    }
  }
}
