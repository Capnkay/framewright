import Ajv from 'ajv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ajv = new Ajv({ allErrors: true });
const schemaPath = path.join(__dirname, '../schemas/element.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

/**
 * Validates an element document against element.schema.json.
 * @param {Object} data 
 * @returns {{ valid: boolean, errors?: any }}
 */
export function validateElement(data) {
  const valid = validate(data);
  if (!valid) {
    return { valid: false, errors: validate.errors };
  }
  return { valid: true };
}
