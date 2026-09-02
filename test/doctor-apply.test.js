'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { applyMigrationPlan, buildMigrationPlan, planDigest } = require('../tools/lib/evolution');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');
const TOOLKIT_VERSION = require(path.join(REPO_ROOT, 'package.json')).version;
const SCHEMA_VERSION = require(path.join(REPO_ROOT, 'schemas', 'v1', 'index.json')).version;

function makeConsumer(t, overlay = null) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-doctor-apply-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  if (overlay !== null) {
    fs.mkdirSync(path.join(repoRoot, 'specs', 'skills'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'specs', 'skills', 'repo-overlay.md'), overlay);
  }
  return repoRoot;
}

function stalePinOverlay() {
  return [
    '---',
    'idd_consumer:',
    '  schemaVersion: 1',
    '  toolkit:',
    '    version: 0.1.0-uat.1',
    '    schema:',
    '      version: 1.9.0',
    `      digest: sha256:${'0'.repeat(64)}`,
    '    source:',
    '      kind: github-tag',
    '      ref: v0.1.0-uat.1',
    '---',
    '# Consumer overlay',
    '',
  ].join('\n');
}

function snapshotTree(root) {
  const entries = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else entries.push([path.relative(root, full), fs.readFileSync(full, 'utf8')]);
    }
  }
  visit(root);
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

test('doctor plan is deterministic and proposes adoption for an unrecorded consumer', (t) => {
  const repoRoot = makeConsumer(t);

  const first = buildMigrationPlan({ repoRoot }).plan;
  const second = buildMigrationPlan({ repoRoot }).plan;

  assert.equal(first.kind, 'idd-migration-plan');
  assert.equal(first.digest, second.digest);
  assert.equal(first.digest, planDigest(first));
  assert.equal(first.writes, false);
  assert.equal(first.journal_mutation, false);
  assert.deepEqual(first.migrations.map((migration) => migration.id), ['adopt-consumer-contract']);
  assert.deepEqual(first.acceptance_required, ['adopt-consumer-contract']);
  assert.equal(first.transition.from_schema, null);
  assert.equal(first.transition.to_schema, SCHEMA_VERSION);
});

test('doctor plan resolves the cataloged path for a stale schema pin', (t) => {
  const repoRoot = makeConsumer(t, stalePinOverlay());
  const { plan } = buildMigrationPlan({ repoRoot });

  assert.deepEqual(plan.migrations.map((migration) => migration.id), [
    'schema-1-9-0-to-1-10-0',
    'schema-1-10-0-to-1-11-0',
    'schema-1-11-0-to-1-12-0',
    'schema-1-12-0-to-1-13-0',
    'schema-1-13-0-to-1-14-0',
  ]);
  assert.deepEqual(plan.acceptance_required, plan.migrations.map((migration) => migration.id));
  assert.match(plan.catalog.digest, /^sha256:[0-9a-f]{64}$/);
});

test('doctor apply refuses without explicit acceptance and writes nothing', (t) => {
  const repoRoot = makeConsumer(t, stalePinOverlay());
  const planPath = path.join(repoRoot, 'plan.json');
  const { plan } = buildMigrationPlan({ repoRoot });
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const before = snapshotTree(repoRoot);

  const result = applyMigrationPlan({ repoRoot, planPath, accept: [] });

  assert.equal(result.status, 'refused');
  assert.equal(result.refusals[0].reason, 'acceptance-required');
  assert.deepEqual(snapshotTree(repoRoot), before);
});

test('doctor apply refuses a tampered plan and writes nothing', (t) => {
  const repoRoot = makeConsumer(t, stalePinOverlay());
  const planPath = path.join(repoRoot, 'plan.json');
  const { plan } = buildMigrationPlan({ repoRoot });
  plan.migrations = [];
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const before = snapshotTree(repoRoot);

  const result = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required });

  assert.equal(result.status, 'refused');
  assert.equal(result.refusals[0].reason, 'plan-digest-mismatch');
  assert.deepEqual(snapshotTree(repoRoot), before);
});

test('doctor apply refuses when error findings block the migration', (t) => {
  const repoRoot = makeConsumer(t, '---\nidd_consumer: {broken\n---\n# Overlay\n');
  const planPath = path.join(repoRoot, 'plan.json');
  const { plan } = buildMigrationPlan({ repoRoot });
  assert.ok(plan.blockers.length > 0);
  fs.writeFileSync(planPath, JSON.stringify(plan));

  const result = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required });

  assert.equal(result.status, 'refused');
  assert.equal(result.refusals[0].reason, 'error-findings-block-apply');
});

test('error findings the plan\'s transformations resolve are not blockers, and apply confirms they are gone', (t) => {
  const repoRoot = makeConsumer(t, [
    '---', 'idd_consumer:', '  schemaVersion: 1', '  toolkit:', '    version: 0.1.0-uat.3', '    schema:', '      version: 1.11.0',
    `      digest: sha256:${'0'.repeat(64)}`, '    source:', '      kind: github-tag', '      ref: v0.1.0-uat.3', '---', '# Overlay', '',
  ].join('\n'));
  fs.mkdirSync(path.join(repoRoot, 'specs', 'fixtures'), { recursive: true });
  // The fixtures validator only runs when a protocol contract exists.
  fs.mkdirSync(path.join(repoRoot, 'specs', 'contracts', 'openapi'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'specs', 'contracts', 'openapi', 'api.yaml'), 'openapi: 3.1.0\ninfo: { title: x, version: "1" }\npaths: {}\n');
  fs.writeFileSync(path.join(repoRoot, 'specs', 'fixtures', 'cases.json'), JSON.stringify({ _meta: { id: 'cases', type: 'conformance-vector' }, cases: [] }, null, 2));
  const { plan, report } = buildMigrationPlan({ repoRoot });
  assert.ok(report.findings.some((item) => item.id === 'validator-fixtures-schema-const' && item.severity === 'error'));
  assert.ok(plan.resolved_by_plan.includes('validator-fixtures-schema-const'), JSON.stringify(plan.resolved_by_plan));
  assert.ok(!plan.blockers.includes('validator-fixtures-schema-const'));
  assert.deepEqual(plan.blockers, []);
  const planPath = path.join(repoRoot, 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const result = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required });
  assert.equal(result.status, 'applied', JSON.stringify(result.refusals));
  assert.deepEqual(result.resolved_by_plan, ['validator-fixtures-schema-const']);
  const rewritten = JSON.parse(fs.readFileSync(path.join(repoRoot, 'specs', 'fixtures', 'cases.json'), 'utf8'));
  assert.equal(rewritten._meta.type, 'fixture');
  assert.equal(rewritten._meta.kind, 'conformance-vector');
  assert.equal(result.findings_after.errors, 0);
});

test('--allow-blocker accepts a named error finding explicitly and records it in the evolution record', (t) => {
  const repoRoot = makeConsumer(t, stalePinOverlay());
  // An unrelated error the plan cannot fix: a story reference to a missing file.
  fs.mkdirSync(path.join(repoRoot, 'specs', 'features'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'specs', 'features', 'x.feature'), '# story: specs/stories/missing.md\nFeature: X\n');
  const { plan } = buildMigrationPlan({ repoRoot });
  assert.ok(plan.blockers.length > 0, 'the missing reference must block');
  const planPath = path.join(repoRoot, 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const refused = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required });
  assert.equal(refused.status, 'refused');
  assert.match(refused.refusals[0].detail, /--allow-blocker validator-traceability-/);
  const allowed = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required, allowBlockers: plan.blockers });
  assert.equal(allowed.status, 'applied', JSON.stringify(allowed.refusals));
  assert.deepEqual(allowed.blockers_allowed, plan.blockers);
  const record = JSON.parse(fs.readFileSync(path.join(repoRoot, allowed.evolution_record), 'utf8'));
  assert.deepEqual(record.blockers_allowed, plan.blockers);
});

test('doctor apply executes accepted migrations, resolves drift, and journals the evolution', (t) => {
  const repoRoot = makeConsumer(t, stalePinOverlay());
  const planPath = path.join(repoRoot, 'plan.json');
  const { plan } = buildMigrationPlan({ repoRoot });
  fs.writeFileSync(planPath, JSON.stringify(plan));

  const result = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.writes, ['specs/skills/repo-overlay.md']);
  assert.equal(result.journal_mutation, false);
  assert.equal(result.invariants.errors, 0);

  const stepModes = result.migrations.flatMap((migration) => migration.steps.map((step) => `${step.mode}:${step.status}`));
  assert.ok(stepModes.includes('review:acknowledged'));
  assert.ok(stepModes.includes('transform:applied'));
  assert.ok(stepModes.includes('validate:applied'));

  const overlay = fs.readFileSync(path.join(repoRoot, 'specs', 'skills', 'repo-overlay.md'), 'utf8');
  assert.match(overlay, new RegExp(`version: ${TOOLKIT_VERSION.replace(/\./g, '\\.')}`));
  assert.match(overlay, new RegExp(`version: ${SCHEMA_VERSION.replace(/\./g, '\\.')}`));
  assert.match(overlay, /# Consumer overlay/);

  const recordPath = path.join(repoRoot, result.evolution_record);
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  assert.equal(record.kind, 'idd-evolution-record');
  assert.equal(record.status, 'applied');
  assert.equal(record.plan_digest, plan.digest);
  assert.equal(record.journal_mutation, false);

  const after = JSON.parse(execFileSync(process.execPath, [IDD_BIN, 'doctor', '--repo', repoRoot, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }));
  const afterIds = after.findings.map((item) => item.id);
  assert.ok(!afterIds.includes('consumer-schema-version-drift'));
  assert.ok(!afterIds.includes('consumer-schema-digest-drift'));
  assert.ok(!afterIds.includes('consumer-toolkit-pin-drift'));

  // Replay protection: the applied plan no longer matches repository state.
  const replay = applyMigrationPlan({ repoRoot, planPath, accept: plan.acceptance_required });
  assert.equal(replay.status, 'refused');
  assert.equal(replay.refusals[0].reason, 'plan-stale');
});

test('doctor apply through the CLI exits non-zero on refusal', (t) => {
  const repoRoot = makeConsumer(t, stalePinOverlay());
  const planPath = path.join(repoRoot, 'plan.json');
  execFileSync(process.execPath, [IDD_BIN, 'doctor', 'plan', '--repo', repoRoot, '--out', planPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.throws(
    () => execFileSync(process.execPath, [IDD_BIN, 'doctor', 'apply', '--plan', planPath, '--repo', repoRoot, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }),
    (error) => {
      const output = JSON.parse(error.stdout);
      assert.equal(output.status, 'refused');
      assert.equal(output.refusals[0].reason, 'acceptance-required');
      return error.status === 1;
    },
  );
});
