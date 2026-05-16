'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');

const { getValidator, loadIndex } = require('../../tools/lib/schema-loader');

const REPO_ROOT = path.join(__dirname, '..', '..');
const VALIDATE_MODELS = path.join(REPO_ROOT, 'tools', 'validate-models.js');
const VALIDATE_JM = path.join(REPO_ROOT, 'tools', 'validate-journey-maps.js');

function runJson(script, specsDir) {
  const out = execFileSync(process.execPath, [script, specsDir, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function writeYaml(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump(data));
}

test('schema registry version is bumped to 1.3.x or later', () => {
  const index = loadIndex();
  const [maj, min] = index.version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 3, `expected minor >= 3 for the declarative-shapes bump, got ${index.version}`);
});

test('lifecycle schema accepts shape: unbounded with no terminal state', () => {
  const data = {
    id: 'truth-file-lifecycle',
    type: 'model',
    entity: 'TruthFile',
    shape: 'unbounded',
    initial_state: 'draft',
    states: {
      draft: { description: 'in progress' },
      active: { description: 'live' },
    },
  };
  const result = getValidator('lifecycle')(data);
  assert.ok(result.valid, `expected valid, got: ${JSON.stringify(result.errors)}`);
});

test('lifecycle validator emits no terminal-state warning under shape: unbounded', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-shape-'));
  const specs = path.join(tmp, 'specs');
  writeYaml(path.join(specs, 'models', 'truth-file.lifecycle.yaml'), {
    id: 'truth-file-lifecycle',
    type: 'model',
    entity: 'TruthFile',
    shape: 'unbounded',
    initial_state: 'active',
    states: { active: { description: 'live' } },
  });
  const result = runJson(VALIDATE_MODELS, specs);
  assert.equal(result.errors.length, 0, `errors: ${result.errors.join('\n')}`);
  assert.ok(
    !result.warnings.some((w) => w.toLowerCase().includes('terminal state')),
    `expected no terminal-state warning, got: ${result.warnings.join('\n')}`,
  );
});

test('lifecycle validator still warns about missing terminal under shape: bounded (default)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-shape-'));
  const specs = path.join(tmp, 'specs');
  writeYaml(path.join(specs, 'models', 'order.lifecycle.yaml'), {
    id: 'order-lifecycle',
    type: 'model',
    entity: 'Order',
    initial_state: 'pending',
    states: { pending: { description: 'wip' } },
  });
  const result = runJson(VALIDATE_MODELS, specs);
  assert.ok(
    result.warnings.some((w) => w.toLowerCase().includes('terminal state')),
    `expected terminal-state warning under default shape, got: ${result.warnings.join('\n')}`,
  );
});

test('journey-map schema accepts shape: branching with duplicate journey_step + branch', () => {
  const data = {
    id: 'sign-in',
    type: 'journey-map',
    journey: 'sign-in',
    shape: 'branching',
    steps: {
      'exchange-link': { journey_step: 3, title: 'Exchange link', branch: 'link-redeem' },
      'exchange-code': { journey_step: 3, title: 'Exchange code', branch: 'code-redeem' },
    },
  };
  const result = getValidator('journey-map')(data);
  assert.ok(result.valid, `expected valid, got: ${JSON.stringify(result.errors)}`);
});

test('journey-map validator emits no non-sequential warning under shape: branching', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-shape-'));
  const specs = path.join(tmp, 'specs');
  writeYaml(path.join(specs, 'journey-maps', 'sign-in.journey-map.yaml'), {
    id: 'sign-in',
    type: 'journey-map',
    journey: 'sign-in',
    shape: 'branching',
    steps: {
      'exchange-link': { journey_step: 3, title: 'Link', branch: 'link-redeem' },
      'exchange-code': { journey_step: 3, title: 'Code', branch: 'code-redeem' },
    },
  });
  const result = runJson(VALIDATE_JM, specs);
  assert.equal(result.errors.length, 0, `errors: ${result.errors.join('\n')}`);
  assert.ok(
    !result.warnings.some((w) => w.toLowerCase().includes('non-sequential')),
    `expected no non-sequential warning, got: ${result.warnings.join('\n')}`,
  );
  assert.ok(
    result.info.some((i) => i.includes('fans out')),
    `expected fan-out info, got: ${result.info.join('\n')}`,
  );
});

test('journey-map validator warns when shape: branching but step missing branch key', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-shape-'));
  const specs = path.join(tmp, 'specs');
  writeYaml(path.join(specs, 'journey-maps', 'auth.journey-map.yaml'), {
    id: 'auth',
    type: 'journey-map',
    journey: 'auth',
    shape: 'branching',
    steps: {
      'exchange-link': { journey_step: 3, title: 'Link', branch: 'link' },
      'exchange-code': { journey_step: 3, title: 'Code' }, // missing branch
    },
  });
  const result = runJson(VALIDATE_JM, specs);
  assert.ok(
    result.warnings.some((w) => w.includes('missing a `branch:`') || w.includes("missing a `branch:` key")),
    `expected branch-missing warning, got: ${result.warnings.join('\n')}`,
  );
});

test('journey-map shape rejects unknown shape value', () => {
  const result = getValidator('journey-map')({
    id: 'x', type: 'journey-map', journey: 'x', shape: 'mystery',
  });
  assert.ok(!result.valid);
});

test('lifecycle shape rejects unknown shape value', () => {
  const result = getValidator('lifecycle')({
    id: 'x', type: 'model', entity: 'X', shape: 'mystery',
    initial_state: 's', states: { s: {} },
  });
  assert.ok(!result.valid);
});
