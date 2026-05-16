#!/usr/bin/env node

/**
 * Validates that model rule `enforced:` blocks resolve to real artifacts (#41).
 *
 * For each model (.model.yaml) file:
 *   - For each rule with an `enforced` field, classify into one of:
 *       narrative — a legacy string tag (e.g., `enforced: persistence`).
 *                   INFO: not bound; cannot be verified.
 *       pending   — `enforced: { pending: "issue #123" }`. INFO with the
 *                   tracker; allowed during implementation.
 *       bound     — array of { kind, binding } entries. Each binding is
 *                   resolved against the filesystem; unresolved → ERROR.
 *       missing   — no enforced field. INFO.
 *
 * Usage:
 *   node tools/validate-enforcement-bindings.js [specs-dir]
 *
 * Options:
 *   --json
 *   --strict           Treat narrative + pending as warnings (defaults: info).
 *                      Useful in CI for repos that have promoted enforcement
 *                      binding to a hard rule.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { findFiles, formatResults } = require('./lib/parse-front-matter');
const { resolveBinding, classifyEnforced } = require('./lib/enforcement-bindings');

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

function loadModel(modelPath) {
  try { return yaml.load(fs.readFileSync(modelPath, 'utf8')); }
  catch { return null; }
}

function main() {
  const results = { errors: [], warnings: [], info: [] };
  const modelsDir = path.join(specsDir, 'models');
  const modelFiles = findFiles(modelsDir, /\.model\.ya?ml$/i);
  const repoRoot = path.dirname(specsDir);

  if (modelFiles.length === 0) {
    results.info.push('No model files found — enforcement-binding check skipped');
    outputResults(results);
    process.exit(0);
  }

  for (const modelFile of modelFiles) {
    const relative = path.relative(process.cwd(), modelFile);
    const model = loadModel(modelFile);
    if (!model || !Array.isArray(model.rules)) continue;

    for (const rule of model.rules) {
      const ruleId = rule.id || '(unnamed-rule)';
      const enforced = classifyEnforced(rule.enforced);

      if (enforced.form === 'missing') {
        continue;
      }
      if (enforced.form === 'narrative') {
        const msg = `${relative}: rule "${ruleId}" has narrative enforced:"${enforced.value}" — consider binding to a concrete enforcement point or marking pending`;
        if (strict) results.warnings.push(msg);
        else results.info.push(msg);
        continue;
      }
      if (enforced.form === 'pending') {
        const msg = `${relative}: rule "${ruleId}" enforcement pending (${enforced.tracker})`;
        if (strict) results.warnings.push(msg);
        else results.info.push(msg);
        continue;
      }
      if (enforced.form === 'bound') {
        for (const entry of enforced.bindings) {
          const result = resolveBinding(entry, { repoRoot });
          if (!result.resolved) {
            results.errors.push(`${relative}: rule "${ruleId}" kind:${entry.kind} binding unresolved — ${result.reason}`);
          } else {
            results.info.push(`${relative}: rule "${ruleId}" kind:${entry.kind} ⇒ ${entry.binding}`);
            if (result.advisory) {
              results.warnings.push(`${relative}: rule "${ruleId}" — ${result.advisory}`);
            }
          }
        }
      }
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
    console.log('Validating enforcement bindings...\n');
    console.log(formatResults(results));
  }
}

main();
