#!/usr/bin/env node

/**
 * Validates fixture files against supported contract schemas.
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
const {
  extractContractOperations,
  loadContractDocuments,
  normalizeProtocol,
  normalizeRef,
  protocolDisplayName,
} = require('./lib/contracts');
const { findFiles, formatResults, parseFrontMatter } = require('./lib/parse-front-matter');
const { getValidator: getSchemaValidator, formatAjvErrors } = require('./lib/schema-loader');

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

const FIXTURES_DIR = path.join(specsDir, 'fixtures');

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

function createAjv() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/**
 * Pre-register every `components.schemas.*` entry from every OpenAPI
 * contract in the index as a named Ajv schema keyed by its canonical
 * `$ref` ("#/components/schemas/<Name>"). This lets nested `$ref`s in
 * any compiled schema (via `allOf` / `oneOf` / `properties`) resolve
 * against sibling components without the validator having to inline
 * them first.
 *
 * Without this, validating a schema that uses `allOf: [{ $ref: ... }]`
 * fails at compile time with "can't resolve reference from id #" because
 * Ajv only sees the top-level schema. Both the legacy-path
 * (`validateLegacyFixture`) and the OpenAPI-path (`validateOpenApiFixture`)
 * compile schemas extracted from components in isolation; both benefit
 * from this registration.
 *
 * Malformed individual schemas are skipped so the per-fixture compile
 * can still surface a precise error instead of failing the whole run.
 */
function registerComponentSchemas(ajv, index) {
  for (const contract of index.openapiContracts) {
    const components = contract.document && contract.document.components;
    const schemas = components && components.schemas;
    if (!schemas || typeof schemas !== 'object') continue;
    for (const [name, schema] of Object.entries(schemas)) {
      const ref = `#/components/schemas/${name}`;
      if (ajv.getSchema(ref)) continue; // duplicate across contracts — first wins
      if (!schema || typeof schema !== 'object') continue;
      try {
        ajv.addSchema({ ...schema, $id: ref });
      } catch {
        // Malformed schema — let the per-fixture compile surface a precise error.
      }
    }
  }
}

function validateWithSchema(ajv, schema, value, label) {
  try {
    const validate = ajv.compile(schema);
    if (!validate(value)) {
      return {
        valid: false,
        error: `${label} validation failed: ${ajv.errorsText(validate.errors)}`,
      };
    }
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `${label} schema could not be compiled: ${error.message}`,
    };
  }
}

function buildContractIndex(results) {
  const contracts = loadContractDocuments(specsDir, results);
  const operations = contracts.flatMap(contract => extractContractOperations(contract).map(operation => ({
    ...operation,
    contract,
  })));

  return {
    contracts,
    operations,
    openapiContracts: contracts.filter(contract => contract.protocol === 'openapi'),
  };
}

function pathMatcher(candidatePath, routePath) {
  const matcher = new RegExp(`^${candidatePath
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{[^}]+\\\}/g, '[^/]+')}$`);

  return matcher.test(routePath);
}

function normalizeContractRef(ref) {
  const normalized = normalizeRef(ref);
  if (!normalized) return null;
  return path.resolve(process.cwd(), normalized);
}

function getContractMetadata(fixture) {
  if (fixture && fixture.contract && typeof fixture.contract === 'object') {
    return fixture.contract;
  }

  if (fixture && fixture._meta && fixture._meta.contract && typeof fixture._meta.contract === 'object') {
    return fixture._meta.contract;
  }

  return null;
}

function getLegacySchemas(index) {
  const schemas = {};

  for (const contract of index.openapiContracts) {
    const components = contract.document && contract.document.components;
    if (!components || !components.schemas || typeof components.schemas !== 'object') {
      continue;
    }

    for (const [name, schema] of Object.entries(components.schemas)) {
      if (!(name in schemas)) {
        schemas[name] = schema;
      }
    }
  }

  return schemas;
}

function validateLegacyFixture(fixture, schemas, ajv) {
  const schemaName = fixture._meta && fixture._meta.schema;
  if (!schemaName) {
    return { valid: true, warning: 'No contract mapping specified, skipping schema validation' };
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

function matchOpenApiOperation(index, fixture, metadata) {
  const method = String(fixture.request && fixture.request.method ? fixture.request.method : '').toLowerCase();
  const routePath = String(fixture.request && fixture.request.path ? fixture.request.path : '');
  const refPath = normalizeContractRef(metadata && metadata.ref);

  if (!method || !routePath) {
    return null;
  }

  const candidates = index.operations.filter(operation =>
    operation.protocol === 'openapi'
    && operation.method === method
    && (!refPath || operation.contract.filePath === refPath)
  );

  return candidates.find(operation =>
    operation.routePath === routePath || pathMatcher(operation.routePath, routePath)
  ) || null;
}

function validateOpenApiFixture(fixture, index, ajv, metadata) {
  const operation = matchOpenApiOperation(index, fixture, metadata);
  if (!operation) {
    const method = String(fixture.request && fixture.request.method ? fixture.request.method : '').toUpperCase();
    const routePath = String(fixture.request && fixture.request.path ? fixture.request.path : '');
    return { valid: false, error: `OpenAPI operation not found: ${method} ${routePath}` };
  }

  const requestBody = fixture.request && fixture.request.body;
  if (requestBody !== undefined) {
    if (!operation.requestSchema) {
      return {
        valid: true,
        warning: `No request schema found for ${operation.method.toUpperCase()} ${operation.routePath}`,
      };
    }

    const requestResult = validateWithSchema(ajv, operation.requestSchema, requestBody, 'Request body');
    if (!requestResult.valid) return requestResult;
  }

  const responseBody = fixture.response && fixture.response.body;
  if (responseBody !== undefined) {
    const status = fixture.response && fixture.response.status != null ? String(fixture.response.status) : '';
    const responseSchema = operation.responseSchemaForStatus(status);

    if (!responseSchema) {
      const label = status ? `status ${status}` : 'fixture status';
      return {
        valid: true,
        warning: `No response schema found for ${label} on ${operation.method.toUpperCase()} ${operation.routePath}`,
      };
    }

    const responseResult = validateWithSchema(ajv, responseSchema, responseBody, 'Response body');
    if (!responseResult.valid) return responseResult;
  }

  return { valid: true };
}

function validateAsyncApiFixture(fixture, index, ajv, metadata) {
  const protocol = normalizeProtocol(metadata && metadata.protocol) || 'asyncapi';
  if (protocol !== 'asyncapi') {
    return { valid: false, error: `Expected AsyncAPI metadata, found ${metadata && metadata.protocol}` };
  }

  const channel = String((metadata && metadata.channel) || (fixture.request && fixture.request.channel) || '').trim();
  const action = String((metadata && metadata.action) || 'publish').toLowerCase();
  const refPath = normalizeContractRef(metadata && metadata.ref);

  if (!channel) {
    return { valid: true, warning: 'AsyncAPI fixture is missing contract.channel metadata' };
  }

  const operation = index.operations.find(candidate =>
    candidate.protocol === 'asyncapi'
    && candidate.channelName === channel
    && candidate.action === action
    && (!refPath || candidate.contract.filePath === refPath)
  );

  if (!operation) {
    return { valid: false, error: `AsyncAPI operation not found: ${action} ${channel}` };
  }

  const payload = (fixture.request && fixture.request.payload !== undefined)
    ? fixture.request.payload
    : (fixture.message && fixture.message.payload !== undefined ? fixture.message.payload : undefined);

  if (payload === undefined) {
    return { valid: true, warning: `AsyncAPI fixture did not include request.payload for ${action} ${channel}` };
  }

  if (!operation.payloadSchema) {
    return { valid: true, warning: `No message payload schema found for ${action} ${channel}` };
  }

  return validateWithSchema(ajv, operation.payloadSchema, payload, 'Message payload');
}

function validateJsonRpcFixture(fixture, index, ajv, metadata) {
  const protocol = normalizeProtocol(metadata && metadata.protocol) || 'json-rpc';
  if (protocol !== 'json-rpc') {
    return { valid: false, error: `Expected JSON-RPC metadata, found ${metadata && metadata.protocol}` };
  }

  const methodName = String((metadata && metadata.method) || (fixture.request && fixture.request.method) || '').trim();
  const refPath = normalizeContractRef(metadata && metadata.ref);

  if (!methodName) {
    return { valid: true, warning: 'JSON-RPC fixture is missing contract.method metadata' };
  }

  const operation = index.operations.find(candidate =>
    candidate.protocol === 'json-rpc'
    && candidate.methodName === methodName
    && (!refPath || candidate.contract.filePath === refPath)
  );

  if (!operation) {
    return { valid: false, error: `JSON-RPC method not found: ${methodName}` };
  }

  if (fixture.request && fixture.request.params !== undefined && operation.paramsSchema) {
    const requestResult = validateWithSchema(ajv, operation.paramsSchema, fixture.request.params, 'Request params');
    if (!requestResult.valid) return requestResult;
  }

  if (fixture.response && fixture.response.result !== undefined) {
    if (!operation.resultSchema) {
      return { valid: true, warning: `No resultSchema found for JSON-RPC method ${methodName}` };
    }

    const responseResult = validateWithSchema(ajv, operation.resultSchema, fixture.response.result, 'Response result');
    if (!responseResult.valid) return responseResult;
  }

  if (fixture.response && fixture.response.error !== undefined && operation.errorSchema) {
    const errorResult = validateWithSchema(ajv, operation.errorSchema, fixture.response.error, 'Response error');
    if (!errorResult.valid) return errorResult;
  }

  return { valid: true };
}

function validateFixture(fixturePath, index, schemas, ajv) {
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

  const schemaResult = getSchemaValidator('fixture')(fixture);
  if (!schemaResult.valid) {
    const detail = formatAjvErrors(schemaResult.errors).join('; ');
    return { valid: false, error: `Fixture schema: ${detail}` };
  }

  if (fixture._meta && typeof fixture._meta === 'object' && fixture._meta.schema) {
    return validateLegacyFixture(fixture, schemas, ajv);
  }

  const metadata = getContractMetadata(fixture);
  const protocol = normalizeProtocol(metadata && metadata.protocol);

  if (protocol === 'asyncapi') {
    return validateAsyncApiFixture(fixture, index, ajv, metadata);
  }

  if (protocol === 'json-rpc') {
    return validateJsonRpcFixture(fixture, index, ajv, metadata);
  }

  if (protocol === 'openapi' || (fixture.request && fixture.request.method && fixture.request.path)) {
    return validateOpenApiFixture(fixture, index, ajv, metadata);
  }

  if (metadata && metadata.protocol) {
    return { valid: true, warning: `Unsupported contract.protocol "${metadata.protocol}"` };
  }

  return { valid: true, warning: 'No contract mapping specified, skipping schema validation' };
}

function outputResults(results) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  process.stdout.write('Validating fixtures against contract schemas...\n\n');
  process.stdout.write(`${formatResults(results)}\n`);
}

function main() {
  const results = { errors: [], warnings: [], info: [] };
  const index = buildContractIndex(results);
  const schemas = getLegacySchemas(index);
  const ajv = createAjv();
  registerComponentSchemas(ajv, index);

  if (index.contracts.length === 0 && results.errors.length === 0) {
    results.info.push('Fixture schema validation skipped because no contract artifacts are available');
    outputResults(results);
    process.exit(0);
  }

  const fixtureFiles = collectFixtureFiles();
  if (fixtureFiles.length === 0) {
    results.info.push('No fixture files found to validate');
    outputResults(results);
    process.exit(0);
  }

  for (const fixturePath of fixtureFiles) {
    const relativePath = path.relative(process.cwd(), fixturePath);
    const result = validateFixture(fixturePath, index, schemas, ajv);

    if (!result.valid) {
      results.errors.push(`${relativePath}: ${result.error}`);
    } else if (result.warning) {
      results.warnings.push(`${relativePath}: ${result.warning}`);
    } else {
      results.info.push(`${relativePath}: valid`);
    }
  }

  const availableProtocols = Array.from(new Set(index.contracts.map(contract => protocolDisplayName(contract.protocol))));
  if (availableProtocols.length > 0) {
    results.info.push(`Loaded contract families: ${availableProtocols.join(', ')}`);
  }
  results.info.push(`Validated ${fixtureFiles.length} fixture file(s)`);

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map(warning => `${warning} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
