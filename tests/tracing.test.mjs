import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tracer } from '../server/src/observability/tracing.js';

test('Tracer throws on invalid stage name', () => {
  const tracer = new Tracer('job-123');
  assert.throws(() => tracer.startSpan('invalid-stage'), /Invalid stage name/);
});

test('Tracer drops spans silently when OTEL_EXPORTER_OTLP_ENDPOINT is unset', () => {
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  
  let fetchCalled = false;
  const originalFetch = global.fetch;
  global.fetch = () => { fetchCalled = true; return Promise.resolve(); };

  try {
    const tracer = new Tracer('job-123');
    const span = tracer.startSpan('input-acquisition');
    span.end();
    assert.equal(fetchCalled, false, 'Fetch should not be called when endpoint is unset');
  } finally {
    if (originalEndpoint !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    }
    global.fetch = originalFetch;
  }
});

test('Tracer emits OTLP JSON payload when OTEL_EXPORTER_OTLP_ENDPOINT is set', async () => {
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  
  let fetchArgs = null;
  const originalFetch = global.fetch;
  global.fetch = (url, options) => {
    fetchArgs = { url, options };
    return Promise.resolve({ ok: true });
  };

  try {
    const tracer = new Tracer('job-123');
    const span = tracer.startSpan('validation-qa');
    span.end();
    
    assert.ok(fetchArgs, 'Fetch should have been called');
    assert.equal(fetchArgs.url, 'http://localhost:4318/v1/traces');
    assert.equal(fetchArgs.options.method, 'POST');
    assert.equal(fetchArgs.options.headers['Content-Type'], 'application/json');
    
    const payload = JSON.parse(fetchArgs.options.body);
    const resourceSpan = payload.resourceSpans[0];
    const spanData = resourceSpan.scopeSpans[0].spans[0];
    
    assert.equal(spanData.name, 'validation-qa');
    assert.equal(spanData.attributes[0].key, 'job.id');
    assert.equal(spanData.attributes[0].value.stringValue, 'job-123');
    assert.ok(spanData.traceId);
    assert.ok(spanData.spanId);
  } finally {
    if (originalEndpoint !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
    global.fetch = originalFetch;
  }
});

test('Tracer swallows fetch errors silently', async () => {
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  
  const originalFetch = global.fetch;
  global.fetch = () => Promise.reject(new Error('Network error'));

  try {
    const tracer = new Tracer('job-456');
    const span = tracer.startSpan('output-delivery');
    span.end(); 
    
    // Await a small tick to ensure the promise rejection is handled
    await new Promise(r => setTimeout(r, 10));
    assert.ok(true, 'Did not crash on fetch error');
  } finally {
    if (originalEndpoint !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
    global.fetch = originalFetch;
  }
});

test('Tracer accepts all 7 valid stage names', () => {
  const tracer = new Tracer('job-777');
  const validStages = [
    'input-acquisition',
    'preprocessing-normalization',
    'multimodal-understanding',
    'semantic-planning-ir',
    'code-generation-assembly',
    'validation-qa',
    'output-delivery'
  ];
  
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  try {
    for (const stage of validStages) {
      assert.doesNotThrow(() => {
        tracer.startSpan(stage).end();
      });
    }
  } finally {
    if (originalEndpoint !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    }
  }
});
