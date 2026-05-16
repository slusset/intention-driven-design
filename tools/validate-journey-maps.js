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
const { getValidator, categorize } = require('./lib/schema-loader');
const { categorize: categorizeKind } = require('./lib/kinds');

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

// Legacy enums retained for messages. Authoritative vocabulary lives in
// tools/lib/kinds.js (ACTION_COMBINATIONS, ASSERTION_COMBINATIONS).
const LEGACY_ACTION_TYPES = [
  'navigate', 'click', 'fill', 'select', 'check', 'uncheck',
  'wait', 'hover', 'scroll', 'press', 'type', 'upload',
];

const LEGACY_ASSERTION_TYPES = [
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

function validateLegacyStepModel(map, errors, warnings, info) {
  if (!map.steps || typeof map.steps !== 'object' || Array.isArray(map.steps)) {
    errors.push('Missing required field: steps (legacy object format)');
    return;
  }

  // Shape selects step-ordering rules (#39). Default is `sequential` for back-compat.
  const shape = typeof map.shape === 'string' ? map.shape : 'sequential';
  const stepsByNumber = new Map();
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
    } else {
      const num = step.journey_step;
      if (shape === 'sequential') {
        if (typeof num === 'number' && num <= lastStepNumber) {
          warnings.push(`Step "${stepId}" has non-sequential journey_step (${num} after ${lastStepNumber}). Declare \`shape: branching\` or \`shape: hierarchical\` if the order is intentional.`);
        } else if (typeof num === 'number') {
          lastStepNumber = num;
        }
      } else if (shape === 'branching') {
        if (!step.branch) {
          warnings.push(`Step "${stepId}" under shape:branching is missing a \`branch:\` key`);
        }
        const group = stepsByNumber.get(num) || [];
        group.push({ stepId, branch: step.branch });
        stepsByNumber.set(num, group);
      }
      // shape:hierarchical accepts any journey_step format (e.g., "3a", "3b")
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

        applyKindedCheck({
          slot: 'action',
          value: action,
          context: `Step "${stepId}" action`,
          legacyNames: LEGACY_ACTION_TYPES,
          validKindsHint: 'ui-interaction, navigation, wait, network',
          errors,
          warnings,
          info,
        });

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

        applyKindedCheck({
          slot: 'assertion',
          value: assertion,
          context: `Step "${stepId}" assertion`,
          legacyNames: LEGACY_ASSERTION_TYPES,
          validKindsHint: 'dom, url, api, cookie, classification, tag, context',
          errors,
          warnings,
          info,
        });

        if (assertion.selector && !String(assertion.selector).includes('data-testid')) {
          warnings.push(`Step "${stepId}" assertion selector doesn't use data-testid: ${assertion.selector}`);
        }
      }
    }
  }

  if (shape === 'branching') {
    for (const [num, group] of stepsByNumber.entries()) {
      if (group.length < 2) continue;
      const branches = group.map((g) => g.branch).filter(Boolean);
      const uniqueBranches = new Set(branches);
      if (uniqueBranches.size !== branches.length) {
        warnings.push(`shape:branching — journey_step ${num} has steps sharing the same \`branch:\` value (${[...group].map((g) => `${g.stepId}/${g.branch || '(none)'}`).join(', ')})`);
      } else {
        info.push(`shape:branching — journey_step ${num} fans out across branches: ${branches.join(', ')}`);
      }
    }
  }
}

function applyKindedCheck({ slot, value, context, legacyNames, validKindsHint, errors, warnings, info }) {
  const result = categorizeKind(slot, value);
  if (result.status === 'expanded') {
    info.push(`${context} type:${result.legacyType} ⇒ ${result.description}`);
  } else if (result.status === 'kinded') {
    // expanded form, no legacy name — self-describing
  } else if (result.status === 'mixed') {
    info.push(`${context} type:${result.legacyType} ⇒ ${result.description}`);
    for (const conflict of result.conflicts) {
      warnings.push(`${context} conflict between legacy type and expanded form — ${conflict}`);
    }
  } else if (result.status === 'unknown') {
    if (result.legacyType) {
      warnings.push(`${context} has unrecognized type: ${result.legacyType}. Known legacy names: ${legacyNames.join(', ')}. Or use the expanded form with kind/property/target.`);
    } else if (result.kind) {
      warnings.push(`${context} has unknown kind: ${result.kind}. Allowed kinds: ${validKindsHint}.`);
    } else {
      errors.push(`${context} missing type or kind`);
    }
  }
}

function validateCurrentStepModel(map, errors, warnings, info = []) {
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
  const info = [];

  let map;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = parseFrontMatter(filePath, content);
    if (parsed.parseError) {
      return { errors: [`Invalid YAML or unreadable file: ${parsed.parseError}`], warnings: [], info: [] };
    }
    map = parsed.body;
  } catch (error) {
    return { errors: [`Invalid YAML or unreadable file: ${error.message}`], warnings: [], info: [] };
  }

  if (!map || typeof map !== 'object') {
    return { errors: ['YAML root must be an object'], warnings: [], info: [] };
  }

  const schemaCheck = getValidator('journey-map')(map);
  if (!schemaCheck.valid) {
    const c = categorize(schemaCheck.errors, map, {
      schemaUrl: 'https://github.com/slusset/intention-driven-design/schemas/v1/journey-map.schema.json',
    });
    for (const msg of c.errors) errors.push(`schema: ${msg}`);
    for (const msg of c.warnings) warnings.push(`schema: ${msg}`);
    for (const msg of c.info) warnings.push(`schema: ${msg}`);
  }

  if (!map.journey) {
    errors.push('Missing required field: journey');
  }

  const expectedJourney = expectedJourneyFromFilename(filePath);
  if (map.journey && map.journey !== expectedJourney) {
    warnings.push(`Journey name "${map.journey}" doesn't match filename "${expectedJourney}"`);
  }

  if (Array.isArray(map.steps)) {
    validateCurrentStepModel(map, errors, warnings, info);
  } else {
    validateLegacyStepModel(map, errors, warnings, info);
  }

  return { errors, warnings, info };
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
    const { errors, warnings, info = [] } = validateJourneyMap(mapFile);

    for (const error of errors) {
      results.errors.push(`${relativePath}: ${error}`);
    }

    for (const warning of warnings) {
      results.warnings.push(`${relativePath}: ${warning}`);
    }

    for (const item of info) {
      results.info.push(`${relativePath}: ${item}`);
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
