// server/src/generate/writeComponentFile.js
//
// Component-file write path — T-028, CONTRACT.md §7.
//
// The API writes generated component files to:
//   client/src/sections/generated/<SectionName>-<sectionId>-v<variation>.jsx
//
// The filename is intentionally non-fixed:
//   - Two variations of the same section get different filenames.
//   - Generating variation 2 never overwrites variation 1.
//   - Vite's eager glob discovers all files in that directory at build time.
//
// This module is the single writer for that path. Nothing else in the API
// may write to client/src/sections/generated/ directly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Absolute path to the repo root (server/src/generate → up 3 levels).
//
// IT WAS FOUR. The comment above has always said three and the code passed four, so
// REPO_ROOT resolved to the PARENT of the repository and every component this project
// generated was written outside it. PreviewPage.jsx discovers sections with
// import.meta.glob('../sections/generated/*.jsx'), which cannot see outside the tree --
// so no generated section has ever been previewable, and every one of them rendered the
// "file was not found by Vite eager-glob" branch instead.
//
// Nothing failed. The write succeeded, the job reported ok, stage 7 recorded success,
// and the file existed -- one directory too high. Found by running the demo and looking
// for the file, which is the only way it could have been found.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const GENERATED_DIR = path.join(REPO_ROOT, 'client', 'src', 'sections', 'generated');

/**
 * buildComponentFilename(sectionName, sectionId, variation) → filename string
 *
 * Returns the canonical filename (basename only, no directory) for a generated
 * component. CONTRACT.md §7:
 *   client/src/sections/generated/<SectionName>-<sectionId>-v<variation>.jsx
 *
 * sectionName is sanitised to remove characters that are illegal in filenames
 * or confusing in import paths (anything not alphanumeric or underscore).
 *
 * @param {string} sectionName  e.g. "PulseFitHero" or "Custom"
 * @param {string} sectionId    10-digit section ID string, e.g. "1000000001"
 * @param {string|number} variation  "1", "2", 1, 2 …
 * @returns {string}  e.g. "PulseFitHero-1000000001-v1.jsx"
 */
export function buildComponentFilename(sectionName, sectionId, variation) {
  const safeName = String(sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
  return `${safeName}-${sectionId}-v${variation}.jsx`;
}

/**
 * buildComponentPath(sectionName, sectionId, variation) → absolute path
 *
 * Returns the full absolute path to the generated file.
 */
export function buildComponentPath(sectionName, sectionId, variation) {
  return path.join(GENERATED_DIR, buildComponentFilename(sectionName, sectionId, variation));
}

/**
 * writeComponentFile({ sectionName, sectionId, variation, source })
 *
 * Writes the emitted JSX source to the correct path under
 * client/src/sections/generated/. Creates the directory if it does not exist.
 *
 * Returns the absolute path of the written file so the caller can store it
 * in the job record and surface it via GET /api/jobs/:jobId/component.
 *
 * @param {object} opts
 * @param {string} opts.sectionName   Human section name (sanitised internally)
 * @param {string} opts.sectionId     10-digit ID string
 * @param {string|number} opts.variation  "1" or "2" (string or number, both OK)
 * @param {string} opts.source        JSX source string from emitComponent()
 * @returns {string}  Absolute path of the written file
 * @throws  If source is empty or sectionId is missing
 */
export function writeComponentFile({ sectionName, sectionId, variation, source }) {
  if (!sectionId) throw new Error('writeComponentFile: sectionId is required');
  if (!source || typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('writeComponentFile: source must be a non-empty string');
  }

  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const filePath = buildComponentPath(sectionName, sectionId, variation);
  fs.writeFileSync(filePath, source, 'utf8');

  return filePath;
}

/**
 * componentFileExists(sectionName, sectionId, variation) → boolean
 *
 * Returns true if the component file for the given sectionId + variation
 * already exists on disk. Used by replay to skip the write when the file
 * is already in place.
 */
export function componentFileExists(sectionName, sectionId, variation) {
  try {
    fs.accessSync(buildComponentPath(sectionName, sectionId, variation), fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
