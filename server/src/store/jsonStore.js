import fs from 'node:fs/promises';

export function createJsonStore(filePath = './server/data/store.json') {
  // Single-writer queue
  let queue = Promise.resolve();

  function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(() => {}); // prevent queue from permanently breaking on error
    return result;
  }

  async function readData() {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { 
          counters: { section: 1000000001, element: 2000000001, cardField: 3000000001 }, 
          sections: [], 
          elements: [] 
        };
      }
      throw err;
    }
  }

  async function writeData(data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    findSections: async ({ pageName } = {}) => {
      const data = await readData();
      let sections = data.sections || [];
      if (pageName) sections = sections.filter(s => s.pageName === pageName);
      return sections;
    },
    
    findSection: async (sectionId) => {
      const data = await readData();
      return (data.sections || []).find(s => s.sectionId === String(sectionId)) || null;
    },
    
    insertSection: (doc) => {
      return enqueue(async () => {
        const data = await readData();
        data.sections = data.sections || [];
        data.sections.push(doc);
        await writeData(data);
        return doc;
      });
    },
    
    updateSection: (sectionId, patch) => {
      return enqueue(async () => {
        const data = await readData();
        const section = (data.sections || []).find(s => s.sectionId === String(sectionId));
        if (!section) return null;
        Object.assign(section, patch);
        await writeData(data);
        return section;
      });
    },
    
    findElements: async ({ pageName, sectionId, fieldIds } = {}) => {
      const data = await readData();
      let elements = data.elements || [];
      if (pageName) elements = elements.filter(e => e.pageName === pageName);
      if (sectionId) elements = elements.filter(e => e.sectionId === String(sectionId));
      if (fieldIds) {
        const ids = fieldIds.map(String);
        elements = elements.filter(e => ids.includes(e.fieldId));
      }
      return elements;
    },
    
    updateElement: (fieldId, patch) => {
      return enqueue(async () => {
        const data = await readData();
        const element = (data.elements || []).find(e => e.fieldId === String(fieldId));
        if (!element) return null;
        Object.assign(element, patch);
        await writeData(data);
        return element;
      });
    },
    
    allocateId: (range) => {
      return enqueue(async () => {
        const data = await readData();
        data.counters = data.counters || { section: 1000000001, element: 2000000001, cardField: 3000000001 };
        
        let val;
        if (range === 'section') val = data.counters.section++;
        else if (range === 'element') val = data.counters.element++;
        else if (range === 'cardField') val = data.counters.cardField++;
        else throw new Error(`Invalid id range: ${range}`);

        await writeData(data);
        return String(val); // Always 10 digits as a string
      });
    }
  };
}
