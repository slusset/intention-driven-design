#!/usr/bin/env node

'use strict';

const path = require('path');
const { formatResults } = require('./lib/parse-front-matter');
const { validateVerificationFile } = require('./lib/verification');

const args = process.argv.slice(2);
let specsDir = null;
let jsonOutput = false;

for (const arg of args) {
  if (arg === '--json') jsonOutput = true;
  else if (!arg.startsWith('--')) specsDir = path.resolve(arg);
}

if (!specsDir) specsDir = path.join(process.cwd(), 'specs');

const results = validateVerificationFile({
  repoRoot: path.dirname(specsDir),
  manifestPath: path.join(specsDir, 'modules.yaml'),
});

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('Validating verification maps and module relations...\n');
  console.log(formatResults(results));
}

process.exit(results.errors.length > 0 ? 1 : 0);
