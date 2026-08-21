// tests/metrics.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { getMetrics } from '../server/src/routes/metrics.js';
import {
  incrementJob,
  observeStageDuration,
  incrementModelCall,
  setPerceptionUp,
  clearMetrics
} from '../server/src/observability/metrics.js';

test('GET /api/metrics returns Prometheus text format with the four minimum series present', () => {
  clearMetrics();
  
  const { status, headers, body } = getMetrics();
  assert.equal(status, 200, 'Metrics endpoint should return 200');
  assert.equal(headers['Content-Type'], 'text/plain; version=0.0.4', 'Content-Type should be Prometheus text format');
  
  assert.match(body, /framewright_jobs_total/, 'Should contain framewright_jobs_total');
  assert.match(body, /framewright_stage_duration_ms_/, 'Should contain framewright_stage_duration_ms');
  assert.match(body, /framewright_model_calls_total/, 'Should contain framewright_model_calls_total');
  assert.match(body, /framewright_perception_up/, 'Should contain framewright_perception_up');
});

test('Metrics correctly record and output label values and quantities', () => {
  clearMetrics();

  incrementJob('queued');
  incrementJob('queued');
  incrementJob('succeeded');
  
  observeStageDuration('1', 120);
  observeStageDuration('1', 130);
  
  incrementModelCall('layout', true);
  
  setPerceptionUp(true);

  const { body } = getMetrics();

  // Test real CONTENT, not just presence
  assert.match(body, /framewright_jobs_total\{status="queued"\} 2/, 'Should record 2 queued jobs');
  assert.match(body, /framewright_jobs_total\{status="succeeded"\} 1/, 'Should record 1 succeeded job');
  
  assert.match(body, /framewright_stage_duration_ms_count\{stage="1"\} 2/, 'Should record 2 observations for stage 1');
  assert.match(body, /framewright_stage_duration_ms_sum\{stage="1"\} 250/, 'Should record sum of 250 for stage 1');
  assert.match(body, /framewright_stage_duration_ms_bucket\{stage="1",le="\+Inf"\} 2/, 'Should record bucket +Inf');
  
  assert.match(body, /framewright_model_calls_total\{ok="true",purpose="layout"\} 1/, 'Should record model call ok=true purpose=layout');
  
  assert.match(body, /framewright_perception_up 1/, 'Should report perception is up (1)');
});
