import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('HeroSection.jsx satisfies R1-R5 and R11-R12 (T-011)', () => {
  const source = read('client/src/sections/generated/HeroSection.jsx');

  // R1 — ids declaration (golden component imports it from logic file)
  assert.match(source, /import\s+\{\s*[^}]*\bids\b[^}]*\}\s+from\s+['"]\.\/HeroSection\.logic\.js['"]/, 'R1: HeroSection must import ids (which declares them)');
  
  // R2 — pageName prop
  assert.match(source, /HeroSection\s*\(\s*\{\s*pageName\s*=\s*['"]Home['"]/, 'R2: must accept pageName prop defaulting to Home');
  
  // R3 — dispatch fetchElementsByIds on mount
  assert.match(source, /useEffect\(\s*\(\)\s*=>\s*\{[^}]*dispatch\(fetchElementsByIds/, 'R3: must dispatch fetchElementsByIds inside useEffect (on mount)');
  
  // R4 — read live values from state.cms.allSections[pageName]
  assert.match(source, /useSelector\(\s*\([^)]*\)\s*=>\s*[^.]*\.cms\.allSections\[pageName\]/, 'R4: must read from state.cms.allSections[pageName]');

  // R5 — every editable node carries id={ids.x} or id={item.fieldIdN}
  assert.match(source, /id=\{ids\.\w+\}/, 'R5: must bind id={ids.x}');
  assert.match(source, /id=\{item\.fieldId\d+\}/, 'R5: must bind id={item.fieldIdN}');

  // R11 — Tailwind layout
  assert.match(source, /className="[^"]*flex-col\s+md:flex-row[^"]*"/, 'R11: must have two columns on desktop, stacked on mobile');
  assert.match(source, /className="[^"]*max-w-[^"]*"/, 'R11: must have max-width container');

  // R12 — dynamicStyle and dynamicStyle2 classes
  assert.match(source, /className="[^"]*dynamicStyle [^"]*"/, 'R12: text and button nodes must have dynamicStyle');
  assert.match(source, /className="[^"]*dynamicStyle2 [^"]*"/, 'R12: images must have dynamicStyle2');
});


