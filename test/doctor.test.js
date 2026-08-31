'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');

function runDoctor(args = []) {
  return JSON.parse(execFileSync(process.execPath, [IDD_BIN, 'doctor', '--json', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));
}

function snapshotTree(root) {
  const entries = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) visit(full);
      else entries.push([rel, fs.readFileSync(full, 'utf8')]);
    }
  }
  visit(root);
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

test('doctor reports aligned toolkit surfaces without claiming continuity', () => {
  const report = runDoctor();

  assert.equal(report.mode, 'report-only');
  assert.equal(report.repository.toolkit_repository, true);
  assert.equal(report.repository.toolkit_version, '0.1.0-uat.1');
  assert.equal(report.repository.schema_version, '1.10.0');
  assert.equal(report.summary.status, 'aligned');
  assert.equal(report.migration.writes, false);
  assert.equal(report.migration.journal_mutation, false);
  assert.equal(report.continuity.status, 'not-assessed');
  assert.equal(report.continuity.dimensions.identity, 'not-assessed');
});

test('doctor detects consumer misalignment and never writes', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-doctor-consumer-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repoRoot, 'specs', 'capabilities'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'certification', 'old'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({
    name: 'consumer-fixture',
    dependencies: { 'idd-toolkit': '^0.1.0-uat.1' },
  }, null, 2));
  fs.writeFileSync(path.join(repoRoot, 'specs', 'capabilities', 'billing.capability.yaml'), [
    'id: billing',
    'type: capability',
    'scope:',
    '  personas: []',
  ].join('\n') + '\n');
  fs.writeFileSync(path.join(repoRoot, 'certification', 'old', 'evidence.yaml'), 'generated: true\n');
  const before = snapshotTree(repoRoot);

  const report = JSON.parse(execFileSync(process.execPath, [IDD_BIN, 'doctor', '--repo', repoRoot, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));
  const ids = report.findings.map((item) => item.id);

  assert.equal(report.mode, 'report-only');
  assert.ok(ids.includes('consumer-toolkit-version-floating'));
  assert.ok(ids.includes('consumer-module-manifest-missing'));
  assert.ok(ids.includes('committed-generated-evidence'));
  assert.equal(report.migration.writes, false);
  assert.equal(report.migration.journal_mutation, false);
  assert.deepEqual(snapshotTree(repoRoot), before);
});

test('doctor surfaces toolkit release-surface drift as diagnostics', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-doctor-toolkit-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ name: 'idd-toolkit', version: '0.1.0-uat.2' }));
  fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), JSON.stringify({ version: '0.1.0-uat.1', packages: { '': { version: '0.1.0-uat.1' } } }));
  fs.mkdirSync(path.join(repoRoot, 'schemas', 'v1'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'schemas', 'v1', 'index.json'), JSON.stringify({ version: '1.10.0' }));
  fs.writeFileSync(path.join(repoRoot, '.release-please-manifest.json'), '{".":"0.1.0-uat.1"}\n');

  const report = JSON.parse(execFileSync(process.execPath, [IDD_BIN, 'doctor', '--repo', repoRoot, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));

  assert.ok(report.findings.some((item) => item.id === 'version-package-lock-root-drift'));
  assert.ok(report.findings.some((item) => item.id === 'version-release-ledger-drift'));
  assert.equal(report.migration.writes, false);
});

test('doctor accepts an explicit immutable GitHub UAT dependency pin', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-doctor-pinned-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({
    name: 'consumer-fixture',
    dependencies: {
      'idd-toolkit': 'github:slusset/intention-driven-design#v0.1.0-uat.1',
    },
  }));

  const report = JSON.parse(execFileSync(process.execPath, [IDD_BIN, 'doctor', '--repo', repoRoot, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));

  assert.equal(report.findings.some((item) => item.id === 'consumer-toolkit-version-floating'), false);
});
