#!/usr/bin/env node

/**
 * Validates front-matter presence and correctness on IDD spec files.
 *
 * Checks:
 * - Every spec file has front-matter with at least `id` and `type`
 * - Type matches the expected type for the file's location
 * - Required fields are present (per docs/idd/front-matter-spec.md)
 * - Recommended fields are flagged as warnings
 *
 * Usage:
 *   node tools/validate-front-matter.js [specs-dir]
 *   node tools/validate-front-matter.js --files file1.md file2.yaml
 *
 * Options:
 *   --files <paths...>  Check only specific files (for CI on PR diffs)
 *   --json              Output results as JSON (for GitHub Action parsing)
 *   --strict            Treat warnings as errors
 *
 * Exit: 0 = pass, 1 = errors found
 */

const fs = require('fs');
const path = require('path');
const {
  getExpectedType,
  parseFrontMatter,
  validateFrontMatter,
  findFiles,
  formatResults,
} = require('./lib/parse-front-matter');

// ── Parse arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);
let specsDir = null;
let specificFiles = null;
let jsonOutput = false;
let strict = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--files') {
    specificFiles = [];
    i++;
    while (i < args.length && !args[i].startsWith('--')) {
      specificFiles.push(args[i]);
      i++;
    }
    i--; // Back up one since the for loop will increment
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

// ── Collect files to check ────────────────────────────────────────────
function collectFiles() {
  if (specificFiles) {
    return specificFiles.filter(f => fs.existsSync(f));
  }

  // Find all spec files in the specs/ directory
  const patterns = [
    /\.md$/,
    /\.feature$/,
    /\.model\.ya?ml$/,
    /\.lifecycle\.ya?ml$/,
    /\.(?:map|journey-map)\.ya?ml$/,
    /\.capability\.ya?ml$/,
    /\.(?:json|fixture\.ya?ml)$/,
  ];

  const allFiles = [];
  for (const pattern of patterns) {
    allFiles.push(...findFiles(specsDir, pattern));
  }

  return allFiles;
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  const results = { errors: [], warnings: [], info: [] };
  const files = collectFiles();

  if (files.length === 0) {
    results.info.push('No spec files found to check');
    outputResults(results);
    process.exit(0);
  }

  let checked = 0;
  let passed = 0;

  for (const filePath of files) {
    // Get relative path for display and type detection
    const relativePath = path.relative(process.cwd(), filePath);

    // Determine expected type
    const expectedType = getExpectedType(relativePath);
    if (!expectedType) {
      // Not a recognized spec file pattern — skip silently
      // (e.g., specs/models/README.md)
      continue;
    }

    checked++;

    // Read and parse
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      results.errors.push(`${relativePath}: Cannot read file: ${e.message}`);
      continue;
    }

    const parsed = parseFrontMatter(filePath, content);

    if (parsed.parseError) {
      results.errors.push(`${relativePath}: Parse error: ${parsed.parseError}`);
      continue;
    }

    // Validate front-matter
    const validation = validateFrontMatter(relativePath, parsed.frontMatter, expectedType);

    if (validation.errors.length === 0 && validation.warnings.length === 0) {
      passed++;
    }

    // Record errors with file context
    for (const error of validation.errors) {
      results.errors.push(`${relativePath}: ${error}`);
    }

    for (const warning of validation.warnings) {
      if (strict) {
        results.errors.push(`${relativePath}: ${warning} (strict mode)`);
      } else {
        results.warnings.push(`${relativePath}: ${warning}`);
      }
    }
  }

  results.info.push(`Checked ${checked} spec file(s): ${passed} passed, ${checked - passed} with issues`);

  outputResults(results);

  if (results.errors.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

function outputResults(results) {
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('Checking front-matter...\n');
    console.log(formatResults(results));
  }
}

main();
