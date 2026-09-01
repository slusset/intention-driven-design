'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { classifyValidatorMessage, filterReport, formatDoctorReport, groupFindings, runDoctor } = require('../tools/lib/doctor');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');
const SCHEMA_VERSION = require(path.join(REPO_ROOT, 'schemas', 'v1', 'index.json')).version;

function consumer(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-doctor-ergo-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

function doctor(args, cwd) {
  try {
    return execFileSync(process.execPath, [IDD_BIN, 'doctor', ...args], { cwd, encoding: 'utf8' });
  } catch (error) {
    return error.stdout;
  }
}

const MODEL_MISSING_SUBJECT = 'id: a\ntype: model\nidentity:\n  field: id\n';
const MODEL_UNKNOWN_KEY = 'id: b\ntype: model\nentity: B\nidentity:\n  field: id\n  type: string\nownership: kernel\nsources:\n  stories: [specs/stories/x.md]\n';

test('validator messages classify into stable, discriminating codes', () => {
  const unknown = classifyValidatorMessage('specs/models/a.model.yaml: schema: (root): unknown property "ownership" (schema: https://example/model.schema.json)');
  assert.equal(unknown.file, 'specs/models/a.model.yaml');
  assert.equal(unknown.code, 'schema-unknown-property-ownership');
  const missing = classifyValidatorMessage("specs/models/b.lifecycle.yaml: schema: (root): must have required property 'entity'");
  assert.equal(missing.code, 'schema-missing-entity');
  const nested = classifyValidatorMessage('specs/models/c.model.yaml: schema: /attributes/handoff/required_when: must be array');
  assert.equal(nested.code, 'schema-must-be-array');
  const prefixed = classifyValidatorMessage('specs/fixtures/x.json: Fixture schema: /_meta/type: must be equal to constant');
  assert.equal(prefixed.code, 'schema-const');
  const apostrophe = classifyValidatorMessage("specs/fixtures/x.json: Declared type 'application-contract-fixture' doesn't match expected 'fixture' for path");
  assert.equal(apostrophe.code, 'declared-type-doesnt-match-expected-for');
  const imperative = classifyValidatorMessage('specs/fixtures/x.json: Missing recommended field: story');
  assert.equal(imperative.code, 'missing-recommended-field-story');
  // Different files, same check → same code.
  const other = classifyValidatorMessage('specs/fixtures/y.json: Missing recommended field: story');
  assert.equal(other.code, imperative.code);
  const noFile = classifyValidatorMessage('Model must have one of "entity", "value_object", "aggregate", "catalog", or "value_objects"');
  assert.equal(noFile.file, null);
  assert.equal(noFile.code, 'model-must-have-one-of-or');
});

test('doctor findings carry discriminating ids, the file, and group by id', (t) => {
  const root = consumer(t, {
    'specs/models/a.model.yaml': MODEL_MISSING_SUBJECT,
    'specs/models/b.model.yaml': MODEL_UNKNOWN_KEY,
    'specs/models/c.model.yaml': MODEL_UNKNOWN_KEY.replace('id: b', 'id: c').replace('entity: B', 'entity: C'),
  });
  const report = runDoctor({ repoRoot: root });
  const models = report.findings.filter((item) => item.check === 'models');
  assert.ok(models.length >= 3);
  const ids = new Set(models.map((item) => item.id));
  assert.ok(ids.has('validator-models-schema-unknown-property-ownership'), [...ids].join('\n'));
  assert.ok(!ids.has('validator-models-error') && !ids.has('validator-models-advisory'), 'generic ids are gone');
  const unknownKey = models.filter((item) => item.id === 'validator-models-schema-unknown-property-ownership');
  assert.equal(unknownKey.length, 2);
  assert.deepEqual(unknownKey.map((item) => item.file).sort(), ['specs/models/b.model.yaml', 'specs/models/c.model.yaml']);

  const groups = groupFindings(report.findings);
  const group = groups.find((g) => g.id === 'validator-models-schema-unknown-property-ownership');
  assert.equal(group.count, 2);
  assert.equal(group.files.length, 2);
  // errors sort before advisories, then by count
  assert.ok(groups.findIndex((g) => g.severity === 'error') < groups.findIndex((g) => g.severity === 'advisory'));
});

test('--severity narrows findings without changing the inspection totals', (t) => {
  const root = consumer(t, { 'specs/models/a.model.yaml': MODEL_MISSING_SUBJECT, 'specs/models/b.model.yaml': MODEL_UNKNOWN_KEY });
  const full = JSON.parse(doctor(['--json'], root));
  const errorsOnly = JSON.parse(doctor(['--json', '--severity', 'error'], root));
  assert.deepEqual(errorsOnly.filter, { severity: ['error'] });
  assert.ok(errorsOnly.findings.length > 0);
  assert.ok(errorsOnly.findings.every((item) => item.severity === 'error'));
  assert.ok(errorsOnly.findings.length < full.findings.length);
  assert.deepEqual(errorsOnly.summary, full.summary, 'summary reports the full inspection');
  const two = filterReport(full, ['error', 'info', 'error']);
  assert.deepEqual(two.filter.severity, ['error', 'info']);
});

test('doctor rejects an unknown severity level', (t) => {
  const root = consumer(t, {});
  assert.throws(() => execFileSync(process.execPath, [IDD_BIN, 'doctor', '--severity', 'loud'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /must be one of error, advisory, info/);
});

test('text report groups findings first, honours --summary and --verbose, and explains evidence not-run', (t) => {
  const files = {};
  for (let i = 0; i < 45; i += 1) files[`specs/models/m${i}.model.yaml`] = MODEL_UNKNOWN_KEY.replace('id: b', `id: m${i}`).replace('entity: B', `entity: M${i}`);
  const root = consumer(t, files);
  const report = runDoctor({ repoRoot: root });
  const text = formatDoctorReport(report);
  assert.match(text, /Findings by id \(\d+ distinct, \d+ total\)/);
  assert.match(text, /validator-models-schema-unknown-property-ownership ×45 — specs\/models\/m0\.model\.yaml, .*\+42 more/);
  assert.match(text, /pass --verbose to list every one/);
  assert.doesNotMatch(text, /\nFindings:\n/);
  assert.match(text, /- evidence: not-run — run-specific/);
  const verbose = formatDoctorReport(report, { verbose: true });
  assert.match(verbose, /\nFindings:\n/);
  const summary = formatDoctorReport(report, { summary: true });
  assert.doesNotMatch(summary, /pass --verbose/);
  const cli = doctor(['--summary'], root);
  assert.match(cli, /Findings by id/);
});

test('inspect names the synthetic adoption path for an unrecorded consumer', (t) => {
  const root = consumer(t, {});
  const report = runDoctor({ repoRoot: root });
  assert.equal(report.migration.catalog.from_schema_version, null);
  assert.equal(report.migration.catalog.to_schema_version, SCHEMA_VERSION);
  assert.deepEqual(report.migration.catalog.migration_ids, ['adopt-consumer-contract']);
  assert.equal(report.migration.catalog.synthetic, true);
  assert.ok(report.migration.catalog.steps.some((step) => step.transformation === 'record-consumer-contract'));
  assert.ok(report.findings.some((item) => item.id === 'consumer-adoption-path-available' && item.severity === 'info'));
  assert.match(formatDoctorReport(report), /adopt-consumer-contract; synthetic — generated by doctor plan/);
  // A recorded consumer on the current schema has no path and is not synthetic.
  const recorded = consumer(t, {
    'specs/skills/repo-overlay.md': `---\nidd_consumer:\n  schemaVersion: 1\n  toolkit:\n    version: 0.0.0\n    schema:\n      version: ${SCHEMA_VERSION}\n      digest: sha256:${'0'.repeat(64)}\n    source:\n      kind: github-tag\n      ref: v0.0.0\n---\n`,
  });
  const recordedReport = runDoctor({ repoRoot: recorded });
  assert.deepEqual(recordedReport.migration.catalog.migration_ids, []);
  assert.equal(recordedReport.migration.catalog.synthetic, false);
});
