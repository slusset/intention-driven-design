'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');

const {
  parseBinding,
  resolveBinding,
  classifyEnforced,
} = require('../../tools/lib/enforcement-bindings');
const { getValidator, loadIndex } = require('../../tools/lib/schema-loader');

const REPO_ROOT = path.join(__dirname, '..', '..');
const VALIDATE = path.join(REPO_ROOT, 'tools', 'validate-enforcement-bindings.js');

function runJson(specsDir, extra = []) {
  try {
    const out = execFileSync(process.execPath, [VALIDATE, specsDir, '--json', ...extra], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } catch (e) {
    // Non-zero exit is expected when there are errors; the JSON payload is on stdout.
    return JSON.parse(e.stdout);
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, typeof content === 'string' ? content : yaml.dump(content));
}

test('schema registry version is bumped to 1.5.x or later', () => {
  const index = loadIndex();
  const [maj, min] = index.version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 5, `expected minor >= 5, got ${index.version}`);
});

test('parseBinding splits path#anchor', () => {
  const r = parseBinding('migrations/0042.sql#unique-customer-id');
  assert.equal(r.file, 'migrations/0042.sql');
  assert.equal(r.anchor, 'unique-customer-id');
  assert.equal(r.label, null);
});

test('parseBinding splits path:label', () => {
  const r = parseBinding('specs/features/x.feature:Some scenario name');
  assert.equal(r.file, 'specs/features/x.feature');
  assert.equal(r.label, 'Some scenario name');
});

test('classifyEnforced recognizes narrative / pending / bound / missing forms', () => {
  assert.equal(classifyEnforced('persistence').form, 'narrative');
  assert.equal(classifyEnforced({ pending: 'issue #99' }).form, 'pending');
  assert.equal(classifyEnforced([{ kind: 'persistence', binding: 'x.sql' }]).form, 'bound');
  assert.equal(classifyEnforced(undefined).form, 'missing');
});

test('schema accepts narrative, pending, and bound enforced forms', () => {
  const v = getValidator('model');

  assert.ok(v({ id: 'a', type: 'model', entity: 'A',
    rules: [{ id: 'r', enforced: 'persistence' }] }).valid);

  assert.ok(v({ id: 'a', type: 'model', entity: 'A',
    rules: [{ id: 'r', enforced: { pending: 'issue #99' } }] }).valid);

  assert.ok(v({ id: 'a', type: 'model', entity: 'A',
    rules: [{ id: 'r', enforced: [{ kind: 'persistence', binding: 'migrations/x.sql#c' }] }] }).valid);
});

test('schema rejects bound enforced entries missing kind or binding', () => {
  const v = getValidator('model');
  assert.ok(!v({ id: 'a', type: 'model', entity: 'A',
    rules: [{ id: 'r', enforced: [{ kind: 'persistence' }] }] }).valid);
  assert.ok(!v({ id: 'a', type: 'model', entity: 'A',
    rules: [{ id: 'r', enforced: [{ binding: 'x' }] }] }).valid);
});

test('resolveBinding finds a named SQL constraint', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  const file = path.join(tmp, 'migrations', '0042.sql');
  writeFile(file,
    'CREATE TABLE truth_files (\n' +
    '  customer_id uuid NOT NULL,\n' +
    '  CONSTRAINT unique_customer_id UNIQUE (customer_id)\n' +
    ');\n');
  const r = resolveBinding({ kind: 'persistence', binding: 'migrations/0042.sql#unique_customer_id' }, { repoRoot: tmp });
  assert.ok(r.resolved, `expected resolved, got: ${r.reason}`);
});

test('resolveBinding reports missing SQL constraint', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  writeFile(path.join(tmp, 'migrations', '0042.sql'), 'CREATE TABLE truth_files (id uuid);\n');
  const r = resolveBinding({ kind: 'persistence', binding: 'migrations/0042.sql#unique_customer_id' }, { repoRoot: tmp });
  assert.ok(!r.resolved);
  assert.match(r.reason, /unique_customer_id/);
});

test('resolveBinding resolves a JSON pointer into a YAML file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  const file = path.join(tmp, 'specs', 'contracts', 'openapi', 'api.yaml');
  writeFile(file, {
    openapi: '3.1.0',
    components: {
      schemas: {
        TruthFile: {
          type: 'object',
          required: ['customerId'],
          properties: { customerId: { type: 'string' } },
        },
      },
    },
  });
  const r = resolveBinding(
    { kind: 'validation', binding: 'specs/contracts/openapi/api.yaml#/components/schemas/TruthFile/required' },
    { repoRoot: tmp },
  );
  assert.ok(r.resolved, `expected resolved, got: ${r.reason}`);
});

test('resolveBinding resolves a markdown heading by slug', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  writeFile(path.join(tmp, 'docs', 'invariants-in-production.md'),
    '# Invariants\n\n## Truth File Revision Pin Roundtrip\n\nDetails.\n');
  const r = resolveBinding(
    { kind: 'invariant', binding: 'docs/invariants-in-production.md#truth-file-revision-pin-roundtrip' },
    { repoRoot: tmp },
  );
  assert.ok(r.resolved);
});

test('resolveBinding resolves a Gherkin scenario by name', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  writeFile(path.join(tmp, 'specs', 'features', 'x.feature'),
    'Feature: Sample\n\n  Scenario: Pinned revision survives roundtrip\n    Given a revision\n');
  const r = resolveBinding(
    { kind: 'domain', binding: 'specs/features/x.feature:Pinned revision survives roundtrip' },
    { repoRoot: tmp },
  );
  assert.ok(r.resolved);
});

test('resolveBinding emits an advisory when kind and file type look mismatched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  writeFile(path.join(tmp, 'specs', 'features', 'x.feature'),
    'Feature: x\n\n  Scenario: pinned\n');
  const r = resolveBinding(
    { kind: 'persistence', binding: 'specs/features/x.feature:pinned' },
    { repoRoot: tmp },
  );
  assert.ok(r.resolved);
  assert.match(r.advisory, /kind:persistence/);
});

test('validate-enforcement-bindings reports unresolved bindings as errors', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  const specs = path.join(tmp, 'specs');
  writeFile(path.join(specs, 'models', 'truth-file.model.yaml'), {
    id: 'truth-file', type: 'model', entity: 'TruthFile',
    rules: [{
      id: 'one-canonical',
      description: 'one truth file per customer',
      enforced: [{ kind: 'persistence', binding: 'migrations/0042.sql#unique_customer_id' }],
    }],
  });
  const result = runJson(specs);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors.join('\n'), /one-canonical/);
});

test('validate-enforcement-bindings accepts a pending marker (info, not error)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  const specs = path.join(tmp, 'specs');
  writeFile(path.join(specs, 'models', 'truth-file.model.yaml'), {
    id: 'truth-file', type: 'model', entity: 'TruthFile',
    rules: [{
      id: 'pinned',
      enforced: { pending: 'issue #99' },
    }],
  });
  const result = runJson(specs);
  assert.equal(result.errors.length, 0);
  assert.ok(result.info.some((i) => i.includes('pending') && i.includes('#99')));
});

test('validate-enforcement-bindings --strict promotes narrative + pending to warnings', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bind-'));
  const specs = path.join(tmp, 'specs');
  writeFile(path.join(specs, 'models', 'a.model.yaml'), {
    id: 'a', type: 'model', entity: 'A',
    rules: [
      { id: 'r1', enforced: 'persistence' },
      { id: 'r2', enforced: { pending: 'TODO' } },
    ],
  });
  const result = runJson(specs, ['--strict']);
  // strict converts warnings → errors, so both should land in errors with " (strict mode)"
  assert.ok(result.errors.some((e) => e.includes('r1') && e.includes('narrative')));
  assert.ok(result.errors.some((e) => e.includes('r2') && e.includes('pending')));
});

test('validate-enforcement-bindings passes against repo specs/ without errors', () => {
  const result = runJson(path.join(REPO_ROOT, 'specs'));
  assert.equal(result.errors.length, 0, `errors: ${result.errors.join('\n')}`);
});
