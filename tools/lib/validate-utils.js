const fs = require('fs');
const path = require('path');
const { formatResults } = require('./parse-front-matter');

function parseCommonArgs(argv, options = {}) {
  const allowWarnOnly = options.allowWarnOnly || false;
  args = argv.slice(2);

  let specsDir = null;
  let specificFiles = null;
  let jsonOutput = false;
  let strict = false;
  let warnOnly = false;
  const unknownFlags = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--files') {
      specificFiles = [];
      i++;
      while (i < args.length && !args[i].startsWith('--')) {
        specificFiles.push(path.resolve(args[i]));
        i++;
      }
      i--;
      continue;
    }

    if (arg === '--json') {
      jsonOutput = true;
      continue;
    }

    if (arg === '--strict') {
      strict = true;
      continue;
    }

    if (allowWarnOnly && arg === '--warn-only') {
      warnOnly = true;
      continue;
    }

    if (arg.startsWith('--')) {
      unknownFlags.push(arg);
      continue;
    }

    if (!specsDir) {
      specsDir = path.resolve(arg);
    }
  }

  return {
    specsDir: specsDir || path.join(process.cwd(), 'specs'),
    specificFiles,
    jsonOutput,
    strict,
    warnOnly,
    unknownFlags,
  };
}

function normalizeForMatch(filePath) {
  return filePath.replace(/\\/g, '/');
}

function matchesAnyPattern(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(path.basename(filePath)) || pattern.test(normalizeForMatch(filePath)));
}

function collectFiles(specsDir, specificFiles, patterns) {
  if (!specificFiles) {
    return null;
  }

  return specificFiles
    .filter((filePath) => fs.existsSync(filePath))
    .filter((filePath) => normalizeForMatch(filePath).startsWith(normalizeForMatch(specsDir)))
    .filter((filePath) => matchesAnyPattern(filePath, patterns));
}

function applyStrictMode(results, strict) {
  if (!strict || results.warnings.length === 0) {
    return results;
  }

  const strictWarnings = results.warnings.map((warning) => `${warning} (strict mode)`);
  results.errors.push(...strictWarnings);
  results.warnings = [];
  return results;
}

function outputResults(toolName, results, jsonOutput) {
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`${toolName}...\n`);
  console.log(formatResults(results));
}

module.exports = {
  parseCommonArgs,
  collectFiles,
  applyStrictMode,
  outputResults,
};
