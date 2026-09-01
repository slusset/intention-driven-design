#!/usr/bin/env node

'use strict';

// Trial runner for the methodology evaluation instrument (#58).
//
//   node evals/run-experiment.js --scenario <dir> --condition <id> [--out <dir>]
//
// Digests the scenario tree, runs the deterministic checkers (the shipped
// validator suite) over it, and writes a schema-validated experiment-record@1
// JSON file. The record is self-contained: scenario seed and measured
// artifacts are content-addressed, the toolkit and schema registry are
// pinned, and the record's own JCS digest closes it.

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { digestTree, runDeterministicCheckers } = require('./checkers');
const { digestJsonFile, jcsSha256 } = require('../tools/lib/contract-digests');
const { findToolkitRoot } = require('../tools/lib/toolkit-root');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { out: null, scenario: null, condition: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--scenario' || arg === '--condition' || arg === '--out') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`${arg} requires a value`);
      options[arg.slice(2)] = argv[++i];
    } else {
      fail(`Unknown option: ${arg}`);
    }
  }
  if (!options.scenario || !options.condition) {
    fail('Usage: node evals/run-experiment.js --scenario <dir> --condition <id> [--out <dir>]');
  }
  return options;
}

function runExperiment({ scenarioDir, conditionId, outDir = null }) {
  const scenarioRoot = path.resolve(scenarioDir);
  const metadataPath = path.join(scenarioRoot, 'scenario.json');
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`scenario metadata not found: ${metadataPath}`);
  }
  const scenario = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  const toolkitRoot = findToolkitRoot(__dirname);
  const toolkit = JSON.parse(fs.readFileSync(path.join(toolkitRoot, 'package.json'), 'utf8'));
  const schemaIndexPath = path.join(toolkitRoot, 'schemas', 'v1', 'index.json');
  const schemaIndex = JSON.parse(fs.readFileSync(schemaIndexPath, 'utf8'));

  const started = new Date();
  const tree = digestTree(scenarioRoot);
  const deterministic = runDeterministicCheckers(scenarioRoot);
  const finished = new Date();

  const record = {
    record_version: 1,
    kind: 'idd-experiment-record',
    id: `${scenario.id}-${conditionId}-${started.toISOString().replace(/[:.]/g, '').toLowerCase()}`,
    scenario: {
      id: scenario.id,
      task: scenario.task,
      seed_digest: tree.digest,
    },
    condition: { id: conditionId },
    environment: {
      toolkit_version: toolkit.version,
      schema_version: schemaIndex.version,
      schema_digest: digestJsonFile(schemaIndexPath),
      node: process.version,
    },
    metrics: { deterministic, judged: [] },
    measurements: { wall_clock_ms: finished.getTime() - started.getTime() },
    artifacts: tree.files,
    timestamps: { started: started.toISOString(), finished: finished.toISOString() },
  };
  record.digest = jcsSha256(record);

  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts', 'experiment-record.schema.json'), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  if (!validate(record)) {
    throw new Error(`produced record violates experiment-record@1: ${JSON.stringify(validate.errors, null, 2)}`);
  }

  let recordPath = null;
  if (outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    recordPath = path.join(outDir, `${record.id}.json`);
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  return { record, recordPath };
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  try {
    const { record, recordPath } = runExperiment({
      scenarioDir: options.scenario,
      conditionId: options.condition,
      outDir: options.out,
    });
    if (recordPath) console.error(`Wrote ${recordPath}`);
    else console.log(JSON.stringify(record, null, 2));
    const summary = record.metrics.deterministic;
    console.error(`Deterministic tier: ${summary.errors} errors, ${summary.warnings} warnings; ` +
      `closure=${summary.traceability_closure} contracts=${summary.contract_conformance} fixtures=${summary.fixture_integrity}`);
  } catch (error) {
    fail(error.message);
  }
}

module.exports = { runExperiment };
