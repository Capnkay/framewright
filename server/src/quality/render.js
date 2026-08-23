// server/src/quality/render.js
//
// Renders a generated component to a screenshot, so §18's visual gate has
// something to measure and the critic has something to look at.
//
// WHY NOT A DEV SERVER. The obvious way to screenshot a React component is to
// serve it and point a browser at a URL. That puts the Vite dev server on the
// critical path of every generation: a second process to start, a file written
// into the client source tree, an HMR round trip to wait for, and a route that
// has to exist. quality/axe.js already showed the cheaper path — bundle the JSX
// with esbuild, server-render it to an HTML string — and a string is all
// Puppeteer's setContent needs. Same engine, same layout, no server.
//
// EVERY FAILURE HERE IS `null`, NEVER A THROW. §18: "No gate below fails a
// generation... these gates inform, and §9 decides." A component that cannot be
// bundled, a machine with no Chromium downloaded, a client tree that was never
// `npm install`ed — each of those is a screenshot that does not exist, which is
// exactly what `visualSimilarity: null` already means in §18.1. NULL IS NOT
// ZERO: null is "not applicable / not measured" and is scored as 1.0, whereas
// zero is a measured total mismatch. Returning 0 for an unbundleable component
// would silently dock a real generation 15 points for an infrastructure fault.
//
// AND IT MUST STAY OPTIONAL. AGENTS.md rule 5: no change may make generation
// REQUIRE a key, a GPU or a network. Puppeteer and esbuild are local
// dependencies, but the client's node_modules may legitimately be absent on a
// server-only checkout, and Puppeteer's Chromium download can be skipped. So
// every dependency here is resolved LAZILY, inside the try. A missing one
// degrades this gate; it does not break the import graph of the route that
// imports it. axe.js resolves esbuild at module scope and would throw on
// import in that situation — copying that would take generation down with it.

import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.join(__dirname, '../../../client');
const GENERATED_DIR = path.join(CLIENT_ROOT, 'src/sections/generated');

const SHARED = /^(react|react-dom|react-router-dom)(\/.*)?$/;

/** Lazily resolve the client's toolchain. Returns null rather than throwing. */
function loadClientToolchain() {
  try {
    const clientRequire = createRequire(path.join(CLIENT_ROOT, 'index.js'));
    return {
      clientRequire,
      esbuild: clientRequire('esbuild'),
      React: clientRequire('react'),
      renderToString: clientRequire('react-dom/server').renderToString,
    };
  } catch {
    return null;
  }
}

/**
 * The stylesheet the screenshot is taken through.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. The emitted component is Tailwind
 * classes end to end. Screenshot it with no stylesheet and every element
 * stacks in document order at browser-default type — a picture that shares
 * almost no pixels with the wireframe, and would score a real generation near
 * zero for a reason that has nothing to do with the generation. So a missing
 * stylesheet is reported as `styled: false` and the caller treats the result as
 * unmeasured, rather than as a bad score.
 *
 * Reads whatever `vite build` last emitted. Not built is a supported state.
 */
async function loadStylesheet() {
  const assets = path.join(CLIENT_ROOT, 'dist/assets');
  try {
    const entries = await fs.readdir(assets);
    const css = entries.filter((f) => f.endsWith('.css'));
    if (!css.length) return null;
    const parts = await Promise.all(css.map((f) => fs.readFile(path.join(assets, f), 'utf8')));
    return parts.join('\n');
  } catch {
    return null;
  }
}

/**
 * renderComponent(jsxSource, options)
 *   -> { screenshot: Buffer|null, html: string|null, styled: boolean, reason: string|null }
 *
 * `reason` is null on success and names the degradation otherwise. A gate that
 * goes quiet is the failure mode §9's Glass Box exists to prevent — "not
 * measured" must always come with why.
 */
export async function renderComponent(jsxSource, { width = 1600, height = 1200 } = {}) {
  const miss = (reason) => ({ screenshot: null, html: null, styled: false, reason });

  if (!jsxSource || typeof jsxSource !== 'string') return miss('no component source to render');

  const toolchain = loadClientToolchain();
  if (!toolchain) return miss('client toolchain unavailable (esbuild/react not resolvable)');
  const { clientRequire, esbuild, React, renderToString } = toolchain;

  // Same interception axe.js uses: share the host's React so the bundle does
  // not carry a second copy (two Reacts in one process is a hook-dispatcher
  // error, not a slow build), and swap react-redux for the mock so the
  // component renders its DEFAULT text rather than crashing on a missing store.
  //
  // DEFAULTS ARE THE RIGHT THING TO SCREENSHOT HERE, and it is worth being
  // explicit because it looks like a shortcut. The critic's job is to check the
  // copy the model read off the wireframe, and that copy IS the default — §9's
  // `data?.[id] || "DEFAULT"`. Hydrating a live store would replace exactly the
  // strings under inspection with CMS values and hide the hallucination.
  const shareReactRuntime = {
    name: 'share-react',
    setup(build) {
      build.onResolve({ filter: SHARED }, (args) => ({
        path: pathToFileURL(clientRequire.resolve(args.path)).href,
        external: true,
      }));
      build.onResolve({ filter: /^react-redux$/ }, () => ({
        path: pathToFileURL(path.join(__dirname, 'mock-redux.mjs')).href,
        external: true,
      }));
    },
  };

  const tempBundle = path.join(os.tmpdir(), `_fw_render_${crypto.randomBytes(8).toString('hex')}.mjs`);

  try {
    await esbuild.build({
      stdin: { contents: jsxSource, loader: 'jsx', resolveDir: GENERATED_DIR },
      bundle: true,
      format: 'esm',
      outfile: tempBundle,
      plugins: [shareReactRuntime],
    });

    const mod = await import(pathToFileURL(tempBundle).href);
    const Comp = mod.default;
    if (!Comp) return miss('bundled component has no default export');

    const body = renderToString(React.createElement(Comp));
    const css = await loadStylesheet();

    // `lang` and a title keep this document from being the thing that trips an
    // accessibility check downstream; the component under test should be.
    const html = [
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">',
      '<title>Framewright render</title>',
      css ? `<style>${css}</style>` : '',
      '<style>body{margin:0}</style>',
      `</head><body><main>${body}</main></body></html>`,
    ].join('');

    // Imported lazily for the same reason as the toolchain: Puppeteer without a
    // downloaded Chromium throws on launch, and that must degrade this gate
    // rather than the generation.
    const { screenshotHtml } = await import('./browser.js');
    const screenshot = await screenshotHtml(html, { width, height });

    return {
      screenshot,
      html,
      styled: Boolean(css),
      reason: css ? null : 'client stylesheet not built — run `npm run build` in client/ for a comparable render',
    };
  } catch (err) {
    return miss(`render failed: ${err && err.message ? err.message : String(err)}`);
  } finally {
    await fs.unlink(tempBundle).catch(() => {});
  }
}

export default renderComponent;
