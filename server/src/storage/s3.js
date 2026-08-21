import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const KEY_ROOTS = ['uploads/', 'artifacts/'];

function validateKey(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('storage: key must be a non-empty string');
  }
  if (key.includes('\\')) {
    throw new Error(`storage: key must use forward slashes: ${key}`);
  }
  if (!KEY_ROOTS.some((root) => key.startsWith(root))) {
    throw new Error(`storage: key must start with uploads/ or artifacts/: ${key}`);
  }
  if (key.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) {
    throw new Error(`storage: key must not contain traversal segments: ${key}`);
  }
}

export function createS3Storage(env, overrideClient) {
  const baseUrl = env.VITE_STORAGE_URL || 'http://localhost:5000/storage/';
  const bucket = env.S3_BUCKET;

  const client = overrideClient || new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: 'auto', // MinIO often accepts any region, but we supply one.
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true, // Typically required for MinIO/compatible backends
  });

  return {
    async putObject(key, bytes, contentType) {
      validateKey(key);
      
      let mimeType = contentType;
      if (!mimeType) {
        if (key.endsWith('.png')) mimeType = 'image/png';
        else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (key.endsWith('.webp')) mimeType = 'image/webp';
        else if (key.endsWith('.json')) mimeType = 'application/json';
        else if (key.endsWith('.txt')) mimeType = 'text/plain';
        else mimeType = 'application/octet-stream';
      }

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: mimeType
      });
      await client.send(command);
      
      let url = baseUrl;
      if (!url.endsWith('/')) url += '/';
      url += key;

      return { key, url };
    },
    
    async getObject(key) {
      validateKey(key);
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      try {
        const response = await client.send(command);
        const bytes = await response.Body.transformToByteArray();
        
        return { 
          bytes: Buffer.from(bytes), 
          contentType: response.ContentType || 'application/octet-stream' 
        };
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
          return null;
        }
        throw err;
      }
    },
    
    async deleteObject(key) {
      validateKey(key);
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      });

      try {
        await client.send(command);
      } catch (err) {
        // According to S3 semantics, deleting a non-existent object succeeds.
        throw err;
      }
    }
  };
}
