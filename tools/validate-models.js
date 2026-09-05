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

const MODELS_DIR = path.join(specsDir, 'models');

const VALID_TYPES = [
  'string', 'number', 'integer', 'boolean', 'datetime', 'date', 'time',
  'enum', 'array', 'object', 'uuid', 'ulid', 'email', 'url', 'uri',
];

// Legacy enum retained as documentation for the named-combinations table.
// Authoritative vocabulary lives in tools/lib/kinds.js (RELATIONSHIP_COMBINATIONS).
const LEGACY_RELATIONSHIP_TYPES = [
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
  const info = [];
  const isLifecycle = /\.lifecycle\.ya?ml$/i.test(filePath);

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return { errors: [`Cannot read file: ${error.message}`], warnings: [], info: [] };
  }

  const parsed = parseFrontMatter(filePath, content);
  if (parsed.parseError) {
    return { errors: [`Invalid YAML: ${parsed.parseError}`], warnings: [], info: [] };
  }

  const model = parsed.body;

  if (!model || typeof model !== 'object') {
    return { errors: ['YAML root must be an object'], warnings, info };
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
    return validateLifecycle(model, errors, warnings, info);
  }

  const r = validateModelDocument(model, errors, warnings, info);
  validateLifecycleSubject(model, filePath, errors, warnings);
  return { ...r, info: r.info || info };
}

/**
 * Cross-document subject agreement (#84): a model that names a `lifecycle:`
 * document must share its subject kind and name with it.
 */
function validateLifecycleSubject(model, filePath, errors, warnings) {
  if (typeof model.lifecycle !== 'string') return;
  const candidates = [
    path.resolve(specsDir, '..', model.lifecycle),
    path.resolve(process.cwd(), model.lifecycle),
    path.resolve(path.dirname(filePath), model.lifecycle),
  ];
  const lifecyclePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!lifecyclePath) {
    warnings.push(`Lifecycle document not found: ${model.lifecycle}`);
    return;
  }
  const parsed = parseFrontMatter(lifecyclePath, fs.readFileSync(lifecyclePath, 'utf8'));
  if (parsed.parseError || !isObject(parsed.body)) return; // reported when the lifecycle file itself is validated
  const lifecycle = parsed.body;
  const subjectKey = model.entity ? 'entity' : model.value_object ? 'value_object' : null;
  if (!subjectKey) return;
  const lifecycleKey = lifecycle.entity ? 'entity' : lifecycle.value_object ? 'value_object' : null;
  if (lifecycleKey && lifecycleKey !== subjectKey) {
    errors.push(`Lifecycle subject kind mismatch: model declares ${subjectKey} but ${model.lifecycle} declares ${lifecycleKey}`);
  } else if (lifecycleKey && lifecycle[lifecycleKey] !== model[subjectKey]) {
    errors.push(`Lifecycle subject mismatch: model ${subjectKey} "${model[subjectKey]}" but ${model.lifecycle} names "${lifecycle[lifecycleKey]}"`);
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateAttributeBlock(block, blockLabel, itemLabel, errors, warnings, info = []) {
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
      const implied = ['values', 'const', 'source', 'ref'].find((key) => attr[key] !== undefined);
      if (!implied) {
        errors.push(`${itemLabel} "${attrName}" missing type (or values / const / source / ref that implies one)`);
      } else {
        info.push(`${itemLabel} "${attrName}" type implied by ${implied}`);
      }
    } else if (!VALID_TYPES.includes(attr.type)) {
      warnings.push(`${itemLabel} "${attrName}" has unknown type: ${attr.type}`);
    }

    // required: boolean | { when } | bare string (legacy spelling of the conditional form, #82)
    if (typeof attr.required === 'string') {
      warnings.push(`${itemLabel} "${attrName}" required: "${attr.required}" uses the legacy conditional spelling — prefer required: { when: "${attr.required}" }`);
    } else if (isObject(attr.required) && attr.required.when === undefined) {
      errors.push(`${itemLabel} "${attrName}" required object must carry "when"`);
    }
    if (Array.isArray(attr.required_when) && attr.required === true) {
      warnings.push(`${itemLabel} "${attrName}" declares both required: true and required_when — the unconditional form wins; drop one`);
    }

    if (!attrName.split('.').every(segment => /^[a-z][a-zA-Z0-9]*$/.test(segment))) {
      warnings.push(`${itemLabel} "${attrName}" should be camelCase`);
    }
  }
}

function validateRelationshipBlock(relationships, errors, warnings, info) {
  if (!isObject(relationships)) {
    errors.push('Relationships must be an object');
    return;
  }

  for (const [relName, rel] of Object.entries(relationships)) {
    if (!isObject(rel)) {
      errors.push(`Relationship "${relName}" must be an object`);
      continue;
    }

    if (!rel.entity) {
      errors.push(`Relationship "${relName}" missing target entity`);
    }

    const result = categorizeKind('relationship', rel);

    if (result.status === 'expanded') {
      info.push(`Relationship "${relName}" type:${result.legacyType} ⇒ ${result.description}`);
    } else if (result.status === 'kinded') {
      // expanded form, no legacy name — already self-describing
    } else if (result.status === 'mixed') {
      info.push(`Relationship "${relName}" type:${result.legacyType} ⇒ ${result.description}`);
      for (const conflict of result.conflicts) {
        warnings.push(`Relationship "${relName}" conflict between legacy type and expanded form — ${conflict}`);
      }
    } else if (result.status === 'unknown') {
      if (result.legacyType) {
        warnings.push(`Relationship "${relName}" has unrecognized type: ${result.legacyType}. Known legacy names: ${LEGACY_RELATIONSHIP_TYPES.join(', ')}. Or use the expanded form with kind/cardinality/ownership/temporality.`);
      } else if (result.kind) {
        warnings.push(`Relationship "${relName}" has unknown kind: ${result.kind}. Allowed kinds: composition, association, aggregation, pointer.`);
      } else {
        errors.push(`Relationship "${relName}" missing type or kind`);
      }
    }
  }
}

function validateRulesBlock(rules, warnings) {
  if (!Array.isArray(rules)) {
    warnings.push('Business rules should be a list');
    return;
  }

  for (const rule of rules) {
    if (typeof rule === 'string') {
      warnings.push(`Business rule "${rule.slice(0, 40)}${rule.length > 40 ? '…' : ''}" is narrative only — give it an id so lifecycles, features, fixtures, and evidence can cite it`);
      continue;
    }
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

/**
 * Identity kinds (#83): field (one attribute), composite (several attributes
 * together), content (no attribute — identity is the canonical bytes, defined
 * by `equality`). `kind` may be omitted and is then inferred.
 */
function inferIdentityKind(identity) {
  if (identity.kind) return identity.kind;
  if (identity.field) return 'field';
  if (identity.fields) return 'composite';
  if (identity.equality) return 'content';
  return null;
}

function validateIdentity(identity, errors, warnings, info) {
  if (!isObject(identity)) {
    errors.push('Identity must be an object');
    return;
  }
  const kind = inferIdentityKind(identity);
  if (!kind) {
    errors.push('Identity must declare field, fields, or equality');
    return;
  }
  if (kind === 'field' && !identity.field) errors.push('Identity kind:field must name a field');
  if (kind === 'composite' && !(Array.isArray(identity.fields) && identity.fields.length > 0)) errors.push('Identity kind:composite must list fields');
  if (kind === 'content' && !identity.equality) errors.push('Identity kind:content must define equality');
  if (kind === 'composite' && Array.isArray(identity.fields) && identity.fields.length === 1) {
    warnings.push(`Identity kind:composite lists a single field ("${identity.fields[0]}") — use kind:field`);
  }
  if (!identity.kind) info.push(`Identity kind inferred as ${kind}`);
  if (kind === 'field' && !identity.type) warnings.push('Identity should specify type');
}

function validateEntityModel(model, errors, warnings, info) {
  if (!model.description) {
    warnings.push('Entity should have a description');
  }

  if (!model.identity) {
    warnings.push('Entity should define identity');
  } else {
    validateIdentity(model.identity, errors, warnings, info);
  }

  if (model.attributes) {
    validateAttributeBlock(model.attributes, 'Attributes', 'Attribute', errors, warnings, info);
  }

  if (model.relationships) {
    validateRelationshipBlock(model.relationships, errors, warnings, info);
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

function validateModelDocument(model, errors, warnings, info = []) {
  if (model.entity) {
    validateEntityModel(model, errors, warnings, info);
    return { errors, warnings, info };
  }

  if (model.value_object) {
    if (model.identity) validateIdentity(model.identity, errors, warnings, info);
    if (model.attributes) validateAttributeBlock(model.attributes, 'Attributes', 'Attribute', errors, warnings, info);
    if (model.rules) validateRulesBlock(model.rules, warnings);
    validateSources(model, 'Value object', warnings);
    return { errors, warnings, info };
  }

  if (model.aggregate) {
    validateAggregateModel(model, errors, warnings);
    return { errors, warnings, info };
  }

  if (model.catalog) {
    validateCatalogModel(model, errors, warnings);
    return { errors, warnings, info };
  }

  if (model.value_objects) {
    validateValueObjectBundle(model, errors, warnings);
    return { errors, warnings, info };
  }

  errors.push('Model must have one of "entity", "value_object", "aggregate", "catalog", or "value_objects"');
  return { errors, warnings, info };
}

function validateLifecycle(model, errors, warnings, info = []) {
  if (!model.entity && !model.value_object) {
    errors.push('Lifecycle must specify entity or value_object');
  } else if (model.entity && model.value_object) {
    errors.push('Lifecycle must specify exactly one of entity or value_object');
  }

  if (!model.initial_state) {
    errors.push('Lifecycle must specify initial_state');
  }

  if (!model.states || typeof model.states !== 'object') {
    errors.push('Lifecycle must define states');
    return { errors, warnings, info };
  }

  const stateNames = Object.keys(model.states);

  if (model.initial_state && !stateNames.includes(model.initial_state)) {
    errors.push(`Initial state "${model.initial_state}" not found in states`);
  }

  const shape = typeof model.shape === 'string' ? model.shape : 'bounded';
  const hasTerminal = Object.values(model.states).some((state) => state && state.terminal === true);

  // Shape selects which rule applies (#39).
  //   bounded   — at least one terminal state required (default)
  //   absorbing — at least one terminal state required
  //   unbounded — no terminal needed (Customer, TruthFile, …)
  //   cyclic    — no terminal needed; transitions may return to initial
  if (shape === 'bounded' || shape === 'absorbing') {
    if (!hasTerminal) {
      warnings.push(`Lifecycle (shape:${shape}) should have at least one terminal state`);
    }
  } else if (shape === 'unbounded' || shape === 'cyclic') {
    if (hasTerminal) {
      info.push(`Lifecycle declared shape:${shape} but has a terminal state — that is allowed; the terminal-state requirement is only enforced for bounded/absorbing shapes`);
    }
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

  return { errors, warnings, info };
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
    const { errors, warnings, info = [] } = validateModelFile(modelFile);

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

  results.info.push(`Validated ${modelFiles.length} model file(s)`);

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map((warning) => `${warning} (strict mode)`));
    results.warnings = [];
  }

  outputResults(results);
  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
