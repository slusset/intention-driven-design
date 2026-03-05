#!/usr/bin/env node

/**
 * Validates journey map YAML files against the expected schema.
 *
 * Usage: node tools/validate-journey-maps.js
 *
 * Expects journey maps in: specs/journey-maps/*.map.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const JOURNEY_MAPS_DIR = path.join(process.cwd(), 'specs/journey-maps');

// Schema definition for journey maps
const JOURNEY_MAP_SCHEMA = {
  required: ['journey', 'description', 'steps'],
  properties: {
    journey: { type: 'string' },
    description: { type: 'string' },
    preconditions: {
      type: 'object',
      properties: {
        auth: { type: 'string' },
        state: { type: 'string' }
      }
    },
    steps: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['journey_step', 'title'],
        properties: {
          journey_step: { type: 'number' },
          title: { type: 'string' },
          setup: { type: 'array' },
          actions: { type: 'array' },
          assertions: { type: 'array' }
        }
      }
    },
    fixtures: { type: 'object' },
    cleanup: { type: 'array' }
  }
};

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

  return fs.readdirSync(JOURNEY_MAPS_DIR)
    .filter(f => f.endsWith('.map.yaml') || f.endsWith('.map.yml'))
    .map(f => path.join(JOURNEY_MAPS_DIR, f));
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

  // Check required fields
  for (const field of JOURNEY_MAP_SCHEMA.required) {
    if (!map[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate journey name matches filename
  const expectedJourney = path.basename(filePath).replace('.map.yaml', '').replace('.map.yml', '');
  if (map.journey && map.journey !== expectedJourney) {
    warnings.push(`Journey name "${map.journey}" doesn't match filename "${expectedJourney}"`);
  }

  // Validate steps
  if (map.steps && typeof map.steps === 'object') {
    let lastStepNumber = 0;

    for (const [stepId, step] of Object.entries(map.steps)) {
      // Check step ID is kebab-case
      if (!/^[a-z][a-z0-9-]*$/.test(stepId)) {
        warnings.push(`Step ID "${stepId}" should be kebab-case`);
      }

      // Check required step fields
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

      // Validate actions
      if (step.actions && Array.isArray(step.actions)) {
        for (const action of step.actions) {
          if (!action.type) {
            errors.push(`Step "${stepId}" has action without type`);
          } else if (!VALID_ACTION_TYPES.includes(action.type)) {
            warnings.push(`Step "${stepId}" has unknown action type: ${action.type}`);
          }

          // Check selectors use data-testid
          if (action.target && !action.target.includes('data-testid')) {
            warnings.push(`Step "${stepId}" action target doesn't use data-testid: ${action.target}`);
          }
        }
      }

      // Validate assertions
      if (step.assertions && Array.isArray(step.assertions)) {
        for (const assertion of step.assertions) {
          if (!assertion.type) {
            errors.push(`Step "${stepId}" has assertion without type`);
          } else if (!VALID_ASSERTION_TYPES.includes(assertion.type)) {
            warnings.push(`Step "${stepId}" has unknown assertion type: ${assertion.type}`);
          }

          // Check selectors use data-testid
          if (assertion.selector && !assertion.selector.includes('data-testid')) {
            warnings.push(`Step "${stepId}" assertion selector doesn't use data-testid: ${assertion.selector}`);
          }
        }
      }
    }
  }

  // Check fixture references
  if (map.fixtures && typeof map.fixtures === 'object') {
    for (const [name, fixture] of Object.entries(map.fixtures)) {
      if (fixture.ref) {
        const refPath = path.join(process.cwd(), fixture.ref);
        if (!fs.existsSync(refPath)) {
          warnings.push(`Fixture "${name}" references non-existent file: ${fixture.ref}`);
        }
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
