// server/src/quality/visual.js
//
// The visual quality gate — CONTRACT.md §18, and §6 for the transform.
//
// §18's table: "Visual | pixelmatch, generated preview against the normalised
// wireframe | similarity 0.0–1.0, `null` when there was no wireframe."
//
// THE GATE INFORMS, IT DOES NOT DECIDE. §18 states it twice and it shapes every
// function here: "No gate below fails a generation. A component that lints clean,
// validates against its schemas and hydrates a live store is a success even if it
// scores poorly here — these gates inform, and §9 decides." So nothing in this file
// throws for a bad score, an unreadable image, or a missing transform. The worst
// outcome available is `similarity: null` plus a warning.
//
// NULL IS NOT ZERO, and §18.1 is explicit about why: "visualSimilarity is null — and
// therefore scored as 1.0 — when no wireframe was supplied. Prompt mode must not be
// penalised for having no image to compare against." Returning 0 for prompt mode would
// silently cost 15 points of a 100-point score for using a supported mode. So the two
// values mean different things here and are never conflated: `null` is "not
// applicable", a number is "measured".
//
// WHY THE COMPARISON HAPPENS IN NORMALISED SPACE. §6 requires stage 2 to record its
// transform `{ scale, offsetX, offsetY, width, height }`, and the doneWhen requires
// this gate to use it. The wireframe the pipeline reasoned about is the NORMALISED one
// — every bbox in the IR is in that space (T-055, T-056) — so comparing a preview
// against the raw upload would measure the normalisation as if it were a generation
// error. A wireframe photographed at an angle and straightened by stage 2 would score
// terribly against its own correct output.
//
// WHY THIS DOES NOT `import pixelmatch`. `npm install` is not a precondition of
// `npm test` in this repository — the store, the envelope, the schemas and the
// sanitiser are all dependency-free for that reason, and tools/test.mjs runs on a
// fresh clone with no node_modules. What follows implements pixelmatch's actual
// algorithm rather than approximating it: the YIQ colour-difference metric from
// Yee (2004) that pixelmatch uses, with the same default threshold of 0.1 and the
// same delta scaling, so swapping the real package in later should move scores by
// rounding rather than by redefinition.
//
// IMAGES ARE RASTERS, NOT FILES. Every function takes `{ width, height, data }` where
// `data` is RGBA bytes. PNG decoding is deliberately out of scope: it is a real
// dependency's job, the caller already has a decoded buffer from whatever took the
// screenshot, and a hand-rolled PNG decoder inside a quality gate is a much larger
// surface than the gate itself.

/**
 * pixelmatch's default. Below this YIQ distance two pixels count as equal.
 * Not tuned here — it is the upstream default, and changing it would make this
 * gate's numbers incomparable with the ones the real package produces.
 */
export const DEFAULT_THRESHOLD = 0.1;

/**
 * Below this similarity the gate appends a warning. §18 gives no number, so this is
 * a judgement and is written down as one: it is §10's escalate band, reused, so that
 * "below 0.60" means the same thing — a human should look at this — whether it is
 * said about a detection or about a rendering. One number, one meaning.
 */
export const LOW_SIMILARITY = 0.60;

/** The §6 transform, as an identity. Used when stage 2 recorded nothing. */
export const IDENTITY_TRANSFORM = Object.freeze({
  scale: 1, offsetX: 0, offsetY: 0, width: null, height: null,
});

function isRaster(image) {
  return Boolean(
    image
    && Number.isInteger(image.width) && image.width > 0
    && Number.isInteger(image.height) && image.height > 0
    && image.data
    && image.data.length >= image.width * image.height * 4,
  );
}

/**
 * Nearest-neighbour resample to a target size.
 *
 * Nearest, not bilinear, and on purpose: the comparison is between a wireframe and a
 * rendered section, both of which are dominated by hard edges — box borders, text
 * strokes, block boundaries. Bilinear blurs exactly those edges, which raises the
 * similarity of two images that disagree about where a box is. Nearest keeps a
 * misplaced edge misplaced, which is the thing the gate is supposed to notice.
 *
 * Deterministic: integer arithmetic only, no floating-point accumulation across rows.
 */
export function resample(image, targetWidth, targetHeight) {
  const out = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(image.height - 1, Math.floor((y * image.height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor((x * image.width) / targetWidth));
      const from = (sy * image.width + sx) * 4;
      const to = (y * targetWidth + x) * 4;
      out[to] = image.data[from];
      out[to + 1] = image.data[from + 1];
      out[to + 2] = image.data[from + 2];
      out[to + 3] = image.data[from + 3];
    }
  }
  return { width: targetWidth, height: targetHeight, data: out };
}

/**
 * Put a preview into the normalised wireframe's space using §6's recorded transform.
 *
 * The transform describes what stage 2 did to the ORIGINAL upload: scaled by `scale`,
 * then shifted by `(offsetX, offsetY)` into a `width x height` canvas. A preview is
 * rendered at its own arbitrary size, so it is resampled to the transform's canvas —
 * the space every IR bbox already lives in.
 *
 * A transform with no recorded canvas falls back to the wireframe's own dimensions,
 * which is the honest reading of "stage 2 did not record one": compare like for like
 * and warn, rather than refuse to score.
 */
export function toNormalisedSpace(preview, transform = IDENTITY_TRANSFORM, fallback = null) {
  const width = transform?.width ?? fallback?.width ?? preview.width;
  const height = transform?.height ?? fallback?.height ?? preview.height;
  if (preview.width === width && preview.height === height) return preview;
  return resample(preview, width, height);
}

/**
 * pixelmatch's YIQ delta. Yee (2004), as implemented upstream.
 *
 * Colour distance in YIQ rather than RGB because YIQ separates luminance from
 * chrominance the way human vision does, so a pixel that differs only in hue at equal
 * brightness scores as more similar than one that differs in brightness — which is
 * what a person comparing two renderings actually perceives.
 */
function colourDelta(a, b, i, j) {
  const r1 = a[i], g1 = a[i + 1], b1 = a[i + 2], al1 = a[i + 3];
  const r2 = b[j], g2 = b[j + 1], b2 = b[j + 2], al2 = b[j + 3];

  if (r1 === r2 && g1 === g2 && b1 === b2 && al1 === al2) return 0;

  // Blend against white, as pixelmatch does, so transparency is comparable.
  const bl = (c, alpha) => 255 + (c - 255) * (alpha / 255);
  const R1 = bl(r1, al1), G1 = bl(g1, al1), B1 = bl(b1, al1);
  const R2 = bl(r2, al2), G2 = bl(g2, al2), B2 = bl(b2, al2);

  const y1 = R1 * 0.29889531 + G1 * 0.58662247 + B1 * 0.11448223;
  const y2 = R2 * 0.29889531 + G2 * 0.58662247 + B2 * 0.11448223;
  const i1 = R1 * 0.59597799 - G1 * 0.27417610 - B1 * 0.32180189;
  const i2 = R2 * 0.59597799 - G2 * 0.27417610 - B2 * 0.32180189;
  const q1 = R1 * 0.21147017 - G1 * 0.52261711 + B1 * 0.31114694;
  const q2 = R2 * 0.21147017 - G2 * 0.52261711 + B2 * 0.31114694;

  const dy = y1 - y2, di = i1 - i2, dq = q1 - q2;
  return 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq;
}

/**
 * compare(a, b, { threshold }) -> { similarity, differing, total, comparable }
 *
 * `similarity` is 1 - differing/total, so 1.0 is identical and 0.0 is every pixel
 * different. Mismatched dimensions are NOT an error — b is resampled onto a — because
 * a preview and a wireframe are never the same size and refusing to compare them
 * would make the gate unreachable in practice.
 */
export function compare(a, b, { threshold = DEFAULT_THRESHOLD } = {}) {
  if (!isRaster(a) || !isRaster(b)) {
    return { similarity: null, differing: 0, total: 0, comparable: false };
  }

  const target = a.width === b.width && a.height === b.height ? b : resample(b, a.width, a.height);
  const maxDelta = 35215 * threshold * threshold; // pixelmatch's constant
  const total = a.width * a.height;

  let differing = 0;
  for (let p = 0; p < total; p += 1) {
    if (colourDelta(a.data, target.data, p * 4, p * 4) > maxDelta) differing += 1;
  }

  return {
    similarity: total === 0 ? null : 1 - differing / total,
    differing,
    total,
    comparable: true,
  };
}

/**
 * scoreVisual(options) -> { similarity, warnings, comparable, differing, total }
 *
 * The gate as §18 defines it. NEVER THROWS — see the header. Every failure mode
 * returns `similarity: null` and says why in `warnings`.
 *
 * options:
 *   preview     raster of the generated section, any size
 *   wireframe   raster of the NORMALISED wireframe (stage 2's output)
 *   transform   §6's recorded transform; used to place the preview in that space
 *   mode        §13's mode. `prompt` and `code` have no image and score null.
 *   threshold   pixelmatch threshold, default 0.1
 */
export function scoreVisual({
  preview = null,
  wireframe = null,
  transform = IDENTITY_TRANSFORM,
  mode = 'wireframe',
  threshold = DEFAULT_THRESHOLD,
} = {}) {
  const warnings = [];
  const none = (reason) => {
    if (reason) warnings.push(reason);
    return { similarity: null, warnings, comparable: false, differing: 0, total: 0 };
  };

  // §18.1: prompt mode must not be penalised for having no image. No warning either —
  // this is the mode working as designed, and a warning on every prompt-mode
  // generation trains everyone to ignore the field.
  if (mode === 'prompt' || mode === 'code') return none(null);
  if (!wireframe) return none(null);

  if (!isRaster(wireframe)) {
    return none('Visual gate skipped: the normalised wireframe raster was unreadable.');
  }
  if (!isRaster(preview)) {
    return none('Visual gate skipped: the generated preview raster was unreadable.');
  }
  if (!transform || transform.width == null || transform.height == null) {
    warnings.push(
      'Stage 2 recorded no normalisation canvas; the visual gate compared against the '
      + "wireframe's own dimensions (§6).",
    );
  }

  const placed = toNormalisedSpace(preview, transform, wireframe);
  const result = compare(wireframe, placed, { threshold });

  if (result.similarity !== null && result.similarity < LOW_SIMILARITY) {
    // Appends a warning and NOTHING ELSE. §18: no gate fails a generation.
    warnings.push(
      `Visual similarity to the wireframe is ${result.similarity.toFixed(2)}, below `
      + `${LOW_SIMILARITY}. The generation was not blocked (§18); this is for review.`,
    );
  }

  return { ...result, warnings };
}

/**
 * §18.1's contribution of this gate to the 0–100 score, isolated so the formula lives
 * in one place and a null is handled the way §18.1 says rather than the way whoever
 * writes T-091 remembers.
 *
 *     15 * (visualSimilarity ?? 1.0)
 */
export function visualScoreContribution(similarity) {
  return 15 * (similarity ?? 1.0);
}

export default scoreVisual;
