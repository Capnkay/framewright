import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SCORABLE_LEN,
  normalise,
  irStrings,
  scoreSample,
  aggregate,
} from '../tools/design2code/textFidelity.mjs';

// T-165. The scorer produces the number the Design2Code write-up leads with, so
// these tests pin the three decisions that number depends on: what counts as
// evidence, what an IR is taken to assert, and what an absent measurement is.

const PAGE = '<h1>Pulse Fit</h1><p>Track your fitness journey</p><button>Get Started</button>';

test('normalise applies the same transform both sides', () => {
  assert.strictEqual(normalise('  Get   Started  '), 'get started');
  assert.strictEqual(normalise('Community<br />Members'), 'community members');
  assert.strictEqual(normalise('<span>Hi</span>'), 'hi');
  assert.strictEqual(normalise('“Quoted” and ‘curly’'), '"quoted" and \'curly\'');
  assert.strictEqual(normalise(null), '');
});

test('normalise strips trailing punctuation but keeps interior punctuation', () => {
  assert.strictEqual(normalise('Get Started!'), 'get started');
  // Interior punctuation is content -- "3.5" and "35" are different claims.
  assert.strictEqual(normalise('Version 3.5'), 'version 3.5');
});

test('irStrings excludes Image defaults, which are never rendered as text', () => {
  const ir = {
    elements: [
      { contentType: 'Text', default: 'Pulse Fit' },
      { contentType: 'Image', default: 'default/images/hero-placeholder.jpg' },
      { contentType: 'Text', default: '   ' },
    ],
  };
  // Scoring the image path would guarantee a hallucination every run regardless
  // of what the model actually read off the page.
  assert.deepStrictEqual(irStrings(ir), ['Pulse Fit']);
});

test('irStrings collects fieldN values from card items', () => {
  const ir = { elements: [], cards: { items: [{ field1: 'Members', field2: 'Coaches', other: 'x' }] } };
  assert.deepStrictEqual(irStrings(ir), ['Members', 'Coaches']);
});

test('irStrings never throws on a malformed IR', () => {
  assert.deepStrictEqual(irStrings(null), []);
  assert.deepStrictEqual(irStrings('nope'), []);
  assert.deepStrictEqual(irStrings({}), []);
});

test('strings shorter than the floor leave both numerator and denominator', () => {
  const ir = { elements: [{ contentType: 'Text', default: 'Go' }, { contentType: 'Text', default: 'Pulse Fit' }] };
  const r = scoreSample({ ir, html: PAGE });

  assert.strictEqual(r.produced, 2);
  assert.strictEqual(r.scorable, 1);
  assert.strictEqual(r.skippedShort, 1);
  // Excluded, not counted against -- and visible in the record either way.
  assert.strictEqual(r.groundedRate, 1);
  assert.ok('Go'.length < MIN_SCORABLE_LEN);
});

test('grounded and hallucinated split on whether the page carries the string', () => {
  const ir = {
    elements: [
      { contentType: 'Text', default: 'Pulse Fit' },
      { contentType: 'Text', default: 'Get Started' },
      { contentType: 'Text', default: 'CHALLENGE YOUR LIMITS' },
    ],
  };
  const r = scoreSample({ ir, html: PAGE });

  assert.strictEqual(r.grounded, 2);
  assert.strictEqual(r.hallucinated, 1);
  assert.strictEqual(r.groundedRate, 2 / 3);
  assert.deepStrictEqual(r.hallucinatedSamples, ['CHALLENGE YOUR LIMITS']);
});

test('a generation that produced no text scores null, not zero', () => {
  // The distinction the whole report rests on: emitting nothing is not the same
  // failure as inventing six strings, and averaging them as 0 hides that.
  const r = scoreSample({ ir: { elements: [] }, html: PAGE });
  assert.strictEqual(r.produced, 0);
  assert.strictEqual(r.groundedRate, null);
});

test('scoreSample never throws on a missing or malformed IR', () => {
  const r = scoreSample({ ir: null, html: PAGE });
  assert.strictEqual(r.produced, 0);
  assert.strictEqual(r.groundedRate, null);
  assert.ok(r.truthStrings > 0);
});

test('aggregate reports micro and macro separately, and they can disagree', () => {
  // One verbose sample and one terse one. Micro pools the counts; macro averages
  // the per-sample rates, so the verbose sample cannot dominate.
  const rows = [
    { produced: 10, scorable: 10, grounded: 2, hallucinated: 8, covered: 2, truthScorable: 10, groundedRate: 0.2, recall: 0.2 },
    { produced: 2, scorable: 2, grounded: 2, hallucinated: 0, covered: 1, truthScorable: 10, groundedRate: 1, recall: 0.1 },
  ];
  const a = aggregate(rows);

  assert.strictEqual(a.samples, 2);
  assert.strictEqual(a.groundedRateMicro, 4 / 12);
  assert.strictEqual(a.groundedRateMacro, 0.6);
  assert.notStrictEqual(a.groundedRateMicro, a.groundedRateMacro);
});

test('aggregate ignores undefined metrics rather than counting them as zero', () => {
  const rows = [
    { produced: 2, scorable: 2, grounded: 1, hallucinated: 1, covered: 1, truthScorable: 4, groundedRate: 0.5, recall: 0.25 },
    { produced: 0, scorable: 0, grounded: 0, hallucinated: 0, covered: 0, truthScorable: 4, groundedRate: null, recall: null },
  ];
  const a = aggregate(rows);
  assert.strictEqual(a.groundedRateMacro, 0.5);
  assert.strictEqual(a.groundedRateMicro, 0.5);
});

test('aggregate over no rows yields null rates, not NaN', () => {
  const a = aggregate([]);
  assert.strictEqual(a.samples, 0);
  assert.strictEqual(a.groundedRateMicro, null);
  assert.strictEqual(a.groundedRateMacro, null);
  assert.strictEqual(a.recallMicro, null);
});
