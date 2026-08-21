import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore } from '../server/src/quality/score.js';

test('Computes score correctly for perfect run with wireframe', () => {
  const score = computeScore({
    structurePass: true,
    eslintErrors: 0,
    visualSimilarity: 1.0,
    axeSeriousViolations: 0,
    confidenceMean: 1.0
  });
  // 40*1 + 25*1 + 15*1 + 15*1 + 5*1 = 100
  assert.equal(score, 100);
});

test('A prompt-mode job scores visualSimilarity as 1.0, not 0', () => {
  const score = computeScore({
    structurePass: true,
    eslintErrors: 0,
    visualSimilarity: null, // Prompt mode
    axeSeriousViolations: 0,
    confidenceMean: 1.0
  });
  // 40*1 + 25*1 + 15*1 + 15*1 + 5*1 = 100
  assert.equal(score, 100);
});

test('Computes penalty correctly', () => {
  const score = computeScore({
    structurePass: true,
    eslintErrors: 5, // 5/10 = 0.5 -> penalty 12.5
    visualSimilarity: 0.8, // 15 * 0.8 = 12
    axeSeriousViolations: 2, // 2/5 = 0.4 -> 15*(1-0.4) = 15*0.6 = 9
    confidenceMean: 0.5 // 5*0.5 = 2.5
  });
  // 40 + 12.5 + 12 + 9 + 2.5 = 76
  assert.equal(score, 76);
});

test('Caps penalties at 0', () => {
  const score = computeScore({
    structurePass: false,
    eslintErrors: 20, // max 1 penalty -> 0
    visualSimilarity: 0.0, // 0
    axeSeriousViolations: 10, // max 1 penalty -> 0
    confidenceMean: 0.0
  });
  assert.equal(score, 0);
});
