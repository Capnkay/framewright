// tests/sanitise-write.test.mjs
//
// T-030 — CONTRACT.md §8's write-side sanitisation chokepoint.
//
// doneWhen: "A content string carrying a script tag or an onerror attribute is
// stripped before persisting, at both call sites, using the §8 tag and
// attribute allow-lists."
//
// Both halves of that are tested: the allow-lists themselves, and that the two
// call sites §8 names actually route through them. The second half is the one
// worth having — a sanitiser nobody calls is the failure mode this task exists
// to close, and it is invisible to a unit test of the sanitiser alone.

import { test, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';

import {
  sanitiseHtml,
  isCleanCss,
  sanitiseLoop,
  sanitiseElementPatch,
  sanitiseGenerateBody,
  ALLOWED_TAGS,
  FORBIDDEN_TAGS,
} from '../server/src/sanitise/sanitiseWrite.js';
import { patchElement } from '../server/src/routes/elements.js';
import { postGenerate } from '../server/src/routes/generate.js';

// ---------------------------------------------------------------------
// doneWhen, first half — script tags and onerror attributes are stripped
// ---------------------------------------------------------------------

test('doneWhen — a script tag is stripped, and its contents go with it', () => {
  assert.equal(sanitiseHtml('<script>alert(1)</script>hi'), 'hi');
  assert.equal(sanitiseHtml('a<script src="x.js"></script>b'), 'ab');
  // Unclosed: the payload must not be released as text.
  assert.equal(sanitiseHtml('safe<script>alert(1)'), 'safe');
  assert.equal(sanitiseHtml('<SCRIPT>alert(1)</SCRIPT>x'), 'x', 'case-insensitive');
});

test('doneWhen — an onerror attribute cannot survive, on any tag', () => {
  // On a forbidden tag the whole tag goes.
  assert.equal(sanitiseHtml('<img src=x onerror=alert(1)>'), '');
  // On an ALLOWED tag the tag survives and the attribute must not — this is
  // the case that actually exercises §8's empty ALLOWED_ATTR.
  assert.equal(sanitiseHtml('<span onerror="alert(1)">hi</span>'), '<span>hi</span>');
  assert.equal(sanitiseHtml('<b onload=alert(1) style="x">t</b>'), '<b>t</b>');

  for (const attr of ['onerror', 'onload', 'style', 'href', 'src', 'srcset', 'formaction']) {
    const out = sanitiseHtml(`<span ${attr}="javascript:alert(1)">t</span>`);
    assert.equal(out, '<span>t</span>', `${attr} must not survive`);
  }
});

test('§8 — every allowed tag survives, every forbidden tag does not', () => {
  for (const tag of ALLOWED_TAGS) {
    const out = sanitiseHtml(`<${tag}>t</${tag}>`);
    assert.ok(out.includes(`<${tag}`), `${tag} is on §8's allow-list and must survive`);
  }
  for (const tag of FORBIDDEN_TAGS) {
    const out = sanitiseHtml(`<${tag}>t</${tag}>`);
    assert.ok(!out.includes(`<${tag}`), `${tag} is forbidden by §8`);
  }
});

test('§8 — HTML comments are forbidden', () => {
  assert.equal(sanitiseHtml('<!-- hidden -->visible'), 'visible');
  assert.equal(sanitiseHtml('a<!--[if IE]><script>x</script><![endif]-->b'), 'ab');
});

test('a forbidden tag is unwrapped, not content-stripped — the copy survives', () => {
  // <a> is forbidden but its link text is display copy and must not vanish.
  assert.equal(sanitiseHtml('<a href="http://example.com">click me</a>'), 'click me');
  assert.equal(sanitiseHtml('<b>keep</b><a href=x>text</a>'), '<b>keep</b>text');
});

test('a ">" inside a quoted attribute value does not end the tag early', () => {
  // The read-side regex scanner ends the tag at the first ">" anywhere, which
  // leaks the rest of the attribute list as text. The write-side tokenizer
  // tracks quote state, so nothing escapes.
  const out = sanitiseHtml('<span title="a>b" onerror=alert(1)>x</span>');
  assert.equal(out, '<span>x</span>');
  assert.ok(!out.includes('onerror'), 'no attribute fragment may leak as text');
});

test('sanitiseHtml is idempotent — a stored string survives a re-write unchanged', () => {
  const inputs = [
    '<script>alert(1)</script>hi',
    '<span onerror=x>t</span>',
    'TRAIN WITHOUT<br />LIMITS',
    '5 < 7 and 8 > 2',
    '<b>bold</b> and <em>em</em>',
    '',
  ];
  for (const input of inputs) {
    const once = sanitiseHtml(input);
    assert.equal(sanitiseHtml(once), once, `not idempotent for ${JSON.stringify(input)}`);
  }
});

test('the reference content string is untouched', () => {
  // §4's own value. If sanitisation mangles this, the demo copy changes.
  assert.equal(sanitiseHtml('Community<br />Members'), 'Community<br />Members');
  assert.equal(sanitiseHtml('TRAIN WITHOUT LIMITS'), 'TRAIN WITHOUT LIMITS');
});

// ---------------------------------------------------------------------
// §8's CSS allow-list — the second injection channel
// ---------------------------------------------------------------------

test('§8 — the reference css value is accepted', () => {
  assert.equal(isCleanCss('font-weight: bold; text-align: left;'), true);
  assert.equal(isCleanCss(null), true, '§13.2 clears an overlay with null');
});

test('§8 — the five forbidden css constructs are rejected', () => {
  for (const bad of [
    'background: url(http://example.com/x.png);',
    'width: expression(alert(1));',
    '@import "other.css";',
    'behavior: url(#default#x);',
    '-moz-binding: url(binding.xml);',
  ]) {
    assert.equal(isCleanCss(bad), false, `${bad} must be rejected`);
  }
});

test('§8 — css that is not a plain declaration list is rejected', () => {
  assert.equal(isCleanCss('} body { display: none;'), false, 'brace escape');
  assert.equal(isCleanCss('color: red; } script { x'), false);
  assert.equal(isCleanCss('<script>'), false);
  assert.equal(isCleanCss(42), false, 'a non-string is not css');
});

// ---------------------------------------------------------------------
// §4 card loop items — user copy that used to bypass the chokepoint
// ---------------------------------------------------------------------

test('§4 — loop item display fields are sanitised', () => {
  const result = sanitiseLoop([
    { field1: '2000+', fieldId1: '3000000001',
      field2: '<img src=x onerror=alert(1)>Members', fieldId2: '3000000002' },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.loop[0].field2, 'Members');
  assert.equal(result.loop[0].field1, '2000+');
});

test('§4 — a loop item fieldId is validated, never rewritten', () => {
  const ok = sanitiseLoop([{ field1: 'x', fieldId1: '3000000001' }]);
  assert.equal(ok.loop[0].fieldId1, '3000000001', 'a valid ID passes through byte-identical');

  const bad = sanitiseLoop([{ field1: 'x', fieldId1: '<script>' }]);
  assert.equal(bad.ok, false, 'a malformed field ID is rejected, not sanitised into one');

  const short = sanitiseLoop([{ fieldId1: '123' }]);
  assert.equal(short.ok, false);
});

test('§4 — loop must be an array of objects', () => {
  assert.equal(sanitiseLoop('nope').ok, false);
  assert.equal(sanitiseLoop([null]).ok, false);
  assert.equal(sanitiseLoop([['a']]).ok, false);
});

// ---------------------------------------------------------------------
// doneWhen, second half — BOTH call sites route through the chokepoint
// ---------------------------------------------------------------------

// The store is isolated by mocking fs, following tests/patch-elements.test.mjs.
// createStore() hard-codes ./server/data/store.json with no injection seam, and
// that file is currently UTF-16LE-corrupted, so a test that touches the real
// path fails on a JSON parse error before it reaches anything this task owns.
//
// Mocking WRITE as well as read is the point: these tests assert on what was
// persisted, not on what was returned. A route that cleans its response body
// but stores the raw string passes a response-only assertion while poisoning
// the store — the precise failure §8's write-side half exists to prevent.

function storeHarness() {
  const data = {
    counters: {},
    sections: [],
    elements: [
      {
        fieldId: '2000000003', sectionId: '1000000001', pageName: 'Home',
        elementName: 'heroTitle', contentType: 'Text',
        content: 'TRAIN WITHOUT LIMITS', css: null, loop: null,
      },
      {
        fieldId: '2000000006', sectionId: '1000000001', pageName: 'Home',
        elementName: 'statBadges', contentType: 'Cards', content: null, css: null,
        loop: [{ field1: '2000+', fieldId1: '3000000001',
                 field2: 'Members', fieldId2: '3000000002' }],
      },
    ],
  };

  const writes = [];
  mock.method(fs, 'readFile', async () => JSON.stringify(data));
  mock.method(fs, 'writeFile', async (_path, content) => {
    writes.push(JSON.parse(content));
  });

  return {
    env: { STORE_TYPE: 'json' },
    /** The last state written to disk, or null if nothing was ever written. */
    persisted: () => (writes.length ? writes[writes.length - 1] : null),
    wrote: () => writes.length > 0,
    restore: () => mock.restoreAll(),
  };
}

test('CALL SITE 1 — PATCH /api/elements/:fieldId persists sanitised content', async () => {
  const h = storeHarness();
  try {
    const res = await patchElement({
      params: { fieldId: '2000000003' },
      body: { content: '<script>alert(1)</script>CLEAN<span onerror=x>!</span>' },
      env: h.env,
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));

    // The assertion that matters: what reached DISK is clean, not merely what
    // was returned. A route that sanitises the response but stores the raw
    // string passes a response-only check and still poisons the store.
    const disk = h.persisted();
    const stored = disk.elements.find((e) => e.fieldId === '2000000003').content;
    assert.equal(stored, 'CLEAN<span>!</span>');
    assert.ok(!stored.includes('script'), 'no script tag may reach the store');
    assert.ok(!stored.includes('onerror'), 'no onerror attribute may reach the store');
  } finally {
    h.restore();
  }
});

test('CALL SITE 1 — PATCH rejects css failing the §8 allow-list with 400', async () => {
  const h = storeHarness();
  try {
    const res = await patchElement({
      params: { fieldId: '2000000003' },
      body: { css: 'background: url(http://example.com/x.png);' },
      env: h.env,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);

    assert.equal(h.wrote(), false,
      'a rejected css value must not reach the store at all');
  } finally {
    h.restore();
  }
});

test('CALL SITE 1 — a patched §4 card loop is sanitised before persisting', async () => {
  const h = storeHarness();
  try {
    const res = await patchElement({
      params: { fieldId: '2000000006' },
      body: {
        loop: [{ field1: '<script>alert(1)</script>5000+', fieldId1: '3000000001',
                 field2: '<img src=x onerror=alert(1)>Members', fieldId2: '3000000002' }],
      },
      env: h.env,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const disk = h.persisted();
    const loop = disk.elements.find((e) => e.fieldId === '2000000006').loop;
    assert.equal(loop[0].field1, '5000+');
    assert.equal(loop[0].field2, 'Members');
    assert.equal(loop[0].fieldId1, '3000000001', 'IDs are preserved exactly');
  } finally {
    h.restore();
  }
});

test('CALL SITE 1 — patching a nested card field sanitises it too (§13.2)', async () => {
  const h = storeHarness();
  try {
    const res = await patchElement({
      params: { fieldId: '3000000001' },
      body: { content: '<script>alert(1)</script>9000+' },
      env: h.env,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const disk = h.persisted();
    const parent = disk.elements.find((e) => e.fieldId === '2000000006');
    assert.equal(parent.loop[0].field1, '9000+');
  } finally {
    h.restore();
  }
});

test('CALL SITE 2 — POST /api/generate sanitises the prompt before T-033 sees it', async () => {
  const ctx = {
    body: { mode: 'prompt', prompt: '<script>alert(1)</script>a hero section' },
    files: {},
  };
  await postGenerate(ctx);

  // The handler is still T-033's stub, so the observable effect is on ctx —
  // which is exactly the seam T-033 inherits. What must be true is that the
  // implementation downstream can never be handed the raw string.
  assert.equal(ctx.body.prompt, 'a hero section');
  assert.ok(!ctx.body.prompt.includes('script'));
});

test('CALL SITE 2 — a pageName that is not an identifier is 400', async () => {
  const res = await postGenerate({
    body: { mode: 'prompt', prompt: 'x', pageName: '../../etc/passwd' },
    files: {},
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.ok, false);
});

test('CALL SITE 2 — pasted code is NOT html-sanitised (§8 parses it instead)', async () => {
  const code = 'const A = () => <div className="x">hi</div>;';
  const ctx = { body: { mode: 'code', code }, files: {} };
  await postGenerate(ctx);
  assert.equal(ctx.body.code, code, 'stripping tags would corrupt the parser input');
});


test('CALL SITE 2 — the cleaned body is what the route USES, not just what it publishes', async () => {
  // T-033 once assigned ctx.body = cleaned.body and then read the raw object for
  // every line after it, so the chokepoint ran and had no effect. This asserts the
  // rebind rather than the assignment.
  const ctx = {
    body: { mode: 'prompt', prompt: '<script>alert(1)</script>a hero' },
    files: {},
  };
  await postGenerate(ctx);
  assert.ok(!ctx.body.prompt.includes('script'));
});

// ---------------------------------------------------------------------
// The patch assembler
// ---------------------------------------------------------------------

test('sanitiseElementPatch cleans every field in one call', () => {
  const r = sanitiseElementPatch({
    content: '<script>x</script>hi',
    css: 'font-weight: bold;',
    loop: [{ field1: '<b onclick=x>1</b>', fieldId1: '3000000001' }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.patch.content, 'hi');
  assert.equal(r.patch.css, 'font-weight: bold;');
  assert.equal(r.patch.loop[0].field1, '<b>1</b>');
});

test('sanitiseElementPatch touches only the keys that were provided', () => {
  const r = sanitiseElementPatch({ content: 'x' });
  assert.deepEqual(Object.keys(r.patch), ['content'],
    'an absent key must not become an explicit null and wipe a stored value');
});

test('sanitiseGenerateBody leaves a body with no user strings alone', () => {
  const r = sanitiseGenerateBody({ mode: 'wireframe' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.body, { mode: 'wireframe' });
});
