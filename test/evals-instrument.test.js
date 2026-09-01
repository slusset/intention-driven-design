'use strict';

// Tests of the evaluation instrument's MECHANICS (#58): record contract,
// determinism, reconstructability, and layering. No benchmark number is
// asserted here, and none ever gates a merge.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runExperiment } = require('../evals/run-experiment');
const { jcsSha256 } = require('../tools/lib/contract-digests');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCENARIO = path.join(REPO_ROOT, 'evals', 'scenarios', 'baseline-empty');

test('runner produces a schema-valid, digest-closed experiment record', (t) => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-eval-records-'));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

  const { record, recordPath } = runExperiment({
    scenarioDir: SCENARIO,
    conditionId: 'mechanics-test',
    outDir,
  });

  // runExperiment validates against experiment-record@1 before returning;
  // re-check the digest closure and reconstruction surface here.
  const { digest, ...rest } = record;
  assert.equal(digest, jcsSha256(rest));
  assert.equal(record.scenario.id, 'baseline-empty');
  assert.equal(record.condition.id, 'mechanics-test');
  assert.match(record.environment.toolkit_version, /^\d+\.\d+\.\d+/);
  assert.ok(record.artifacts.length > 0);
  for (const artifact of record.artifacts) {
    assert.match(artifact.digest, /^sha256:[0-9a-f]{64}$/);
  }
  assert.ok(fs.existsSync(recordPath));
  assert.deepEqual(JSON.parse(fs.readFileSync(recordPath, 'utf8')), record);
});

test('deterministic tier is a pure function of the scenario tree', () => {
  const first = runExperiment({ scenarioDir: SCENARIO, conditionId: 'determinism-a' });
  const second = runExperiment({ scenarioDir: SCENARIO, conditionId: 'determinism-b' });

  assert.deepEqual(first.record.metrics.deterministic, second.record.metrics.deterministic);
  assert.equal(first.record.scenario.seed_digest, second.record.scenario.seed_digest);
  assert.deepEqual(first.record.artifacts, second.record.artifacts);
});

test('checkers surface real drift in a produced tree', (t) => {
  const trialRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-eval-trial-'));
  t.after(() => fs.rmSync(trialRoot, { recursive: true, force: true }));
  fs.cpSync(SCENARIO, trialRoot, { recursive: true });
  // An agent under test leaves a story pointing at a journey that does not
  // exist: traceability closure must fail deterministically.
  fs.mkdirSync(path.join(trialRoot, 'specs', 'stories'), { recursive: true });
  fs.writeFileSync(path.join(trialRoot, 'specs', 'stories', 'broken.story.md'), [
    '---',
    'id: broken-story',
    'type: story',
    'refs:',
    '  journey: specs/journeys/missing.journey.md',
    '  persona: specs/personas/missing.persona.md',
    '---',
    '# Broken story',
    '',
  ].join('\n'));

  const { record } = runExperiment({ scenarioDir: trialRoot, conditionId: 'drift-check' });
  assert.ok(record.metrics.deterministic.errors > 0);
  assert.notEqual(record.scenario.seed_digest, runExperiment({ scenarioDir: SCENARIO, conditionId: 'seed' }).record.scenario.seed_digest);
});

test('instrument stays outside the release unit', () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }));
  for (const file of packed.files) {
    assert.ok(!file.path.startsWith('evals/'), `npm pack must not ship the instrument: ${file.path}`);
  }
});

test('product code never reaches into the instrument', () => {
  const productDirs = [path.join(REPO_ROOT, 'bin'), path.join(REPO_ROOT, 'tools')];
  const offenders = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        visit(full);
      } else if (entry.name.endsWith('.js') && /(?:require\(|from ')[^)']*evals\//.test(fs.readFileSync(full, 'utf8'))) {
        offenders.push(path.relative(REPO_ROOT, full));
      }
    }
  }
  for (const dir of productDirs) visit(dir);
  assert.deepEqual(offenders, []);
});
