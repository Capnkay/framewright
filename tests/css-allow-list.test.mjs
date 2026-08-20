// tests/css-allow-list.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeCssText } from '../server/src/sanitise/cssAllowList.js';

test('isSafeCssText rejects non-strings and empty strings', () => {
  assert.equal(isSafeCssText(null), false);
  assert.equal(isSafeCssText(undefined), false);
  assert.equal(isSafeCssText(123), false);
  assert.equal(isSafeCssText(''), false);
  assert.equal(isSafeCssText('   '), false);
});

test('isSafeCssText passes the golden reference value (§8)', () => {
  assert.equal(isSafeCssText('font-weight: bold; text-align: left;'), true);
});

test('isSafeCssText passes a single property with or without trailing semicolon', () => {
  assert.equal(isSafeCssText('color: red;'), true);
  assert.equal(isSafeCssText('color: red'), true);
});

test('isSafeCssText rejects strings with url(', () => {
  assert.equal(isSafeCssText('background: url(image.png);'), false);
  assert.equal(isSafeCssText('background: URL(image.png);'), false);
});

test('isSafeCssText rejects strings with expression(', () => {
  assert.equal(isSafeCssText('width: expression(document.body.clientWidth);'), false);
  assert.equal(isSafeCssText('width: eXpression(something);'), false);
});

test('isSafeCssText rejects strings with @import', () => {
  assert.equal(isSafeCssText('@import "style.css";'), false);
});

test('isSafeCssText rejects strings with behavior:', () => {
  assert.equal(isSafeCssText('behavior: url(script.htc);'), false);
});

test('isSafeCssText rejects strings with -moz-binding', () => {
  assert.equal(isSafeCssText('-moz-binding: url(script.xml);'), false);
});

test('isSafeCssText rejects structurally invalid CSS', () => {
  assert.equal(isSafeCssText('color: red; } body { background: blue;'), false);
  assert.equal(isSafeCssText('color: "red";'), false);
  assert.equal(isSafeCssText('content: \'<script>\';'), false);
});
