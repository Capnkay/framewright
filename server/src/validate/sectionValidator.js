import { validateAgainstSchema } from './irValidator.js';
import sectionSchema from '../schemas/section.schema.json' with { type: 'json' };

// Swapping in real Ajv later is a one-line change:
//   import Ajv from 'ajv';
//   const validate = new Ajv().compile(sectionSchema);

export function validateSection(doc) {
  return validateAgainstSchema(doc, sectionSchema);
}
