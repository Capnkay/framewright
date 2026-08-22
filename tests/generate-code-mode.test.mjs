// T-124 — mode=code, the last of §13's four modes. §6, §13, §14.
//
// THE GAP, and it is the same one five times over. `codeToIr.js` was built,
// exported, and called by nothing; `mode=code` answered 501. AGENTS.md rule 9
// exists because of T-101, T-108, T-116, T-119 and this.
//
// WHAT THESE TESTS DO NOT DO, and it matters more than what they do. The obvious
// test is "round-trip a component and assert the copy survived". It passes
// whether or not the parser reads anything, because the reference scaffold this
// mode falls back to IS the Pulse Fit template, so an element that resolved
// nothing keeps a default identical to the one the component was emitted from.
// That is not a hypothetical — it is what the first version of this suite
// asserted, and it was green while every default was being read from the
// scaffold and none from the code.
//
// So the assertions below check `sourceOf` and the warnings, which are the only
// fields that distinguish "read from your component" from "assumed on your
// behalf".

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { postGenerate } from '../server/src/routes/generate.js';
import { codeToIr, CodeNotUnderstood } from '../server/src/generate/codeToIr.js';
import { emitComponent } from '../server/src/generate/emitComponent.js';
import { promptToIrKeyless } from '../server/src/generate/promptToIrKeyless.js';
import { validateIr } from '../server/src/validate/irValidator.js';
import { createStore } from '../server/src/store/index.js';

async function isolatedEnv(label) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `fw-${label}-`));
  return {
    JOB_STORE_PATH: path.join(dir, 'jobs.json'),
    ARTIFACT_ROOT: path.join(dir, 'artifacts'),
    STORE_PATH: path.join(dir, 'store.json'),
    MONGODB_URI: '',
  };
}

/**
 * A real §7 component, emitted by the real emitter rather than checked in.
 *
 * A fixture pasted into this file would be a snapshot of the emitter on the day
 * it was written, and mode=code's whole job is to read what the emitter produces
 * TODAY. Generating it here means a change to the emitter that breaks the parser
 * fails this suite instead of being discovered by a user.
 */
function emittedComponent(overrides = {}) {
  const ir = promptToIrKeyless('a bold hero with three stats', {
    pageName: 'Home',
    sectionName: 'RoundTrip',
  });
  let next = 2000000900;
  ir.elements = ir.elements.map((el) => ({ ...el, fieldId: String(next++), ...(overrides[el.elementName] || {}) }));
  return { source: String(emitComponent(ir)), ir };
}

// ---------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------

test('every element’s default is read from the code, not from the scaffold', async () => {
  const { source, ir } = emittedComponent();
  const parsed = await codeToIr(source, { pageName: 'Home', sectionName: 'RoundTrip' });

  for (const element of parsed.elements) {
    assert.equal(
      element.sourceOf,
      'code',
      `${element.elementName} was not read from the pasted component (sourceOf=${element.sourceOf})`,
    );
  }

  // And no per-element "could not be resolved" warning survived.
  const unresolved = parsed.warnings.filter((w) => w.includes('no default content could be resolved'));
  assert.deepEqual(unresolved, [], 'some defaults fell back to the reference');

  // Only then is comparing the values meaningful.
  for (const element of parsed.elements) {
    const before = ir.elements.find((e) => e.elementName === element.elementName);
    assert.equal(element.default, before.default, `${element.elementName} round-tripped to a different default`);
  }
});

test('the IR it produces satisfies §6', async () => {
  const { source } = emittedComponent();
  const parsed = await codeToIr(source, { pageName: 'Home', sectionName: 'RoundTrip' });

  const result = validateIr(parsed);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(parsed.source.mode, 'code');
  assert.deepEqual(parsed.source.inputs, ['code']);
  // §13.3 — a code round-trip is the canonical preserve case.
  assert.equal(parsed.idPolicy.mode, 'preserve');
});

test('it says out loud which §6 fields the code could not supply', async () => {
  // The failure this prevents: an IR that looks complete while layout, theme and
  // designTokens were invented, with nothing recording that they were.
  const { source } = emittedComponent();
  const parsed = await codeToIr(source, { pageName: 'Home', sectionName: 'RoundTrip' });

  assert.ok(
    parsed.warnings.some((w) => w.includes('layout') && w.includes('theme') && w.includes('designTokens')),
    `no warning names the invented fields: ${JSON.stringify(parsed.warnings)}`,
  );
});

test('a component with no §7 markers is refused rather than silently templated', async () => {
  // The worst available behaviour: return the Pulse Fit template, report success,
  // and hand back a section that has nothing to do with what was pasted.
  const plain = `
    export default function Marketing() {
      return <section><h1>Totally unrelated</h1><p>No ids map here.</p></section>;
    }
  `;

  await assert.rejects(
    () => codeToIr(plain, { pageName: 'Home', sectionName: 'X' }),
    (err) => err instanceof CodeNotUnderstood && /const ids/.test(err.message),
  );
});

test('unparseable input is refused, not partially guessed', async () => {
  await assert.rejects(
    () => codeToIr('export default function ( { { {', {}),
    (err) => err instanceof CodeNotUnderstood,
  );
  await assert.rejects(() => codeToIr('   ', {}), (err) => err instanceof CodeNotUnderstood);
});

// ---------------------------------------------------------------------
// §14 — the input is never executed
// ---------------------------------------------------------------------

test('a hostile component is parsed, never run', async () => {
  // AGENTS.md: never eval, never new Function, never vm — Node's vm is not a
  // security boundary. The proof here is behavioural: this component's top level
  // would throw and set a global if anything evaluated it, and codeToIr's own
  // failure must be CodeNotUnderstood (no §7 markers), not that side effect.
  delete globalThis.__T124_EXECUTED__;

  const hostile = `
    globalThis.__T124_EXECUTED__ = true;
    process.exit(1);
    export default function Evil() {
      return <div id={notIds.thing}>x</div>;
    }
  `;

  await assert.rejects(
    () => codeToIr(hostile, { pageName: 'Home', sectionName: 'X' }),
    (err) => err instanceof CodeNotUnderstood,
  );
  assert.equal(globalThis.__T124_EXECUTED__, undefined, 'the pasted code ran');
});

test('this module reaches no code-execution primitive', async () => {
  // A source-level check, deliberately narrow: it asserts the absence of the four
  // things AGENTS.md names, in the one file that handles untrusted input. It is
  // not a substitute for the behavioural test above; it catches the case where
  // somebody "simplifies" the AST walk into an eval a year from now.
  const source = await fs.readFile(
    new URL('../server/src/generate/codeToIr.js', import.meta.url),
    'utf8',
  );
  const code = source.replace(/^\s*\/\/.*$/gm, ''); // the header discusses them by name

  for (const forbidden of ['eval(', 'new Function', "require('vm')", 'from \'vm\'']) {
    assert.equal(code.includes(forbidden), false, `codeToIr.js contains ${forbidden}`);
  }
});

// ---------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------

test('mode=code is no longer 501 and completes seven stages', async () => {
  const env = await isolatedEnv('code-200');
  const { source } = emittedComponent();

  const { status, body } = await postGenerate({
    env,
    body: { mode: 'code', pageName: 'Home', sectionName: 'FromCode', code: source },
    files: {},
  });

  assert.notEqual(status, 501, JSON.stringify(body));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.job.mode, 'code');

  for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
    const record = body.job.stages.find((s) => s.stage === stage);
    assert.ok(record, `stage ${stage} has no record`);
    assert.notEqual(record.status, 'failed', `stage ${stage} failed: ${JSON.stringify(record.warnings)}`);
  }
});

test('the persisted section carries the pasted component’s own copy', async () => {
  // The end-to-end claim: what was pasted reaches the store, through the IR, the
  // emitter and the element documents.
  const env = await isolatedEnv('code-store');
  const { source } = emittedComponent();

  const { body } = await postGenerate({
    env,
    body: { mode: 'code', pageName: 'Home', sectionName: 'FromCode', code: source },
    files: {},
  });

  const store = createStore(env);
  const section = await store.findSection(body.job.sectionId);
  assert.ok(section, 'no section was persisted');

  const elements = await store.findElements({ fieldIds: section.fieldIds });
  const headline = elements.find((e) => e.elementName === 'headlineMain');
  assert.ok(headline, 'headlineMain was not persisted');
  assert.equal(headline.content, 'CHALLENGE YOUR LIMITS');
});

test('a component the parser cannot read is a 422, not a 500', async () => {
  // §13. A 500 says "we broke" and points the reader at our logs; a 422 points
  // them at the one thing they can change.
  const env = await isolatedEnv('code-422');

  const { status, body } = await postGenerate({
    env,
    body: {
      mode: 'code',
      pageName: 'Home',
      sectionName: 'FromCode',
      code: 'export default function X() { return <div>nothing marked up</div>; }',
    },
    files: {},
  });

  assert.equal(status, 422, JSON.stringify(body));
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'PARSE_FAILURE');
  assert.match(body.error.message, /const ids/);
});

test('mode=code with no code is a 400', async () => {
  const env = await isolatedEnv('code-400');
  const { status, body } = await postGenerate({
    env,
    body: { mode: 'code', pageName: 'Home', sectionName: 'FromCode' },
    files: {},
  });

  assert.equal(status, 400, JSON.stringify(body));
  assert.match(body.error.message, /code/i);
});

test('no mode answers 501 any more — §13 names four and four are built', async () => {
  const env = await isolatedEnv('code-modes');
  const { source } = emittedComponent();

  for (const mode of ['prompt', 'code']) {
    const { status } = await postGenerate({
      env,
      body: {
        mode,
        pageName: 'Home',
        sectionName: 'AllModes',
        prompt: 'a bold hero with three stats',
        code: source,
      },
      files: {},
    });
    assert.notEqual(status, 501, `mode=${mode} still answers 501`);
  }
});

test('combined may carry code, and the code half reaches the merge', async () => {
  // §6's order gives technical patterns to code. This asserts the halves met at
  // all — the merge running is the property T-119 established and this extends.
  const env = await isolatedEnv('code-combined');
  const { source } = emittedComponent();

  const { status, body } = await postGenerate({
    env,
    body: {
      mode: 'combined',
      pageName: 'Home',
      sectionName: 'CombinedCode',
      prompt: 'a bold hero with three stats',
      code: source,
    },
    files: {},
  });

  assert.equal(status, 200, JSON.stringify(body));
  const stage4 = body.job.stages.find((s) => s.stage === 4);
  const ir = JSON.parse(await fs.readFile(stage4.outputRef, 'utf8'));
  assert.ok(ir.elements.length >= 7, 'the reference set did not survive a combined code run');
});


// ---------------------------------------------------------------------
// T-140 — a component whose constants live in a sibling module.
// ---------------------------------------------------------------------

test('a pasted file whose ids and DEFAULTS live elsewhere still yields visible copy', async () => {
  // §7 LETS A SECTION SPLIT ITS CONSTANTS OUT, and the golden HeroSection does
  // exactly that — `ids` and `DEFAULTS` are exported from HeroSection.logic.js.
  // This reads one pasted string, so `DEFAULTS[ids.x]` resolves to nothing
  // through no fault of the input.
  //
  // Emitting '' for that was honest about having read nothing and produced a
  // section that renders blank. Found in a four-mode rehearsal against the live
  // stack: wireframe gave "HEADLINE", prompt and combined gave "CHALLENGE YOUR
  // LIMITS", and code gave "". All four returned 200 and no stage failed, so the
  // only notice was fifteen warnings.
  const split = `
    import { ids, DEFAULTS } from './Thing.logic.js';
    import { getHtml, getTextValue } from '../../utils/getHtml.js';

    export default function Thing({ data }) {
      return (
        <section>
          <h1 id={ids.headlineMain}
              dangerouslySetInnerHTML={{ __html: getHtml(getTextValue(data, ids.headlineMain, DEFAULTS[ids.headlineMain]), DEFAULTS[ids.headlineMain]) }} />
          <button id={ids.ctaButton}>{getTextValue(data, ids.ctaButton, DEFAULTS[ids.ctaButton])}</button>
        </section>
      );
    }
  `;

  const ir = await codeToIr(split, { pageName: 'Home', sectionName: 'Split' });
  const byName = Object.fromEntries(ir.elements.map((e) => [e.elementName, e]));

  // The elements are found — the JSX is readable even when the constants are not.
  assert.ok(byName.headlineMain, 'headlineMain was not found at all');

  // And they are NOT blank.
  assert.notEqual(byName.headlineMain.default, '', 'headlineMain came back empty');
  assert.ok(byName.headlineMain.default, 'headlineMain has no default at all');

  // The warning must still say the copy is not the caller's, or a reference
  // default becomes indistinguishable from something we actually read.
  assert.ok(
    ir.warnings.some((w) => w.includes('headlineMain') && w.includes('no default content could be resolved')),
    `no warning explains the fallback: ${JSON.stringify(ir.warnings)}`,
  );
  assert.ok(
    ir.warnings.some((w) => w.includes('sibling module')),
    'the warning does not say why it could not be read',
  );
});

test('an element with no reference default is left empty rather than invented', async () => {
  // The fallback is §3's reference set, not a guess. A name outside it has
  // nothing legitimate to fall back to, and making something up would be worse
  // than blank — blank is visibly wrong, invented copy is not.
  const odd = `
    import { ids, DEFAULTS } from './X.logic.js';
    export default function X({ data }) {
      return <p id={ids.somethingNobodyDefined}>{DEFAULTS[ids.somethingNobodyDefined]}</p>;
    }
  `;

  const ir = await codeToIr(odd, { pageName: 'Home', sectionName: 'Odd' });
  const el = ir.elements.find((e) => e.elementName === 'somethingNobodyDefined');

  if (el) {
    assert.equal(el.default, '', 'a default was invented for an element §3 does not define');
    assert.ok(
      ir.warnings.some((w) => w.includes('no reference default')),
      'the empty case is not explained',
    );
  }
});
