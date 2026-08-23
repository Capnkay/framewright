import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeEntities,
  collapse,
  visibleStrings,
  groundTruth,
} from '../tools/design2code/groundTruth.mjs';

// T-164. The ground-truth extractor decides what "on the page" means, and the
// headline metric is groundedness -- of the strings we assert, the share
// actually on the page. Every defect here moves that number without any change
// to generation, so these tests pin the extractor's behaviour rather than its
// output on any particular sample.

test('entities decode, and the ampersand decodes LAST', () => {
  assert.strictEqual(decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.strictEqual(decodeEntities('&#65;&#x42;'), 'AB');
  assert.strictEqual(decodeEntities('&quot;x&quot; &#39;y&apos;'), '"x" \'y\'');
  assert.strictEqual(decodeEntities('a&nbsp;b'), 'a b');

  // The ordering rule the implementation calls out by name: decoding & first
  // would turn `&amp;lt;` into `<`, inventing markup that was never on the page.
  assert.strictEqual(decodeEntities('&amp;lt;'), '&lt;');
});

test('collapse applies HTML’s own whitespace rule', () => {
  assert.strictEqual(collapse('  a \n\t  b  '), 'a b');
  assert.strictEqual(collapse('\n\n'), '');
  assert.strictEqual(collapse('one&nbsp;&nbsp;two'), 'one two');
});

test('visibleStrings returns rendered text in document order', () => {
  const html = '<h1>First</h1><p>Second</p><span>Third</span>';
  assert.deepStrictEqual(visibleStrings(html), ['First', 'Second', 'Third']);
});

test('script, style and head content never reach the ground truth', () => {
  const html = [
    '<html><head><title>Title</title><style>.a{color:red}</style></head>',
    '<body><script>var x = "NOT ON THE PAGE";</script>',
    '<h1>Real Heading</h1></body></html>',
  ].join('');

  const strings = visibleStrings(html);
  assert.ok(strings.includes('Real Heading'));
  assert.ok(!strings.some((s) => s.includes('NOT ON THE PAGE')));
  assert.ok(!strings.some((s) => s.includes('color:red')));
});

test('a nested skipped tag does not end the skip early', () => {
  // The defect this guards: tracking nesting against the CLOSING tag lets a
  // <style> inside <head> end the skip, leaking the rest of <head> into the
  // ground truth as if a user could read it.
  const html = '<head><style>.a{}</style><title>Leaked</title></head><body><p>Kept</p></body>';
  const strings = visibleStrings(html);
  assert.deepStrictEqual(strings, ['Kept']);
});

test('comments are stripped before extraction', () => {
  const html = '<p>Kept</p><!-- <h1>Commented Out</h1> -->';
  assert.deepStrictEqual(visibleStrings(html), ['Kept']);
});

test('groundTruth joins to a lowercase blob separated by a sentinel', () => {
  const { strings, joined } = groundTruth('<h1>Pulse Fit</h1><p>Get Started</p>');
  assert.deepStrictEqual(strings, ['Pulse Fit', 'Get Started']);
  assert.strictEqual(joined, 'pulse fit  get started');
});

test('the sentinel stops a match spanning two adjacent strings', () => {
  // Why a  rather than a space: joined with whitespace, the page
  // <h1>Get</h1><p>Started</p> would answer YES to "is 'get started' on the
  // page?" when neither element says it. That inflates groundedness -- the
  // headline metric -- for a page that never carried the phrase.
  const { joined } = groundTruth('<h1>Get</h1><p>Started</p>');
  assert.ok(!joined.includes('get started'));
});

test('empty and malformed input yield no strings rather than throwing', () => {
  assert.deepStrictEqual(visibleStrings(''), []);
  assert.deepStrictEqual(visibleStrings(null), []);
  assert.deepStrictEqual(visibleStrings('<p>unclosed'), ['unclosed']);
});
