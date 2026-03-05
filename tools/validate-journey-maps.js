#!/usr/bin/env node

/**
 * Validates journey map YAML files against the expected schema.
 *
 * Usage: node tools/validate-journey-maps.js
 *
 * Expects journey maps in: specs/journey-maps/*.map.yaml or *.journey-map.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const JOURNEY_MAPS_DIR = path.join(process.cwd(), 'specs/journey-maps');

// Valid action types
const VALID_ACTION_TYPES = [
  'navigate', 'click', 'fill', 'select', 'check', 'uncheck',
  'wait', 'hover', 'scroll', 'press', 'type', 'upload'
];

// Valid assertion types
const VALID_ASSERTION_TYPES = [
  'visible', 'hidden', 'text', 'url', 'api', 'count',
  'polling', 'attribute', 'value', 'enabled', 'disabled'
];

function findJourneyMaps() {
  if (!fs.existsSync(JOURNEY_MAPS_DIR)) {
    return [];
  }

  const files = [];
  const pattern = /\.(?:map|journey-map)\.ya?ml$/i;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(JOURNEY_MAPS_DIR);
  return files;
}

function expectedJourneyFromFilename(filePath) {
  return path.basename(filePath)
    .replace(/\.journey-map\.ya?ml$/i, '')
    .replace(/\.map\.ya?ml$/i, '');
}

function validateFileRef(ref, errors, warnings, label) {
  if (!ref || typeof ref !== 'string') return;
  const refPath = path.join(process.cwd(), ref);
  if (!fs.existsSync(refPath)) {
    warnings.push(`${label} references non-existent file: ${ref}`);
  }
}

function validateLegacyStepModel(map, errors, warnings) {
  // Legacy format: steps as object keyed by step-id with journey_step/title fields
  if (!map.steps || typeof map.steps !== 'object' || Array.isArray(map.steps)) {
    errors.push('Missing required field: steps (legacy object format)');
    return;
  }

  let lastStepNumber = 0;
  for (const [stepId, step] of Object.entries(map.steps)) {
    if (!/^[a-z][a-z0-9-]*$/.test(stepId)) {
      warnings.push(`Step ID "${stepId}" should be kebab-case`);
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

    if (step.actions && Array.isArray(step.actions)) {
      for (const action of step.actions) {
        if (!action.type) {
          errors.push(`Step "${stepId}" has action without type`);
        } else if (!VALID_ACTION_TYPES.includes(action.type)) {
          warnings.push(`Step "${stepId}" has unknown action type: ${action.type}`);
        }
        if (action.target && !action.target.includes('data-testid')) {
          warnings.push(`Step "${stepId}" action target doesn't use data-testid: ${action.target}`);
        }
      }
    }

    if (step.assertions && Array.isArray(step.assertions)) {
      for (const assertion of step.assertions) {
        if (!assertion.type) {
          errors.push(`Step "${stepId}" has assertion without type`);
        } else if (!VALID_ASSERTION_TYPES.includes(assertion.type)) {
          warnings.push(`Step "${stepId}" has unknown assertion type: ${assertion.type}`);
        }
        if (assertion.selector && !assertion.selector.includes('data-testid')) {
          warnings.push(`Step "${stepId}" assertion selector doesn't use data-testid: ${assertion.selector}`);
        }
      }
    }
  }
}

function validateCurrentStepModel(map, errors, warnings) {
  // Current format: steps as array with ids and traceability refs
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
    } else {
      validateFileRef(step.story, errors, warnings, `Step "${step.id}" story`);
    }
  }
}

function validateJourneyMap(filePath) {
  const errors = [];
  const warnings = [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { errors: [`Cannot read file: ${e.message}`], warnings: [] };
  }

  let map;
  try {
    map = yaml.load(content);
  } catch (e) {
    return { errors: [`Invalid YAML: ${e.message}`], warnings: [] };
  }

  if (!map || typeof map !== 'object') {
    return { errors: ['YAML root must be an object'], warnings: [] };
  }

  if (!map.journey) {
    errors.push('Missing required field: journey');
  }

  // Validate journey name matches filename
  const expectedJourney = expectedJourneyFromFilename(filePath);
  if (map.journey && map.journey !== expectedJourney) {
    warnings.push(`Journey name "${map.journey}" doesn't match filename "${expectedJourney}"`);
  }

  if (Array.isArray(map.steps)) {
    validateCurrentStepModel(map, errors, warnings);
  } else {
    validateLegacyStepModel(map, errors, warnings);
  }

  // Current-format source references
  if (map.sources && typeof map.sources === 'object') {
    validateFileRef(map.sources.journey, errors, warnings, 'sources.journey');

    if (Array.isArray(map.sources.stories)) {
      for (const ref of map.sources.stories) {
        validateFileRef(ref, errors, warnings, 'sources.stories');
      }
    }

    if (Array.isArray(map.sources.features)) {
      for (const ref of map.sources.features) {
        validateFileRef(ref, errors, warnings, 'sources.features');
      }
    }
  }

  // Check fixture references
  if (map.fixtures && typeof map.fixtures === 'object') {
    for (const [name, fixture] of Object.entries(map.fixtures)) {
      if (fixture.ref) {
        validateFileRef(fixture.ref, errors, warnings, `Fixture "${name}"`);
      }
    }
  }

  return { errors, warnings };
}

function main() {
  console.log('Validating journey maps...\n');

  const mapFiles = findJourneyMaps();

  if (mapFiles.length === 0) {
    console.log('No journey maps found.');
    process.exit(0);
  }

  let hasErrors = false;
  let hasWarnings = false;

  for (const mapFile of mapFiles) {
    const relativePath = path.relative(process.cwd(), mapFile);
    const { errors, warnings } = validateJourneyMap(mapFile);

    if (errors.length > 0) {
      console.log(`❌ ${relativePath}`);
      errors.forEach(e => console.log(`   ERROR: ${e}`));
      hasErrors = true;
    } else if (warnings.length > 0) {
      console.log(`⚠️  ${relativePath}`);
      warnings.forEach(w => console.log(`   WARN: ${w}`));
      hasWarnings = true;
    } else {
      console.log(`✅ ${relativePath}`);
    }

    if (errors.length > 0 || warnings.length > 0) {
      console.log('');
    }
  }

  console.log('\n---');
  console.log(`Validated ${mapFiles.length} journey map(s)`);

  if (hasErrors) {
    console.log('Some journey maps have errors.');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('Validation passed with warnings.');
    process.exit(0);
  } else {
    console.log('All journey maps valid.');
    process.exit(0);
  }
}

main();
