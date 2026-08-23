import { STATUS, ok, badRequest, error, notImplemented } from '../http/envelope.js';
import { createStore } from '../store/index.js';
import { createJobStore } from '../jobs/jobStore.js';
import createStageTrace, { artifactRootFrom } from '../jobs/stageTrace.js';
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
  let body = ctx.body || {};
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
  // REBIND, do not merely publish -- the same fix generate.js already carries, and its
  // comment explains why: assigning ctx.body alone leaves every line below reading the
  // RAW object, so the sanitised prompt is computed and then discarded and body.prompt
  // reaches the IR builder unsanitised. That is the §8 write-side chokepoint running
  // and having no effect. This file had the bug generate.js documents.
  body = cleaned.body;
  ctx.body = body;

  if (body.mode !== 'prompt') {
    // `STATUS.NOT_IMPLEMENTED` DOES NOT EXIST. envelope.js exports 501 as a standalone
    // `NOT_IMPLEMENTED`, kept out of STATUS deliberately because it is not a contract
    // status code -- so this expression was `undefined` and the handler answered with
    // no status at all. The same bug was found in generate.js at T-108; this file was
    // outside that task's files and still carried it.
    //
    // `notImplemented` is envelope.js's own helper and nothing was using it. A fourth
    // hand-built literal is how the first three drifted.
    return notImplemented('T-041', `mode=${body.mode} on regenerate`);
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

  const allElements = await store.findElements({ sectionId });
  const elementsByName = {};
  for (const el of allElements) {
    elementsByName[el.elementName] = el;
  }

  const jobStore = createJobStore(env.JOB_STORE_PATH ? { filePath: env.JOB_STORE_PATH } : undefined);
  // §11.2's root by default; `ARTIFACT_ROOT` in the env moves it. Job ids
  // restart at 1 in every isolated store, so two callers with their own job
  // stores and one shared root write over each other's stage outputs (T-120).
  const trace = createStageTrace({ jobStore, artifactRoot: artifactRootFrom(env) });

  let job;
  try {
    job = await jobStore.createJob({ mode: body.mode, pageName, sectionId });

    // Skip image stages for prompt mode
    await trace.skipStage(job.jobId, { stage: 1, reason: 'mode=prompt uses no image' });
    await trace.skipStage(job.jobId, { stage: 2, reason: 'mode=prompt uses no image' });
    await trace.skipStage(job.jobId, { stage: 3, reason: 'mode=prompt uses no image' });
    
    let preservedIds = {};
    let newIds = [];

    // Stage 4: semantic-planning-ir
    const s4 = await trace.runStage(job.jobId, {
      stage: 4,
      run: async () => {
        const ir = await promptToIrHosted(body.prompt, { pageName, sectionName, variations: nextVariation });
        ir.sectionId = sectionId;
        
        // §13.3: idPolicy.mode is forced to preserve
        ir.idPolicy = ir.idPolicy || {};
        ir.idPolicy.mode = 'preserve';
        
        for (const el of ir.elements) {
          const existing = elementsByName[el.elementName];
          if (existing && existing.fieldId) {
            el.fieldId = existing.fieldId;
            preservedIds[el.elementName] = existing.fieldId;
            if (el.contentType !== 'Cards') {
              el.default = existing.content;
              el.css = existing.css;
            }
          } else {
            el.fieldId = await store.allocateId('element');
            newIds.push(el.fieldId);
          }
        }
        
        if (ir.cards && ir.cards.items) {
          const cardsElName = ir.cards.of || 'statBadges';
          const existingCards = elementsByName[cardsElName];
          const existingLoop = existingCards && existingCards.loop ? existingCards.loop : [];
          
          for (let index = 0; index < ir.cards.items.length; index++) {
            const item = ir.cards.items[index];
            const existingItem = existingLoop[index];
            
            for (let i = 1; i <= ir.cards.fieldsPerItem; i++) {
              if (item[`field${i}`] !== undefined) {
                if (existingItem && existingItem[`fieldId${i}`]) {
                  item[`fieldId${i}`] = existingItem[`fieldId${i}`];
                  item[`field${i}`] = existingItem[`field${i}`];
                } else {
                  const newId = await store.allocateId('cardField');
                  item[`fieldId${i}`] = newId;
                  newIds.push(newId);
                }
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
      // §2 REQUIRES `variations`, PLURAL AND A STRING. T-109 found the same divergence
      // in generate.js: a regenerated section was persisted in a shape its own schema
      // rejects. The singular stays as an alias because regenerate, replay and the
      // client's PreviewPage all read it -- see T-109's note; one task migrates all of
      // them and deletes the alias.
      variations: String(nextVariation),
      variation: nextVariation,
      prompt: body.prompt || existingSection.prompt,
      designTokens: ir.designTokens,
      fieldIds: ir.elements.map(e => e.fieldId) // base semantics: replace fieldIds
    };
    
    await store.updateSection(sectionId, updatedSection);
    
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
      
      const isPreserved = Object.values(preservedIds).includes(el.fieldId);
      if (isPreserved) {
        await store.updateElement(el.fieldId, elementDoc);
      } else {
        await store.insertElement(elementDoc);
      }
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
    
    // §11.1's terminal status. T-138 fixed this in generate.js and it never
    // reached here: a regenerate that ran every stage still reported "queued",
    // so the Glass Box showed a finished run as waiting to start. Two routes,
    // one omission, and only one of them was in that task's files list.
    await jobStore.setStatus(job.jobId, 'succeeded');

    const finalJob = await jobStore.getJob(job.jobId);
    
    const safeName = String(ir.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
    const filename = `${safeName}-${ir.sectionId}-v${nextVariation}.jsx`;
    
    return {
      status: STATUS.OK,
      body: ok({
        jobId: job.jobId,
        sectionId: ir.sectionId,
        componentFile: `src/sections/generated/${filename}`,
        preservedIds,
        newIds,
        warnings: [],
        job: finalJob
      })
    };
    
  } catch (err) {
    return { status: 500, body: error('INTERNAL_ERROR', err.message) };
  }
}
