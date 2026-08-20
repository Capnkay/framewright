import { STATUS, ok, badRequest, error } from '../http/envelope.js';
import { createStore } from '../store/index.js';
import { createJobStore } from '../jobs/jobStore.js';
import createStageTrace from '../jobs/stageTrace.js';
import promptToIrHosted from '../generate/promptToIrHosted.js';
import { emitComponent } from '../generate/emitComponent.js';
import { writeComponentFile } from '../generate/writeComponentFile.js';
import { sanitiseGenerateBody } from '../sanitise/sanitiseWrite.js';

export async function postGenerate(ctx = {}) {
  const env = ctx.env || {};
  const body = ctx.body || {};
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
  ctx.body = cleaned.body;

  if (body.mode !== 'prompt') {
    return { status: STATUS.NOT_IMPLEMENTED, body: { ok: false, error: { code: 'NOT_IMPLEMENTED', message: `T-033: mode=${body.mode} not implemented yet` } } };
  }

  const store = createStore(env);
  const jobStore = createJobStore(env.JOB_STORE_PATH ? { filePath: env.JOB_STORE_PATH } : undefined);
  const trace = createStageTrace({ jobStore });

  let job;
  try {
    const pageName = body.pageName || 'Home';
    const sectionName = body.sectionName || 'Custom';
    
    // Allocate section ID early so we can put it in the job and the IR
    const sectionId = await store.allocateId('section');
    
    job = await jobStore.createJob({ mode: 'prompt', pageName, sectionId });
    
    // Skip image stages
    await trace.skipStage(job.jobId, { stage: 1, reason: 'mode=prompt uses no image' });
    await trace.skipStage(job.jobId, { stage: 2, reason: 'mode=prompt uses no image' });
    await trace.skipStage(job.jobId, { stage: 3, reason: 'mode=prompt uses no image' });
    
    // Stage 4: semantic-planning-ir
    const s4 = await trace.runStage(job.jobId, {
      stage: 4,
      run: async () => {
        const ir = await promptToIrHosted(body.prompt, { pageName, sectionName });
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
      variation: '1',
      designTokens: ir.designTokens,
      fieldIds: ir.elements.map(e => e.fieldId)
    };
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
        css: el.css || null
      };
      
      if (el.contentType === 'Cards' && ir.cards) {
        elementDoc.content = null; // Cards don't have text content
        elementDoc.loop = ir.cards.items;
      }
      
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
    
    // Stage 7: output-delivery (Write file to disk)
    await trace.runStage(job.jobId, {
      stage: 7,
      run: async () => {
        await writeComponentFile({
          sectionName: ir.sectionName,
          sectionId: ir.sectionId,
          variation: '1',
          source: s5.output
        });
        return { success: true };
      }
    });
    
    // Refetch job to return it updated
    const finalJob = await jobStore.getJob(job.jobId);
    
    return {
      status: STATUS.OK,
      body: ok({ job: finalJob })
    };
    
  } catch (err) {
    if (job && job.jobId) {
      // Best effort trace the failure if we failed outside a stage? 
      // The prompt doesn't ask for a specific stage failure recording for top level errors,
      // but we return 500.
    }
    return { status: 500, body: error('INTERNAL_ERROR', err.message) };
  }
}
