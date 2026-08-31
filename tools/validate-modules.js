#!/usr/bin/env node

'use strict';

const path = require('path');
const { formatResults } = require('./lib/parse-front-matter');
const { validateModulesFile } = require('./lib/modules');

const args = process.argv.slice(2);
let specsDir = null;
let jsonOutput = false;

for (const arg of args) {
  if (arg === '--json') jsonOutput = true;
  else if (!arg.startsWith('--')) specsDir = path.resolve(arg);
}

if (!specsDir) specsDir = path.join(process.cwd(), 'specs');

const repoRoot = path.dirname(specsDir);
const results = validateModulesFile({
  repoRoot,
  manifestPath: path.join(specsDir, 'modules.yaml'),
});

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('Validating module manifest and dependency DAG...\n');
  console.log(formatResults(results));
}

process.exit(results.errors.length > 0 ? 1 : 0);
