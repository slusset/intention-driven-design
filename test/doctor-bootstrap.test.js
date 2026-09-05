'use strict';

// docs/idd/evolution-and-migration.md: explicit source-schema bootstrap (#101).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { buildMigrationPlan, applyMigrationPlan, planDigest } = require('../tools/lib/evolution');
const { createModule } = require('../tools/lib/module-scaffold');
const { readConsumerContract } = require('../tools/lib/consumer-contract');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin/idd.js');
const TARGET = require('../schemas/v1/index.json').version;
const OVERLAY = 'specs/skills/repo-overlay.md';
const CASES = 'specs/fixtures/cases.json';
const SOURCE = { version: '1.11.0', source: 'operator-asserted' };

function write(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function fixture(t, { legacy = true, overlay = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bootstrap-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(createModule({ repoRoot: root, name: 'core' }).errors, []);
  if (overlay) write(root, OVERLAY, '# Consumer overlay\nKeep this text.\n');
  if (legacy) {
    write(root, 'specs/contracts/openapi/api.yaml', 'openapi: 3.1.0\ninfo: { title: x, version: "1" }\npaths: {}\n');
    write(root, CASES, JSON.stringify({ _meta: { id: 'cases', type: 'conformance-vector' }, cases: [{ input: 42 }] }, null, 2));
    const capabilityPath = path.join(root, 'specs/capabilities/core.capability.yaml');
    const capability = yaml.load(fs.readFileSync(capabilityPath, 'utf8'));
    capability.scope.contracts = ['specs/contracts/openapi/api.yaml'];
    capability.scope.fixtures = [CASES];
    fs.writeFileSync(capabilityPath, yaml.dump(capability));
  }
  return root;
}

function snapshot(root) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push([path.relative(root, file), fs.readFileSync(file, 'utf8')]);
    }
  }
  walk(root);
  return files.sort(([a], [b]) => a.localeCompare(b));
}

function cli(root, args) {
  return spawnSync(process.execPath, [CLI, 'doctor', ...args, '--repo', root], { cwd: ROOT, encoding: 'utf8' });
}

function recordedOverlay(version = '1.11.0') {
  return `---\n${yaml.dump({ idd_consumer: { schemaVersion: 1, toolkit: {
    version: '0.1.0-uat.3', schema: { version, digest: `sha256:${'a'.repeat(64)}` }, source: { kind: 'github-tag', ref: 'v0.1.0-uat.3' },
  } } })}---\n# Consumer\n`;
}

test('an explicit source reaches the fixture migration without recording an intermediate contract', (t) => {
  const root = fixture(t);
  const before = snapshot(root);
  const plain = buildMigrationPlan({ repoRoot: root }).plan;
  assert.deepEqual(plain.migrations.map(x => x.id), ['adopt-consumer-contract']);
  assert.ok(plain.blockers.includes('validator-fixtures-schema-const'));
  const { plan, report } = buildMigrationPlan({ repoRoot: root, fromSchema: '1.11.0' });
  assert.deepEqual(plan.source_schema, SOURCE);
  assert.equal(plan.transition.from_schema, '1.11.0');
  assert.equal(plan.transition.to_schema, TARGET);
  assert.equal(plan.migrations[0].id, 'schema-1-11-0-to-1-12-0');
  assert.equal(plan.migrations.at(-1).to.schema, TARGET);
  assert.ok(plan.resolved_by_plan.includes('validator-fixtures-schema-const'));
  assert.deepEqual(plan.blockers, []);
  assert.equal(report.repository.consumer_contract.status, 'unrecorded');
  assert.equal(plan.digest, buildMigrationPlan({ repoRoot: root, fromSchema: '1.11.0' }).plan.digest);
  assert.deepEqual(snapshot(root), before);
});

test('CLI plan/apply carries the source assertion, still requires acceptance, and rejects replay', (t) => {
  const root = fixture(t, { overlay: false });
  const planPath = path.join(root, 'plan.json');
  const planned = cli(root, ['plan', '--from-schema', '1.11.0', '--out', planPath]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /1\.11\.0.*operator-asserted/);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert.equal(readConsumerContract(root).status, 'missing');
  const before = snapshot(root);
  const refused = cli(root, ['apply', '--plan', planPath, '--json']);
  assert.equal(refused.status, 1);
  assert.equal(JSON.parse(refused.stdout).refusals[0].reason, 'acceptance-required');
  assert.deepEqual(snapshot(root), before);
  const args = ['apply', '--plan', planPath, '--json', ...plan.acceptance_required.flatMap(id => ['--accept', id])];
  const applied = cli(root, args);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  const result = JSON.parse(applied.stdout);
  assert.equal(result.findings_after.errors, 0);
  assert.equal(result.journal_mutation, false);
  const rewritten = JSON.parse(fs.readFileSync(path.join(root, CASES), 'utf8'));
  assert.equal(rewritten._meta.type, 'fixture');
  assert.equal(rewritten._meta.kind, 'conformance-vector');
  assert.deepEqual(rewritten.cases, [{ input: 42 }]);
  const consumer = readConsumerContract(root);
  assert.equal(consumer.status, 'valid');
  assert.equal(consumer.record.toolkit.schema.version, TARGET);
  const record = JSON.parse(fs.readFileSync(path.join(root, result.evolution_record), 'utf8'));
  assert.deepEqual(record.source_schema, SOURCE);
  assert.equal(record.plan_digest, plan.digest);
  const after = snapshot(root);
  const replay = cli(root, args);
  assert.equal(replay.status, 1);
  assert.equal(JSON.parse(replay.stdout).refusals[0].reason, 'plan-stale');
  assert.deepEqual(snapshot(root), after);
});

test('invalid versions and unavailable paths fail without an output plan or consumer writes', (t) => {
  const root = fixture(t);
  const before = snapshot(root);
  for (const version of ['1.11', 'banana', '9.9.9']) {
    const result = cli(root, ['plan', '--from-schema', version, '--out', path.join(root, 'bad-plan.json')]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /from-schema|catalog.*path/i);
    assert.deepEqual(snapshot(root), before);
  }
  assert.equal(cli(root, ['plan', '--from-schema']).status, 1);
  assert.equal(cli(root, ['--from-schema', '1.11.0']).status, 1);
  assert.equal(cli(root, ['apply', '--from-schema', '1.11.0']).status, 1);
});

test('the source option cannot override valid or invalid records or the toolkit itself', (t) => {
  const root = fixture(t);
  for (const overlay of [recordedOverlay(), '---\nidd_consumer: {broken\n---\n']) {
    write(root, OVERLAY, overlay);
    const before = snapshot(root);
    assert.throws(() => buildMigrationPlan({ repoRoot: root, fromSchema: '1.11.0' }), /unrecorded|recorded contract/);
    assert.deepEqual(snapshot(root), before);
  }
  assert.throws(() => buildMigrationPlan({ repoRoot: ROOT, fromSchema: '1.11.0' }), /consumer|toolkit/);
});

test('a current-schema assertion records adoption without a schema migration', (t) => {
  const root = fixture(t, { legacy: false });
  const { plan } = buildMigrationPlan({ repoRoot: root, fromSchema: TARGET });
  assert.deepEqual(plan.source_schema, { version: TARGET, source: 'operator-asserted' });
  assert.equal(plan.transition.from_schema, TARGET);
  assert.deepEqual(plan.migrations.map(x => x.id), ['adopt-consumer-contract']);
});

test('source tampering and a newly recorded contract invalidate the saved bootstrap plan', (t) => {
  const root = fixture(t);
  const plan = buildMigrationPlan({ repoRoot: root, fromSchema: '1.11.0' }).plan;
  const planPath = path.join(root, 'plan.json');
  const altered = structuredClone(plan);
  altered.source_schema.version = '1.12.0';
  for (const rehash of [false, true]) {
    if (rehash) altered.digest = planDigest(altered);
    write(root, 'plan.json', JSON.stringify(altered));
    const before = snapshot(root);
    const result = applyMigrationPlan({ repoRoot: root, planPath, accept: plan.acceptance_required });
    assert.equal(result.status, 'refused');
    assert.equal(result.refusals[0].reason, rehash ? 'plan-stale' : 'plan-digest-mismatch');
    assert.deepEqual(snapshot(root), before);
  }
  write(root, 'plan.json', JSON.stringify(plan));
  write(root, OVERLAY, recordedOverlay());
  const before = snapshot(root);
  const result = applyMigrationPlan({ repoRoot: root, planPath, accept: plan.acceptance_required });
  assert.equal(result.refusals[0].reason, 'plan-stale');
  assert.deepEqual(snapshot(root), before);
});

test('the source assertion does not waive unrelated migration blockers', (t) => {
  const root = fixture(t);
  write(root, 'specs/features/broken.feature', '# id: broken\n# type: feature\n# story: specs/stories/missing.md\nFeature: Broken\n');
  const plan = buildMigrationPlan({ repoRoot: root, fromSchema: '1.11.0' }).plan;
  assert.ok(plan.blockers.some(id => id.startsWith('validator-traceability-')));
  write(root, 'plan.json', JSON.stringify(plan));
  const before = snapshot(root);
  const result = applyMigrationPlan({ repoRoot: root, planPath: path.join(root, 'plan.json'), accept: plan.acceptance_required });
  assert.equal(result.refusals[0].reason, 'error-findings-block-apply');
  assert.deepEqual(snapshot(root), before);
});
