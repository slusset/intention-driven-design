/**
 * Centralized loader for the IDD JSON Schemas published under schemas/v1/.
 *
 * Per-document grammars (shape, types, required fields, enums, closed-world
 * keys) live in the schemas. Validators load the schema once via
 * getValidator(kind) and run it against parsed artifact content. Cross-document
 * constraints — traceability, capability scope, fixture/contract binding,
 * evidence — remain in imperative checkers and are not covered by this loader.
 *
 * Closed-world key validation (#37):
 *   Each schema sets additionalProperties/unevaluatedProperties to false at
 *   every enumerated object level. Unknown keys are reported by ajv. The
 *   `categorize()` helper interprets each error against the document so that:
 *     - unknown keys tagged with `$conformance: experimental` become INFO
 *     - unknown keys tagged with `$conformance: legacy-compatible` become WARNING
 *     - other unknown keys become WARNING by default (ERROR under --strict)
 *     - all non-unknown-key violations remain ERROR
 *
 * See schemas/v1/index.json for the artifact registry and SCHEMA.md for the
 * publication, versioning, and extension policy.
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { findToolkitRoot } = require('./toolkit-root');

const SCHEMAS_DIR = path.join(
  findToolkitRoot(__dirname) || path.join(__dirname, '..', '..'),
  'schemas',
  'v1',
);

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
  const entries = [
    ...Object.values(index.definitions || {}),
    ...Object.values(index.artifacts),
  ];
  for (const entry of entries) {
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
 * Resolve a JSON pointer-ish instance path (ajv's err.instancePath) against the data.
 */
function resolveInstancePath(data, instancePath) {
  if (!instancePath) return data;
  const parts = instancePath.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cursor = data;
  for (const part of parts) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

const CONFORMANCE_TIERS = new Set(['canonical', 'legacy-compatible', 'experimental']);

function conformanceTierOf(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const tier = value.$conformance;
    if (CONFORMANCE_TIERS.has(tier)) return tier;
  }
  return null;
}

/**
 * Format one ajv error to a short human string.
 */
function unknownKeyFrom(err) {
  if (!err || !err.params) return undefined;
  return err.params.additionalProperty || err.params.unevaluatedProperty;
}

function formatOne(err) {
  const where = err.instancePath || '(root)';
  const detail = err.message || 'invalid';
  if (err.keyword === 'additionalProperties' || err.keyword === 'unevaluatedProperties') {
    return `${where}: unknown property "${unknownKeyFrom(err)}"`;
  }
  if (err.keyword === 'enum' && err.params && err.params.allowedValues) {
    return `${where}: ${detail} (allowed: ${err.params.allowedValues.join(', ')})`;
  }
  return `${where}: ${detail}`;
}

/**
 * Categorize ajv errors against the document, honoring $conformance markers.
 * Returns { errors, warnings, info } where each entry is a short string.
 *
 * @param {Array} ajvErrors - validate().errors
 * @param {unknown} data - the validated document
 * @param {object} opts
 * @param {string} [opts.schemaUrl] - hint URL appended to unknown-key messages
 */
function categorize(ajvErrors, data, opts = {}) {
  const errors = [];
  const warnings = [];
  const info = [];

  if (!ajvErrors || ajvErrors.length === 0) {
    return { errors, warnings, info };
  }

  const hint = opts.schemaUrl ? ` (schema: ${opts.schemaUrl})` : '';

  for (const err of ajvErrors) {
    const isUnknownKey = err.keyword === 'additionalProperties' || err.keyword === 'unevaluatedProperties';

    if (!isUnknownKey) {
      errors.push(formatOne(err));
      continue;
    }

    const key = unknownKeyFrom(err);
    const parent = resolveInstancePath(data, err.instancePath);
    const value = parent && typeof parent === 'object' ? parent[key] : undefined;
    const tier = conformanceTierOf(value);

    const base = formatOne(err);
    if (tier === 'experimental') {
      info.push(`${base} accepted under $conformance:experimental${hint}`);
    } else if (tier === 'legacy-compatible') {
      warnings.push(`${base} retained under $conformance:legacy-compatible${hint}`);
    } else {
      warnings.push(`${base}${hint}`);
    }
  }

  return { errors, warnings, info };
}

/**
 * Legacy formatter retained for callers that have not migrated to categorize().
 * Treats every ajv error as a flat string.
 */
function formatAjvErrors(errors) {
  if (!errors || errors.length === 0) return [];
  return errors.map(formatOne);
}

module.exports = {
  getValidator,
  formatAjvErrors,
  categorize,
  loadIndex,
};
