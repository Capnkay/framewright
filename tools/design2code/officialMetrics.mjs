// tools/design2code/officialMetrics.mjs
//
// The Design2Code paper's fine-grained metrics — T-162.
//
// READ THE CAVEAT BEFORE THE NUMBERS. Design2Code scores a model that was asked
// to reproduce a WHOLE PAGE as HTML. Framewright is asked for ONE CMS-ready
// section built from §3's seven slots, and that is not a weaker attempt at the
// same task — it is a different task. So on this benchmark:
//
//   * Block-match is bounded above by (our blocks / their blocks). A page with
//     forty text blocks against our seven caps the score near 0.18 before the
//     generator does anything at all.
//   * Position and colour similarity are computed only over MATCHED blocks, so
//     they are meaningful — they say "of what we did produce, how close was it".
//   * Text similarity, likewise, is over matched blocks.
//
// Reported this way, block-match measures TEMPLATE COVERAGE and the other three
// measure GENERATION QUALITY on what was covered. Averaging them into one
// headline would hide exactly that distinction, so this module never does.
//
// WHY BLOCKS COME FROM THE DOM, NOT FROM PIXELS. The reference implementation
// segments the rendered image. We have both DOMs in a real browser already —
// the emitted component is rendered for the critic, and the reference HTML is a
// file — so `getClientRects()` gives the true box of every text run instead of a
// guess recovered from pixels. It is strictly more accurate, and the thing being
// compared (text content, position, colour) is identical either way.
//
// CLIP SIMILARITY IS NOT IMPLEMENTED, and is reported as null rather than
// approximated. It needs a CLIP checkpoint; substituting a hand-rolled image
// distance and calling it CLIP would be a fabricated number, which
// BENCHMARK-RESULTS.md exists to keep out.

import puppeteer from '../../server/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { normalise } from './textFidelity.mjs';

/** Extracts every visible text run with its box and colour, in document order. */
const EXTRACT = `(() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    out.push({
      text,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      w: rect.width,
      h: rect.height,
      color: style.color,
    });
  }
  return { blocks: out, pageW: document.documentElement.scrollWidth, pageH: document.documentElement.scrollHeight };
})()`;

function parseRgb(css) {
  const m = /rgba?\(([^)]+)\)/.exec(String(css || ''));
  if (!m) return [0, 0, 0];
  const parts = m[1].split(',').map((v) => Number(v.trim()));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/**
 * Normalised edit distance, 1.0 identical and 0.0 unrelated.
 *
 * Iterative two-row Levenshtein: the recursive form blows the stack on the
 * longer paragraphs in this corpus, and the full matrix is needless allocation
 * when only the previous row is ever read.
 */
export function textSimilarity(a, b) {
  const s = normalise(a);
  const t = normalise(b);
  if (!s.length && !t.length) return 1;
  if (!s.length || !t.length) return 0;
  if (s === t) return 1;

  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= t.length; j += 1) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return 1 - prev[t.length] / Math.max(s.length, t.length);
}

/**
 * Greedy one-to-one matching on text similarity, best pair first.
 *
 * Greedy rather than Hungarian on purpose: the paper's own matcher is greedy,
 * and with seven candidates against forty the optimal assignment and the greedy
 * one agree almost always. Choosing the more complex algorithm would make our
 * numbers incomparable to the published ones for no measurable gain.
 */
export function matchBlocks(generated, reference, threshold = 0.5) {
  const pairs = [];
  for (let i = 0; i < generated.length; i += 1) {
    for (let j = 0; j < reference.length; j += 1) {
      const score = textSimilarity(generated[i].text, reference[j].text);
      if (score >= threshold) pairs.push({ i, j, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedG = new Set();
  const usedR = new Set();
  const matched = [];
  for (const p of pairs) {
    if (usedG.has(p.i) || usedR.has(p.j)) continue;
    usedG.add(p.i);
    usedR.add(p.j);
    matched.push({ generated: generated[p.i], reference: reference[p.j], textScore: p.score });
  }
  return matched;
}

async function extract(page, load) {
  await load(page);
  await new Promise((r) => setTimeout(r, 400));
  return page.evaluate(EXTRACT);
}

/**
 * officialMetrics({ html, screenshotHtml }) -> the four sub-scores.
 *
 * `screenshotHtml` is a full document wrapping the emitted component's
 * server-rendered markup — render.js already builds one for the critic, so this
 * takes the string rather than re-deriving it.
 */
export async function officialMetrics({ referenceHtml, generatedHtml, width = 1280, height = 720 }) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    const ref = await extract(page, (p) =>
      p.setContent(referenceHtml, { waitUntil: 'domcontentloaded', timeout: 20000 }));
    const gen = await extract(page, (p) =>
      p.setContent(generatedHtml, { waitUntil: 'domcontentloaded', timeout: 20000 }));

    const matched = matchBlocks(gen.blocks, ref.blocks);

    // Template coverage, NOT quality. See the header.
    const blockMatch = ref.blocks.length ? matched.length / ref.blocks.length : null;

    if (!matched.length) {
      return {
        blockMatch,
        textSimilarity: null,
        positionSimilarity: null,
        colorSimilarity: null,
        clipSimilarity: null,
        matchedBlocks: 0,
        generatedBlocks: gen.blocks.length,
        referenceBlocks: ref.blocks.length,
      };
    }

    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

    // Position: 1 minus the centre-to-centre distance normalised by the page
    // diagonal, so a score is comparable across differently sized pages.
    const diag = Math.hypot(ref.pageW || width, ref.pageH || height) || 1;
    const position = mean(
      matched.map((m) => {
        const d = Math.hypot(m.generated.x - m.reference.x, m.generated.y - m.reference.y);
        return Math.max(0, 1 - d / diag);
      }),
    );

    // Colour: 1 minus RGB distance normalised by the maximum possible.
    const maxDist = Math.sqrt(3 * 255 * 255);
    const colour = mean(
      matched.map((m) => {
        const [r1, g1, b1] = parseRgb(m.generated.color);
        const [r2, g2, b2] = parseRgb(m.reference.color);
        return Math.max(0, 1 - Math.hypot(r1 - r2, g1 - g2, b1 - b2) / maxDist);
      }),
    );

    return {
      blockMatch,
      textSimilarity: mean(matched.map((m) => m.textScore)),
      positionSimilarity: position,
      colorSimilarity: colour,
      // Deliberately not approximated — see the header.
      clipSimilarity: null,
      matchedBlocks: matched.length,
      generatedBlocks: gen.blocks.length,
      referenceBlocks: ref.blocks.length,
    };
  } finally {
    await browser.close();
  }
}

export default officialMetrics;
