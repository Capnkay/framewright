import { createLocalDiskStorage } from './localDisk.js';

export function createStorage(env = process.env) {
  // §15.2: "Two implementations: local disk under uploads/ and artifacts/ (the default...) 
  // and S3-compatible object storage ... selected by S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY."
  
  if (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    // The S3-compatible backend is T-083. Fail loudly rather than silently
    // falling back to local disk: a machine configured for S3 that quietly
    // wrote to local disk would lose every artifact on the next deploy.
    throw new Error('storage: the S3 backend is not implemented yet (T-083)');
  }

  // Default is local disk
  return createLocalDiskStorage(env);
}
