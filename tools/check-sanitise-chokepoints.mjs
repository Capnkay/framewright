import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const UTILS_DIR = path.join(REPO_ROOT, 'client', 'src', 'utils');
const GENERATED_DIR = path.join(REPO_ROOT, 'client', 'src', 'sections', 'generated');

// Scan for data?.[id] || fallback pattern
// This regex looks for either `data?.[id] ||` or `(data && data[id]) ||`
const PATTERN = /(data\??\.\[[^\]]+\]\s*\|\||\(data\s*&&\s*data\[[^\]]+\]\)\s*\|\|)/g;

function checkFile(filePath, isAllowed) {
  if (!fs.existsSync(filePath)) return true;
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = [...content.matchAll(PATTERN)];
  
  if (isAllowed) {
    if (matches.length !== 1) {
      console.error(`FAIL: Expected exactly 1 match in ${filePath}, found ${matches.length}`);
      return false;
    }
  } else {
    if (matches.length > 0) {
      console.error(`FAIL: Found forbidden pattern in ${filePath}`);
      return false;
    }
  }
  return true;
}

let pass = true;
pass = checkFile(path.join(UTILS_DIR, 'getHtml.js'), true) && pass;

if (fs.existsSync(GENERATED_DIR)) {
  for (const file of fs.readdirSync(GENERATED_DIR)) {
    pass = checkFile(path.join(GENERATED_DIR, file), false) && pass;
  }
}
pass = checkFile(path.join(REPO_ROOT, 'server', 'src', 'generate', 'emitComponent.js'), false) && pass;

if (!pass) {
  process.exit(1);
}
console.log('PASS: Exactly one read-side call site for the raw pattern, and it lives inside getHtml.js');
