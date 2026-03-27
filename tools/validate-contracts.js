#!/usr/bin/env node

/**
 * Validates contract artifacts across supported protocol families.
 *
 * Usage:
 *   node tools/validate-contracts.js [specs-dir]
 *   node tools/validate-contracts.js --files specs/contracts/asyncapi/events.yaml
 *
 * Options:
 *   --files <paths...>  Validate only specific contract files
 *   --json              Output results as JSON
 *   --strict            Treat warnings as errors
 */

const path = require('path');
const {
  discoverContractFiles,
  extractContractOperations,
  loadContractDocuments,
  protocolDisplayName,
} = require('./lib/contracts');
const { formatResults } = require('./lib/parse-front-matter');

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
      specificFiles.push(path.resolve(args[i]));
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

function outputResults(results) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  process.stdout.write('Validating contract artifacts...\n\n');
  process.stdout.write(`${formatResults(results)}\n`);
}

function selectedContracts() {
  if (!specificFiles) return null;
  const selected = new Set(specificFiles);
  return discoverContractFiles(specsDir).filter(entry => selected.has(entry.filePath));
}

function validateContractShape(contract, results) {
  const label = contract.relativePath;
  const { document, protocol } = contract;

  if (!document || typeof document !== 'object') {
    results.errors.push(`${label}: ${protocolDisplayName(protocol)} contract did not parse to an object`);
    return;
  }

  if (protocol === 'openapi') {
    if (!document.openapi) {
      results.errors.push(`${label}: Missing required field: openapi`);
    }
    if (!document.paths || typeof document.paths !== 'object') {
      results.errors.push(`${label}: Missing required object: paths`);
    }
    return;
  }

  if (protocol === 'asyncapi') {
    if (!document.asyncapi) {
      results.errors.push(`${label}: Missing required field: asyncapi`);
    }
    if (!document.channels || typeof document.channels !== 'object') {
      results.errors.push(`${label}: Missing required object: channels`);
    }
    return;
  }

  if (protocol === 'json-rpc') {
    if (!document.jsonrpc) {
      results.warnings.push(`${label}: Missing jsonrpc version marker; expected jsonrpc: "2.0"`);
    }
    if (!document.methods || (typeof document.methods !== 'object' && !Array.isArray(document.methods))) {
      results.errors.push(`${label}: Missing required collection: methods`);
    }
  }
}

function validateOperations(contract, results) {
  const operations = extractContractOperations(contract);

  if (operations.length === 0) {
    results.warnings.push(`${contract.relativePath}: No contract operations found`);
    return;
  }

  for (const operation of operations) {
    if (operation.protocol === 'openapi') {
      if (!operation.source.responses || typeof operation.source.responses !== 'object') {
        results.warnings.push(`${contract.relativePath}: ${operation.label}: Missing responses block`);
      }
    }

    if (operation.protocol === 'asyncapi' && !operation.payloadSchema) {
      results.warnings.push(`${contract.relativePath}: ${operation.label}: Missing message payload schema`);
    }

    if (operation.protocol === 'json-rpc' && !operation.paramsSchema && !operation.resultSchema) {
      results.warnings.push(`${contract.relativePath}: ${operation.label}: Missing paramsSchema/resultSchema`);
    }
  }

  results.info.push(`${contract.relativePath}: validated ${operations.length} ${operations.length === 1 ? 'operation' : 'operations'}`);
}

function main() {
  const results = { errors: [], warnings: [], info: [] };
  const loaded = loadContractDocuments(specsDir, results);

  const selected = selectedContracts();
  const candidateSet = selected ? new Set(selected.map(entry => entry.filePath)) : null;
  const contracts = candidateSet
    ? loaded.filter(contract => candidateSet.has(contract.filePath))
    : loaded;

  if (contracts.length === 0) {
    results.info.push('No contract files found to validate');
    outputResults(results);
    process.exit(0);
  }

  for (const contract of contracts) {
    validateContractShape(contract, results);
    validateOperations(contract, results);
  }

  results.info.push(`Validated ${contracts.length} contract file(s)`);

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map(warning => `${warning} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
