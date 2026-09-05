'use strict';

// SCHEMA.md: Accepted toolkit pins; regression for #102.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { runDoctor, formatDoctorReport } = require('../tools/lib/doctor');
const { digestJsonFile } = require('../tools/lib/contract-digests');

const ROOT = path.resolve(__dirname, '..');
const VERSION = require('../package.json').version;
const SCHEMA_VERSION = require('../schemas/v1/index.json').version;
const OVERLAY = 'specs/skills/repo-overlay.md';
const FLOATING = 'consumer-toolkit-version-floating';
const DISAGREEMENT = 'consumer-toolkit-dependency-drift';

function write(root, relative, value) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), value);
}

function contract(kind = 'github-tag') {
  return { idd_consumer: { schemaVersion: 1, toolkit: {
    version: VERSION,
    schema: { version: SCHEMA_VERSION, digest: digestJsonFile(path.join(ROOT, 'schemas/v1/index.json')) },
    source: { kind, ref: kind === 'github-tag' ? `v${VERSION}` : kind === 'npm' ? VERSION : '/accepted/toolkit' },
  } } };
}

function saveContract(root, value) {
  write(root, OVERLAY, `---\n${yaml.dump(value)}---\n# Consumer\n`);
}

function fixture(t, kind = 'github-tag') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-toolkit-pins-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (kind) saveContract(root, contract(kind));
  return root;
}

function inspect(root) { return runDoctor({ repoRoot: root }); }
function finding(report, id) { return report.findings.find(item => item.id === id); }

for (const kind of ['github-tag', 'local']) {
  test(`${kind} contract supplies a standalone pin without package.json or an npm dependency`, (t) => {
    const root = fixture(t, kind);
    const overlay = fs.readFileSync(path.join(root, OVERLAY), 'utf8');
    for (const packageJson of [null, { name: 'consumer', dependencies: { unrelated: '^1.0.0' } }]) {
      if (packageJson) write(root, 'package.json', JSON.stringify(packageJson));
      const report = inspect(root);
      assert.equal(report.repository.consumer_contract.status, 'valid');
      assert.equal(finding(report, FLOATING), undefined);
      assert.equal(finding(report, 'consumer-toolkit-version-unrecorded'), undefined);
      assert.equal(finding(report, DISAGREEMENT), undefined);
      assert.equal(report.migration.writes, false);
      assert.ok(formatDoctorReport(report).includes(`Accepted toolkit contract: ${VERSION} (${kind}; ${OVERLAY})`));
    }
    assert.equal(fs.readFileSync(path.join(root, OVERLAY), 'utf8'), overlay);
    assert.deepEqual(fs.readdirSync(root).sort(), ['package.json', 'specs']);
  });
}

test('matching exact npm and GitHub/Git UAT pins agree with the recorded contract', (t) => {
  const root = fixture(t);
  for (const spec of [VERSION, `github:slusset/intention-driven-design#v${VERSION}`, `github:slusset/intention-driven-design#${VERSION}`, `git+https://github.com/slusset/intention-driven-design.git#v${VERSION}`]) {
    write(root, 'package.json', JSON.stringify({ dependencies: { 'idd-toolkit': spec } }));
    const report = inspect(root);
    assert.equal(finding(report, FLOATING), undefined);
    assert.equal(finding(report, DISAGREEMENT), undefined);
    assert.equal(report.repository.consumer_toolkit_spec, spec);
  }
});

test('an exact but conflicting dependency names both sources and does not become a floating warning', (t) => {
  const root = fixture(t);
  for (const spec of ['0.1.0-uat.999', 'github:slusset/intention-driven-design#v0.1.0-uat.999', 'git+https://github.com/slusset/intention-driven-design.git#0.1.0-uat.999']) {
    write(root, 'package.json', JSON.stringify({ dependencies: { 'idd-toolkit': spec } }));
    const report = inspect(root);
    const drift = finding(report, DISAGREEMENT);
    assert.ok(drift, spec);
    assert.equal(drift.severity, 'advisory');
    assert.equal(drift.current, spec);
    assert.equal(drift.expected, VERSION);
    assert.deepEqual(drift.paths, ['package.json', OVERLAY]);
    assert.equal(finding(report, FLOATING), undefined);
  }
});

test('a valid standalone contract cannot hide floating or malformed npm entries', (t) => {
  const root = fixture(t, 'local');
  for (const spec of [`^${VERSION}`, 'github:slusset/intention-driven-design#main', '', null, 42, {}]) {
    write(root, 'package.json', JSON.stringify({ devDependencies: { 'idd-toolkit': spec } }));
    const report = inspect(root);
    const floating = finding(report, FLOATING);
    assert.ok(floating, JSON.stringify(spec));
    assert.match(floating.subject, /devDependencies/);
    assert.match(`${floating.expected} ${floating.recommendation}`, /npm|package\.json/);
    assert.equal(finding(report, DISAGREEMENT), undefined);
  }
});

test('each dependency section is checked so a matching entry cannot mask a conflicting one', (t) => {
  const root = fixture(t);
  write(root, 'package.json', JSON.stringify({
    dependencies: { 'idd-toolkit': '0.1.0-uat.999' },
    devDependencies: { 'idd-toolkit': `^${VERSION}` },
    optionalDependencies: { 'idd-toolkit': VERSION },
  }));
  const report = inspect(root);
  assert.match(finding(report, DISAGREEMENT).subject, /dependencies\.idd-toolkit/);
  assert.match(finding(report, FLOATING).subject, /devDependencies\.idd-toolkit/);
});

test('unsupported standalone provenance and invalid or missing records retain diagnostics', (t) => {
  const root = fixture(t, 'npm');
  const npm = inspect(root);
  const floating = finding(npm, FLOATING);
  assert.ok(floating);
  assert.match(`${floating.expected} ${floating.recommendation}`, /github-tag/);
  assert.match(`${floating.expected} ${floating.recommendation}`, /local/);
  saveContract(root, { idd_consumer: { schemaVersion: 1 } });
  const invalid = inspect(root);
  assert.ok(finding(invalid, 'consumer-contract-invalid'));
  assert.ok(finding(invalid, 'consumer-toolkit-version-unrecorded'));
  fs.unlinkSync(path.join(root, OVERLAY));
  assert.ok(finding(inspect(root), 'consumer-toolkit-version-unrecorded'));
});

test('standalone pin recognition preserves runtime, schema-digest, and source-ref drift', (t) => {
  const root = fixture(t);
  const declared = contract();
  declared.idd_consumer.toolkit.version = '0.1.0-uat.999';
  declared.idd_consumer.toolkit.schema.digest = `sha256:${'0'.repeat(64)}`;
  declared.idd_consumer.toolkit.source.ref = 'main';
  saveContract(root, declared);
  const report = inspect(root);
  assert.equal(finding(report, FLOATING), undefined);
  for (const id of ['consumer-toolkit-pin-drift', 'consumer-schema-digest-drift', 'consumer-source-ref-drift']) assert.ok(finding(report, id), id);
});
