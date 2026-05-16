#!/usr/bin/env node

/**
 * Validates journey map files for structural compliance.
 *
 * Usage:
 *   node tools/validate-journey-maps.js [specs-dir]
 *   node tools/validate-journey-maps.js --files specs/journey-maps/example.journey-map.yaml
 *
 * Options:
 *   --files <paths...>  Validate only specific journey-map files
 *   --json              Output results as JSON
 *   --strict            Treat warnings as errors
 */

const fs = require('fs');
const path = require('path');
const { findFiles, formatResults, parseFrontMatter } = require('./lib/parse-front-matter');
const { getValidator, formatAjvErrors } = require('./lib/schema-loader');

const args = process.argv.slice(2);
let specsDir = null;
let specificFiles = null;
let jsonOutput = false;
let strict = false;

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--files') {
    specificFiles = [];
    i += 1;
    while (i < args.length && !args[i].startsWith('--')) {
      specificFiles.push(args[i]);
      i += 1;
    }
    i -= 1;
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

const JOURNEY_MAPS_DIR = path.join(specsDir, 'journey-maps');
const MAP_PATTERN = /\.(?:map|journey-map)\.ya?ml$/i;

const VALID_ACTION_TYPES = [
  'navigate', 'click', 'fill', 'select', 'check', 'uncheck',
  'wait', 'hover', 'scroll', 'press', 'type', 'upload',
];

const VALID_ASSERTION_TYPES = [
  'visible', 'hidden', 'text', 'url', 'api', 'count',
  'polling', 'attribute', 'value', 'enabled', 'disabled',
];

function collectJourneyMaps() {
  if (specificFiles) {
    const files = new Set();
    for (const input of specificFiles) {
      const resolved = path.resolve(input);
      if (!fs.existsSync(resolved) || !MAP_PATTERN.test(resolved)) {
        continue;
      }
      files.add(resolved);
    }
    return Array.from(files);
  }

  return findFiles(JOURNEY_MAPS_DIR, MAP_PATTERN);
}

function expectedJourneyFromFilename(filePath) {
  return path.basename(filePath)
    .replace(/\.journey-map\.ya?ml$/i, '')
    .replace(/\.map\.ya?ml$/i, '');
}

function validateLegacyStepModel(map, errors, warnings) {
  if (!map.steps || typeof map.steps !== 'object' || Array.isArray(map.steps)) {
    errors.push('Missing required field: steps (legacy object format)');
    return;
  }

  let lastStepNumber = 0;

  for (const [stepId, step] of Object.entries(map.steps)) {
    if (!/^[a-z][a-z0-9-]*$/.test(stepId)) {
      warnings.push(`Step ID "${stepId}" should be kebab-case`);
    }

    if (!step || typeof step !== 'object') {
      errors.push(`Step "${stepId}" must be an object`);
      continue;
    }

    if (!step.journey_step) {
      errors.push(`Step "${stepId}" missing journey_step number`);
    } else if (step.journey_step <= lastStepNumber) {
      warnings.push(`Step "${stepId}" has non-sequential journey_step (${step.journey_step} after ${lastStepNumber})`);
    } else {
      lastStepNumber = step.journey_step;
    }

    if (!step.title) {
      errors.push(`Step "${stepId}" missing title`);
    }

    if (Array.isArray(step.actions)) {
      for (const action of step.actions) {
        if (!action || typeof action !== 'object') {
          errors.push(`Step "${stepId}" has action that is not an object`);
          continue;
        }

        if (!action.type) {
          errors.push(`Step "${stepId}" has action without type`);
        } else if (!VALID_ACTION_TYPES.includes(action.type)) {
          warnings.push(`Step "${stepId}" has unknown action type: ${action.type}`);
        }

        if (action.target && !String(action.target).includes('data-testid')) {
          warnings.push(`Step "${stepId}" action target doesn't use data-testid: ${action.target}`);
        }
      }
    }

    if (Array.isArray(step.assertions)) {
      for (const assertion of step.assertions) {
        if (!assertion || typeof assertion !== 'object') {
          errors.push(`Step "${stepId}" has assertion that is not an object`);
          continue;
        }

        if (!assertion.type) {
          errors.push(`Step "${stepId}" has assertion without type`);
        } else if (!VALID_ASSERTION_TYPES.includes(assertion.type)) {
          warnings.push(`Step "${stepId}" has unknown assertion type: ${assertion.type}`);
        }

        if (assertion.selector && !String(assertion.selector).includes('data-testid')) {
          warnings.push(`Step "${stepId}" assertion selector doesn't use data-testid: ${assertion.selector}`);
        }
      }
    }
  }
}

function validateCurrentStepModel(map, errors, warnings) {
  if (!Array.isArray(map.steps) || map.steps.length === 0) {
    errors.push('Missing required field: steps (array format)');
    return;
  }

  for (const step of map.steps) {
    if (!step || typeof step !== 'object') {
      errors.push('Step entry must be an object');
      continue;
    }

    if (!step.id) {
      errors.push('Step missing id');
      continue;
    }

    if (!/^[a-z][a-z0-9-]*$/.test(step.id)) {
      warnings.push(`Step ID "${step.id}" should be kebab-case`);
    }

    if (!step.story) {
      warnings.push(`Step "${step.id}" missing story reference`);
    }
  }
}

function validateJourneyMap(filePath) {
  const errors = [];
  const warnings = [];

  let map;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseFrontMatter(filePath, content);
    if (parsed.parseError) {
      return { errors: [`Invalid YAML or unreadable file: ${parsed.parseError}`], warnings: [] };
    }
    map = parsed.body;
  } catch (error) {
    return { errors: [`Invalid YAML or unreadable file: ${error.message}`], warnings: [] };
  }

  if (!map || typeof map !== 'object') {
    return { errors: ['YAML root must be an object'], warnings: [] };
  }

  const schemaCheck = getValidator('journey-map')(map);
  if (!schemaCheck.valid) {
    for (const msg of formatAjvErrors(schemaCheck.errors)) {
      errors.push(`schema: ${msg}`);
    }
  }

  if (!map.journey) {
    errors.push('Missing required field: journey');
  }

  const expectedJourney = expectedJourneyFromFilename(filePath);
  if (map.journey && map.journey !== expectedJourney) {
    warnings.push(`Journey name "${map.journey}" doesn't match filename "${expectedJourney}"`);
  }

  if (Array.isArray(map.steps)) {
    validateCurrentStepModel(map, errors, warnings);
  } else {
    validateLegacyStepModel(map, errors, warnings);
  }

  return { errors, warnings };
}

function outputResults(results) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  process.stdout.write('Validating journey maps...\n\n');
  process.stdout.write(`${formatResults(results)}\n`);
}

function main() {
  const results = { errors: [], warnings: [], info: [] };
  const mapFiles = collectJourneyMaps();

  if (mapFiles.length === 0) {
    results.info.push('No journey maps found to validate');
    outputResults(results);
    process.exit(0);
  }

  for (const mapFile of mapFiles) {
    const relativePath = path.relative(process.cwd(), mapFile);
    const { errors, warnings } = validateJourneyMap(mapFile);

    for (const error of errors) {
      results.errors.push(`${relativePath}: ${error}`);
    }

    for (const warning of warnings) {
      results.warnings.push(`${relativePath}: ${warning}`);
    }

    if (errors.length === 0 && warnings.length === 0) {
      results.info.push(`${relativePath}: valid`);
    }
  }

  results.info.push(`Validated ${mapFiles.length} journey map file(s)`);

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map((warning) => `${warning} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
