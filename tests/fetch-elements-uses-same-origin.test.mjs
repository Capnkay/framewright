// T-127 — the mount-time read must go through the same origin. §5, §9, §13.4.
//
// THE DEFECT, and it was found in Chrome because nothing else could find it.
// `DEFAULT_API_URL` was the absolute `http://localhost:5000/api`. The app is
// served from :5173, the Node API sends no `Access-Control-Allow-Origin`, so the
// browser blocked every read with `TypeError: Failed to fetch`. On
// /preview/Home: hydration status `failed`, 0 keys in `allSections`, and 48
// identical exceptions — one per mounted section.
//
// §9 NAMES THIS AS THE FAILURE THE WHOLE ASSERTION EXISTS FOR. Every text node
// renders `data?.[id] || "DEFAULT"`, so the page was pixel-perfect and the store
// was completely dead. It compiled, it linted, it passed schema validation, it
// would have passed a screenshot check, and it failed only when someone changed
// a value and nothing moved — which is exactly what the judging script asks a
// judge to do.
//
// WHY EVERY EXISTING TEST MISSED IT, which is the part worth keeping:
//
//   * `npm run check-store-liveness` drives this thunk from Node. There is no
//     document origin in Node, so there is no same-origin policy to violate and
//     the absolute URL works perfectly.
//   * every unit test injects `apiUrl` through the thunk's `extraArgument`,
//     which short-circuits the default before it is ever consulted.
//
// So the one line that decides whether the store is alive in a browser was the
// one line no test ever executed. These tests execute it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchElementsByIds } from '../client/src/redux/fetchElementsByIds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, '../client/src/redux/fetchElementsByIds.js');
const VITE_CONFIG = path.join(__dirname, '../client/vite.config.js');

/**
 * Run the thunk with a recording fetch and NO injected apiUrl, so the default
 * is the thing under test. Every other suite passes one in, which is precisely
 * how this survived.
 */
async function urlRequestedWithNoOverride({ pageName = 'Home' } = {}) {
  let requested = null;

  const fetchImpl = async (url) => {
    requested = url;
    return { ok: true, status: 200, json: async () => [] };
  };

  const thunk = fetchElementsByIds({ elementIds: [], pageName });
  // `extraArgument` carries the fetch but deliberately NOT an apiUrl.
  await thunk(() => {}, () => ({ cms: { allSections: {}, missing: {} } }), { fetchImpl });

  return requested;
}

// ---------------------------------------------------------------------

test('the default request is same-origin — no scheme, no host, no port', async () => {
  // Asserted as a PROPERTY rather than as the string '/api/elements?...'. A
  // future move to '/cms-api' or a versioned prefix is fine; a move back to
  // anything absolute is the bug.
  const url = await urlRequestedWithNoOverride();

  assert.ok(url, 'the thunk never called fetch');
  assert.equal(/^https?:\/\//.test(url), false, `the read is cross-origin: ${url}`);
  assert.equal(url.includes('localhost'), false, `the read names a host: ${url}`);
  assert.equal(url.startsWith('/'), true, `the read is not a root-relative path: ${url}`);
});

test('it still asks §13.4’s endpoint, with the page as a query parameter', async () => {
  // Making the URL relative must not quietly change WHICH endpoint is read.
  // §13.4: a collection read is a bare array from GET /api/elements.
  const url = await urlRequestedWithNoOverride({ pageName: 'Home' });

  assert.match(url, /\/elements\?/, `not the elements endpoint: ${url}`);
  assert.match(url, /pageName=Home/, `the page name is missing: ${url}`);
});

test('a page name that needs encoding is encoded, not concatenated', async () => {
  // §1 makes pageName a case-sensitive first-class key, and it reaches this
  // function from a route parameter.
  const url = await urlRequestedWithNoOverride({ pageName: 'Landing Page/2' });

  assert.match(url, /pageName=Landing%20Page%2F2/, `the page name is not encoded: ${url}`);
});

test('an explicitly configured API base still wins', async () => {
  // A deployed build points at a real host through VITE_API_URL, and tests pass
  // one through extraArgument. Neither may be broken by the default changing.
  let requested = null;
  const fetchImpl = async (url) => {
    requested = url;
    return { ok: true, status: 200, json: async () => [] };
  };

  const thunk = fetchElementsByIds({ elementIds: [], pageName: 'Home' });
  await thunk(() => {}, () => ({ cms: { allSections: {}, missing: {} } }), { fetchImpl, apiUrl: 'https://api.example.com/v2' });

  assert.match(requested, /^https:\/\/api\.example\.com\/v2\/elements\?/, requested);
});

test('the Vite proxy the default now relies on is actually configured', async () => {
  // The default being relative is only correct BECAUSE the dev server proxies
  // /api to the Node API. If that proxy is ever removed, this default stops
  // working and the failure looks identical to the one it just fixed — a dead
  // store behind a perfect page. So the two are pinned together.
  const config = await fs.readFile(VITE_CONFIG, 'utf8');

  assert.match(config, /proxy/, 'vite.config.js no longer configures a proxy');
  assert.match(config, /['"]\/api['"]\s*:/, 'the /api proxy entry is gone');
  assert.match(config, /target:\s*['"]http:\/\/localhost:5000['"]/, 'the proxy no longer targets the API');
});

test('no absolute localhost URL is left in the module', async () => {
  // Belt and braces on the source, because the constant could be reintroduced
  // beside the one under test and the behavioural checks above would still pass
  // if the new one were used only on some path.
  const source = await fs.readFile(SOURCE, 'utf8');
  const code = source.replace(/^\s*\/\/.*$/gm, ''); // the header quotes the old value

  assert.equal(
    /https?:\/\/localhost/.test(code),
    false,
    'an absolute localhost URL is back in fetchElementsByIds.js',
  );
});
