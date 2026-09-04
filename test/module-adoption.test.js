'use strict';

// SCHEMA.md: Missing module manifest; regression for #105.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { validateModulesFile } = require('../tools/lib/modules');
const { validateVerificationFile } = require('../tools/lib/verification');
const { readConsumerContract } = require('../tools/lib/consumer-contract');

const REPO_ROOT = path.resolve(__dirname, '..');
const VALID_CONTRACT = {
  idd_consumer: {
    schemaVersion: 1,
    toolkit: {
      version: '0.1.0-uat.5',
      schema: { version: '1.14.0', digest: `sha256:${'a'.repeat(64)}` },
      source: { kind: 'github-tag', ref: 'v0.1.0-uat.5' },
    },
  },
};

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-module-adoption-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) write(root, relative, content);
  return root;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function results(root, specDir = 'specs') {
  const options = { repoRoot: root, manifestPath: path.join(root, specDir, 'modules.yaml') };
  return [validateModulesFile(options), validateVerificationFile(options)];
}

test('both validators keep the informational skip without adoption signals', (t) => {
  const root = fixture(t, {
    'specs/capabilities/legacy.capability.yaml': 'id: legacy\nnote: "depends_on: []"\n',
    'specs/verification/legacy/verification.yaml': 'id: legacy\nnotes: { depends_on: [] }\n',
    'examples/specs/capabilities/example.capability.yaml': 'depends_on: []\n',
  });
  for (const result of results(root)) {
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, []);
    assert.match(result.info.join('\n'), /not present .* validation skipped/);
  }
});

test('a valid consumer contract alone requires the missing manifest', (t) => {
  const root = fixture(t, {
    'specs/skills/repo-overlay.md': `---\n${yaml.dump(VALID_CONTRACT)}---\n# Overlay\n`,
  });
  assert.equal(readConsumerContract(root).status, 'valid');
  for (const specDir of ['specs', 'design']) {
    for (const result of results(root, specDir)) {
      assert.ok(result.errors[0].startsWith(`${specDir}/modules.yaml: required module manifest is missing`));
      assert.match(result.errors.join('\n'), /specs\/skills\/repo-overlay\.md.*idd_consumer/);
      assert.deepEqual(result.info, []);
    }
  }
});

test('an invalid or unrecorded consumer contract does not establish adoption', (t) => {
  const root = fixture(t);
  for (const overlay of ['# No contract\n', '---\nidd_consumer: { schemaVersion: 1 }\n---\n', '---\nidd_consumer: [\n---\n']) {
    write(root, 'specs/skills/repo-overlay.md', overlay);
    for (const result of results(root)) {
      assert.deepEqual(result.errors, []);
      assert.match(result.info.join('\n'), /validation skipped/);
    }
  }
});

for (const file of ['capabilities/nested/core.capability.yaml', 'capabilities/core.capability.yml', 'verification/core/verification.yaml', 'verification/nested/core/verification.yml']) {
  for (const dependencies of ['[]', '[upstream]']) {
    test(`${file} with depends_on: ${dependencies} requires the manifest`, (t) => {
      const root = fixture(t, { [`specs/${file}`]: `id: core\ndepends_on: ${dependencies}\n` });
      for (const result of results(root)) {
        assert.equal(result.errors.length, 1);
        assert.ok(result.errors[0].includes(`specs/${file} declares depends_on`), result.errors[0]);
        assert.deepEqual(result.info, []);
      }
    });
  }
}

test('adoption detection honors the selected spec directory', (t) => {
  const root = fixture(t, { 'design/capabilities/core.capability.yaml': 'depends_on: []\n' });
  for (const result of results(root, 'design')) {
    assert.match(result.errors.join('\n'), /design\/modules\.yaml: required module manifest is missing/);
  }
  for (const result of results(root)) assert.deepEqual(result.errors, []);
});

test('malformed candidates cannot silently disable adoption detection', (t) => {
  const root = fixture(t, { 'specs/verification/core/verification.yaml': 'depends_on: [\n' });
  for (const result of results(root)) {
    assert.match(result.errors.join('\n'), /specs\/verification\/core\/verification\.yaml: cannot assess module adoption/);
    assert.deepEqual(result.info, []);
  }
});

test('removing an adopted manifest fails both CLI validators; restoring it recovers', (t) => {
  const root = fixture(t, {
    'specs/modules.yaml': yaml.dump({ version: 1, modules: { core: {
      capabilities: ['specs/capabilities/core.capability.yaml'], rule_families: [], depends_on: [],
    } } }),
    'specs/capabilities/core.capability.yaml': 'id: core\ntype: capability\n',
    'specs/verification/core/verification.yaml': yaml.dump({
      id: 'core-verification', type: 'verification', capability: 'specs/capabilities/core.capability.yaml',
      status: 'planned', depends_on: [], rules: [],
      evidence: { classification: { intent: 'exploratory', verification: 'not-verified', certification: 'not-certified', production: 'not-ready' } },
    }),
  });
  const manifestPath = path.join(root, 'specs/modules.yaml');
  const manifest = fs.readFileSync(manifestPath);
  for (const present of [true, false, true]) {
    if (present) fs.writeFileSync(manifestPath, manifest);
    else fs.unlinkSync(manifestPath);
    for (const check of ['modules', 'verification']) {
      const child = spawnSync(process.execPath, [path.join(REPO_ROOT, 'bin/idd.js'), 'validate', check, '--json'], {
        cwd: root, encoding: 'utf8',
      });
      assert.equal(child.status, present ? 0 : 1, child.stdout + child.stderr);
      const report = JSON.parse(child.stdout);
      if (present) assert.deepEqual(report.errors, []);
      else assert.match(report.errors.join('\n'), /required module manifest is missing/);
    }
  }
});
