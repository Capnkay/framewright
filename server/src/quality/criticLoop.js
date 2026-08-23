// server/src/quality/criticLoop.js
//
// The self-correcting loop: render what was generated, show it to the critic
// beside the original wireframe, apply the correction, generate again.
//
// WHY A LOOP AND NOT A SINGLE PASS. The first correction is usually the text —
// the hallucinated heading, the invented marketing line. Once that lands, the
// second render is a different picture, and mismatches the first pass could not
// see (an element in the wrong order, a missing card) become visible. One pass
// catches the loudest error; the loop catches the one underneath it.
//
// WHY IT IS TIGHTLY BOUNDED ANYWAY. NFR-02 gives the whole generation 60
// seconds. A render is a browser page and a bundle (~1-3s), and a critic call
// is a vision model with §16.2's 30-second ceiling. Two iterations is the most
// that fits beside stages 1-7; the default is therefore 2, not "until it
// converges". A loop that runs until it is happy is a loop that misses the
// deadline on the one wireframe that confuses it — and that wireframe is the
// one that will be on screen during judging.
//
// IT CONVERGES BY STOPPING, NOT BY SUCCEEDING. Three exits: the critic reports
// no change (converged), the iteration cap is reached (bounded), or a step
// degrades (no screenshot, no key, no toolchain). All three return a usable IR
// and a reason. There is no fourth exit where the loop keeps going.
//
// NOTHING HERE CAN FAIL A GENERATION. §18: gates inform, §9 decides. Every
// early return below carries the IR and source it was handed, so the worst
// outcome is the generation that would have happened without the loop.
//
// ONE-WAY DOOR THIS AVOIDS: the loop never keeps a correction it could not
// re-emit. If the critic returns an IR and the emitter then rejects it, the
// previous IR *and* its source are restored together. Keeping a corrected IR
// beside the source emitted from the older one would hand stage 7 a component
// that does not match the IR stage 6 validated — a mismatch nothing downstream
// checks for, because until this file nothing could produce it.

import { renderComponent } from './render.js';
import { runCritic } from './critic.js';

export const DEFAULT_MAX_ITERATIONS = 2;

/**
 * runCriticLoop({ wireframe, ir, source, emit, maxIterations, width, height })
 *   -> { ir, source, iterations, screenshot, converged, warnings }
 *
 *   wireframe — Buffer of the image to match. Prefer stage 2's NORMALISED
 *               raster: §6 puts every IR bbox in normalised space, so comparing
 *               against the raw upload measures the normalisation as if it were
 *               a generation error. Falls back to the upload when stage 2
 *               degraded and produced no raster.
 *   emit      — (ir) => jsx source. The caller's stage-5 emitter, injected so
 *               this module neither imports it nor decides how emission works.
 *
 * `screenshot` is the LAST successful render, which the caller can hand to the
 * §18 visual gate — the loop has already paid for it, and rendering twice to
 * measure what was just rendered is pure waste.
 *
 * Never throws.
 */
export async function runCriticLoop({
  wireframe,
  ir,
  source,
  emit,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  width,
  height,
  critic = runCritic,
  render = renderComponent,
} = {}) {
  const warnings = [];
  const base = { ir, source, iterations: 0, screenshot: null, converged: false, warnings };

  if (typeof emit !== 'function') {
    warnings.push('critic loop skipped: no emitter supplied');
    return base;
  }
  if (!wireframe) {
    warnings.push('critic loop skipped: no wireframe to compare against');
    return base;
  }
  if (!ir || !source) {
    warnings.push('critic loop skipped: nothing generated to critique');
    return base;
  }

  let currentIr = ir;
  let currentSource = source;
  let lastScreenshot = null;
  let iterations = 0;

  for (let i = 0; i < Math.max(0, maxIterations); i += 1) {
    const rendered = await render(currentSource, { width, height });
    if (!rendered.screenshot) {
      warnings.push(`critic loop stopped at iteration ${i + 1}: ${rendered.reason}`);
      break;
    }
    lastScreenshot = rendered.screenshot;

    // An unstyled render is a picture of the right elements in the wrong
    // places. The critic would read that as a structural mismatch and
    // "correct" a layout that was never wrong, so the loop declines to run
    // rather than acting on a comparison it knows is invalid.
    if (!rendered.styled) {
      warnings.push(`critic loop stopped at iteration ${i + 1}: ${rendered.reason}`);
      break;
    }

    const verdict = await critic({ wireframe, screenshot: rendered.screenshot, ir: currentIr });
    iterations = i + 1;

    if (!verdict.ok) {
      warnings.push(`critic did not run at iteration ${iterations}: ${verdict.reason}`);
      break;
    }
    if (!verdict.changed) {
      // Converged: the critic looked at both images and had nothing to change.
      return { ir: currentIr, source: currentSource, iterations, screenshot: lastScreenshot, converged: true, warnings };
    }

    let nextSource;
    try {
      nextSource = await emit(verdict.ir);
    } catch (err) {
      warnings.push(
        `critic correction at iteration ${iterations} was discarded — it did not emit: ${err && err.message ? err.message : String(err)}`,
      );
      break; // currentIr and currentSource are still the last consistent pair.
    }
    if (!nextSource) {
      warnings.push(`critic correction at iteration ${iterations} was discarded — the emitter produced nothing`);
      break;
    }

    currentIr = verdict.ir;
    currentSource = nextSource;
  }

  if (iterations >= maxIterations && maxIterations > 0) {
    warnings.push(`critic loop hit its ${maxIterations}-iteration ceiling without converging`);
  }

  return { ir: currentIr, source: currentSource, iterations, screenshot: lastScreenshot, converged: false, warnings };
}

export default runCriticLoop;
