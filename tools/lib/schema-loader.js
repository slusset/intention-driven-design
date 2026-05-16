/**
 * Centralized loader for the IDD JSON Schemas published under schemas/v1/.
 *
 * Per-document grammars (shape, types, required fields, enums) live in the
 * schemas. Validators load the schema once via getValidator(kind) and run it
 * against parsed artifact content. Cross-document constraints — traceability,
 * capability scope, fixture/contract binding, evidence — remain in imperative
 * checkers and are not covered by this loader.
 *
 * See schemas/v1/index.json for the artifact registry and SCHEMA.md for the
 * publication, versioning, and extension policy.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const SCHEMAS_DIR = path.join(__dirname, '..', '..', 'schemas', 'v1');

let cachedAjv = null;
let cachedIndex = null;
const validatorCache = new Map();

function loadIndex() {
  if (!cachedIndex) {
    const raw = fs.readFileSync(path.join(SCHEMAS_DIR, 'index.json'), 'utf8');
    cachedIndex = JSON.parse(raw);
  }
  return cachedIndex;
}

function loadAjv() {
  if (cachedAjv) return cachedAjv;

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);

  const index = loadIndex();
  for (const [, entry] of Object.entries(index.artifacts)) {
    const schemaPath = path.join(SCHEMAS_DIR, entry.path);
    const raw = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(raw);
    ajv.addSchema(schema, schema.$id);
  }

  cachedAjv = ajv;
  return ajv;
}

/**
 * Get a compiled validator for an artifact kind.
 * @param {string} kind - one of the keys in schemas/v1/index.json#/artifacts
 * @returns {(data: unknown) => { valid: boolean, errors: Array }}
 */
function getValidator(kind) {
  if (validatorCache.has(kind)) {
    return validatorCache.get(kind);
  }

  const ajv = loadAjv();
  const index = loadIndex();
  const entry = index.artifacts[kind];
  if (!entry) {
    throw new Error(`Unknown IDD artifact kind: ${kind}`);
  }

  const validate = ajv.getSchema(entry.$id);
  if (!validate) {
    throw new Error(`Schema for ${kind} could not be loaded (id: ${entry.$id})`);
  }

  const fn = (data) => {
    const valid = validate(data);
    return { valid, errors: validate.errors || [] };
  };

  validatorCache.set(kind, fn);
  return fn;
}

/**
 * Format ajv errors into short, human-readable strings.
 */
function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return [];
  return errors.map((err) => {
    const where = err.instancePath || '(root)';
    const detail = err.message || 'invalid';
    if (err.keyword === 'additionalProperties' && err.params && err.params.additionalProperty) {
      return `${where}: unknown property "${err.params.additionalProperty}"`;
    }
    if (err.keyword === 'enum' && err.params && err.params.allowedValues) {
      return `${where}: ${detail} (allowed: ${err.params.allowedValues.join(', ')})`;
    }
    return `${where}: ${detail}`;
  });
}

module.exports = {
  getValidator,
  formatAjvErrors,
  loadIndex,
};
