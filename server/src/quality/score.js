/**
 * Compute the quality score per A 18.1's exact formula.
 *
 * score = 40 * structurePass
 *       + 25 * (1 - min(1, eslintErrors / 10))
 *       + 15 * (visualSimilarity ?? 1.0)
 *       + 15 * (1 - min(1, axeSeriousViolations / 5))
 *       +  5 * confidenceMean
 */
export function computeScore({
  structurePass = false,
  eslintErrors = 0,
  visualSimilarity = null,
  axeSeriousViolations = null,
  confidenceMean = 0.0
} = {}) {
  const structureScore = 40 * (structurePass ? 1 : 0);
  
  const lintPenalty = Math.min(1, eslintErrors / 10);
  const lintScore = 25 * (1 - lintPenalty);
  
  // "visualSimilarity is null - and therefore scored as 1.0 - when no wireframe was supplied."
  const visScore = 15 * (visualSimilarity !== null && visualSimilarity !== undefined ? visualSimilarity : 1.0);
  
  const axePenalty = axeSeriousViolations !== null && axeSeriousViolations !== undefined 
    ? Math.min(1, axeSeriousViolations / 5) 
    : 1.0;
  const axeScore = 15 * (1 - axePenalty);
  
  const confScore = 5 * confidenceMean;

  // Returning rounded or unrounded? A 18.1 says 0-100.
  // We'll return Math.round, though a float is also fine. Let's return Math.round so it's a clean 0-100 number,
  // or we can just return the float. We'll return the float and the caller can format it if needed,
  // or just round it here since it says "One number, 0-100".
  return Math.round(structureScore + lintScore + visScore + axeScore + confScore);
}

/**
 * Extracts validation metrics from a job's stage traces and computes its quality score.
 */
export function computeJobScore(job, stage6ArtifactData = null) {
  if (!job || !Array.isArray(job.stages)) return null;

  // We need structurePass, eslintErrors, visualSimilarity, axeSeriousViolations, confidenceMean
  
  // 1. confidenceMean
  let confSum = 0;
  let confCount = 0;
  for (const stage of job.stages) {
    if (typeof stage.confidence === 'number') {
      confSum += stage.confidence;
      confCount += 1;
    }
  }
  const confidenceMean = confCount > 0 ? confSum / confCount : (job.mode === 'prompt' ? 1.0 : 0.0);

  // Default metrics
  let structurePass = false;
  let eslintErrors = 0;
  let visualSimilarity = job.mode === 'prompt' ? 1.0 : null;
  let axeSeriousViolations = null;

  // 2. Extract from stage 6 (validation-qa)
  const s6 = job.stages.slice().reverse().find(s => s.stage === 6 && s.status !== 'failed');
  if (s6) {
    if (stage6ArtifactData) {
      if (stage6ArtifactData.structurePass !== undefined) structurePass = stage6ArtifactData.structurePass;
      if (stage6ArtifactData.eslintErrors !== undefined) eslintErrors = stage6ArtifactData.eslintErrors;
      if (stage6ArtifactData.visualSimilarity !== undefined) visualSimilarity = stage6ArtifactData.visualSimilarity;
      if (stage6ArtifactData.axeSeriousViolations !== undefined) axeSeriousViolations = stage6ArtifactData.axeSeriousViolations;
    }
    // If not in artifact but in stage warnings/details, we could parse it, but A 18 gates usually store metrics in outputRef.
  }

  // T-091 rule: A prompt-mode job scores visualSimilarity as 1.0, not 0
  if (job.mode === 'prompt') {
    visualSimilarity = 1.0;
  }

  return computeScore({
    structurePass,
    eslintErrors,
    visualSimilarity,
    axeSeriousViolations,
    confidenceMean
  });
}

