#!/usr/bin/env node

/**
 * Validates that fixture files match their corresponding OpenAPI schemas.
 *
 * Usage: node tools/validate-fixtures.js
 *
 * Expects:
 * - specs/contracts/openapi/api.yaml (with components.schemas)
 * - specs/fixtures/ (JSON fixture files)
 *
 * Each fixture should have a _meta.schema field indicating which schema to validate against.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SPECS_DIR = path.join(process.cwd(), 'specs');
const API_FILE = path.join(SPECS_DIR, 'contracts/openapi/api.yaml');
const FIXTURES_DIR = path.join(SPECS_DIR, 'fixtures');

function loadSchemas() {
  if (!fs.existsSync(API_FILE)) {
    console.log('OpenAPI file not found:', API_FILE);
    return null;
  }

  const content = fs.readFileSync(API_FILE, 'utf8');
  const api = yaml.load(content);

  return api?.components?.schemas || null;
}

function findFixtures(dir) {
  const fixtures = [];

  if (!fs.existsSync(dir)) {
    return fixtures;
  }

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.json')) {
        fixtures.push(fullPath);
      }
    }
  }

  walk(dir);
  return fixtures;
}

function validateFixture(fixturePath, schemas, ajv) {
  const content = fs.readFileSync(fixturePath, 'utf8');
  let fixture;

  try {
    fixture = JSON.parse(content);
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${e.message}` };
  }

  // Check for _meta.schema to know which schema to validate against
  const schemaName = fixture._meta?.schema;

  if (!schemaName) {
    // If no schema specified, just validate JSON structure
    return { valid: true, warning: 'No _meta.schema specified, skipping schema validation' };
  }

  const schema = schemas[schemaName];

  if (!schema) {
    return { valid: false, error: `Schema "${schemaName}" not found in api.yaml` };
  }

  // Validate request if present
  if (fixture.request) {
    const requestSchemaName = fixture._meta?.requestSchema || `${schemaName}Request`;
    const requestSchema = schemas[requestSchemaName];

    if (requestSchema) {
      const validate = ajv.compile(requestSchema);
      if (!validate(fixture.request)) {
        return {
          valid: false,
          error: `Request validation failed: ${ajv.errorsText(validate.errors)}`
        };
      }
    }
  }

  // Validate response if present
  if (fixture.response) {
    const validate = ajv.compile(schema);
    if (!validate(fixture.response)) {
      return {
        valid: false,
        error: `Response validation failed: ${ajv.errorsText(validate.errors)}`
      };
    }
  }

  return { valid: true };
}

function main() {
  console.log('Validating fixtures against OpenAPI schemas...\n');

  const schemas = loadSchemas();

  if (!schemas) {
    console.log('No schemas found, skipping fixture validation.');
    process.exit(0);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  // Add all schemas to AJV for $ref resolution
  Object.entries(schemas).forEach(([name, schema]) => {
    try {
      ajv.addSchema(schema, `#/components/schemas/${name}`);
    } catch (e) {
      // Schema may already be added or have issues
    }
  });

  const fixtures = findFixtures(FIXTURES_DIR);

  if (fixtures.length === 0) {
    console.log('No fixtures found.');
    process.exit(0);
  }

  let hasErrors = false;
  let hasWarnings = false;

  for (const fixturePath of fixtures) {
    const relativePath = path.relative(process.cwd(), fixturePath);
    const result = validateFixture(fixturePath, schemas, ajv);

    if (!result.valid) {
      console.log(`❌ ${relativePath}`);
      console.log(`   ${result.error}\n`);
      hasErrors = true;
    } else if (result.warning) {
      console.log(`⚠️  ${relativePath}`);
      console.log(`   ${result.warning}\n`);
      hasWarnings = true;
    } else {
      console.log(`✅ ${relativePath}`);
    }
  }

  console.log('\n---');
  console.log(`Validated ${fixtures.length} fixture(s)`);

  if (hasErrors) {
    console.log('Some fixtures failed validation.');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('Validation passed with warnings.');
    process.exit(0);
  } else {
    console.log('All fixtures valid.');
    process.exit(0);
  }
}

main();
