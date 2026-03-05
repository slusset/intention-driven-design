#!/usr/bin/env node

/**
 * Validates that fixture files match their corresponding OpenAPI schemas.
 *
 * Usage: node tools/validate-fixtures.js
 *
 * Expects:
 * - specs/contracts/openapi/api.yaml
 * - specs/fixtures/ (JSON or YAML fixture files)
 *
 * Supports two fixture styles:
 * 1) Legacy: JSON fixture with _meta.schema / _meta.requestSchema
 * 2) Current: fixture.request.method + fixture.request.path mapped to OpenAPI paths
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const SPECS_DIR = path.join(process.cwd(), 'specs');
const API_FILE = path.join(SPECS_DIR, 'contracts/openapi/api.yaml');
const FIXTURES_DIR = path.join(SPECS_DIR, 'fixtures');

function loadApi() {
  if (!fs.existsSync(API_FILE)) {
    console.log('OpenAPI file not found:', API_FILE);
    return null;
  }

  const content = fs.readFileSync(API_FILE, 'utf8');
  return yaml.load(content);
}

function loadSchemas(api) {
  return api?.components?.schemas || {};
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
      } else if (/\.(json|ya?ml)$/i.test(entry.name)) {
        fixtures.push(fullPath);
      }
    }
  }

  walk(dir);
  return fixtures;
}

function parseFixtureFile(fixturePath) {
  const content = fs.readFileSync(fixturePath, 'utf8');
  const ext = path.extname(fixturePath).toLowerCase();

  try {
    if (ext === '.json') {
      return JSON.parse(content);
    }
    if (ext === '.yaml' || ext === '.yml') {
      return yaml.load(content);
    }
    return null;
  } catch (e) {
    return { parseError: e.message };
  }
}

function schemaFromContent(content) {
  if (!content || typeof content !== 'object') return null;
  if (content['application/json']?.schema) {
    return content['application/json'].schema;
  }

  for (const mediaType of Object.values(content)) {
    if (mediaType && typeof mediaType === 'object' && mediaType.schema) {
      return mediaType.schema;
    }
  }

  return null;
}

function responseForStatus(responses, status) {
  if (!responses || typeof responses !== 'object') return null;
  if (status && responses[status]) return responses[status];
  if (status && status.length === 3 && responses[`${status[0]}XX`]) {
    return responses[`${status[0]}XX`];
  }
  if (responses.default) return responses.default;
  return null;
}

function validateWithSchema(ajv, schema, value, label) {
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    return {
      valid: false,
      error: `${label} validation failed: ${ajv.errorsText(validate.errors)}`
    };
  }
  return { valid: true };
}

function validateLegacyFixture(fixture, schemas, ajv) {
  // Legacy JSON style: _meta.schema + optional _meta.requestSchema
  const schemaName = fixture._meta?.schema;
  if (!schemaName) {
    return { valid: true, warning: 'No _meta.schema or request mapping specified, skipping schema validation' };
  }

  const responseSchema = schemas[schemaName];
  if (!responseSchema) {
    return { valid: false, error: `Schema "${schemaName}" not found in api.yaml components.schemas` };
  }

  const requestData = fixture.request?.body ?? fixture.request;
  if (requestData) {
    const requestSchemaName = fixture._meta?.requestSchema || `${schemaName}Request`;
    const requestSchema = schemas[requestSchemaName];
    if (requestSchema) {
      const requestResult = validateWithSchema(ajv, requestSchema, requestData, 'Request');
      if (!requestResult.valid) return requestResult;
    }
  }

  const responseData = fixture.response?.body ?? fixture.response;
  if (responseData) {
    const responseResult = validateWithSchema(ajv, responseSchema, responseData, 'Response');
    if (!responseResult.valid) return responseResult;
  }

  return { valid: true };
}

function validateMappedFixture(fixture, api, ajv) {
  const method = String(fixture.request?.method || '').toLowerCase();
  const routePath = String(fixture.request?.path || '');
  if (!method || !routePath) {
    return { valid: true, warning: 'No _meta.schema or request mapping specified, skipping schema validation' };
  }

  const pathItem = api?.paths?.[routePath];
  if (!pathItem || typeof pathItem !== 'object') {
    return { valid: false, error: `OpenAPI path not found: ${routePath}` };
  }

  const operation = pathItem[method];
  if (!operation || typeof operation !== 'object') {
    return { valid: false, error: `OpenAPI operation not found: ${method.toUpperCase()} ${routePath}` };
  }

  const requestBody = fixture.request?.body;
  if (requestBody !== undefined) {
    const requestSchema = schemaFromContent(operation.requestBody?.content);
    if (!requestSchema) {
      return { valid: true, warning: `No request schema found for ${method.toUpperCase()} ${routePath}` };
    }

    const requestResult = validateWithSchema(ajv, requestSchema, requestBody, 'Request body');
    if (!requestResult.valid) return requestResult;
  }

  const responseBody = fixture.response?.body;
  if (responseBody !== undefined) {
    const status = fixture.response?.status != null ? String(fixture.response.status) : '';
    const response = responseForStatus(operation.responses, status);
    if (!response) {
      const label = status ? `status ${status}` : 'fixture status';
      return { valid: true, warning: `No response definition found for ${label} on ${method.toUpperCase()} ${routePath}` };
    }

    const responseSchema = schemaFromContent(response.content);
    if (!responseSchema) {
      return { valid: true, warning: `No response schema found for ${method.toUpperCase()} ${routePath}` };
    }

    const responseResult = validateWithSchema(ajv, responseSchema, responseBody, 'Response body');
    if (!responseResult.valid) return responseResult;
  }

  return { valid: true };
}

function validateFixture(fixturePath, api, schemas, ajv) {
  const fixture = parseFixtureFile(fixturePath);
  if (!fixture || typeof fixture !== 'object') {
    return { valid: false, error: 'Fixture file did not parse to an object' };
  }
  if (fixture.parseError) {
    return { valid: false, error: `Invalid fixture format: ${fixture.parseError}` };
  }

  if (fixture._meta && typeof fixture._meta === 'object') {
    return validateLegacyFixture(fixture, schemas, ajv);
  }

  return validateMappedFixture(fixture, api, ajv);
}

function main() {
  console.log('Validating fixtures against OpenAPI schemas...\n');

  const api = loadApi();
  if (!api || typeof api !== 'object') {
    console.log('OpenAPI file is empty or invalid, skipping fixture validation.');
    process.exit(0);
  }

  const schemas = loadSchemas(api);

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
    const result = validateFixture(fixturePath, api, schemas, ajv);

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
