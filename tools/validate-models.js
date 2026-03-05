#!/usr/bin/env node

/**
 * Validates domain model files for structural compliance.
 *
 * Usage:
 *   node tools/validate-models.js [specs-dir]
 *   node tools/validate-models.js --files specs/models/account.model.yaml
 *
 * Options:
 *   --files <paths...>  Validate only specific model/lifecycle files
 *   --json              Output results as JSON
 *   --strict            Treat warnings as errors
 */

const fs = require('fs');
const path = require('path');
const { findFiles, formatResults, parseFrontMatter } = require('./lib/parse-front-matter');

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

const MODELS_DIR = path.join(specsDir, 'models');

const VALID_TYPES = [
  'string', 'number', 'integer', 'boolean', 'datetime', 'date', 'time',
  'enum', 'array', 'object', 'uuid', 'ulid', 'email', 'url', 'uri',
];

const VALID_RELATIONSHIP_TYPES = [
  'belongs-to', 'has-one', 'has-many', 'many-to-many',
];

function isModelFile(filePath) {
  return /\.(model|lifecycle)\.ya?ml$/i.test(filePath);
}

function collectModelFiles() {
  if (specificFiles) {
    const files = new Set();
    for (const input of specificFiles) {
      const resolved = path.resolve(input);
      if (!fs.existsSync(resolved) || !isModelFile(resolved)) {
        continue;
      }
      files.add(resolved);
    }
    return Array.from(files);
  }

  return findFiles(MODELS_DIR, /\.(model|lifecycle)\.ya?ml$/i);
}

function validateModelFile(filePath) {
  const errors = [];
  const warnings = [];
  const isLifecycle = /\.lifecycle\.ya?ml$/i.test(filePath);

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { errors: [`Cannot read file: ${error.message}`], warnings: [] };
  }

  const parsed = parseFrontMatter(filePath, content);
  if (parsed.parseError) {
    return { errors: [`Invalid YAML: ${parsed.parseError}`], warnings: [] };
  }

  const model = parsed.body;

  if (!model || typeof model !== 'object') {
    return { errors: ['YAML root must be an object'], warnings };
  }

  if (isLifecycle) {
    return validateLifecycle(model, errors, warnings);
  }

  return validateEntityModel(model, errors, warnings);
}

function validateEntityModel(model, errors, warnings) {
  if (!model.entity && !model.value_object) {
    errors.push('Model must have "entity" or "value_object" field');
    return { errors, warnings };
  }

  const isEntity = Boolean(model.entity);

  if (isEntity) {
    if (!model.description) {
      warnings.push('Entity should have a description');
    }

    if (!model.identity) {
      warnings.push('Entity should define identity field');
    } else {
      if (!model.identity.field) {
        errors.push('Identity must have a field name');
      }
      if (!model.identity.type) {
        warnings.push('Identity should specify type');
      }
    }

    if (model.attributes && typeof model.attributes === 'object') {
      for (const [attrName, attr] of Object.entries(model.attributes)) {
        if (!attr || typeof attr !== 'object') {
          errors.push(`Attribute "${attrName}" must be an object`);
          continue;
        }

        if (!attr.type) {
          errors.push(`Attribute "${attrName}" missing type`);
        } else if (!VALID_TYPES.includes(attr.type)) {
          warnings.push(`Attribute "${attrName}" has unknown type: ${attr.type}`);
        }

        if (!/^[a-z][a-zA-Z0-9]*$/.test(attrName)) {
          warnings.push(`Attribute "${attrName}" should be camelCase`);
        }
      }
    }

    if (model.relationships && typeof model.relationships === 'object') {
      for (const [relName, rel] of Object.entries(model.relationships)) {
        if (!rel || typeof rel !== 'object') {
          errors.push(`Relationship "${relName}" must be an object`);
          continue;
        }

        if (!rel.type) {
          errors.push(`Relationship "${relName}" missing type`);
        } else if (!VALID_RELATIONSHIP_TYPES.includes(rel.type)) {
          warnings.push(`Relationship "${relName}" has unknown type: ${rel.type}`);
        }

        if (!rel.entity) {
          errors.push(`Relationship "${relName}" missing target entity`);
        }
      }
    }

    if (Array.isArray(model.rules)) {
      for (const rule of model.rules) {
        if (!rule || typeof rule !== 'object') {
          warnings.push('Business rule entry should be an object');
          continue;
        }
        if (!rule.id) {
          warnings.push('Business rule should have an id');
        }
        if (!rule.description) {
          warnings.push(`Rule "${rule.id || 'unknown'}" should have a description`);
        }
      }
    }

    if (!model.sources || (!model.sources.stories && !model.sources.journeys)) {
      warnings.push('Entity should reference source stories or journeys');
    }
  } else if (!model.type) {
    errors.push('Value object must have a type');
  }

  return { errors, warnings };
}

function validateLifecycle(model, errors, warnings) {
  if (!model.entity) {
    errors.push('Lifecycle must specify entity');
  }

  if (!model.initial_state) {
    errors.push('Lifecycle must specify initial_state');
  }

  if (!model.states || typeof model.states !== 'object') {
    errors.push('Lifecycle must define states');
    return { errors, warnings };
  }

  const stateNames = Object.keys(model.states);

  if (model.initial_state && !stateNames.includes(model.initial_state)) {
    errors.push(`Initial state "${model.initial_state}" not found in states`);
  }

  const hasTerminal = Object.values(model.states).some((state) => state && state.terminal === true);
  if (!hasTerminal) {
    warnings.push('Lifecycle should have at least one terminal state');
  }

  if (model.transitions && typeof model.transitions === 'object') {
    for (const [transitionName, transition] of Object.entries(model.transitions)) {
      if (transitionName.startsWith('_')) continue;
      if (!transition || typeof transition !== 'object') {
        errors.push(`Transition "${transitionName}" must be an object`);
        continue;
      }

      if (!transition.from) {
        errors.push(`Transition "${transitionName}" missing "from" state`);
      } else if (!stateNames.includes(transition.from)) {
        errors.push(`Transition "${transitionName}" references unknown "from" state: ${transition.from}`);
      }

      if (!transition.to) {
        errors.push(`Transition "${transitionName}" missing "to" state`);
      } else if (!stateNames.includes(transition.to)) {
        errors.push(`Transition "${transitionName}" references unknown "to" state: ${transition.to}`);
      }

      if (transition.from && model.states[transition.from] && model.states[transition.from].terminal) {
        warnings.push(`Transition "${transitionName}" originates from terminal state "${transition.from}"`);
      }
    }
  }

  return { errors, warnings };
}

function outputResults(results) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }

  process.stdout.write('Validating domain models...\n\n');
  process.stdout.write(`${formatResults(results)}\n`);
}

function main() {
  const results = { errors: [], warnings: [], info: [] };
  const modelFiles = collectModelFiles();

  if (modelFiles.length === 0) {
    results.info.push('No model files found to validate');
    outputResults(results);
    process.exit(0);
  }

  for (const modelFile of modelFiles) {
    const relativePath = path.relative(process.cwd(), modelFile);
    const { errors, warnings } = validateModelFile(modelFile);

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

  results.info.push(`Validated ${modelFiles.length} model file(s)`);

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map((warning) => `${warning} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
