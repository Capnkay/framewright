// server/src/validate/irValidator.js
//
// validateIr(doc) — CONTRACT.md §6's IR v1.0 Ajv schema and validator.
//
// `ajv` is not installed yet (Phase 1 installs it, per server/package.json —
// the same swap-in pattern the golden component uses for PrimeReact and
// DOMPurify: a real dependency is declared now, and a hand-written stand-in
// does its job until npm install actually happens, so this file works on a
// fresh clone with zero packages). What follows is a small JSON-Schema
// evaluator covering exactly the draft-07 keywords ../schemas/ir.schema.json
// uses (type, required, properties, enum, items, minItems/maxItems,
// minimum/maximum, not.required) — not a general-purpose implementation.
//
// Swapping in real Ajv later is a one-line change:
//   import Ajv from 'ajv';
//   const validate = new Ajv().compile(irSchema);
//   export function validateIr(doc) {
//     const valid = validate(doc);
//     return { valid, errors: valid ? [] : validate.errors.map(...) };
//   }
// Nothing that calls validateIr needs to change shape.

import irSchema from '../schemas/ir.schema.json' with { type: 'json' };

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function matchesType(value, typeSpec) {
  const types = Array.isArray(typeSpec) ? typeSpec : [typeSpec];
  const actual = typeOf(value);
  return types.includes(actual) || (types.includes('integer') && actual === 'number' && Number.isInteger(value));
}

/**
 * validateSchema(value, schema, path, errors) — walks `value` against
 * `schema`, pushing `{ path, message }` entries onto `errors`. Mutates
 * `errors` in place; returns nothing.
 */
function validateSchema(value, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path, message: `must be of type ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}, got ${typeOf(value)}` });
    return;
  }

  if (value === null || value === undefined) return;

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}` });
  }

  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    errors.push({ path, message: `must be >= ${schema.minimum}` });
  }
  if (schema.maximum !== undefined && typeof value === 'number' && value > schema.maximum) {
    errors.push({ path, message: `must be <= ${schema.maximum}` });
  }

  if (typeOf(value) === 'object') {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({ path, message: `missing required field "${key}"` });
        }
      }
    }
    if (schema.not && Array.isArray(schema.not.required)) {
      const present = schema.not.required.filter((key) => key in value);
      if (present.length > 0) {
        errors.push({ path, message: `must not carry field(s) ${present.join(', ')} — the IR never carries field IDs (§6)` });
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateSchema(value[key], subSchema, `${path}.${key}`, errors);
        }
      }
    }
  }

  if (typeOf(value) === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must have at least ${schema.minItems} item(s)` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `must have at most ${schema.maxItems} item(s)` });
    }
    if (schema.items) {
      value.forEach((item, index) => validateSchema(item, schema.items, `${path}[${index}]`, errors));
    }
  }
}

/**
 * validateIr(doc) -> { valid: boolean, errors: [{ path, message }] }
 *
 * Validates `doc` against CONTRACT.md §6's IR v1.0 shape. `doc` itself is
 * never mutated.
 */
export function validateIr(doc) {
  const errors = [];
  validateSchema(doc, irSchema, '$', errors);
  return { valid: errors.length === 0, errors };
}

/**
 * validateAgainstSchema(value, schema) -> { valid, errors: [{ path, message }] }
 *
 * The same evaluator, against an arbitrary schema rather than the IR's.
 * §16.2 requires the model orchestrator to validate a response against "the
 * caller's Ajv schema" — a caller that is not always the IR — and the
 * alternative to exporting this was a second schema evaluator living beside
 * the first. Two evaluators would disagree the moment either changed, which
 * is the same defect T-092's register entry recorded for the schema itself.
 */
export function validateAgainstSchema(value, schema) {
  const errors = [];
  validateSchema(value, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

export { irSchema };
