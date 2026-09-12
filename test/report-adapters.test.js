const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { formats, getAdapter } = require('../tools/lib/report-adapters');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');
const junit = getAdapter('junit');

// Shaped like a cargo-nextest report, but nothing here is Rust-specific:
// surefire, pytest and jest emit the same elements.
const REPORT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="run" tests="6">
  <testsuite name="kernel" tests="6">
    <testcase name="T-3: malformed envelopes fail at the boundary" classname="kernel::admission" time="0.012"/>
    <testcase name="U-5: rotation preserves the principal" classname="kernel::identity" time="1.5">
      <failure message="assertion failed: principal &amp; key diverged">stack</failure>
    </testcase>
    <testcase name="W-1: workspace publishes" classname="workspace" time="0.2">
      <skipped message="requires a relay"/>
    </testcase>
    <testcase name="C-4: ordering &gt; holds" classname="kernel::order" time="0.01"/>
    <testcase name="D-1: 5 > 3 stays true" classname="kernel::order" time="0.02"/>
    <testcase name="E-9: import errors surface" classname="storage" time="0.4">
      <error message="panicked at lib:42">trace</error>
    </testcase>
  </testsuite>
</testsuites>
`;

function inTempRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-junit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'report.xml'), REPORT);
  return dir;
}

function runIdd(cwd, args) {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [IDD_BIN, ...args], { cwd, encoding: 'utf8' }) };
  } catch (error) {
    return { status: error.status, stdout: `${error.stdout || ''}`, stderr: `${error.stderr || ''}` };
  }
}

test('junit parses one observation per case and drops skipped ones', () => {
  const { observations, skipped } = junit.parse(REPORT);

  assert.equal(skipped, 1);
  assert.deepEqual(observations.map((o) => o.outcome), ['pass', 'fail', 'pass', 'pass', 'fail']);
  assert.deepEqual(observations.map((o) => o.scope), [
    'kernel::admission', 'kernel::identity', 'kernel::order', 'kernel::order', 'storage',
  ]);
  assert.equal(observations[0].durationMs, 12);
  assert.equal(observations[1].durationMs, 1500);
});

test('junit decodes entities and survives an unescaped angle bracket in a name', () => {
  const { observations } = junit.parse(REPORT);
  const names = observations.map((o) => o.name);

  assert.ok(names.includes('C-4: ordering > holds'), 'entity-encoded name was not decoded');
  assert.ok(names.includes('D-1: 5 > 3 stays true'), 'raw angle bracket truncated the tag');
  assert.equal(observations[1].detail, 'assertion failed: principal & key diverged');
});

test('junit refuses a file that is not a JUnit report', () => {
  assert.throws(() => junit.parse('{"tests": []}'), /not a JUnit XML report/);
  assert.throws(() => junit.parse(''), /not a JUnit XML report/);
});

test('the registry is keyed by format, and an unknown one names the known formats', () => {
  assert.deepEqual(formats(), ['junit']);
  assert.equal(junit.probeKind, 'test-selector');
  // A runner is not a format: asking for one is an error, not a silent guess.
  assert.throws(() => getAdapter('nextest'), /unknown report format: nextest \(known formats: junit\)/);
});

test('idd evidence record --from junit writes one record per case', (t) => {
  const dir = inTempRepo(t);

  const result = runIdd(dir, ['evidence', 'record', '--from', 'junit', 'report.xml', '--run-id', 'ci-1', '--json']);
  assert.equal(result.status, 0, result.stderr);

  const summary = JSON.parse(result.stdout);
  assert.equal(summary.format, 'junit');
  assert.equal(summary.records, 5);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.pass, 3);
  assert.equal(summary.fail, 2);

  const lines = fs.readFileSync(path.join(dir, '.idd/evidence/results/ci-1.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 5);
  assert.equal(lines[0].probe.kind, 'test-selector');
  assert.equal(lines[0].tool.name, 'junit');
  assert.equal(lines[0].probe.scope, 'kernel::admission');
  assert.equal(lines[1].observed, 'fail');
  // No maps in this repository, so nothing claims these probes yet.
  assert.equal(lines[0].verdict, 'unclaimed');
});

test('a failing case against a pinned expectation is a mismatch and exits nonzero', (t) => {
  const dir = inTempRepo(t);

  const result = runIdd(dir, ['evidence', 'record', '--from', 'junit', 'report.xml',
    '--tool', 'nextest', '--expected', 'pass', '--run-id', 'ci-2', '--json']);

  assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.mismatch, 2);
  assert.equal(summary.records, 5);

  const first = JSON.parse(fs.readFileSync(path.join(dir, '.idd/evidence/results/ci-2.jsonl'), 'utf8').split('\n')[0]);
  assert.equal(first.tool.name, 'nextest');
  assert.equal(first.expected, 'pass');
});

test('an unknown format fails before reading anything', (t) => {
  const dir = inTempRepo(t);
  const result = runIdd(dir, ['evidence', 'record', '--from', 'xunit', 'report.xml']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown report format: xunit/);
});
