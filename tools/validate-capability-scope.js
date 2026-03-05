#!/usr/bin/env node

/**
 * Validates that spec files are listed in at least one capability scope.
 *
 * Usage:
 *   node tools/validate-capability-scope.js [specs-dir]
 *   node tools/validate-capability-scope.js --files file1.feature file2.md
 *
 * Options:
 *   --files <paths...>  Check only specific files (for CI on PR diffs)
 *   --json              Output results as JSON
 *   --strict            Treat warnings as errors
 *   --warn-only         Don't fail on uncovered files (emit warnings instead)
 *
 * Exit: 0 = pass, 1 = errors found
 */

const path = require('path');
const {
  findFiles,
  findFilesByPatterns,
  loadYamlFile,
  fileExists,
} = require('./lib/parse-front-matter');
const {
  parseCommonArgs,
  collectFiles,
  applyStrictMode,
  outputResults,
} = require('./lib/validate-utils');

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function buildScopedFileMatcher(specsDir) {
  const scopeRoot = path.relative(process.cwd(), specsDir).replace(/\\/g, '/');
  const normalizedScopeRoot = scopeRoot === '' ? 'specs' : scopeRoot;

  function shouldBeScoped(filePath) {
    const normalized = normalizePath(filePath);
    return (
      normalized.startsWith(`${normalizedScopeRoot}/features/`) && /\.feature$/.test(normalized)
    ) || (
      normalized.startsWith(`${normalizedScopeRoot}/stories/`) && /\.md$/.test(normalized)
    ) || (
      normalized.startsWith(`${normalizedScopeRoot}/models/`) && /\.model\.ya?ml$/.test(normalized)
    ) || (
      normalized.startsWith(`${normalizedScopeRoot}/models/`) && /\.lifecycle\.ya?ml$/.test(normalized)
    ) || (
      normalized.startsWith(`${normalizedScopeRoot}/contracts/`) && /\.ya?ml$/.test(normalized)
    );
  }

  return { shouldBeScoped, normalizedScopeRoot };
}

function loadCapabilities(specsDir) {
  const capDir = path.join(specsDir, 'capabilities');
  const capFiles = findFiles(capDir, /\.capability\.ya?ml$/);
  const capabilities = [];

  for (const capFile of capFiles) {
    const loaded = loadYamlFile(capFile);
    if (loaded.error || !loaded.data || !loaded.data.scope) {
      continue;
    }

    capabilities.push({
      file: path.relative(process.cwd(), capFile).replace(/\\/g, '/'),
      id: loaded.data.id || path.basename(capFile, path.extname(capFile)),
      scope: loaded.data.scope,
    });
  }

  return capabilities;
}

function buildScopeIndex(capabilities) {
  const index = new Map();

  for (const capability of capabilities) {
    for (const entries of Object.values(capability.scope)) {
      if (!Array.isArray(entries)) {
        continue;
      }

      for (const entry of entries) {
        if (typeof entry !== 'string') {
          continue;
        }

        if (!index.has(entry)) {
          index.set(entry, []);
        }
        index.get(entry).push(capability.id);
      }
    }
  }

  return index;
}

function main() {
  const args = parseCommonArgs(process.argv, { allowWarnOnly: true });
  const results = { errors: [], warnings: [], info: [] };

  if (args.unknownFlags.length > 0) {
    results.errors.push(`Unknown option(s): ${args.unknownFlags.join(', ')}`);
    outputResults('Validating capability scope', results, args.jsonOutput);
    process.exit(1);
  }

  const { shouldBeScoped, normalizedScopeRoot } = buildScopedFileMatcher(args.specsDir);
  const scopePatterns = [
    /\.feature$/,
    /\.model\.ya?ml$/,
    /\.lifecycle\.ya?ml$/,
    /\.ya?ml$/,
    /\.md$/,
  ];

  const targetFiles = (collectFiles(args.specsDir, args.specificFiles, scopePatterns)
    || findFilesByPatterns(args.specsDir, scopePatterns))
    .map((filePath) => path.relative(process.cwd(), filePath).replace(/\\/g, '/'))
    .filter((filePath) => shouldBeScoped(filePath));

  const capabilities = loadCapabilities(args.specsDir);

  if (capabilities.length === 0) {
    results.info.push(`No capability files found in ${normalizedScopeRoot}/capabilities/`);
    results.info.push('Scope checking skipped - create capability files to enable');
    outputResults('Validating capability scope', results, args.jsonOutput);
    process.exit(0);
  }

  results.info.push(`Found ${capabilities.length} capability file(s): ${capabilities.map((cap) => cap.id).join(', ')}`);

  const scopeIndex = buildScopeIndex(capabilities);

  let covered = 0;
  let uncovered = 0;

  for (const filePath of targetFiles) {
    if (scopeIndex.has(filePath)) {
      covered++;
      continue;
    }

    uncovered++;
    const message = `${filePath}: Not listed in any capability scope`;
    if (args.warnOnly) {
      results.warnings.push(message);
    } else {
      results.errors.push(message);
    }
  }

  results.info.push(`Scope coverage: ${covered}/${covered + uncovered} files covered`);

  let staleEntries = 0;
  for (const capability of capabilities) {
    for (const [category, entries] of Object.entries(capability.scope)) {
      if (!Array.isArray(entries)) {
        continue;
      }

      for (const entry of entries) {
        if (typeof entry !== 'string') {
          continue;
        }

        if (!fileExists(entry)) {
          staleEntries++;
          results.errors.push(`${capability.file}: Scope entry '${entry}' in ${category} does not exist`);
        }
      }
    }
  }

  if (staleEntries > 0) {
    results.info.push(`Found ${staleEntries} stale scope entry/entries`);
  }

  for (const capability of capabilities) {
    if (!capability.id) {
      results.warnings.push(`${capability.file}: Missing 'id' field`);
    }
  }

  applyStrictMode(results, args.strict);
  outputResults('Validating capability scope', results, args.jsonOutput);

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
