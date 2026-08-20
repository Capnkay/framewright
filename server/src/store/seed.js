import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function seedStore(store) {
  // Restarting the server must not duplicate seed rows
  const existingSection = await store.findSection('1000000001');
  if (existingSection) {
    return;
  }

  const sectionsPath = path.join(__dirname, '../../data/seed/sections.json');
  const elementsPath = path.join(__dirname, '../../data/seed/elements.json');

  const sectionsData = await fs.readFile(sectionsPath, 'utf8');
  const elementsData = await fs.readFile(elementsPath, 'utf8');

  const sections = JSON.parse(sectionsData);
  const elements = JSON.parse(elementsData);

  for (const sec of sections) {
    await store.insertSection(sec);
  }

  for (const el of elements) {
    await store.insertElement(el);
  }
}
