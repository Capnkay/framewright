// server/src/routes/metrics.js
import { getMetricsFormat } from '../observability/metrics.js';

export function getMetrics(ctx = {}) {
  return {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; version=0.0.4'
    },
    body: getMetricsFormat()
  };
}
