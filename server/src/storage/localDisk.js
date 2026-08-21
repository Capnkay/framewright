import fs from 'node:fs/promises';
import path from 'node:path';

// §15.2 rule 2: "Keys are the paths §11.2 and §13.1 already define" —
// `uploads/<jobId>.<ext>` and `artifacts/<jobId>/<stage>-<name>.<ext>`.
// Nothing else is a legal key. Without this check `path.resolve(repoRoot, key)`
// happily accepts `../../x` or an absolute path and reads or writes anywhere on
// the disk, which is a write-anywhere primitive on any key derived from job
// input. Fails closed: an unrecognised key throws rather than being sanitised
// into some neighbouring path the caller did not ask for.
// A literal backslash, named rather than escaped inline so the check reads clearly.
const BACKSLASH = String.fromCharCode(92);
const KEY_ROOTS = ['uploads/', 'artifacts/'];

function resolveKey(repoRoot, key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('storage: key must be a non-empty string');
  }
  if (key.includes(BACKSLASH)) {
    throw new Error(`storage: key must use forward slashes: ${key}`);
  }
  if (!KEY_ROOTS.some((root) => key.startsWith(root))) {
    throw new Error(`storage: key must start with uploads/ or artifacts/: ${key}`);
  }
  if (key.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) {
    throw new Error(`storage: key must not contain traversal segments: ${key}`);
  }
  if (path.isAbsolute(key)) {
    throw new Error(`storage: key must be relative: ${key}`);
  }
  const absPath = path.resolve(repoRoot, key);
  // Belt and braces: even if a shape slips past the checks above, the resolved
  // path must still land inside the repo root.
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`storage: key escapes the storage root: ${key}`);
  }
  return absPath;
}

export function createLocalDiskStorage(env) {
  // `VITE_STORAGE_URL` remains the single read root, trailing slash intact (§15.2 rule 3, §14)
  const baseUrl = env.VITE_STORAGE_URL || 'http://localhost:5000/storage/';

  // The cwd is the repo root.
  const repoRoot = process.cwd();

  return {
    async putObject(key, bytes, contentType) {
      const absPath = resolveKey(repoRoot, key);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, bytes);
      
      let url = baseUrl;
      if (!url.endsWith('/')) url += '/';
      url += key;

      return { key, url };
    },
    
    async getObject(key) {
      const absPath = resolveKey(repoRoot, key);
      try {
        const bytes = await fs.readFile(absPath);
        
        let contentType = 'application/octet-stream';
        if (key.endsWith('.png')) contentType = 'image/png';
        else if (key.endsWith('.jpg') || key.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (key.endsWith('.webp')) contentType = 'image/webp';
        else if (key.endsWith('.json')) contentType = 'application/json';
        else if (key.endsWith('.txt')) contentType = 'text/plain';

        return { bytes, contentType };
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
    
    async deleteObject(key) {
      const absPath = resolveKey(repoRoot, key);
      try {
        await fs.unlink(absPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  };
}
