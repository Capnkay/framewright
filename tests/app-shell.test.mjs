// tests/app-shell.test.mjs — T-001, CONTRACT.md §5.2.
//
// Verifies T-001's doneWhen: the Redux store is attached at the app root and the
// cms slice namespace exists even if empty.
//
// TWO KINDS OF CHECK, AND THE DIFFERENCE IS STATED RATHER THAN BLURRED:
//
//   1. BEHAVIOURAL — the reducer map and the slice's initial state are imported
//      and executed. client/src/redux/reducers.js imports only cmsSlice.js, both
//      dependency-free, so this runs on a fresh clone with no `npm install`.
//
//   2. STATIC — the .jsx files are read as text and asserted against. They
//      import react, react-dom, react-redux and react-router-dom, so importing
//      them here would make `npm test` require node_modules and break the
//      constraint tools/test.mjs exists to protect.
//
// A static check is weaker than a behavioural one and is not dressed up as more.
// It proves the wiring is written; it does not prove the app boots. The boot is
// verified by a human running `npm run dev` in client/ and loading both routes —
// which is the other half of T-001's doneWhen, and is recorded in the task's
// journal note rather than asserted here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reducerMap, CMS_SLICE_KEYS } from '../client/src/redux/reducers.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO_ROOT, rel));

// ---------------------------------------------------------------------
// BEHAVIOURAL — the §5.2 slice shape.
// ---------------------------------------------------------------------
test('the store mounts exactly one slice, under the key cms (§5.2)', () => {
  assert.deepEqual(Object.keys(reducerMap), ['cms']);
  assert.equal(typeof reducerMap.cms, 'function');
});

test('the cms namespace exists and carries exactly §5.2 six keys, even when empty', () => {
  // Redux initialises by calling the reducer with undefined state.
  const initial = reducerMap.cms(undefined, { type: '@@INIT' });

  assert.deepEqual(Object.keys(initial).sort(), [...CMS_SLICE_KEYS].sort());
  assert.equal(CMS_SLICE_KEYS.length, 6);

  // The initial values §5.2 implies: empty maps, idle, no error.
  assert.deepEqual(initial.allSections, {});
  assert.deepEqual(initial.allSectionsCss, {});
  assert.deepEqual(initial.sectionNames, {});
  assert.equal(initial.status, 'idle');
  assert.equal(initial.error, null);
  assert.deepEqual(initial.missing, {});
});

test('the cms reducer returns state unchanged for an unknown action', () => {
  // Redux probes every reducer with a random action type at store creation and
  // throws if one returns undefined. A reducer missing its default case passes
  // every hand-written test and then fails at boot.
  const initial = reducerMap.cms(undefined, { type: '@@INIT' });
  const after = reducerMap.cms(initial, { type: 'something/nobodyHandles' });
  assert.equal(after, initial, 'an unhandled action must return the same state reference');
});

// ---------------------------------------------------------------------
// STATIC — the app root's wiring.
// ---------------------------------------------------------------------
test('main.jsx attaches the store, the router and the stylesheet at the root', () => {
  const source = read('client/src/main.jsx');

  assert.match(source, /configureStore\(\s*\{\s*reducer:\s*reducerMap\s*\}\s*\)/,
    'the store must be built from the reducer map, not an inline literal');
  assert.match(source, /<Provider\s+store=\{store\}>/, 'react-redux Provider must wrap the app');
  assert.match(source, /<BrowserRouter>/, 'the router must be mounted at the root');
  assert.match(source, /from '\.\/redux\/reducers\.js'/, 'the reducer map is imported, not redefined');
  assert.match(source, /import '\.\/index\.css'/, 'the Tailwind entry stylesheet must be imported once');
});

test('main.jsx imports the slice from client/src/redux, the path the tests bind to (F-002)', () => {
  // The board declares client/src/store/ for the client slice, but the tested
  // modules live at client/src/redux/ and tests/golden.test.mjs imports them
  // from there. Wiring the app to a second copy would orphan the covered one.
  // See _build/findings/F-002.md.
  const reducers = read('client/src/redux/reducers.js');
  assert.match(reducers, /from '\.\/cmsSlice\.js'/);
  assert.ok(exists('client/src/redux/cmsSlice.js'));
  assert.ok(
    !exists('client/src/store/cmsSlice.js'),
    'a second cms slice under client/src/store/ would orphan the tested one (F-002)',
  );
});

test('App.jsx declares both routes, with pageName as a path parameter', () => {
  const source = read('client/src/App.jsx');

  assert.match(source, /path="\/generate"/, '/generate must be routed');
  assert.match(source, /path="\/preview\/:pageName"/, '/preview/:pageName must be routed');

  // §1 makes pageName case-sensitive; a path parameter preserves the case the
  // person typed, where a lowercased query string would not.
  assert.match(source, /to="\/preview\/Home"/, '/preview must default to Home (§1)');
});

test('every file the app shell needs to boot is present', () => {
  for (const file of [
    'client/index.html',
    'client/vite.config.js',
    'client/tailwind.config.js',
    'client/postcss.config.js',
    'client/src/index.css',
    'client/src/main.jsx',
    'client/src/App.jsx',
    'client/src/redux/reducers.js',
    'client/src/routes/GeneratePage.jsx',
    'client/src/routes/PreviewPage.jsx',
  ]) {
    assert.ok(exists(file), `${file} is missing`);
  }
});

test('index.html provides the mount point main.jsx requires', () => {
  const html = read('client/index.html');
  assert.match(html, /id="root"/, 'main.jsx throws without #root');
  assert.match(html, /src="\/src\/main\.jsx"/, 'the module entry must point at main.jsx');
});

// ---------------------------------------------------------------------
// STATIC — the build config, including one real trap.
// ---------------------------------------------------------------------
test('client/package.json declares the dev script and the §5.2 runtime stack', () => {
  const pkg = JSON.parse(read('client/package.json'));

  assert.equal(pkg.scripts.dev, 'vite', 'README names `npm run dev` for the frontend');
  assert.equal(typeof pkg.scripts.build, 'string');
  assert.equal(pkg.type, 'module');

  for (const dep of ['react', 'react-dom', 'react-redux', '@reduxjs/toolkit', 'react-router-dom']) {
    assert.ok(pkg.dependencies[dep], `${dep} must be declared`);
  }
  for (const dep of ['vite', '@vitejs/plugin-react', 'tailwindcss', 'postcss', 'autoprefixer']) {
    assert.ok(pkg.devDependencies[dep], `${dep} must be declared`);
  }
});

test('the Tailwind content globs cover the generated-sections directory', () => {
  // The purge trap: Tailwind only emits a utility it finds as a literal in a
  // scanned file. Generated components land in client/src/sections/generated/
  // (§7's mounting seam) and carry the classes R11 and R12 are graded on. If
  // this glob stops covering them, a generated section renders unstyled in a
  // production build while looking perfect in dev.
  const config = read('client/tailwind.config.js');
  const globMatch = config.match(/content:\s*\[([^\]]+)\]/);
  assert.ok(globMatch, 'a content array must be declared');

  // Assert the PROPERTY this test's comment describes — that a generated
  // section is scanned — rather than one literal spelling of the glob.
  // `./src/**/*.{js,jsx,ts,tsx}` covers every generated .jsx and is what the
  // config actually carries; matching the exact substring `{js,jsx}` failed
  // against a strictly wider glob, which is a false negative on the only
  // question that matters here.
  const globs = globMatch[1];
  const patterns = [...globs.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  assert.ok(patterns.length, 'the content array must list at least one glob');

  // Expand the glob by scanning it, rather than by a chain of regex replaces:
  // escaping the metacharacters first would escape `{` and `}` too, and the
  // brace-expansion pass would then never match its own delimiters.
  const covers = (glob, file) => {
    const src = glob.replace(/^\.\//, '');
    let rx = '';
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (c === '*') {
        if (src[i + 1] === '*') {
          rx += '(?:.*/)?';
          i += 1;
          if (src[i + 1] === '/') i += 1;
        } else {
          rx += '[^/]*';
        }
      } else if (c === '{') {
        const close = src.indexOf('}', i);
        rx += '(?:' + src.slice(i + 1, close).split(',').join('|') + ')';
        i = close;
      } else if ('.+^$()|[]\\?'.includes(c)) {
        rx += '\\' + c;
      } else {
        rx += c;
      }
    }
    return new RegExp('^' + rx + '$').test(file);
  };

  const generated = 'src/sections/generated/HeroSection.jsx';
  assert.ok(
    patterns.some((g) => covers(g, generated)),
    `no content glob scans ${generated} — generated sections would purge to unstyled. Globs: ${patterns.join(', ')}`,
  );

  // The golden component is the concrete case that must be covered today.
  assert.ok(exists('client/src/sections/generated/HeroSection.jsx'));
});

test('vite pins the port README documents, and fails loudly on a clash', () => {
  const config = read('client/vite.config.js');
  assert.match(config, /port:\s*5173/, 'README names http://localhost:5173');
  assert.match(config, /strictPort:\s*true/, 'a silent fallback port breaks the demo URL');
});
