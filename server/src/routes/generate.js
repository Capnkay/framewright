import { STATUS, NOT_IMPLEMENTED, ok, badRequest, error } from '../http/envelope.js';
import { createStore } from '../store/index.js';
import { createJobStore } from '../jobs/jobStore.js';
import createStageTrace, { artifactRootFrom } from '../jobs/stageTrace.js';
import promptToIrHosted from '../generate/promptToIrHosted.js';
import { emitComponent } from '../generate/emitComponent.js';
import { writeComponentFile } from '../generate/writeComponentFile.js';
import { sanitiseGenerateBody } from '../sanitise/sanitiseWrite.js';
import { perceiveOrDegrade, STAGE_DEGRADED } from '../generate/perceiveAndAssembleIr.js';
import { validateSection } from '../validate/sectionValidator.js';
import { validateElement } from '../validate/elementValidator.js';
import { PROJECT_NAME } from '../models/elementDoc.js';
import createValidateAndRecover from '../generate/validateAndRecover.js';
import { measureAccessibility } from '../quality/axe.js';
import { resolveConflicts } from '../generate/resolveConflicts.js';
import { codeToIr, CodeNotUnderstood } from '../generate/codeToIr.js';
import { isSafeCssText } from '../sanitise/cssAllowList.js';

/**
 * §13.1's upload, as it reaches this handler.
 *
 * TOLERANT OF SHAPE, DELIBERATELY. `ctx.files` is whatever the HTTP layer put there,
 * and multer's memory and disk storages disagree about the field names (`buffer` vs
 * `data`, `originalname` vs `filename`). Picking one and letting the other arrive as
 * `undefined` fails as "no wireframe supplied" — a message that sends the reader to
 * the client when the fault is in the adapter.
 */
function readUpload(file) {
  if (!file) return null;
  const bytes = file.buffer || file.data || file.bytes || null;
  if (!bytes) return null;
  return {
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    filename: file.originalname || file.filename || file.name || 'wireframe.png',
    contentType: file.mimetype || file.type || 'image/png',
    size: file.size ?? (bytes.length || 0),
  };
}

/**
 * §13.1's accepted formats, enforced here as well as at the perception service.
 * Doing it in both places is not duplication: this one produces §13's error envelope
 * for the caller, and that one keeps the service honest when it is called directly.
 */
const ACCEPTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * §8's second chokepoint, applied. T-109.
 *
 * WHY IT IS HERE AND NOT ONLY IN sanitiseWrite. sanitiseWrite cleans what the CALLER
 * sent. This runs on what the GENERATOR produced — an IR element's `css` comes from a
 * model or a template, travels through the emitter, and reaches the store without ever
 * having been the caller's input. §8 makes the store boundary a chokepoint, not the
 * request boundary alone, and cssAllowList.js has existed since T-032 with nothing
 * calling it.
 *
 * REJECTS THE DECLARATION, NOT THE GENERATION. An unsafe `css` value is dropped and
 * warned about rather than failing the job: the section is still correct without it,
 * and killing a generation over a style string would make §8 something people route
 * around. What must not happen — and now cannot — is the value reaching the store.
 */
function safeCss(value, elementName, warnings) {
  if (value === null || value === undefined || value === '') return null;
  if (isSafeCssText(value)) return value;
  warnings.push(
    `${elementName}: the css declaration was rejected by §8's allow-list and dropped. ` +
    'The element was stored without it.'
  );
  return null;
}

/** A schema failure at the write path is a bug in this handler, not in the caller. */
function assertValid(result, what) {
  if (result.valid) return;
  const detail = (result.errors || [])
    .slice(0, 3)
    .map((e) => `${e.path}: ${e.message}`)
    .join('; ');
  throw new Error(`${what} failed its own schema before insert — ${detail}`);
}

export async function postGenerate(ctx = {}) {
  const env = ctx.env || {};
  let body = ctx.body || {};
  const files = ctx.files || {};

  const MODES = ['wireframe', 'code', 'prompt', 'combined'];
  if (!MODES.includes(body.mode)) {
    return badRequest(`mode is required and must be one of: ${MODES.join(', ')}.`);
  }

  const hasInput = Boolean(files.wireframe || body.code || body.prompt);
  if (!hasInput) {
    return badRequest('At least one of wireframe, code, or prompt is required.');
  }

  const cleaned = sanitiseGenerateBody(body);
  if (!cleaned.ok) return badRequest(cleaned.reason);
  // REBIND, do not merely publish. Assigning ctx.body alone left every line below
  // reading the RAW object, so the sanitised prompt was computed and then discarded
  // and body.prompt reached the IR builder unsanitised — the §8 write-side chokepoint
  // running but having no effect. Everything downstream of this line must see the
  // cleaned body, which is what makes it a chokepoint rather than a formality.
  body = cleaned.body;
  ctx.body = body;

  // T-108 opened `wireframe`, T-119 `combined`, T-124 `code`. All four of §13's modes
  // are built. The gate stays rather than being deleted: it is the thing that made
  // "not built" say 501 instead of half-working, and a fifth mode would want it again.
  const IMPLEMENTED_MODES = ['prompt', 'wireframe', 'combined', 'code'];
  if (!IMPLEMENTED_MODES.includes(body.mode)) {
    // `STATUS.NOT_IMPLEMENTED` does not exist -- envelope.js exports 501 as a
    // standalone `NOT_IMPLEMENTED`, deliberately kept OUT of STATUS because it is not
    // a contract status code. Reading it off STATUS yielded `undefined`, so every
    // unimplemented mode has been answering with an undefined status rather than a
    // 501. Found by T-108's test asserting the two remaining modes still say 501.
    return { status: NOT_IMPLEMENTED, body: { ok: false, error: { code: 'NOT_IMPLEMENTED', message: `T-033: mode=${body.mode} not implemented yet` } } };
  }

  // COMBINED IS NOT A THIRD PATH, it is both halves plus §6's conflict order. Building
  // it as its own branch would be a second implementation of the two that already work
  // and a second place for them to drift.
  //
  // WHICH HALVES RUN IS DECIDED BY WHAT THE CALLER SENT, not by the mode alone.
  // `combined` with a wireframe and no prompt is a wireframe run; with a prompt and no
  // wireframe it is a prompt run. §13 requires at least one input and does not require
  // combined to carry both, so refusing a one-sided combined would invent a rule.
  const usesWireframe = body.mode === 'wireframe' || (body.mode === 'combined' && Boolean(files.wireframe || files.image));
  const usesPrompt = body.mode === 'prompt' || (body.mode === 'combined' && Boolean(body.prompt));
  const usesCode = body.mode === 'code' || (body.mode === 'combined' && Boolean(body.code));
  const isWireframe = usesWireframe;

  if (body.mode === 'combined' && !usesWireframe && !usesPrompt && !usesCode) {
    return badRequest('mode=combined requires a wireframe image, a prompt or code (§13).');
  }
  if (body.mode === 'code' && !String(body.code || '').trim()) {
    return badRequest('mode=code requires a React component in `code` (§13).');
  }

  let upload = null;
  if (isWireframe) {
    upload = readUpload(files.wireframe);
    if (!upload) {
      return badRequest(`mode=${body.mode} requires a wireframe image (§13.1).`);
    }
    if (!ACCEPTED_IMAGE_TYPES.has(upload.contentType)) {
      return badRequest(
        `Unsupported image type ${upload.contentType}. Accepted: image/jpeg, image/png, image/webp (§13.1).`
      );
    }
    if (upload.size > MAX_IMAGE_BYTES) {
      return { status: 413, body: error('PAYLOAD_TOO_LARGE', `Image is ${upload.size} bytes; the limit is ${MAX_IMAGE_BYTES} (§13.1).`) };
    }
  }

  const store = createStore(env);
  const jobStore = createJobStore(env.JOB_STORE_PATH ? { filePath: env.JOB_STORE_PATH } : undefined);
  // §11.2's root by default; `ARTIFACT_ROOT` in the env moves it. Job ids
  // restart at 1 in every isolated store, so two callers with their own job
  // stores and one shared root write over each other's stage outputs (T-120).
  const trace = createStageTrace({ jobStore, artifactRoot: artifactRootFrom(env) });

  // Set by stage 4 when mode=code could not read the pasted component. §13's 422.
  let codeFailure = null;

  let job;
  try {
    const pageName = body.pageName || 'Home';
    const sectionName = body.sectionName || 'Custom';
    
    // Allocate section ID early so we can put it in the job and the IR
    const sectionId = await store.allocateId('section');
    
    job = await jobStore.createJob({ mode: body.mode, pageName, sectionId });

    // ---- stages 1-3 -------------------------------------------------------
    //
    // ONE CALL TO /perceive, THREE TRACE RECORDS. §11.0 numbers normalisation (2) and
    // multimodal-understanding (3) as separate stages, and the perception service runs
    // both behind a single request — §12 gives it one endpoint, not three. So the call
    // is made once and each record carries the part of the result that belongs to it:
    // stage 2 the normalisation transform §6 requires, stage 3 the regions and text.
    // Splitting the call to match the numbering would double a 5-second stage to make
    // the trace look tidier, and would make the two records describe two different
    // readings of the same image.
    let perceived = null;
    let perceptionWarnings = [];
    const writeWarnings = [];

    if (isWireframe) {
      // Stage 1: the upload, persisted as this stage's artifact. §11.2 keeps artifacts
      // Node-owned, and this is the one place the original bytes exist on this side.
      await trace.runStage(job.jobId, {
        stage: 1,
        run: async () => upload.bytes,
        outputExt: upload.contentType === 'image/jpeg' ? 'jpg'
          : upload.contentType === 'image/webp' ? 'webp' : 'png',
        outputName: 'upload'
      });

      perceived = await perceiveOrDegrade({
        image: upload.bytes,
        filename: upload.filename,
        contentType: upload.contentType,
        baseUrl: env.PERCEPTION_URL || undefined,
        request: {
          pageName,
          sectionName,
          mode: body.mode,
          prompt: body.prompt || '',
          wireframeRef: `uploads/${job.jobId}`
        }
      });
      perceptionWarnings = perceived.warnings || [];

      const remote = perceived.perception || {};
      const remoteStage = (n) => (remote.stages || []).find((s) => s.stage === n) || null;

      // TWO ARTIFACTS FROM ONE STAGE, using runStage's own input/output pair rather
      // than inventing a second stage. §11 rule 2 persists the input BEFORE the stage
      // and the output after, which is exactly the shape stage 2 needs: the transform
      // §6 requires goes in as `s2-preprocessing-normalization.json`, and the
      // normalised canvas comes out as `s2-normalised.jpg`.
      //
      // The canvas is the artifact the human-in-the-loop overlay draws its bbox over.
      // Before T-112 nothing produced it -- the perception service returns the
      // transform, not pixels, because §11.2 makes it a service that never writes
      // files -- so the overlay's <img> was a 404 and the box was drawn over nothing.
      const raster = (remoteStage(2)?.artifact || {}).raster || null;
      await trace.runStage(job.jobId, {
        stage: 2,
        input: remote.normalisation || { degraded: true },
        inputName: 'preprocessing-normalization',
        inputExt: 'json',
        run: async () => (raster ? Buffer.from(raster.base64, 'base64') : null),
        outputName: 'normalised',
        outputExt: raster ? (raster.extension || 'jpg') : 'json'
      });

      await trace.runStage(job.jobId, {
        stage: 3,
        run: async () => {
          const s3 = remoteStage(3);
          if (!s3) {
            // §11.1: degraded is "the stage did not do its real work but the pipeline
            // continued" — the canonical case being this service unreachable. Throwing
            // here would make it FAILED and stop the job, which is the outcome
            // AGENTS.md rule 5 forbids.
            return { degraded: true, reason: perceived.reason || 'perception returned no stage 3 record' };
          }
          return s3.artifact;
        },
        outputName: 'regions'
      });
    } else {
      // Skip image stages
      await trace.skipStage(job.jobId, { stage: 1, reason: `mode=${body.mode} uses no image` });
      await trace.skipStage(job.jobId, { stage: 2, reason: `mode=${body.mode} uses no image` });
      await trace.skipStage(job.jobId, { stage: 3, reason: `mode=${body.mode} uses no image` });
    }
    
    // Stage 4: semantic-planning-ir
    const s4 = await trace.runStage(job.jobId, {
      stage: 4,
      run: async () => {
        // The wireframe path's IR is already assembled by perceiveOrDegrade — that is
        // what §12's named sub-objects are for, and reassembling them here would be a
        // second implementation of the split T-058 already owns and tests.
        const wireframeIr = usesWireframe ? perceived.ir : null;
        const promptIr = usesPrompt
          ? await promptToIrHosted(body.prompt, { pageName, sectionName })
          : null;

        // §14 and AGENTS.md: the pasted component is PARSED, never executed. codeToIr
        // reads an AST and nothing in this path can reach `eval`, `new Function` or
        // `vm`. Its warnings carry into the job because a code run that quietly used
        // the reference template for six of seven elements must be readable as such.
        let codeIr = null;
        if (usesCode) {
          try {
            codeIr = await codeToIr(body.code, { pageName, sectionName });
          } catch (err) {
            // Captured rather than matched on later. runStage keeps only a thrown
            // error's MESSAGE, so recovering "was this a parse failure or a bug"
            // downstream would mean substring-matching our own prose — which is
            // fine until somebody rewords the message and a 422 silently becomes
            // a 500.
            if (err instanceof CodeNotUnderstood) codeFailure = err.message;
            throw err;
          }
          for (const warning of codeIr.warnings || []) writeWarnings.push(warning);
          delete codeIr.warnings;
        }

        // §6's conflict order lives in resolveConflicts and nowhere else: prompt wins
        // for copy, colour, CTA behaviour and card count; wireframe wins for spatial
        // layout; code wins for technical patterns. That module was built at T-061 and
        // had zero callers until T-119.
        const supplied = [promptIr, wireframeIr, codeIr].filter(Boolean);
        let ir;
        if (supplied.length > 1) {
          const merged = resolveConflicts({ promptIr, wireframeIr, codeIr });
          if (!merged) throw new Error('conflict resolution produced no IR');
          for (const warning of merged.warnings || []) writeWarnings.push(warning);
          ir = merged;
          delete ir.warnings;
        } else {
          ir = supplied[0] || null;
        }
        if (!ir) throw new Error(`mode=${body.mode} produced no IR`);
        ir.sectionId = sectionId;
        
        // Allocate IDs for elements
        for (const el of ir.elements) {
          el.fieldId = await store.allocateId('element');
        }
        
        // Allocate IDs for cards
        if (ir.cards && ir.cards.items) {
          for (const item of ir.cards.items) {
            for (let i = 1; i <= ir.cards.fieldsPerItem; i++) {
              if (item[`field${i}`] !== undefined) {
                item[`fieldId${i}`] = await store.allocateId('cardField');
              }
            }
          }
        }
        
        return ir;
      }
    });

    if (s4.status === 'failed' || !s4.output) {
      // A CODE INPUT WE CANNOT READ IS THE CALLER'S 422, NOT OUR 500. §13 gives
      // 422 to a parse failure, and the distinction is worth the four lines: a
      // 500 says "we broke" and sends the reader to our logs, while this says
      // "that component has no §7 element markers in it" and sends them to the
      // one thing they can actually change. The reason is carried on the stage
      // record's warnings, which is where runStage puts a thrown message.
      if (codeFailure) {
        return { status: STATUS.UNPROCESSABLE, body: error('PARSE_FAILURE', codeFailure) };
      }
      throw new Error('Stage 4 failed to produce an IR');
    }
    const ir = s4.output;
    
    // Write to DB - SECTION FIRST to avoid orphaned elements
    const sectionDoc = {
      sectionName: ir.sectionName,
      sectionId: ir.sectionId,
      pageName: ir.pageName,
      platform: 'Website',
      status: 'Pending',
      jobId: job.jobId,
      prompt: body.prompt || '',
      // §2 REQUIRES `variations`, PLURAL, AND A STRING. This handler wrote `variation`
      // and nothing noticed, because sectionValidator.js was built at T-020 and called
      // by nobody -- the first run with it wired refused the document on the missing
      // field. promptToIrKeyless and perceiveAndAssembleIr both produce `variations`
      // correctly; only the hand-built document here diverged.
      //
      // THE SINGULAR IS KEPT AS AN ALIAS, deliberately and temporarily. regenerate.js,
      // replay.js and the client's PreviewPage all read `section.variation`, none of
      // them is in this task's files, and dropping it would build the preview's
      // generated filename as `-vundefined.jsx`. Both are written until one task can
      // migrate every reader and delete the alias. Logged rather than left quiet.
      variations: String(ir.variations || '1'),
      variation: '1',
      designTokens: ir.designTokens,
      fieldIds: ir.elements.map(e => e.fieldId)
    };
    // §2, at the one moment it matters. sectionValidator.js (T-020) existed and was
    // called by nothing, so nothing checked the shape at the point it was persisted.
    assertValid(validateSection(sectionDoc), 'the section document');
    await store.insertSection(sectionDoc);
    
    // Then elements
    for (const el of ir.elements) {
      const elementDoc = {
        fieldId: el.fieldId,
        sectionId: ir.sectionId,
        jobId: job.jobId,
        elementName: el.elementName,
        contentType: el.contentType,
        tag: el.tag,
        order: el.order,
        content: el.default,
        css: safeCss(el.css, el.elementName, writeWarnings),
        // §3 REQUIRES ALL THREE and this handler emitted none of them, because
        // elementValidator.js (T-021) was built and never called on the document being
        // written. `loop` is null for everything that is not a Cards element -- §3
        // makes it required, not optional, so setting it only for cards left every
        // other element a field short.
        //
        // T-109 DEFERRED THIS, and the reason it could not land then is worth keeping:
        // adding `pageName` failed the §9 store-liveness assertion. The cause was not
        // §3 and not the hydration path -- it was that the seed inserted hardcoded ids
        // without advancing the allocator, so the first generated section duplicated
        // every seeded id. `pageName` merely made the duplicates visible to
        // hydrateElements, which filters on it. T-111 fixed the seed; this is now safe.
        loop: null,
        projectName: PROJECT_NAME,
        pageName: ir.pageName
      };
      
      if (el.contentType === 'Cards' && ir.cards) {
        elementDoc.content = null; // Cards don't have text content
        elementDoc.loop = ir.cards.items;
      }
      
      // §3, at the one moment it matters -- the same argument as the section above.
      assertValid(validateElement(elementDoc), `the element document for ${el.elementName}`);
      await store.insertElement(elementDoc);
    }
    
    // Stage 5: code-generation-assembly
    const s5 = await trace.runStage(job.jobId, {
      stage: 5,
      run: async () => {
        return emitComponent(ir);
      },
      outputExt: 'jsx'
    });
    
    if (s5.status === 'failed' || !s5.output) {
      throw new Error('Stage 5 failed to emit component');
    }
    
    // ---- stage 6: validation-qa -------------------------------------------
    //
    // WHY THIS EXISTS. runStage was called for 1, 2, 3, 4, 5 and 7 and never for 6, so
    // quality/score.js -- which looks for `job.stages.find(s => s.stage === 6)` -- fell
    // back to `structurePass: false` and `eslintErrors: 0` for every job ever scored.
    // The 0-100 number T-091 surfaces was not a measurement of anything.
    //
    // USES validateAndRecover's OWN check, which implements §18.2's parse-then-lint
    // rule including "an ESLint error -- warnings do not count", rather than a second
    // implementation of the same rule that can drift from it. That module had zero
    // callers too.
    //
    // A STRUCTURAL FAILURE IS A DEGRADED STAGE AND A SUCCESSFUL JOB. §18.2's whole
    // point is that the job still succeeds; marking it failed would stop a generation
    // over a lint error and take the demo with it.
    const { check } = createValidateAndRecover();
    await trace.runStage(job.jobId, {
      stage: 6,
      run: async (ctxStage) => {
        const result = await check(s5.output);
        for (const warning of result.warnings || []) ctxStage.addWarning(warning);
        if (!result.ok) {
          ctxStage.addWarning(`§18.2 ${result.kind}: ${result.error}`);
        }
        // The shape computeJobScore already reads. The visual metrics need a rendered
        // page and a browser; it is not measured here and keeps its documented fallback.
        const axeViolations = await measureAccessibility(s5.output);
        if (axeViolations !== null && axeViolations > 0) {
          ctxStage.addWarning(`axe-core: ${axeViolations} serious/critical accessibility violation(s) found.`);
        }
        
        const measured = ['structurePass', 'eslintErrors'];
        const notMeasured = ['visualSimilarity'];
        
        if (axeViolations !== null) {
          measured.push('axeSeriousViolations');
        } else {
          notMeasured.push('axeSeriousViolations');
        }

        return {
          structurePass: result.ok === true,
          eslintErrors: result.ok === false && result.kind === 'lint-error' ? 1 : 0,
          axeSeriousViolations: axeViolations,
          measured,
          notMeasured,
        };
      },
      outputName: 'validation-qa'
    });

    // Stage 7: output-delivery (Write file to disk)
    await trace.runStage(job.jobId, {
      stage: 7,
      run: async () => {
        // The path is RECORDED, not just written. routes/artifacts.js serves the
        // emitted source from `job.componentFile`, and nothing was setting it — so
        // GET /api/jobs/:id/component answered "generation not complete" about a
        // job whose file was sitting on disk. Written and unreachable, which is
        // this project's recurring shape.
        const written = await writeComponentFile({
          sectionName: ir.sectionName,
          sectionId: ir.sectionId,
          variation: '1',
          source: s5.output
        });
        if (typeof written === 'string' && written.trim()) {
          await jobStore.setComponentFile(job.jobId, written);
        }
        return { success: true, componentFile: written ?? null };
      }
    });
    
    // §11.1's terminal status. `setStatus` existed on the job store and NOTHING
    // CALLED IT: every job was created "queued" and stayed queued for ever, so the
    // Glass Box showed a finished seven-stage run as still waiting to start. The
    // same shape as five other defects this week — the API was built, and the call
    // was never made.
    await jobStore.setStatus(job.jobId, 'succeeded');

    // Refetch job to return it updated
    const finalJob = await jobStore.getJob(job.jobId);
    
    // §12: degradation is part of the contract, not an afterthought. A caller that
    // cannot tell a wireframe-derived section from a template-derived one has no way
    // to know the upload was ignored, and the job record alone does not say.
    const payload = { job: finalJob };
    const allWarnings = [...perceptionWarnings, ...writeWarnings];
    if (allWarnings.length) payload.warnings = allWarnings;
    if (perceived && perceived.stageStatus === STAGE_DEGRADED) payload.degraded = true;

    return {
      status: STATUS.OK,
      body: ok(payload)
    };
    
  } catch (err) {
    if (job && job.jobId) {
      // A job that died is `failed`, not `queued`. Best effort: if the store is
      // what broke, there is nothing useful to record and the 500 below is the
      // honest answer.
      try {
        await jobStore.setStatus(job.jobId, 'failed');
      } catch {
        /* the store is unavailable; the response still reports the failure */
      }
    }
    if (job && job.jobId) {
      // Best effort trace the failure if we failed outside a stage? 
      // The prompt doesn't ask for a specific stage failure recording for top level errors,
      // but we return 500.
    }
    return { status: 500, body: error('INTERNAL_ERROR', err.message) };
  }
}
