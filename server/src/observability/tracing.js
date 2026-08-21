import crypto from 'node:crypto';

const VALID_STAGES = new Set([
  'input-acquisition',
  'preprocessing-normalization',
  'multimodal-understanding',
  'semantic-planning-ir',
  'code-generation-assembly',
  'validation-qa',
  'output-delivery'
]);

function generateTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

export class Tracer {
  constructor(jobId) {
    this.jobId = jobId;
    this.traceId = generateTraceId();
  }

  startSpan(stageName) {
    if (!VALID_STAGES.has(stageName)) {
      throw new Error(`Invalid stage name: ${stageName}`);
    }

    const spanId = generateSpanId();
    const startTimeUnixNano = (BigInt(Date.now()) * 1000000n).toString();

    return {
      end: () => {
        const endTimeUnixNano = (BigInt(Date.now()) * 1000000n).toString();
        this.emit(stageName, spanId, startTimeUnixNano, endTimeUnixNano);
      }
    };
  }

  emit(stageName, spanId, startTimeUnixNano, endTimeUnixNano) {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!endpoint) return; // Dropped silently when unconfigured

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'framewright' } }
            ]
          },
          scopeSpans: [
            {
              scope: { name: 'framewright.tracer' },
              spans: [
                {
                  traceId: this.traceId,
                  spanId: spanId,
                  name: stageName,
                  kind: 1, // SPAN_KIND_INTERNAL
                  startTimeUnixNano,
                  endTimeUnixNano,
                  attributes: [
                    { key: 'job.id', value: { stringValue: this.jobId } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const url = endpoint.endsWith('/') ? `${endpoint}v1/traces` : `${endpoint}/v1/traces`;
    
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Dropped silently on error: nothing warns, errors, or slows
    });
  }
}
