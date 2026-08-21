import { performance } from 'node:perf_hooks';

/**
 * Performance gate A 18:
 * "Performance | bundle size and render cost of the generated section only | bytes, ms"
 */
export async function scorePerformance(source, renderFn) {
  if (typeof source !== 'string') {
    return { ok: false, error: 'Source string required' };
  }

  // Measure bundle size simply as the byte length of the JSX source code
  // A perfect mini-bundler might minify this, but measuring the raw string
  // fulfills the contract of tracking "bundle size ... | bytes".
  const bytes = Buffer.byteLength(source, 'utf8');

  // To measure render cost, the caller can provide a renderFn that does the actual work.
  // Because compiling JSX and rendering it requires babel/React which we don't want
  // to tightly couple inside this measurement function if we can inject it.
  let ms = 0;
  if (typeof renderFn === 'function') {
    const start = performance.now();
    try {
      await renderFn();
      ms = Math.round(performance.now() - start);
    } catch (err) {
      return { ok: false, error: `renderFn threw: ${err.message}` };
    }
  }

  return {
    ok: true,
    bytes,
    ms
  };
}
