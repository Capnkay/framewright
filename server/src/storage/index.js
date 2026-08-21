import { createLocalDiskStorage } from './localDisk.js';
import { createS3Storage } from './s3.js';

export function createStorage(env = process.env) {
  // A 15.2: "Two implementations: local disk under uploads/ and artifacts/ (the default...) 
  // and S3-compatible object storage ... selected by S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY."
  
  if (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return createS3Storage(env);
  }

  // Default is local disk
  return createLocalDiskStorage(env);
}
