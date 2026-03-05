#!/usr/bin/env node

/**
 * Validates domain model YAML files against the expected schema.
 *
 * Usage: node tools/validate-models.js
 *
 * Expects models in: specs/models/**\/*.model.yaml and *.lifecycle.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const MODELS_DIR = path.join(process.cwd(), 'specs/models');

// Valid attribute types for models
const VALID_TYPES = [
  'string', 'number', 'integer', 'boolean', 'datetime', 'date', 'time',
  'enum', 'array', 'object', 'uuid', 'ulid', 'email', 'url', 'uri'
];

// Valid relationship types
const VALID_RELATIONSHIP_TYPES = [
  'belongs-to', 'has-one', 'has-many', 'many-to-many'
];

function findModelFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.model.yaml') || entry.name.endsWith('.lifecycle.yaml')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function validateModelFile(filePath) {
  const errors = [];
  const warnings = [];
  const isLifecycle = filePath.endsWith('.lifecycle.yaml');

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return { errors: [`Cannot read file: ${e.message}`], warnings: [] };
  }

  let model;
  try {
    model = yaml.load(content);
  } catch (e) {
    return { errors: [`Invalid YAML: ${e.message}`], warnings: [] };
  }

  if (isLifecycle) {
    return validateLifecycle(model, filePath, errors, warnings);
  } else {
    return validateEntityModel(model, filePath, errors, warnings);
  }
}

function validateEntityModel(model, filePath, errors, warnings) {
  // Check for entity or value_object
  if (!model.entity && !model.value_object) {
    errors.push('Model must have "entity" or "value_object" field');
    return { errors, warnings };
  }

  const isEntity = !!model.entity;

  // Check required fields for entities
  if (isEntity) {
    if (!model.description) {
      warnings.push('Entity should have a description');
    }

    // Check identity
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

    // Check attributes
    if (model.attributes) {
      for (const [attrName, attr] of Object.entries(model.attributes)) {
        if (!attr.type) {
          errors.push(`Attribute "${attrName}" missing type`);
        } else if (!VALID_TYPES.includes(attr.type)) {
          warnings.push(`Attribute "${attrName}" has unknown type: ${attr.type}`);
        }

        // Check camelCase
        if (!/^[a-z][a-zA-Z0-9]*$/.test(attrName)) {
          warnings.push(`Attribute "${attrName}" should be camelCase`);
        }
      }
    }

    // Check relationships
    if (model.relationships) {
      for (const [relName, rel] of Object.entries(model.relationships)) {
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

    // Check rules have IDs
    if (model.rules && Array.isArray(model.rules)) {
      for (const rule of model.rules) {
        if (!rule.id) {
          warnings.push('Business rule should have an id');
        }
        if (!rule.description) {
          warnings.push(`Rule "${rule.id || 'unknown'}" should have a description`);
        }
      }
    }

    // Check sources
    if (!model.sources || (!model.sources.stories && !model.sources.journeys)) {
      warnings.push('Entity should reference source stories or journeys');
    }
  }

  // Value object validation
  if (!isEntity) {
    if (!model.type) {
      errors.push('Value object must have a type');
    }
  }

  return { errors, warnings };
}

function validateLifecycle(model, filePath, errors, warnings) {
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

  // Check initial state exists
  if (model.initial_state && !stateNames.includes(model.initial_state)) {
    errors.push(`Initial state "${model.initial_state}" not found in states`);
  }

  // Check at least one terminal state
  const hasTerminal = Object.values(model.states).some(s => s.terminal === true);
  if (!hasTerminal) {
    warnings.push('Lifecycle should have at least one terminal state');
  }

  // Check transitions
  if (model.transitions) {
    for (const [transName, trans] of Object.entries(model.transitions)) {
      if (transName.startsWith('_')) continue; // Skip _invalid etc.

      if (!trans.from) {
        errors.push(`Transition "${transName}" missing "from" state`);
      } else if (!stateNames.includes(trans.from)) {
        errors.push(`Transition "${transName}" references unknown "from" state: ${trans.from}`);
      }

      if (!trans.to) {
        errors.push(`Transition "${transName}" missing "to" state`);
      } else if (!stateNames.includes(trans.to)) {
        errors.push(`Transition "${transName}" references unknown "to" state: ${trans.to}`);
      }

      // Check transitions from terminal states
      if (trans.from && model.states[trans.from]?.terminal) {
        warnings.push(`Transition "${transName}" originates from terminal state "${trans.from}"`);
      }
    }
  }

  return { errors, warnings };
}

function main() {
  console.log('Validating domain models...\n');

  const modelFiles = findModelFiles(MODELS_DIR);

  if (modelFiles.length === 0) {
    console.log('No model files found.');
    process.exit(0);
  }

  let hasErrors = false;
  let hasWarnings = false;

  for (const modelFile of modelFiles) {
    const relativePath = path.relative(process.cwd(), modelFile);
    const { errors, warnings } = validateModelFile(modelFile);

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
  console.log(`Validated ${modelFiles.length} model file(s)`);

  if (hasErrors) {
    console.log('Some models have errors.');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('Validation passed with warnings.');
    process.exit(0);
  } else {
    console.log('All models valid.');
    process.exit(0);
  }
}

main();
