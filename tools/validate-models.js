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
const { getValidator, categorize } = require('./lib/schema-loader');

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

  const schemaKind = isLifecycle ? 'lifecycle' : 'model';
  const schemaUrl = `https://github.com/slusset/intention-driven-design/schemas/v1/${schemaKind}.schema.json`;
  const schemaCheck = getValidator(schemaKind)(model);
  if (!schemaCheck.valid) {
    const c = categorize(schemaCheck.errors, model, { schemaUrl });
    for (const msg of c.errors) errors.push(`schema: ${msg}`);
    for (const msg of c.warnings) warnings.push(`schema: ${msg}`);
    for (const msg of c.info) warnings.push(`schema: ${msg}`);
  }

  if (isLifecycle) {
    return validateLifecycle(model, errors, warnings);
  }

  return validateModelDocument(model, errors, warnings);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateAttributeBlock(block, blockLabel, itemLabel, errors, warnings) {
  if (!isObject(block)) {
    errors.push(`${blockLabel} must be an object`);
    return;
  }

  for (const [attrName, attr] of Object.entries(block)) {
    if (!isObject(attr)) {
      errors.push(`${itemLabel} "${attrName}" must be an object`);
      continue;
    }

    if (!attr.type) {
      errors.push(`${itemLabel} "${attrName}" missing type`);
    } else if (!VALID_TYPES.includes(attr.type)) {
      warnings.push(`${itemLabel} "${attrName}" has unknown type: ${attr.type}`);
    }

    if (!/^[a-z][a-zA-Z0-9]*$/.test(attrName)) {
      warnings.push(`${itemLabel} "${attrName}" should be camelCase`);
    }
  }
}

function validateRelationshipBlock(relationships, errors, warnings) {
  if (!isObject(relationships)) {
    errors.push('Relationships must be an object');
    return;
  }

  for (const [relName, rel] of Object.entries(relationships)) {
    if (!isObject(rel)) {
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

function validateRulesBlock(rules, warnings) {
  if (!Array.isArray(rules)) {
    warnings.push('Business rules should be a list');
    return;
  }

  for (const rule of rules) {
    if (!isObject(rule)) {
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

function validateSources(model, label, warnings) {
  if (!model.sources || (!model.sources.stories && !model.sources.journeys)) {
    warnings.push(`${label} should reference source stories or journeys`);
  }
}

function validateEntityModel(model, errors, warnings) {
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

  if (model.attributes) {
    validateAttributeBlock(model.attributes, 'Attributes', 'Attribute', errors, warnings);
  }

  if (model.relationships) {
    validateRelationshipBlock(model.relationships, errors, warnings);
  }

  if (model.rules) {
    validateRulesBlock(model.rules, warnings);
  }

  validateSources(model, 'Entity', warnings);
}

function validateAggregateModel(model, errors, warnings) {
  if (typeof model.aggregate !== 'string' || model.aggregate.trim() === '') {
    errors.push('Aggregate model must have a non-empty "aggregate" field');
  }

  if (!model.description) {
    warnings.push('Aggregate should have a description');
  }

  if (!model.entities && !model.value_objects) {
    warnings.push('Aggregate should define nested "entities" or "value_objects"');
  }

  if (model.entities) {
    if (!isObject(model.entities)) {
      errors.push('Aggregate "entities" must be an object');
    } else {
      for (const [name, entity] of Object.entries(model.entities)) {
        if (!isObject(entity)) {
          errors.push(`Aggregate entity "${name}" must be an object`);
          continue;
        }
        if (!entity.entity && !entity.ref) {
          warnings.push(`Aggregate entity "${name}" should declare "entity" or "ref"`);
        }
      }
    }
  }

  if (model.value_objects) {
    if (!isObject(model.value_objects)) {
      errors.push('Aggregate "value_objects" must be an object');
    } else {
      for (const [name, valueObject] of Object.entries(model.value_objects)) {
        if (!isObject(valueObject)) {
          errors.push(`Aggregate value object "${name}" must be an object`);
          continue;
        }
        if (!valueObject.value_object && !valueObject.ref && !valueObject.attributes && !valueObject.properties) {
          warnings.push(`Aggregate value object "${name}" should declare "value_object", "ref", "attributes", or "properties"`);
        }
      }
    }
  }

  if (model.rules) {
    validateRulesBlock(model.rules, warnings);
  }

  validateSources(model, 'Aggregate', warnings);
}

function validateCatalogModel(model, errors, warnings) {
  if (typeof model.catalog !== 'string' || model.catalog.trim() === '') {
    errors.push('Catalog model must have a non-empty "catalog" field');
  }

  if (!model.properties && !model.entries && !model.items) {
    warnings.push('Catalog should define "properties", "entries", or "items"');
  }

  if (model.properties) {
    validateAttributeBlock(model.properties, 'Properties', 'Property', errors, warnings);
  }

  if (model.entries && !isObject(model.entries)) {
    errors.push('Catalog "entries" must be an object');
  }

  if (model.items && !isObject(model.items)) {
    errors.push('Catalog "items" must be an object');
  }

  validateSources(model, 'Catalog', warnings);
}

function validateValueObjectBundle(model, errors, warnings) {
  if (!isObject(model.value_objects)) {
    errors.push('"value_objects" must be an object when used as a shared bundle');
    return;
  }

  for (const [name, valueObject] of Object.entries(model.value_objects)) {
    if (!isObject(valueObject)) {
      errors.push(`Shared value object "${name}" must be an object`);
      continue;
    }

    if (!valueObject.value_object && !valueObject.attributes && !valueObject.properties) {
      warnings.push(`Shared value object "${name}" should declare "value_object", "attributes", or "properties"`);
    }
  }

  validateSources(model, 'Shared value object bundle', warnings);
}

function validateModelDocument(model, errors, warnings) {
  if (model.entity) {
    validateEntityModel(model, errors, warnings);
    return { errors, warnings };
  }

  if (model.value_object) {
    validateSources(model, 'Value object', warnings);
    return { errors, warnings };
  }

  if (model.aggregate) {
    validateAggregateModel(model, errors, warnings);
    return { errors, warnings };
  }

  if (model.catalog) {
    validateCatalogModel(model, errors, warnings);
    return { errors, warnings };
  }

  if (model.value_objects) {
    validateValueObjectBundle(model, errors, warnings);
    return { errors, warnings };
  }

  errors.push('Model must have one of "entity", "value_object", "aggregate", "catalog", or "value_objects"');
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
      } else {
        const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
        const unknownFromStates = fromStates.filter((state) => !stateNames.includes(state));
        if (unknownFromStates.length > 0) {
          errors.push(`Transition "${transitionName}" references unknown "from" state(s): ${unknownFromStates.join(', ')}`);
        }

        const terminalOrigins = fromStates.filter((state) => model.states[state] && model.states[state].terminal);
        if (terminalOrigins.length > 0) {
          warnings.push(`Transition "${transitionName}" originates from terminal state(s): ${terminalOrigins.join(', ')}`);
        }
      }

      if (!transition.to) {
        errors.push(`Transition "${transitionName}" missing "to" state`);
      } else {
        const toStates = Array.isArray(transition.to) ? transition.to : [transition.to];
        const unknownToStates = toStates.filter((state) => !stateNames.includes(state));
        if (unknownToStates.length > 0) {
          errors.push(`Transition "${transitionName}" references unknown "to" state(s): ${unknownToStates.join(', ')}`);
        }
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
