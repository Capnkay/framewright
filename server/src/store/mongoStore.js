import { MongoClient } from 'mongodb';

// The seeded reference section, spared by deleteSections — see jsonStore.js.
const SEEDED_SECTION_ID = '1000000001';

export function createMongoStore(uri = 'mongodb://localhost:27017/framewright') {
  const client = new MongoClient(uri);
  const dbPromise = client.connect().then(c => c.db());

  async function getCollection(name) {
    const db = await dbPromise;
    return db.collection(name);
  }

  return {
    findSections: async ({ pageName } = {}) => {
      const col = await getCollection('sections');
      const query = pageName ? { pageName } : {};
      return col.find(query).toArray();
    },
    
    findSection: async (sectionId) => {
      const col = await getCollection('sections');
      return col.findOne({ sectionId: String(sectionId) });
    },
    
    // §13.4's delete. Kept deliberately in step with jsonStore's: same cascade, same
    // seed exclusion, same refusal to act without a pageName. An empty filter here
    // meant "delete every section in the database", which is one missing query
    // parameter away from erasing the store.
    deleteSections: async ({ pageName } = {}) => {
      if (!pageName) return 0;
      const sections = await getCollection('sections');
      const elements = await getCollection('elements');
      const doomed = await sections
        .find({ pageName, sectionId: { $ne: SEEDED_SECTION_ID } })
        .toArray();
      if (!doomed.length) return 0;
      const doomedIds = doomed.map(s => String(s.sectionId));
      await elements.deleteMany({ sectionId: { $in: doomedIds } });
      const res = await sections.deleteMany({ sectionId: { $in: doomedIds } });
      return res.deletedCount;
    },

    insertSection: async (doc) => {
      const col = await getCollection('sections');
      await col.insertOne(doc);
      return doc;
    },
    
    updateSection: async (sectionId, patch) => {
      const col = await getCollection('sections');
      const result = await col.findOneAndUpdate(
        { sectionId: String(sectionId) },
        { $set: patch },
        { returnDocument: 'after' }
      );
      return result; // returnDocument: 'after' gives the updated document in MongoDB driver 4+
    },
    
    findElements: async ({ pageName, sectionId, fieldIds } = {}) => {
      const col = await getCollection('elements');
      const query = {};
      if (pageName) query.pageName = pageName;
      if (sectionId) query.sectionId = String(sectionId);
      if (fieldIds) {
        query.fieldId = { $in: fieldIds.map(String) };
      }
      return col.find(query).toArray();
    },
    
    insertElement: async (doc) => {
      const col = await getCollection('elements');
      await col.insertOne(doc);
      return doc;
    },
    
    updateElement: async (fieldId, patch) => {
      const col = await getCollection('elements');
      const result = await col.findOneAndUpdate(
        { fieldId: String(fieldId) },
        { $set: patch },
        { returnDocument: 'after' }
      );
      return result;
    },
    
    allocateId: async (range) => {
      const col = await getCollection('counters');
      
      const offsets = {
        section: 1000000000,
        element: 2000000000,
        cardField: 3000000000
      };

      if (offsets[range] === undefined) {
        throw new Error(`Invalid id range: ${range}`);
      }

      const result = await col.findOneAndUpdate(
        { _id: range },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
      
      const val = offsets[range] + result.seq;
      return String(val);
    },
    
    close: async () => {
      await client.close();
    }
  };
}
