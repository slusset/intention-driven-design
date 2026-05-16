#!/usr/bin/env node

/**
 * Validates that spec files are listed in at least one capability's scope.
 *
 * Checks:
 * - Every spec file (features, contracts, models, stories) appears in at
 *   least one specs/capabilities/*.capability.yaml scope block
 * - Capability scope entries point to files that exist
 * - No stale entries in capability scope (files that were removed)
 *
 * Usage:
 *   node tools/validate-capability-scope.js [specs-dir]
 *   node tools/validate-capability-scope.js --files file1.feature file2.md
 *
 * Options:
 *   --files <paths...>  Check only specific files (for CI on PR diffs)
 *   --json              Output results as JSON
 *   --warn-only         Don't fail on uncovered files (just warn)
 *
 * Exit: 0 = pass, 1 = errors found
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { findFiles, fileExists, formatResults } = require('./lib/parse-front-matter');
const { getValidator, formatAjvErrors } = require('./lib/schema-loader');

// ── Parse arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);
let specsDir = null;
let specificFiles = null;
let jsonOutput = false;
let warnOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--files') {
    specificFiles = [];
    i++;
    while (i < args.length && !args[i].startsWith('--')) {
      specificFiles.push(args[i]);
      i++;
    }
    i--;
  } else if (args[i] === '--json') {
    jsonOutput = true;
  } else if (args[i] === '--warn-only') {
    warnOnly = true;
  } else if (!args[i].startsWith('--')) {
    specsDir = path.resolve(args[i]);
  }
}

if (!specsDir) {
  specsDir = path.join(process.cwd(), 'specs');
}

const ROOT_PREFIX = path.relative(process.cwd(), specsDir).replace(/\\/g, '/');

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── File patterns that should appear in capability scope ──────────────
// Not all spec files need to be in scope — personas and journeys are
// referenced by capabilities but checking them is optional.
// The key artifacts that MUST be in scope are features, contracts, models,
// and stories.
const SCOPED_PATTERNS = [
  new RegExp(`^${escapeRegExp(ROOT_PREFIX ? `${ROOT_PREFIX}/` : '')}features\\/.*\\.feature$`),
  new RegExp(`^${escapeRegExp(ROOT_PREFIX ? `${ROOT_PREFIX}/` : '')}stories\\/.*\\.md$`),
  new RegExp(`^${escapeRegExp(ROOT_PREFIX ? `${ROOT_PREFIX}/` : '')}models\\/.*\\.model\\.ya?ml$`),
  new RegExp(`^${escapeRegExp(ROOT_PREFIX ? `${ROOT_PREFIX}/` : '')}models\\/.*\\.lifecycle\\.ya?ml$`),
  new RegExp(`^${escapeRegExp(ROOT_PREFIX ? `${ROOT_PREFIX}/` : '')}contracts\\/.*\\.ya?ml$`),
];

function shouldBeScoped(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return SCOPED_PATTERNS.some(pattern => pattern.test(normalized));
}

// ── Load all capability files ─────────────────────────────────────────
function loadCapabilities() {
  const capDir = path.join(specsDir, 'capabilities');
  const capFiles = findFiles(capDir, /\.capability\.ya?ml$/);
  const capabilities = [];
  const schemaErrors = [];
  const validate = getValidator('capability');

  for (const capFile of capFiles) {
    try {
      const content = fs.readFileSync(capFile, 'utf8');
      const data = yaml.load(content);
      const relative = path.relative(process.cwd(), capFile);
      if (data && typeof data === 'object') {
        const r = validate(data);
        if (!r.valid) {
          for (const msg of formatAjvErrors(r.errors)) {
            schemaErrors.push(`${relative}: schema: ${msg}`);
          }
        }
      }
      if (data && data.scope) {
        capabilities.push({
          file: relative,
          id: data.id || path.basename(capFile, '.capability.yaml'),
          scope: data.scope,
        });
      }
    } catch (e) {
      // Will be reported by other checkers
    }
  }

  return { capabilities, schemaErrors };
}

/**
 * Build a set of all file paths listed in any capability scope.
 */
function buildScopeIndex(capabilities) {
  const index = new Map(); // filePath → [capability ids]

  for (const cap of capabilities) {
    for (const [category, entries] of Object.entries(cap.scope)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        if (!index.has(entry)) {
          index.set(entry, []);
        }
        index.get(entry).push(cap.id);
      }
    }
  }

  return index;
}

// ── Collect files to check ────────────────────────────────────────────
function collectFiles() {
  if (specificFiles) {
    // Filter to only files that should be scoped
    return Array.from(new Set(specificFiles
      .map(f => path.relative(process.cwd(), path.resolve(f)))
      .filter(f => shouldBeScoped(f))));
  }

  // Find all scopeable spec files
  const allFiles = new Set();
  const patterns = [
    /\.feature$/,
    /\.model\.ya?ml$/,
    /\.lifecycle\.ya?ml$/,
    /\.ya?ml$/,  // for contracts
    /\.md$/,     // for stories
  ];

  for (const pattern of patterns) {
    const found = findFiles(specsDir, pattern);
    for (const f of found) {
      const rel = path.relative(process.cwd(), f);
      if (shouldBeScoped(rel)) {
        allFiles.add(rel);
      }
    }
  }

  return Array.from(allFiles);
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  const results = { errors: [], warnings: [], info: [] };

  // Load capabilities
  const { capabilities, schemaErrors } = loadCapabilities();
  for (const msg of schemaErrors) {
    results.errors.push(msg);
  }

  if (capabilities.length === 0) {
    results.info.push('No capability files found in specs/capabilities/');
    results.info.push('Scope checking skipped — create capability files to enable');
    outputResults(results);
    process.exit(0);
  }

  results.info.push(`Found ${capabilities.length} capability file(s): ${capabilities.map(c => c.id).join(', ')}`);

  // Build the scope index
  const scopeIndex = buildScopeIndex(capabilities);

  // Check 1: Are target files covered by at least one capability?
  const filesToCheck = collectFiles();
  let covered = 0;
  let uncovered = 0;

  for (const filePath of filesToCheck) {
    if (scopeIndex.has(filePath)) {
      covered++;
    } else {
      uncovered++;
      const msg = `${filePath}: Not listed in any capability scope`;
      if (warnOnly) {
        results.warnings.push(msg);
      } else {
        results.errors.push(msg);
      }
    }
  }

  results.info.push(`Scope coverage: ${covered}/${covered + uncovered} files covered`);

  // Check 2: Do scope entries point to files that exist?
  let staleEntries = 0;
  for (const cap of capabilities) {
    for (const [category, entries] of Object.entries(cap.scope)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        if (!fileExists(entry)) {
          staleEntries++;
          results.errors.push(`${cap.file}: Scope entry '${entry}' in ${category} does not exist`);
        }
      }
    }
  }

  if (staleEntries > 0) {
    results.info.push(`Found ${staleEntries} stale scope entry/entries`);
  }

  // Check 3: Capability files have required fields
  for (const cap of capabilities) {
    if (!cap.id) {
      results.warnings.push(`${cap.file}: Missing 'id' field`);
    }
  }

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
    console.log('Checking capability scope...\n');
    console.log(formatResults(results));
  }
}

main();
