'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const { formatAjvErrors } = require('./schema-loader');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readMigrationCatalog(toolkitRoot, options = {}) {
  const catalogRelative = options.catalogPath || 'migrations/catalog.json';
  const schemaRelative = options.schemaPath || 'migrations/catalog.schema.json';
  const catalogPath = path.join(toolkitRoot, catalogRelative);
  const result = {
    path: catalogRelative,
    status: 'missing',
    catalog: null,
    errors: [],
  };

  if (!fs.existsSync(catalogPath)) return result;

  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  } catch (error) {
    result.status = 'invalid';
    result.errors.push(`invalid JSON: ${error.message}`);
    return result;
  }

  const schemaPath = path.join(toolkitRoot, schemaRelative);
  const schema = readJson(schemaPath);
  if (!schema) {
    result.status = 'invalid';
    result.errors.push(`migration catalog schema is missing or unreadable: ${schemaRelative}`);
    return result;
  }

  const ajv = new Ajv({ strict: false, allErrors: true });
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    result.status = 'invalid';
    result.errors.push(`migration catalog schema could not be compiled: ${error.message}`);
    return result;
  }
  if (!validate(catalog)) {
    result.status = 'invalid';
    result.errors.push(...formatAjvErrors(validate.errors));
    return result;
  }

  const ids = new Set();
  for (const migration of catalog.migrations) {
    if (ids.has(migration.id)) {
      result.status = 'invalid';
      result.errors.push(`duplicate migration id: ${migration.id}`);
    }
    ids.add(migration.id);
    if (migration.from.schema === migration.to.schema) {
      result.status = 'invalid';
      result.errors.push(`migration ${migration.id} does not change schema version`);
    }
  }
  if (result.errors.length > 0) return result;

  result.status = 'valid';
  result.catalog = catalog;
  return result;
}

/**
 * Resolve a shortest ordered schema migration path from one exact version to
 * another. Catalog entries are edges, which lets a doctor report a sequence
 * of small migrations instead of inventing a monolithic transformation.
 */
function findMigrationPath(catalog, fromSchema, toSchema) {
  if (!catalog || !Array.isArray(catalog.migrations) || !fromSchema || !toSchema) return [];
  if (fromSchema === toSchema) return [];

  const queue = [{ version: fromSchema, path: [] }];
  const visited = new Set([fromSchema]);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const migration of catalog.migrations) {
      if (migration.from.schema !== current.version) continue;
      const nextPath = [...current.path, migration];
      if (migration.to.schema === toSchema) return nextPath;
      if (!visited.has(migration.to.schema)) {
        visited.add(migration.to.schema);
        queue.push({ version: migration.to.schema, path: nextPath });
      }
    }
  }
  return [];
}

module.exports = { findMigrationPath, readMigrationCatalog };
