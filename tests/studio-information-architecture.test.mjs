// T-126 — what a person meets when the Studio opens. FR-G01, FR-G09, §7 R11.
//
// WHY THIS EXISTS AS A TEST RATHER THAN AS TASTE. Every other test on this page
// asserts that a component is mounted and wired, and all of them passed while
// the page showed "Configuration (FR-G07)" as a heading, described itself as
// "Full studio layout mounting all 14 built components", and rendered the string
// "Preview will render here" where the product goes. Reachability tests cannot
// see any of that — the components were genuinely reachable.
//
// So these pin the few properties that decide whether the first thirty seconds
// land, chosen because each one has a definite answer:
//
//   * no internal vocabulary reaches the screen — requirement ids, ticket
//     numbers, component counts
//   * the preview frames the real route rather than a placeholder
//   * there is an empty state before a run, and the stage trace after one
//
// They are deliberately NOT assertions about layout, spacing or colour. Those
// change with judgement and a test that pins them just makes design work
// expensive.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRequire = createRequire(path.join(__dirname, '../client/index.js'));
const React = clientRequire('react');
const { renderToString } = clientRequire('react-dom/server');
const { MemoryRouter } = clientRequire('react-router-dom');

const esbuild = (await import('../client/node_modules/esbuild/lib/main.js')).default;

const SOURCE = path.join(__dirname, '../client/src/routes/GeneratePage.jsx');
const BUNDLE = path.join(__dirname, '_temp_studio_ia.mjs');

/** Bundle GeneratePage with React kept external, so SSR shares one runtime. */
async function loadPage() {
  const SHARED = /^(react|react-dom|react-router-dom|react-redux|@reduxjs\/toolkit)(\/.*)?$/;
  await esbuild.build({
    entryPoints: [SOURCE],
    bundle: true,
    format: 'esm',
    outfile: BUNDLE,
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [
      {
        name: 'share-react-runtime',
        setup(build) {
          build.onResolve({ filter: SHARED }, (args) => ({
            path: pathToFileURL(clientRequire.resolve(args.path)).href,
            external: true,
          }));
        },
      },
    ],
  });
  const mod = await import(pathToFileURL(BUNDLE).href + `?t=${Date.now()}`);
  return mod.default;
}

function render(Page, props = {}) {
  return renderToString(
    React.createElement(MemoryRouter, null, React.createElement(Page, props)),
  );
}

/** A job record shaped like one the API returns, with a real stage trace. */
function sampleJob() {
  return {
    jobId: 'job-0000000042',
    sectionId: '1000000042',
    mode: 'wireframe',
    status: 'complete',
    pageName: 'Home',
    stages: [
      { stage: 1, name: 'input-acquisition', status: 'ok', ms: 4, warnings: [], attempt: 1 },
      { stage: 2, name: 'preprocessing-normalization', status: 'ok', ms: 61, warnings: [], attempt: 1 },
      { stage: 3, name: 'multimodal-understanding', status: 'degraded', ms: 12, warnings: ['perception unreachable'], attempt: 1 },
      { stage: 4, name: 'semantic-planning-ir', status: 'ok', ms: 3, warnings: [], attempt: 1 },
      { stage: 5, name: 'code-generation-assembly', status: 'ok', ms: 9, warnings: [], attempt: 1 },
      { stage: 6, name: 'validation-qa', status: 'ok', ms: 7, warnings: [], attempt: 1 },
      { stage: 7, name: 'output-delivery', status: 'ok', ms: 1, warnings: [], attempt: 1 },
    ],
  };
}

let Page;
test.before(async () => {
  Page = await loadPage();
});
test.after(async () => {
  try { await esbuild.stop(); } catch { /* already stopped */ }
  try { await fs.unlink(BUNDLE); } catch { /* never written */ }
});

// ---------------------------------------------------------------------

test('no requirement id, ticket number or component count reaches the screen', async () => {
  // The exact strings that were on this page: "Configuration (FR-G07)",
  // "Generation Mode (FR-G04, FR-G01)", "Legacy Inputs (FR-G02, FR-G03)" and
  // "Full studio layout mounting all 14 built components".
  //
  // Checked against the rendered HTML rather than the source, because a comment
  // explaining WHY a heading is worded a certain way should not fail this — only
  // what a person actually sees.
  const html = render(Page, { initialJob: sampleJob() });

  const forbidden = [
    /\bFR-G\d{2}\b/, // requirement ids
    /\bT-\d{3}\b/, // task ids
    /§\s?\d/, // contract section marks
    /\bmounting all \d+\b/, // the component-count note
    /\bLegacy\b/, // a demo does not ship something labelled legacy
  ];

  for (const pattern of forbidden) {
    const match = html.match(pattern);
    assert.equal(match, null, `internal vocabulary is on screen: ${match && match[0]}`);
  }
});

test('the preview frames the real route rather than a placeholder', async () => {
  // ResponsiveToggle takes `src` and renders an iframe of it. It was being given
  // `children` instead — which narrows a container, and a narrowed container
  // cannot trigger a `md:` breakpoint, so R11's stacking never showed. The old
  // child was the literal text "Preview will render here".
  const html = render(Page);

  assert.equal(html.includes('Preview will render here'), false, 'the placeholder is still there');
  assert.match(html, /<iframe/, 'the preview is not framed at all');
  assert.match(html, /src="\/preview\/Home"/, 'the iframe does not point at the preview route');
});

test('before a run there is an empty state that says what will happen', async () => {
  const html = render(Page);

  assert.match(html, /Nothing generated yet/i, 'no empty state');
  // And the stage trace is NOT rendered empty — a timeline with no stages in it
  // is the thing that made the old page feel like a dashboard nobody had filled in.
  assert.equal(html.includes('Job Timeline'), false, 'the timeline renders before any job exists');
});

test('after a run the stage trace is visible without hunting for it', async () => {
  // §11's timeline is the second thing worth watching here, so it is the default
  // tab rather than one click away.
  const html = render(Page, { initialJob: sampleJob() });

  assert.match(html, /Job Timeline/, 'the timeline is not shown for a completed job');
  assert.match(html, /Generation Progress/, 'the progress panel is not shown');
  // Matched case- and separator-insensitively on purpose. JobTimeline renders
  // "input acquisition" with a `capitalize` class and GenerationProgress renders
  // "Input Acquisition"; both are the same §11.0 stage name presented for people
  // rather than for a log. Pinning one spelling would make a copy tweak fail a
  // test about whether the trace is VISIBLE.
  assert.match(html, /input[\s-]acquisition/i, 'stage names are missing from the timeline');
  assert.match(html, /multimodal[\s-]understanding/i, 'later stages are missing');
});

test('every studio component is still reachable from this page', async () => {
  // Rule 9's corollary, kept honest across a layout rewrite: the point of the
  // rebuild was to move things, not to drop them. Checked on the SOURCE, since
  // a component behind a closed <details> or an unselected tab is reachable but
  // not rendered server-side.
  const source = await fs.readFile(SOURCE, 'utf8');

  // ModeSelector + CodePromptInputs were replaced by Composer — see the same
  // note in studio-page-mounts-its-controls.test.mjs.
  const mustMount = [
    'SectionFields',
    'Composer',
    'JobTimeline',
    'StageInspector',
    'GenerationProgress',
    'JobHistory',
    'GeneratedSourceView',
    'QuestionPrompt',
    'ResponsiveToggle',
    'SideEditor',
    'ErrorBanner',
  ];

  for (const name of mustMount) {
    assert.match(source, new RegExp(`<${name}[\\s/>]`), `${name} is imported but never mounted`);
  }
});

test('the CMS editor does not ask anyone to type a ten-digit id from memory', async () => {
  // Field ids are allocated by the API and come back on the job (§1), so the
  // page can list them. The old placeholder was "Enter field ID to edit".
  const html = render(Page, { initialJob: sampleJob() });
  const source = await fs.readFile(SOURCE, 'utf8');

  assert.equal(html.includes('Enter field ID to edit'), false, 'the manual id box is still the primary path');
  assert.match(source, /\/api\/elements\?sectionId=/, 'the page never fetches the section’s fields');
  assert.match(source, /<select/, 'there is no field picker');
});

test('a §13.4 collection read is treated as a bare array', async () => {
  // §9 names this as the failure that produces a dead store behind a
  // pixel-perfect preview: an endpoint returning `[...]` read as `{ data: [...] }`.
  // The field fetch added by this task is a new place that could get it wrong.
  const source = await fs.readFile(SOURCE, 'utf8');

  assert.match(source, /Array\.isArray\(rows\)/, 'the elements response is not checked as an array');
  assert.equal(/rows\.data|json\.data/.test(source), false, 'the elements response is being unwrapped from `data`');
});
