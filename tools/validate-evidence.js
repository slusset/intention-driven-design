#!/usr/bin/env node

/**
 * Validate a certification evidence manifest against IDD certification thresholds.
 *
 * Evidence manifests are generated (see generate-evidence.js), not committed —
 * this validator normally runs against the gitignored `.idd/evidence/`
 * workspace or a CI-generated manifest.
 *
 * Usage:
 *   node tools/validate-evidence.js --evidence .idd/evidence/foo/evidence.yaml
 *
 * Options:
 *   --evidence <path>  Required evidence manifest path
 *   --allow-gaps       Allow non-empty gaps list without failing
 *   --json             Output machine-readable results
 *
 * Exit: 0 = pass, 1 = errors found
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { fileExists, formatResults } = require('./lib/parse-front-matter');

const args = process.argv.slice(2);
let evidencePath = null;
let allowGaps = false;
let jsonOutput = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--evidence') {
    evidencePath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--allow-gaps') {
    allowGaps = true;
  } else if (arg === '--json') {
    jsonOutput = true;
  }
}

const results = {
  errors: [],
  warnings: [],
  info: [],
};

function toProjectRelative(absolutePath) {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
}

function parseYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function parseRatio(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return null;
  return {
    covered: Number(match[1]),
    total: Number(match[2]),
  };
}

function checkRequiredField(obj, fieldPath, label = fieldPath) {
  const value = fieldPath.split('.').reduce((current, key) => {
    if (!isObject(current)) return undefined;
    return current[key];
  }, obj);

  if (value === undefined || value === null || value === '') {
    results.errors.push(`Missing required field: ${label}`);
    return undefined;
  }

  return value;
}

function checkReportPath(evidenceDir, sectionName, reportPath) {
  if (reportPath == null || reportPath === '') {
    results.warnings.push(`${sectionName}: No report path recorded`);
    return;
  }

  const resolved = path.resolve(evidenceDir, reportPath);
  if (!fs.existsSync(resolved)) {
    results.errors.push(`${sectionName}: Report file not found: ${reportPath}`);
  }
}

function checkFailedCount(sectionName, section) {
  if (!isObject(section)) {
    results.errors.push(`${sectionName}: Evidence section is missing or invalid`);
    return;
  }

  if (section.failed == null) {
    results.warnings.push(`${sectionName}: Failed count is not recorded`);
    return;
  }

  if (typeof section.failed !== 'number') {
    results.errors.push(`${sectionName}: Failed count must be numeric`);
    return;
  }

  if (section.failed > 0) {
    results.errors.push(`${sectionName}: Failed count must be 0 (found ${section.failed})`);
  }
}

function validateTraceabilitySection(traceability) {
  if (!isObject(traceability)) {
    results.errors.push('Missing required field: traceability');
    return;
  }

  const ratioFields = [
    'stories_with_features',
    'features_with_contracts',
    'endpoints_with_tests',
    'journeys_with_e2e',
  ];

  for (const field of ratioFields) {
    const value = traceability[field];
    if (value == null || value === '') {
      results.errors.push(`traceability.${field}: Missing required value`);
      continue;
    }

    const parsed = parseRatio(value);
    if (!parsed) {
      results.errors.push(`traceability.${field}: Expected X/Y ratio, found '${value}'`);
      continue;
    }

    if (parsed.covered !== parsed.total) {
      results.errors.push(`traceability.${field}: Expected 100% coverage, found ${value}`);
    }
  }

  const orphanFields = [
    'orphan_tests',
    'orphan_features',
    'orphan_endpoints',
  ];

  for (const field of orphanFields) {
    const value = traceability[field];
    if (value == null) {
      results.errors.push(`traceability.${field}: Missing required value`);
      continue;
    }
    if (typeof value !== 'number') {
      results.errors.push(`traceability.${field}: Expected numeric value`);
      continue;
    }
    if (value !== 0) {
      results.errors.push(`traceability.${field}: Expected 0, found ${value}`);
    }
  }
}

function validateGaps(gaps) {
  if (!Array.isArray(gaps)) {
    results.errors.push('Missing required field: gaps');
    return;
  }

  if (gaps.length === 0) {
    results.info.push('No declared certification gaps');
    return;
  }

  if (allowGaps) {
    results.warnings.push(`Certification includes ${gaps.length} declared gap(s); allowed via --allow-gaps`);
  } else {
    results.errors.push(`Certification includes ${gaps.length} declared gap(s); use --allow-gaps only when human approval exists`);
  }
}

function main() {
  if (!evidencePath) {
    results.errors.push('Missing required option: --evidence <path>');
    return finish();
  }

  if (!fs.existsSync(evidencePath)) {
    results.errors.push(`Evidence file not found: ${toProjectRelative(evidencePath)}`);
    return finish();
  }

  let evidence;
  try {
    evidence = parseYaml(evidencePath);
  } catch (error) {
    results.errors.push(`Failed to parse evidence file: ${error.message}`);
    return finish();
  }

  if (!isObject(evidence)) {
    results.errors.push('Evidence manifest is empty or invalid');
    return finish();
  }

  const capabilityRef = checkRequiredField(evidence, 'capability');
  checkRequiredField(evidence, 'certified_at');
  checkRequiredField(evidence, 'certified_by');
  const evidenceSection = checkRequiredField(evidence, 'evidence');
  const traceabilitySection = checkRequiredField(evidence, 'traceability');
  const gapsSection = checkRequiredField(evidence, 'gaps');

  if (typeof capabilityRef === 'string') {
    if (!fileExists(capabilityRef)) {
      results.errors.push(`Referenced capability file not found: ${capabilityRef}`);
    } else {
      results.info.push(`Referenced capability found: ${capabilityRef}`);
    }
  }

  const evidenceDir = path.dirname(evidencePath);
  if (isObject(evidenceSection)) {
    const unitTests = evidenceSection.unit_tests;
    const contractTests = evidenceSection.contract_tests;
    const e2eTests = evidenceSection.e2e_tests;
    const coverage = evidenceSection.coverage;

    checkFailedCount('evidence.unit_tests', unitTests);
    checkFailedCount('evidence.contract_tests', contractTests);
    checkFailedCount('evidence.e2e_tests', e2eTests);

    checkReportPath(evidenceDir, 'evidence.unit_tests', unitTests?.report);
    checkReportPath(evidenceDir, 'evidence.contract_tests', contractTests?.report);
    checkReportPath(evidenceDir, 'evidence.e2e_tests', e2eTests?.report);

    if (coverage?.report) {
      checkReportPath(evidenceDir, 'evidence.coverage', coverage.report);
    } else {
      results.info.push('Coverage report not recorded (informational only)');
    }
  }

  validateTraceabilitySection(traceabilitySection);
  validateGaps(gapsSection);

  finish();
}

function finish() {
  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(formatResults(results));
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
