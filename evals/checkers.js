'use strict';

// Deterministic checker tier of the evaluation instrument (#58). The checkers
// ARE the shipped tools/validate-*.js suite, run as pure functions over the
// artifact tree a trial produced. The instrument may depend on the product —
// trials are recorded through the system under test — but never the reverse.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DIAGNOSTIC_CHECKS, runValidator } = require('../tools/lib/doctor');
const { jcsSha256 } = require('../tools/lib/contract-digests');

const IGNORED_TREE_ENTRIES = new Set(['.git', 'node_modules', '.idd', '.DS_Store']);

function runDeterministicCheckers(repoRoot) {
  const checks = {};
  let errors = 0;
  let warnings = 0;
  for (const check of DIAGNOSTIC_CHECKS) {
    const result = runValidator(repoRoot, check);
    const checkErrors = (result.errors || []).length;
    const checkWarnings = (result.warnings || []).length;
    checks[check] = {
      status: checkErrors > 0 ? 'error' : checkWarnings > 0 ? 'advisory' : 'pass',
      errors: checkErrors,
      warnings: checkWarnings,
    };
    errors += checkErrors;
    warnings += checkWarnings;
  }
  return {
    checks,
    errors,
    warnings,
    traceability_closure: checks.traceability.errors === 0 && checks['capability-closure'].errors === 0,
    contract_conformance: checks.contracts.errors === 0 && checks.verification.errors === 0,
    fixture_integrity: checks.fixtures.errors === 0,
  };
}

function digestFile(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

/**
 * Content-address every file in a tree: sorted repo-relative paths mapped to
 * sha256 digests of the raw bytes. The JCS digest of that map is the tree's
 * seed digest, so a record pins exactly which bytes were measured.
 */
function digestTree(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_TREE_ENTRIES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        files.push({ path: path.relative(root, full).replace(/\\/g, '/'), digest: digestFile(full) });
      }
    }
  }
  visit(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const map = Object.fromEntries(files.map((file) => [file.path, file.digest]));
  return { files, digest: jcsSha256(map) };
}

module.exports = { digestTree, runDeterministicCheckers };
