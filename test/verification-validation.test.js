'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');

const { loadIndex } = require('../tools/lib/schema-loader');
const { validateVerificationFile } = require('../tools/lib/verification');

function writeYaml(repoRoot, relativePath, document) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(document, { lineWidth: -1 }));
}

function writeJson(repoRoot, relativePath, document) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
}

function classification(verification = 'locally-verified') {
  return {
    intent: 'exploratory',
    verification,
    certification: 'not-certified',
    production: 'not-ready',
  };
}

function verificationMap(id, capability, ruleId, sourceModel, options = {}) {
  return {
    id: `${id}-verification`,
    type: 'verification',
    capability,
    status: 'specified',
    depends_on: options.dependsOn || [],
    rules: [{
      id: ruleId,
      source_models: [sourceModel],
      ...(options.inherits ? { inherits: options.inherits } : {}),
    }],
    evidence: { classification: classification(options.verification) },
  };
}

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-verification-'));
  const manifest = {
    version: 1,
    modules: {
      kernel: {
        root: 'specs',
        capabilities: ['specs/capabilities/kernel.capability.yaml'],
        rule_families: ['K'],
        depends_on: [],
      },
      application: {
        root: 'app/specs',
        capabilities: ['app/specs/capabilities/application.capability.yaml'],
        rule_families: ['APP'],
        depends_on: ['kernel'],
      },
    },
  };
  const kernelCapability = {
    id: 'kernel',
    type: 'capability',
    scope: { models: ['specs/models/kernel.model.yaml'], features: [] },
  };
  const applicationCapability = {
    id: 'application',
    type: 'capability',
    scope: { models: ['app/specs/models/application.model.yaml'], features: [] },
  };
  const kernelMap = verificationMap(
    'kernel',
    'specs/capabilities/kernel.capability.yaml',
    'K-1-kernel-rule',
    'specs/models/kernel.model.yaml',
  );
  const applicationMap = verificationMap(
    'application',
    'app/specs/capabilities/application.capability.yaml',
    'APP-1-application-rule',
    'app/specs/models/application.model.yaml',
    {
      dependsOn: ['specs/verification/kernel/verification.yaml'],
      inherits: ['K-1-kernel-rule'],
    },
  );

  writeYaml(repoRoot, 'specs/modules.yaml', manifest);
  writeYaml(repoRoot, 'specs/capabilities/kernel.capability.yaml', kernelCapability);
  writeYaml(repoRoot, 'app/specs/capabilities/application.capability.yaml', applicationCapability);
  writeYaml(repoRoot, 'specs/models/kernel.model.yaml', { id: 'kernel', type: 'model' });
  writeYaml(repoRoot, 'app/specs/models/application.model.yaml', { id: 'application', type: 'model' });
  writeYaml(repoRoot, 'specs/verification/kernel/verification.yaml', kernelMap);
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);

  return { repoRoot, manifest, kernelMap, applicationMap };
}

test('schema registry version is bumped to 1.9.x or later', () => {
  const [major, minor] = loadIndex().version.split('.').map(Number);
  assert.equal(major, 1);
  assert.ok(minor >= 9, `expected minor >= 9, got ${loadIndex().version}`);
});

test('accepts root-aware maps whose dependencies and inherited rules follow the DAG', (t) => {
  const { repoRoot } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const result = validateVerificationFile({ repoRoot });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.match(result.info.join('\n'), /2 verification map\(s\), 2 distinct rule id\(s\)/);
  assert.match(result.info.join('\n'), /app\/specs, specs/);
});

test('rejects a relocated capability whose verification map silently disappeared', (t) => {
  const { repoRoot } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  fs.rmSync(path.join(repoRoot, 'app', 'specs', 'verification'), { recursive: true });

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /missing verification map for app\/specs\/capabilities\/application/);
});

test('rejects a map dependency outside the module DAG', (t) => {
  const { repoRoot, manifest } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  manifest.modules.application.depends_on = [];
  writeYaml(repoRoot, 'specs/modules.yaml', manifest);

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /application may not depend on kernel; it is outside the dependency DAG/);
});

test('rejects verification or certification claims above a dependency', (t) => {
  const { repoRoot, kernelMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  kernelMap.evidence.classification.verification = 'not-verified';
  writeYaml(repoRoot, 'specs/verification/kernel/verification.yaml', kernelMap);

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /claims verification locally-verified .* at not-verified/);
});

test('rejects rule entries owned by a downstream module family', (t) => {
  const { repoRoot, kernelMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  kernelMap.rules[0].id = 'APP-2-upward-definition';
  kernelMap.rules[0].source_models = ['app/specs/models/application.model.yaml'];
  writeYaml(repoRoot, 'specs/verification/kernel/verification.yaml', kernelMap);

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /kernel includes APP-2-upward-definition from application, outside its dependency DAG/);
});

test('allows a downstream map to carry evidence for an upstream rule', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules.push({
    id: 'K-1-kernel-rule',
    source_models: ['specs/models/kernel.model.yaml'],
    evidence: { tests: ['application-preserves-kernel-rule'] },
  });
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);

  const result = validateVerificationFile({ repoRoot });

  assert.deepEqual(result.errors, []);
});

test('rejects inherited rules outside the transitive dependency DAG', (t) => {
  const { repoRoot, kernelMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  kernelMap.rules[0].inherits = ['APP-1-application-rule'];
  writeYaml(repoRoot, 'specs/verification/kernel/verification.yaml', kernelMap);

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /kernel may not inherit APP-1-application-rule .* outside the dependency DAG/);
});

test('rejects downstream rule citations from an upstream chain artifact', (t) => {
  const { repoRoot } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  writeYaml(repoRoot, 'specs/models/kernel.model.yaml', {
    id: 'kernel',
    type: 'model',
    note: 'This improperly cites APP-1-application-rule from downstream.',
  });

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /kernel\.model\.yaml: module kernel cites APP-family rules owned by application/);
});

test('accepts legacy classification nesting with a migration warning', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.evidence_plan = { classification: applicationMap.evidence.classification };
  delete applicationMap.evidence;
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);

  const result = validateVerificationFile({ repoRoot });

  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /evidence_plan\.classification is legacy-compatible/);
});

test('rejects unknown evidence-classification values', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.evidence.classification.production = 'maybe-ready';
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /schema: .*production/);
});

test('accepts explicit literal selector bindings and two-way x-rules', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules[0].contract = 'app/specs/contracts/application.schema.json';
  applicationMap.rules[0].current_evidence = {
    bindings: [{
      files: ['tests/application.test.js'],
      selectors: ['application-preserves-kernel-rule'],
      match: 'literal',
    }],
  };
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);
  writeJson(repoRoot, 'app/specs/contracts/application.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    'x-rules': ['APP-1-application-rule'],
    type: 'object',
  });
  fs.mkdirSync(path.join(repoRoot, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'tests', 'application.test.js'), 'test("application-preserves-kernel-rule", () => {});\n');

  const result = validateVerificationFile({ repoRoot });

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /Validated 1 explicit evidence binding\(s\) and 1 x-rules contract\(s\)/);
});

test('rejects a selector whose literal anchor is absent from its bound files', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules[0].current_evidence = {
    bindings: [{ files: ['tests/application.test.js'], selectors: ['phantom-selector'] }],
  };
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);
  fs.mkdirSync(path.join(repoRoot, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'tests', 'application.test.js'), 'test("real-selector", () => {});\n');

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /selector phantom-selector matches none of its bound files/);
});

test('rejects a missing file in an explicit evidence binding', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules[0].current_evidence = {
    bindings: [{ files: ['tests/missing.test.js'], selectors: ['missing-selector'] }],
  };
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /references missing path tests\/missing\.test\.js/);
  assert.match(result.errors.join('\n'), /binding declares no readable evidence files/);
});

test('rejects a referenced JSON Schema contract without a reciprocal x-rules entry', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules[0].contract = 'app/specs/contracts/application.schema.json';
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);
  writeJson(repoRoot, 'app/specs/contracts/application.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
  });

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /application\.schema\.json: x-rules must be an array naming APP-1-application-rule/);
});

test('rejects an x-rules ID mentioned only in map prose, not as a rule entry', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules[0].evidence = {
    statement: 'APP-99-orphan-rule is discussed here but is not a rule inventory entry.',
  };
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);
  writeJson(repoRoot, 'app/specs/contracts/orphan.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    'x-rules': ['APP-99-orphan-rule'],
    type: 'object',
  });

  const result = validateVerificationFile({ repoRoot });

  assert.match(result.errors.join('\n'), /x-rules names APP-99-orphan-rule, which no verification map mentions/);
});

test('validates legacy selectors but warns to migrate them to bindings', (t) => {
  const { repoRoot, applicationMap } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  applicationMap.rules[0].current_evidence = {
    tests: ['tests/application.test.js'],
    selectors: ['legacy-selector'],
  };
  writeYaml(repoRoot, 'app/specs/verification/application/verification.yaml', applicationMap);
  fs.mkdirSync(path.join(repoRoot, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'tests', 'application.test.js'), 'test("legacy-selector", () => {});\n');

  const result = validateVerificationFile({ repoRoot });

  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join('\n'), /selector\/selector\(s\) fields are legacy-compatible/);
});
