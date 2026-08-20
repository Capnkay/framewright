import { createStore } from '../store/index.js';
import fs from 'node:fs';
import { buildComponentPath } from '../generate/writeComponentFile.js';

export async function getExportZip(ctx = {}) {
  const { sectionId } = ctx.params || {};
  const env = ctx.env || {};
  const store = ctx.store || createStore(env);

  if (!sectionId || !/^[1-9][0-9]{9}$/.test(sectionId)) {
    return { status: 400, body: { ok: false, error: 'Invalid sectionId' } };
  }

  const section = await store.findSection(sectionId);
  if (!section) {
    return { status: 404, body: { ok: false, error: 'Section not found' } };
  }

  const elements = await store.findElements({ sectionId });

  // Find the latest variation component path
  let componentPath = null;
  let componentName = null;
  
  // It says "The downloaded archive contains the component .jsx file"
  // Assuming variation is section.variations count. 
  // Let's try from variations down to 1.
  const variations = section.variations || 1;
  for (let i = variations; i >= 1; i--) {
    const tryPath = buildComponentPath(section.sectionName, section.sectionId, i);
    if (fs.existsSync(tryPath)) {
      componentPath = tryPath;
      const safeName = String(section.sectionName || 'Section').replace(/[^a-zA-Z0-9_]/g, '');
      componentName = `${safeName}-${section.sectionId}-v${i}.jsx`;
      break;
    }
  }

  return {
    // Return a special flag for raw streaming
    stream: true,
    contentType: 'application/zip',
    headers: {
      'Content-Disposition': `attachment; filename="section-${sectionId}.zip"`
    },
    handler: async (req, res) => {
      let archiver;
      try {
        const mod = await import('archiver');
        archiver = mod.default || mod;
      } catch (err) {
        res.status(500).send({ error: 'Failed to load archiver' });
        return;
      }
      const archive = archiver('zip', { zlib: { level: 9 } });

      archive.on('error', (err) => {
        res.status(500).send({ error: err.message });
      });

      // Stream to response
      archive.pipe(res);

      // Append section.json
      archive.append(JSON.stringify(section, null, 2), { name: 'section.json' });

      // Append elements.json
      archive.append(JSON.stringify(elements, null, 2), { name: 'elements.json' });

      // Append the jsx component
      if (componentPath) {
        archive.file(componentPath, { name: componentName });
      }

      archive.finalize();
    }
  };
}
