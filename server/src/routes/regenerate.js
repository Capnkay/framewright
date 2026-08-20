import { STATUS, ok, badRequest, error } from '../http/envelope.js';
import { createStore } from '../store/index.js';
import { createJobStore } from '../jobs/jobStore.js';
import createStageTrace from '../jobs/stageTrace.js';
import promptToIrHosted from '../generate/promptToIrHosted.js';
import { emitComponent } from '../generate/emitComponent.js';
import { writeComponentFile } from '../generate/writeComponentFile.js';
import { sanitiseGenerateBody } from '../sanitise/sanitiseWrite.js';

const TEN_DIGITS = /^[0-9]{10}$/;
function isSectionId(value) {
  return typeof value === 'string' && TEN_DIGITS.test(value) && value.startsWith('1');
}

export async function postRegenerate(ctx = {}) {
  const env = ctx.env || {};
  const { sectionId } = ctx.params || {};
  const body = ctx.body || {};
  const files = ctx.files || {};

  if (!isSectionId(sectionId)) {
    return badRequest('sectionId must be a 10-digit string in the 1… range (§1).');
  }

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
    return { status: STATUS.NOT_IMPLEMENTED, body: { ok: false, error: { code: 'NOT_IMPLEMENTED', message: `T-041: mode=${body.mode} not implemented yet` } } };
  }

  const store = createStore(env);
  
  // 1. Fetch existing section
  const existingSection = await store.findSection(sectionId);
  if (!existingSection) {
    return { status: STATUS.NOT_FOUND, body: error('NOT_FOUND', `Section ${sectionId} not found`) };
  }
  
  const pageName = existingSection.pageName || 'Home';
  const sectionName = existingSection.sectionName || 'Custom';
  // Parse existing variations or default to 1, then increment
  const currentVariations = parseInt(existingSection.variation || '1', 10);
  const nextVariation = body.variation ? String(body.variation) : String(currentVariations + 1);

  const jobStore = createJobStore(env.JOB_STORE_PATH ? { filePath: env.JOB_STORE_PATH } : undefined);
  const trace = createStageTrace({ jobStore });

  let job;
  try {
    job = await jobStore.createJob({ mode: body.mode, pageName, sectionId });

    // Skip image stages for prompt mode
    await trace.skipStage(job.jobId, { stage: 1, reason: 'mode=prompt uses no image' });
    await trace.skipStage(job.jobId, { stage: 2, reason: 'mode=prompt uses no image' });
    await trace.skipStage(job.jobId, { stage: 3, reason: 'mode=prompt uses no image' });
    
    // Stage 4: semantic-planning-ir
    const s4 = await trace.runStage(job.jobId, {
      stage: 4,
      run: async () => {
        const ir = await promptToIrHosted(body.prompt, { pageName, sectionName, variations: nextVariation });
        ir.sectionId = sectionId;
        
        // §13.3: idPolicy.mode is forced to preserve
        ir.idPolicy = ir.idPolicy || {};
        ir.idPolicy.mode = 'preserve';
        
        // At this base step, we don't fully implement T-062/T-063 preserve semantics for IDs.
        // But the IR shape must match.
        // Wait, T-041's doneWhen says: "The sectionId does not change; variations is updated in place; idPolicy.mode is forced to preserve for this call."
        // We will just allocate new IDs for everything that doesn't have an ID.
        // For base semantics, T-062 isn't implemented so applyIdPolicy doesn't exist yet,
        // but we must not leave elements without fieldId.
        
        for (const el of ir.elements) {
          if (!el.fieldId) {
            el.fieldId = await store.allocateId('element');
          }
        }
        
        if (ir.cards && ir.cards.items) {
          for (const item of ir.cards.items) {
            for (let i = 1; i <= ir.cards.fieldsPerItem; i++) {
              if (item[`field${i}`] !== undefined && !item[`fieldId${i}`]) {
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
    
    // Update the existing section in place
    const updatedSection = {
      ...existingSection,
      variation: nextVariation,
      prompt: body.prompt || existingSection.prompt,
      designTokens: ir.designTokens,
      fieldIds: ir.elements.map(e => e.fieldId) // base semantics: replace fieldIds
    };
    
    await store.updateSection(sectionId, updatedSection);
    
    // Insert new elements (this is naive base semantics, T-062 handles the real 'keep')
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
        elementDoc.content = null;
        elementDoc.loop = ir.cards.items;
      }
      
      // We just insert them all. T-062 will update this to find/update existing elements.
      await store.insertElement(elementDoc);
    }
    
    // Stage 5: code-generation-assembly
    const s5 = await trace.runStage(job.jobId, {
      stage: 5,
      run: async () => emitComponent(ir),
      outputExt: 'jsx'
    });
    
    if (s5.status === 'failed' || !s5.output) {
      throw new Error('Stage 5 failed to emit component');
    }
    
    // Stage 7: output-delivery
    await trace.runStage(job.jobId, {
      stage: 7,
      run: async () => {
        await writeComponentFile({
          sectionName: ir.sectionName,
          sectionId: ir.sectionId,
          variation: nextVariation,
          source: s5.output
        });
        return { success: true };
      }
    });
    
    const finalJob = await jobStore.getJob(job.jobId);
    
    return {
      status: STATUS.OK,
      body: ok({ job: finalJob })
    };
    
  } catch (err) {
    return { status: 500, body: error('INTERNAL_ERROR', err.message) };
  }
}
