// server/src/models/rerank.js
import { embed } from './embedding.js';

function getWords(text) {
  if (typeof text !== 'string') return [];
  return text.toLowerCase().match(/\w+/g) || [];
}

export function lexicalOverlapScore(query, candidate) {
  const qWords = getWords(query);
  if (qWords.length === 0) return 0;
  
  const cWords = getWords(candidate);
  const qSet = new Set(qWords);
  
  let overlap = 0;
  for (const w of cWords) {
    if (qSet.has(w)) overlap += 1;
  }
  
  return overlap;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function rerank(query, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const texts = [query, ...candidates];
  const embeddings = await embed(texts);

  if (!embeddings) {
    // Fall back to lexical overlap scoring when embed returns null
    const ranked = candidates.map((c, index) => {
      return { index, score: lexicalOverlapScore(query, c) };
    });
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  const qVec = embeddings[0];
  const cVecs = embeddings.slice(1);

  const ranked = cVecs.map((vec, index) => {
    return { index, score: cosineSimilarity(qVec, vec) };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
