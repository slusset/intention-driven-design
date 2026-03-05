#!/usr/bin/env node

/**
 * Validates fixture files against OpenAPI request/response schemas.
 *
 * Usage:
 *   node tools/validate-fixtures.js [specs-dir]
 *   node tools/validate-fixtures.js --files specs/fixtures/example.fixture.yaml
 *
 * Options:
 *   --files <paths...>  Validate only specific fixture files
 *   --json              Output results as JSON
 *   --strict            Treat warnings as errors
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { findFiles, formatResults, parseFrontMatter } = require('./lib/parse-front-matter');

const args = process.argv.slice(2);
let specsDir = null;
let specificFiles = null;
let jsonOutput = false;
let strict = false;

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--files') {
    specificFiles = [];
    i += 1;
    while (i < args.length && !args[i].startsWith('--')) {
      specificFiles.push(args[i]);
      i += 1;
    }
    i -= 1;
  } else if (args[i] === '--json') {
    jsonOutput = true;
  } else if (args[i] === '--strict') {
    strict = true;
  } else if (!args[i].startsWith('--')) {
    specsDir = path.resolve(args[i]);
  }
}

if (!specsDir) {
  specsDir = path.join(process.cwd(), 'specs');
}

const API_FILE = path.join(specsDir, 'contracts', 'openapi', 'api.yaml');
const FIXTURES_DIR = path.join(specsDir, 'fixtures');

function loadApi(results) {
  if (!fs.existsSync(API_FILE)) {
    results.warnings.push(`OpenAPI file not found: ${path.relative(process.cwd(), API_FILE)}`);
    return null;
  }

  try {
    const content = fs.readFileSync(API_FILE, 'utf8');
    const parsed = parseFrontMatter(API_FILE, content);
    if (parsed.parseError) {
      results.errors.push(`${path.relative(process.cwd(), API_FILE)}: Failed to parse OpenAPI file: ${parsed.parseError}`);
      return null;
    }
    const api = parsed.body;
    if (!api || typeof api !== 'object') {
      results.errors.push(`${path.relative(process.cwd(), API_FILE)}: OpenAPI file did not parse to an object`);
      return null;
    }
    return api;
  } catch (error) {
    results.errors.push(`${path.relative(process.cwd(), API_FILE)}: Failed to parse OpenAPI file: ${error.message}`);
    return null;
  }
}

function hasFixtureExtension(filePath) {
  return /\.(json|ya?ml)$/i.test(filePath);
}

function collectFixtureFiles() {
  if (specificFiles) {
    const files = new Set();
    for (const input of specificFiles) {
      const resolved = path.resolve(input);
      if (!fs.existsSync(resolved) || !hasFixtureExtension(resolved)) {
        continue;
      }
      files.add(resolved);
    }
    return Array.from(files);
  }

  return findFiles(FIXTURES_DIR, /\.(json|ya?ml)$/i);
}

function parseFixtureFile(fixturePath) {
  const content = fs.readFileSync(fixturePath, 'utf8');
  const parsed = parseFrontMatter(fixturePath, content);
  if (parsed.parseError) {
    return { parseError: parsed.parseError };
  }
  return parsed.body;
}

function schemaFromContent(content) {
  if (!content || typeof content !== 'object') return null;
  if (content['application/json'] && content['application/json'].schema) {
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

function findOperation(api, method, routePath) {
  const paths = api && api.paths;
  if (!paths || typeof paths !== 'object') return null;

  const exact = paths[routePath] && paths[routePath][method];
  if (exact) {
    return { operation: exact, normalizedPath: routePath };
  }

  for (const [candidatePath, candidateItem] of Object.entries(paths)) {
    if (!candidateItem || typeof candidateItem !== 'object' || !candidateItem[method]) continue;

    const matcher = new RegExp(`^${candidatePath
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{[^}]+\\\}/g, '[^/]+')}$`);

    if (matcher.test(routePath)) {
      return { operation: candidateItem[method], normalizedPath: candidatePath };
    }
  }

  return null;
}

function validateWithSchema(ajv, schema, value, label) {
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    return {
      valid: false,
      error: `${label} validation failed: ${ajv.errorsText(validate.errors)}`,
    };
  }

  return { valid: true };
}

function validateLegacyFixture(fixture, schemas, ajv) {
  const schemaName = fixture._meta && fixture._meta.schema;
  if (!schemaName) {
    return { valid: true, warning: 'No _meta.schema or request mapping specified, skipping schema validation' };
  }

  const responseSchema = schemas[schemaName];
  if (!responseSchema) {
    return { valid: false, error: `Schema "${schemaName}" not found in components.schemas` };
  }

  const requestData = fixture.request && (fixture.request.body != null ? fixture.request.body : fixture.request);
  if (requestData != null) {
    const requestSchemaName = (fixture._meta && fixture._meta.requestSchema) || `${schemaName}Request`;
    const requestSchema = schemas[requestSchemaName];
    if (requestSchema) {
      const requestResult = validateWithSchema(ajv, requestSchema, requestData, 'Request');
      if (!requestResult.valid) return requestResult;
    }
  }

  const responseData = fixture.response && (fixture.response.body != null ? fixture.response.body : fixture.response);
  if (responseData != null) {
    const responseResult = validateWithSchema(ajv, responseSchema, responseData, 'Response');
    if (!responseResult.valid) return responseResult;
  }

  return { valid: true };
}

function validateMappedFixture(fixture, api, ajv) {
  const method = String(fixture.request && fixture.request.method ? fixture.request.method : '').toLowerCase();
  const routePath = String(fixture.request && fixture.request.path ? fixture.request.path : '');

  if (!method || !routePath) {
    return { valid: true, warning: 'No _meta.schema or request mapping specified, skipping schema validation' };
  }

  const match = findOperation(api, method, routePath);
  if (!match) {
    return { valid: false, error: `OpenAPI operation not found: ${method.toUpperCase()} ${routePath}` };
  }

  const requestBody = fixture.request && fixture.request.body;
  if (requestBody !== undefined) {
    const requestSchema = schemaFromContent(match.operation.requestBody && match.operation.requestBody.content);
    if (!requestSchema) {
      return {
        valid: true,
        warning: `No request schema found for ${method.toUpperCase()} ${match.normalizedPath}`,
      };
    }

    const requestResult = validateWithSchema(ajv, requestSchema, requestBody, 'Request body');
    if (!requestResult.valid) return requestResult;
  }

  const responseBody = fixture.response && fixture.response.body;
  if (responseBody !== undefined) {
    const status = fixture.response && fixture.response.status != null ? String(fixture.response.status) : '';
    const response = responseForStatus(match.operation.responses, status);

    if (!response) {
      const label = status ? `status ${status}` : 'fixture status';
      return {
        valid: true,
        warning: `No response definition found for ${label} on ${method.toUpperCase()} ${match.normalizedPath}`,
      };
    }

    const responseSchema = schemaFromContent(response.content);
    if (!responseSchema) {
      return {
        valid: true,
        warning: `No response schema found for ${method.toUpperCase()} ${match.normalizedPath}`,
      };
    }

    const responseResult = validateWithSchema(ajv, responseSchema, responseBody, 'Response body');
    if (!responseResult.valid) return responseResult;
  }

  return { valid: true };
}

function validateFixture(fixturePath, api, schemas, ajv) {
  let fixture;
  try {
    fixture = parseFixtureFile(fixturePath);
  } catch (error) {
    return { valid: false, error: `Unable to read fixture: ${error.message}` };
  }

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

function outputResults(results) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  process.stdout.write('Validating fixtures against OpenAPI schemas...\n\n');
  process.stdout.write(`${formatResults(results)}\n`);
}

function main() {
  const results = { errors: [], warnings: [], info: [] };

  const api = loadApi(results);
  if (!api || results.errors.length > 0) {
    if (!api && results.errors.length === 0) {
      results.info.push('Fixture schema validation skipped because OpenAPI contract is unavailable');
    }
    if (strict && results.warnings.length > 0) {
      results.errors.push(...results.warnings.map((w) => `${w} (strict mode)`));
      results.warnings = [];
    }
    outputResults(results);
    process.exit(results.errors.length > 0 ? 1 : 0);
  }

  const schemas = api.components && api.components.schemas ? api.components.schemas : {};
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  for (const [name, schema] of Object.entries(schemas)) {
    try {
      ajv.addSchema(schema, `#/components/schemas/${name}`);
    } catch (_) {
      // Ignore duplicate/unusable schema additions.
    }
  }

  const fixtureFiles = collectFixtureFiles();
  if (fixtureFiles.length === 0) {
    results.info.push('No fixture files found to validate');
    outputResults(results);
    process.exit(0);
  }

  for (const fixturePath of fixtureFiles) {
    const relativePath = path.relative(process.cwd(), fixturePath);
    const result = validateFixture(fixturePath, api, schemas, ajv);

    if (!result.valid) {
      results.errors.push(`${relativePath}: ${result.error}`);
    } else if (result.warning) {
      results.warnings.push(`${relativePath}: ${result.warning}`);
    } else {
      results.info.push(`${relativePath}: valid`);
    }
  }

  results.info.push(`Validated ${fixtureFiles.length} fixture file(s)`);

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map((w) => `${w} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
