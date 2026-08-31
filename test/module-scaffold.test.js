'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');

function runJson(args) {
  try {
    return { failed: false, result: JSON.parse(execFileSync(process.execPath, [IDD_BIN, ...args], { cwd: REPO_ROOT, encoding: 'utf8' })) };
  } catch (error) {
    return { failed: true, result: JSON.parse(error.stdout) };
  }
}

function readYaml(repoRoot, relativePath) {
  return yaml.load(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function writeYaml(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(value, { lineWidth: -1 }));
}

function writeJson(repoRoot, relativePath, value) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test('module create scaffolds an idempotent bounded-context chain', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-module-cli-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const preview = runJson(['module', 'create', 'billing', '--repo', repoRoot, '--dry-run', '--json']);
  assert.equal(preview.failed, false);
  assert.ok(preview.result.actions.some((action) => action.path === 'specs/modules.yaml'));
  assert.equal(fs.existsSync(path.join(repoRoot, 'specs')), false);

  const created = runJson(['module', 'create', 'billing', '--repo', repoRoot, '--json']);
  assert.equal(created.failed, false);
  assert.ok(created.result.created.includes('specs/capabilities/billing.capability.yaml'));
  assert.ok(fs.existsSync(path.join(repoRoot, 'specs/models/billing/.gitkeep')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'specs/contracts/openapi/billing/.gitkeep')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'specs/verification/billing/verification.yaml')));

  const manifest = readYaml(repoRoot, 'specs/modules.yaml');
  assert.deepEqual(manifest.modules.billing, {
    root: 'specs',
    capabilities: ['specs/capabilities/billing.capability.yaml'],
    rule_families: [],
    depends_on: [],
  });
  assert.equal(readYaml(repoRoot, 'specs/verification/billing/verification.yaml').status, 'planned');

  const moduleValidation = runJson(['validate', 'modules', path.join(repoRoot, 'specs'), '--json']);
  const verificationValidation = runJson(['validate', 'verification', path.join(repoRoot, 'specs'), '--json']);
  assert.equal(moduleValidation.failed, false);
  assert.equal(verificationValidation.failed, false);
  assert.deepEqual(moduleValidation.result.errors, []);
  assert.deepEqual(verificationValidation.result.errors, []);

  const repeated = runJson(['module', 'create', 'billing', '--repo', repoRoot, '--json']);
  assert.equal(repeated.failed, false);
  assert.deepEqual(repeated.result.actions, []);
  assert.match(repeated.result.warnings.join('\n'), /idempotent/);
});

test('module create honors an explicit colocated spec root', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-module-cli-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const result = runJson(['module', 'create', 'instruments', '--repo', repoRoot, '--root', 'evals/specs', '--json']);

  assert.equal(result.failed, false);
  assert.ok(fs.existsSync(path.join(repoRoot, 'evals/specs/capabilities/instruments.capability.yaml')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'evals/specs/verification/instruments/verification.yaml')));
  assert.equal(readYaml(repoRoot, 'specs/modules.yaml').modules.instruments.root, 'evals/specs');
});

test('module link adds a DAG edge and computes an upstream contract pin', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-module-cli-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  assert.equal(runJson(['module', 'create', 'identity-kernel', '--repo', repoRoot, '--json']).failed, false);
  assert.equal(runJson(['module', 'create', 'billing', '--repo', repoRoot, '--json']).failed, false);

  const identityCapability = readYaml(repoRoot, 'specs/capabilities/identity-kernel.capability.yaml');
  identityCapability.scope.contracts = ['specs/contracts/identity-kernel.schema.json'];
  writeYaml(repoRoot, 'specs/capabilities/identity-kernel.capability.yaml', identityCapability);
  const contract = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Identity kernel', type: 'object' };
  writeJson(repoRoot, 'specs/contracts/identity-kernel.schema.json', contract);

  const linked = runJson(['module', 'link', 'billing', '--repo', repoRoot, '--depends-on', 'identity-kernel', '--json']);
  assert.equal(linked.failed, false);
  assert.equal(readYaml(repoRoot, 'specs/modules.yaml').modules.billing.depends_on[0], 'identity-kernel');

  const pinned = runJson([
    'module', 'link', 'billing', '--repo', repoRoot, '--capability', 'billing',
    '--contract', 'specs/contracts/identity-kernel.schema.json', '--json',
  ]);
  assert.equal(pinned.failed, false);
  const map = readYaml(repoRoot, 'specs/verification/billing/verification.yaml');
  assert.equal(map.contract_pins[0].canonicalization, 'jcs-sha256@1');
  assert.match(map.contract_pins[0].digest, /^sha256:[0-9a-f]{64}$/);

  const status = runJson(['module', 'status', '--repo', repoRoot, '--json']);
  assert.equal(status.failed, false);
  assert.deepEqual(status.result.modules.map((module) => module.name), ['identity-kernel', 'billing']);
  assert.deepEqual(status.result.modules[1].depends_on, ['identity-kernel']);
});

test('module link refuses dependency cycles before writing', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-module-cli-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  assert.equal(runJson(['module', 'create', 'identity-kernel', '--repo', repoRoot, '--json']).failed, false);
  assert.equal(runJson(['module', 'create', 'billing', '--repo', repoRoot, '--json']).failed, false);
  assert.equal(runJson(['module', 'link', 'billing', '--repo', repoRoot, '--depends-on', 'identity-kernel', '--json']).failed, false);

  const cycle = runJson(['module', 'link', 'identity-kernel', '--repo', repoRoot, '--depends-on', 'billing', '--json']);
  assert.equal(cycle.failed, true);
  assert.match(cycle.result.errors.join('\n'), /dependency cycle/);
  assert.deepEqual(readYaml(repoRoot, 'specs/modules.yaml').modules['identity-kernel'].depends_on, []);
});
