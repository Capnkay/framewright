// server/src/observability/metrics.js

const counters = new Map();
const histograms = new Map();
let perceptionUp = 0;

function formatLabels(labels) {
  if (!labels) return '';
  const entries = Object.entries(labels).filter(([k, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  const formatted = entries
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  return `{${formatted}}`;
}

export function incrementJob(status) {
  const key = `framewright_jobs_total${formatLabels({ status })}`;
  counters.set(key, (counters.get(key) || 0) + 1);
}

export function observeStageDuration(stage, ms) {
  const key = `framewright_stage_duration_ms${formatLabels({ stage })}`;
  if (!histograms.has(key)) {
    histograms.set(key, { count: 0, sum: 0 });
  }
  const entry = histograms.get(key);
  entry.count += 1;
  entry.sum += ms;
}

export function incrementModelCall(purpose, ok) {
  const key = `framewright_model_calls_total${formatLabels({ purpose, ok: String(ok) })}`;
  counters.set(key, (counters.get(key) || 0) + 1);
}

export function setPerceptionUp(isUp) {
  perceptionUp = isUp ? 1 : 0;
}

export function clearMetrics() {
  counters.clear();
  histograms.clear();
  perceptionUp = 0;
}

export function getMetricsFormat() {
  const lines = [];

  // Jobs
  lines.push('# TYPE framewright_jobs_total counter');
  let hasJobs = false;
  for (const [key, value] of counters.entries()) {
    if (key.startsWith('framewright_jobs_total')) {
      hasJobs = true;
      lines.push(`${key} ${value}`);
    }
  }
  if (!hasJobs) lines.push(`framewright_jobs_total 0`);

  // Stage duration
  lines.push('# TYPE framewright_stage_duration_ms histogram');
  let hasDuration = false;
  for (const [key, data] of histograms.entries()) {
    if (key.startsWith('framewright_stage_duration_ms')) {
      hasDuration = true;
      const baseName = key.split('{')[0];
      const labelStr = key.substring(baseName.length);
      const labelsInner = labelStr === '' ? '' : labelStr.substring(1, labelStr.length - 1);
      const bucketLabels = labelsInner ? `{${labelsInner},le="+Inf"}` : `{le="+Inf"}`;
      lines.push(`${baseName}_bucket${bucketLabels} ${data.count}`);
      lines.push(`${baseName}_sum${labelStr} ${data.sum}`);
      lines.push(`${baseName}_count${labelStr} ${data.count}`);
    }
  }
  if (!hasDuration) {
    lines.push(`framewright_stage_duration_ms_bucket{le="+Inf"} 0`);
    lines.push(`framewright_stage_duration_ms_sum 0`);
    lines.push(`framewright_stage_duration_ms_count 0`);
  }

  // Model calls
  lines.push('# TYPE framewright_model_calls_total counter');
  let hasModelCalls = false;
  for (const [key, value] of counters.entries()) {
    if (key.startsWith('framewright_model_calls_total')) {
      hasModelCalls = true;
      lines.push(`${key} ${value}`);
    }
  }
  if (!hasModelCalls) lines.push(`framewright_model_calls_total 0`);

  // Perception up
  lines.push('# TYPE framewright_perception_up gauge');
  lines.push(`framewright_perception_up ${perceptionUp}`);

  return lines.join('\n') + '\n';
}
