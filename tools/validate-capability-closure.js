#!/usr/bin/env node

/**
 * Validates capability scope as a reference closure (#40).
 *
 * For each capability file (specs/capabilities/*.capability.yaml):
 *   1. Compute the transitive closure of artifacts reachable from the
 *      declared scope, following references in front-matter and contract
 *      x-* extensions (see tools/lib/reference-graph.js).
 *   2. Compare the closure against the declared scope:
 *        - In closure but not declared       → warning ("missing from scope")
 *        - In declared scope but not reached → warning ("declared but not reachable")
 *        - In `scope.excluded`               → ignored
 *
 * Complements tools/validate-capability-scope.js, which checks "every spec
 * file is in some capability scope". Capability closure is the inverse
 * obligation: "every reachable artifact is in *this* capability's scope".
 *
 * Usage:
 *   node tools/validate-capability-closure.js [specs-dir]
 *
 * Options:
 *   --json            JSON output
 *   --strict          Treat warnings as errors
 */

const fs = require('fs');
const path = require('path');
const { findFiles, formatResults } = require('./lib/parse-front-matter');
const { loadCapability, computeClosure, isNarrativeTier } = require('./lib/reference-graph');

const args = process.argv.slice(2);
let specsDir = null;
let jsonOutput = false;
let strict = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') jsonOutput = true;
  else if (args[i] === '--strict') strict = true;
  else if (!args[i].startsWith('--')) specsDir = path.resolve(args[i]);
}

if (!specsDir) specsDir = path.join(process.cwd(), 'specs');

function flattenScope(scope) {
  const out = new Set();
  for (const items of Object.values(scope)) {
    for (const item of items) out.add(item);
  }
  return out;
}

function main() {
  const results = { errors: [], warnings: [], info: [] };
  const capDir = path.join(specsDir, 'capabilities');
  const capFiles = findFiles(capDir, /\.capability\.ya?ml$/);
  // References are repo-relative (specs/..., examples/...). Resolve them
  // against the parent of the specs dir so the walker works regardless of
  // where the spec tree lives.
  const repoRoot = path.dirname(specsDir);

  if (capFiles.length === 0) {
    results.info.push('No capability files found — closure check skipped');
    outputResults(results);
    process.exit(0);
  }

  for (const capFile of capFiles) {
    const relative = path.relative(process.cwd(), capFile);
    const capability = loadCapability(capFile);
    if (!capability) {
      results.warnings.push(`${relative}: capability has no scope block`);
      continue;
    }

    const declared = flattenScope(capability.scope);
    const excluded = new Set(capability.excluded || []);
    const { closure, incomingRefs } = computeClosure(capability, { repoRoot });

    const missingFromScope = [];
    for (const item of closure) {
      if (!declared.has(item) && !excluded.has(item)) {
        missingFromScope.push(item);
      }
    }

    // Dead-spec heuristic: a narrative-tier artifact (persona / journey / story)
    // declared in scope but with no incoming reference is likely dead. The
    // structured tier (features, models, lifecycles, journey-maps, fixtures,
    // contracts) often legitimately sits at graph leaves with no inbound refs,
    // so we skip the check for those.
    const declaredButUnreachable = [];
    for (const item of declared) {
      if (excluded.has(item)) continue;
      if (!isNarrativeTier(item)) continue;
      const incoming = incomingRefs.get(item);
      if (!incoming || incoming.size === 0) {
        declaredButUnreachable.push(item);
      }
    }

    if (missingFromScope.length === 0 && declaredButUnreachable.length === 0) {
      results.info.push(`${relative}: closure OK (scope = ${declared.size}, closure = ${closure.size}, excluded = ${excluded.size})`);
    }

    for (const item of missingFromScope.sort()) {
      results.warnings.push(`${relative}: reachable from scope but not declared — ${item}. Add to scope, or list under \`scope.excluded\` if owned by another capability.`);
    }

    for (const item of declaredButUnreachable.sort()) {
      results.warnings.push(`${relative}: declared in scope but not reachable from any other artifact — ${item}. May be dead spec; otherwise add a reference somewhere in the closure.`);
    }
  }

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map((w) => `${w} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

function outputResults(results) {
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('Validating capability reference closure...\n');
    console.log(formatResults(results));
  }
}

main();
