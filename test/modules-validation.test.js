'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  moduleRoots,
  validateModulesDocument,
  validateModulesFile,
} = require('../tools/lib/modules');
const { loadIndex } = require('../tools/lib/schema-loader');

function fixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-modules-'));
  fs.mkdirSync(path.join(repoRoot, 'specs', 'capabilities'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'evals', 'specs', 'capabilities'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'specs', 'capabilities', 'core.capability.yaml'), 'id: core\n');
  fs.writeFileSync(path.join(repoRoot, 'evals', 'specs', 'capabilities', 'bench.capability.yaml'), 'id: bench\n');

  const manifest = {
    version: 1,
    modules: {
      kernel: {
        root: 'specs',
        capabilities: ['specs/capabilities/core.capability.yaml'],
        rule_families: ['I', 'C'],
        depends_on: [],
      },
      instruments: {
        root: 'evals/specs',
        capabilities: ['evals/specs/capabilities/bench.capability.yaml'],
        rule_families: ['EVAL'],
        depends_on: ['kernel'],
      },
    },
  };

  return { repoRoot, manifest };
}

test('schema registry version is bumped to 1.7.x or later', () => {
  const [major, minor] = loadIndex().version.split('.').map(Number);
  assert.equal(major, 1);
  assert.ok(minor >= 7, `expected minor >= 7, got ${loadIndex().version}`);
});

test('accepts exact ownership across default and explicit module roots', (t) => {
  const { repoRoot, manifest } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const result = validateModulesDocument(manifest, { repoRoot });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(moduleRoots(manifest), ['evals/specs', 'specs']);
  assert.match(result.info.join('\n'), /2 module\(s\), 2 capability assignment\(s\)/);
});

test('rejects duplicate capability and rule-family ownership', (t) => {
  const { repoRoot, manifest } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  manifest.modules.instruments.root = 'specs';
  manifest.modules.instruments.capabilities = ['specs/capabilities/core.capability.yaml'];
  manifest.modules.instruments.rule_families = ['C'];

  const result = validateModulesDocument(manifest, { repoRoot });

  assert.match(result.errors.join('\n'), /core\.capability\.yaml assigned to both kernel and instruments/);
  assert.match(result.errors.join('\n'), /rule family C owned by both kernel and instruments/);
});

test('discovers unassigned capabilities under every declared root', (t) => {
  const { repoRoot, manifest } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  manifest.modules.instruments.capabilities = ['evals/specs/capabilities/other.capability.yaml'];
  fs.writeFileSync(path.join(repoRoot, 'evals', 'specs', 'capabilities', 'other.capability.yaml'), 'id: other\n');

  const result = validateModulesDocument(manifest, { repoRoot });

  assert.match(result.errors.join('\n'), /bench\.capability\.yaml is not assigned to any module/);
});

test('rejects unknown dependencies and dependency cycles', (t) => {
  const { repoRoot, manifest } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  manifest.modules.kernel.depends_on = ['instruments', 'missing'];

  const result = validateModulesDocument(manifest, { repoRoot });

  assert.match(result.errors.join('\n'), /kernel depends on unknown module missing/);
  assert.match(result.errors.join('\n'), /dependency cycle: kernel -> instruments -> kernel/);
});

test('rejects capability declarations outside the module root', (t) => {
  const { repoRoot, manifest } = fixture();
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  manifest.modules.instruments.capabilities = ['specs/capabilities/core.capability.yaml'];

  const result = validateModulesDocument(manifest, { repoRoot });

  assert.match(result.errors.join('\n'), /must be under evals\/specs\/capabilities\//);
});

test('skips cleanly when a repository has not adopted modules.yaml', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-modules-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  const result = validateModulesFile({ repoRoot });

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /not present .* validation skipped/);
});
