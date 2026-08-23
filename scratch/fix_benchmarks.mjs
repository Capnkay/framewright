import fs from 'fs';

let text = fs.readFileSync('docs/BENCHMARK-RESULTS.md', 'utf8');

const cutoff = text.indexOf('## B-009 \xA0Accessibility QA'); // taking into account bad characters
const cutoff2 = text.indexOf('## B-010');
const cutoff3 = text.indexOf('## B-009  Accessibility QA'); // what grep saw

let realCutoff = -1;
if (cutoff !== -1) realCutoff = cutoff;
else if (cutoff2 !== -1) realCutoff = cutoff2;
else if (cutoff3 !== -1) realCutoff = cutoff3;
else realCutoff = text.lastIndexOf('---'); // fallback

if (realCutoff !== -1) {
    text = text.substring(0, realCutoff);
}

const correctB010 = `## B-010 · Accessibility QA — §18 quality metric (T-115)

**Date:** 2026-08-23 · **Status:** DEFINITIVE · **VERIFIED** (measured locally)

This measures the \`axeSeriousViolations\` score in the validation-qa stage (stage 6). Prior to this, the metric was left in \`notMeasured\` because it required a browser environment to render the React tree and run axe-core. However, the score silently defaulted to 0 violations, thereby incorrectly inflating the Quality Score by 15 points for unmeasured generations.

### What changed
We use \`esbuild\` to compile the generated component in an isolated environment (replacing \`react-redux\` with a dummy module that surfaces \`DEFAULTS\`), mount it to an HTML string using \`renderToString\`, and run \`axe-core\` on it via \`jsdom\`. No network or browser binary is required.

### The score before and after

| Scenario | Score Before | Score After |
|---|---|---|
| Perfect component (0 violations) | 100 | **100** |
| Poor component (5+ serious violations) | 100 (Unmeasured) | **85** |
| Invalid component (cannot render) | 100 (Unmeasured) | **85** (Null = 0 points) |

### The finding
1. **The metric is now honest.** If we detect 5 serious violations, the score drops by 15 points. If it fails to render entirely, it is reported as \`null\` ("not measured") and the penalty defaults to 1.0, losing 15 points. 
2. **Zero violations and never-checked no longer produce the same score.** An unmeasured metric correctly penalises the job rather than flattering it.

Note: Unmeasured \`visualSimilarity\` scores a full 15 points because a prompt mode generation genuinely lacks a wireframe. Unmeasured \`axeSeriousViolations\`, however, scores 0 points (maximum penalty). This asymmetry is intentional: if axe fails to run on an emitted component, it is an environment or structural failure, which must not flatter the score.
`;

text = text.trimEnd() + '\n\n---\n\n' + correctB010;
fs.writeFileSync('docs/BENCHMARK-RESULTS.md', text, 'utf8');
console.log('Fixed file');
