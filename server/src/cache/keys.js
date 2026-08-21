export const CACHE_TTL = {
  IR: 60 * 60 * 1000,
  RENDER: 60 * 60 * 1000,
  EMBED: 24 * 60 * 60 * 1000,
  PERCEIVE: 24 * 60 * 60 * 1000
};

export const CacheKeys = {
  ir: (jobId) => ({ key: `ir:${jobId}`, ttlMs: CACHE_TTL.IR }),
  render: (sectionId, variation) => ({ key: `render:${sectionId}:v${variation}`, ttlMs: CACHE_TTL.RENDER }),
  embed: (sha256) => ({ key: `embed:${sha256}`, ttlMs: CACHE_TTL.EMBED }),
  perceive: (sha256) => ({ key: `perceive:${sha256}`, ttlMs: CACHE_TTL.PERCEIVE })
};
