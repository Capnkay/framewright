// tools/design2code/textFidelity.mjs
//
// Score a produced IR's text against a page's ground truth — T-161.
//
// THE PRIMARY METRIC IS GROUNDEDNESS, NOT RECALL, and the reason is structural
// rather than a preference.
//
// Framewright emits ONE CMS section built from §3's seven slots. A Design2Code
// page carries 26-42 visible strings. So recall — "what fraction of the page did
// we recover" — is capped at roughly seven over forty before the generator does
// anything at all, and it moves when the TEMPLATE changes rather than when the
// generation improves. Reporting it as the headline would make a template with
// more slots look like a better model.
//
// Groundedness asks the question the critic loop actually answers: OF THE
// STRINGS WE PRODUCED, how many are really on the page? A generator that
// invents plausible marketing copy scores badly no matter how many slots it
// has, and one that reads the image honestly scores well even with seven. That
// is §18's hallucination failure stated as a number, and it is the one claim
// Phase 1 makes.
//
// RECALL IS STILL REPORTED, marked as template-bounded, because it is the right
// measure of a DIFFERENT thing (coverage) and hiding it would be its own kind of
// dishonesty. What must not happen is the two being averaged into one score.
//
// MATCHING IS DELIBERATELY GENEROUS, in the direction that costs us. A produced
// string counts as grounded if its normalised form appears anywhere in the
// page's normalised text. That will occasionally credit a short word that
// appears by coincidence — so the floor is raised by MIN_SCORABLE_LEN, below
// which a string is not scored at all rather than being counted as a free hit.
// Being generous here means a reported hallucination is a real one.

import { groundTruth } from './groundTruth.mjs';

/**
 * Strings this short are not evidence either way. "Home", "Go", "40+" appear on
 * half the web; crediting them inflates groundedness and penalising them
 * invents hallucinations. They are excluded from both numerator and
 * denominator, and counted separately so the exclusion is visible.
 */
export const MIN_SCORABLE_LEN = 4;

/**
 * Normalise for comparison — the same transform on both sides.
 *
 * `<br />` is stripped because the emitter's own defaults carry it
 * ("Community<br />Members") while the page renders it as a line break, i.e. as
 * whitespace. Leaving it in would report a miss on a string that matches.
 */
export function normalise(text) {
  return String(text == null ? '' : text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // Trailing punctuation only. Interior punctuation is content.
    .replace(/[.,:;!?]+$/, '');
}

/**
 * Every string an IR asserts is on the page.
 *
 * Image defaults are excluded: a path like `default/images/hero-placeholder.jpg`
 * is never rendered as text, so scoring it would guarantee a hallucination on
 * every run regardless of what the model read.
 */
export function irStrings(ir) {
  const out = [];
  if (!ir || typeof ir !== 'object') return out;

  for (const el of ir.elements || []) {
    if (el.contentType === 'Image') continue;
    if (typeof el.default === 'string' && el.default.trim()) out.push(el.default);
  }

  for (const item of ir.cards?.items || []) {
    for (const [key, value] of Object.entries(item)) {
      if (/^field\d+$/.test(key) && typeof value === 'string' && value.trim()) out.push(value);
    }
  }

  return out;
}

/**
 * scoreSample({ ir, html }) -> per-sample record
 *
 * Never throws on a missing or malformed IR: a generation that failed is a
 * recorded zero with `produced: 0`, which is a measurement, not an error. A
 * harness that crashes on the interesting case reports only the easy ones.
 */
export function scoreSample({ ir, html }) {
  const truth = groundTruth(html);
  const produced = irStrings(ir);

  const scorable = [];
  const skipped = [];
  for (const raw of produced) {
    const norm = normalise(raw);
    if (norm.length >= MIN_SCORABLE_LEN) scorable.push({ raw, norm });
    else skipped.push(raw);
  }

  const grounded = [];
  const hallucinated = [];
  for (const s of scorable) {
    if (truth.joined.includes(s.norm)) grounded.push(s.raw);
    else hallucinated.push(s.raw);
  }

  // Recall over ground-truth strings long enough to be evidence, so both sides
  // of the report use one rule.
  const truthScorable = truth.strings.map(normalise).filter((s) => s.length >= MIN_SCORABLE_LEN);
  const producedBlob = scorable.map((s) => s.norm).join('  ');
  const covered = truthScorable.filter((s) => producedBlob.includes(s));

  return {
    produced: produced.length,
    scorable: scorable.length,
    skippedShort: skipped.length,
    grounded: grounded.length,
    hallucinated: hallucinated.length,
    // The headline. `null` when nothing scorable was produced — a generation
    // that emitted no text has no groundedness, and scoring it 0 would be
    // indistinguishable from one that invented six strings.
    groundedRate: scorable.length ? grounded.length / scorable.length : null,
    truthStrings: truth.strings.length,
    truthScorable: truthScorable.length,
    covered: covered.length,
    // Template-bounded. See the header — never average this with groundedRate.
    recall: truthScorable.length ? covered.length / truthScorable.length : null,
    hallucinatedSamples: hallucinated.slice(0, 5),
  };
}

/** Mean over the samples where the metric is defined; null when none are. */
function meanOf(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * aggregate(rows) -> the arm's summary.
 *
 * Reports BOTH a macro mean (per-sample average) and a micro rate (pooled
 * counts). They disagree when samples produce different numbers of strings, and
 * the disagreement is informative: micro is the honest "of everything we said,
 * how much was true", macro stops one verbose sample dominating.
 */
export function aggregate(rows) {
  const totals = rows.reduce(
    (acc, r) => ({
      produced: acc.produced + r.produced,
      scorable: acc.scorable + r.scorable,
      grounded: acc.grounded + r.grounded,
      hallucinated: acc.hallucinated + r.hallucinated,
      covered: acc.covered + r.covered,
      truthScorable: acc.truthScorable + r.truthScorable,
    }),
    { produced: 0, scorable: 0, grounded: 0, hallucinated: 0, covered: 0, truthScorable: 0 },
  );

  return {
    samples: rows.length,
    ...totals,
    groundedRateMicro: totals.scorable ? totals.grounded / totals.scorable : null,
    groundedRateMacro: meanOf(rows, 'groundedRate'),
    recallMicro: totals.truthScorable ? totals.covered / totals.truthScorable : null,
    recallMacro: meanOf(rows, 'recall'),
  };
}

export default scoreSample;
