'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { buildFormalResult, loadVerificationMaps, declaredProbes, claimsFor } = require('../tools/lib/formal-results');
const { createCoverageValidator } = require('../tools/lib/evidence-coverage');
const { rollupEvidence, formatRollupMarkdown } = require('../tools/lib/evidence-rollup');
const { getValidator } = require('../tools/lib/schema-loader');
const ROOT = path.resolve(__dirname, '..');
const MAP = 'specs/verification/kernel/verification.yaml';
const INPUTS = ['specs/modules.yaml', 'model.als', 'import.als', 'model.cfg', 'runner.js', 'formal-tools.lock.json', MAP];
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
function write(root, file, value) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
}
function git(root, ...args) { return execFileSync('git', args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
function save(f) { write(f.root, '.idd/evidence/results/current.json', f.current); write(f.root, '.idd/evidence/baseline/prior.json', f.prior); }
function fixture(t, withDependency = false, extraProbes = 0, extraInputs = 0) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-coverage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, '.gitignore', '.idd/\n');
  write(root, 'specs/modules.yaml', { version: 1, modules: { kernel: { root: 'specs', capabilities: ['specs/capabilities/kernel.capability.yaml'], rule_families: ['K'], depends_on: [] } } });
  const witnesses = ['Witness', ...Array.from({ length: extraProbes }, (_, i) => `Witness${i}`)];
  const files = Array.from({ length: extraInputs }, (_, i) => `input-${i}.txt`);
  for (const file of files) write(root, file, 'tracked input\n');
  write(root, MAP, { capability: 'specs/capabilities/kernel.capability.yaml', tooling: { alloy: { sources: ['model.als'], lock: 'formal-tools.lock.json' } }, evidence: { classification: { verification: 'verified' } }, rules: [{ id: 'K-1', alloy: { assertions: ['Safe'], predicates: witnesses } }] });
  write(root, 'model.als', `open import\nassert Safe {}\n${witnesses.map(name => `pred ${name} {}`).join('\n')}\n`);
  write(root, 'import.als', 'sig E {}\n'); write(root, 'model.cfg', 'bound=3\n'); write(root, 'runner.js', '// runner v1\n');
  write(root, 'formal-tools.lock.json', { alloy: { version: '6.2.0', sha256: 'c'.repeat(64) } });
  const parent = 'specs/verification/upstream/verification.yaml';
  if (withDependency) {
    write(root, parent, { capability: 'specs/capabilities/upstream.capability.yaml', rules: [] });
    const map = JSON.parse(fs.readFileSync(path.join(root, MAP))); map.depends_on = [parent]; write(root, MAP, map);
  }
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'fixture@example.invalid'); git(root, 'config', 'user.name', 'Fixture'); git(root, 'add', '.'); git(root, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline');
  const base = git(root, 'rev-parse', 'HEAD');
  const options = { tool: 'alloy', lock: 'formal-tools.lock.json', kind: 'alloy-command', source: 'model.als', inputs: [...INPUTS, ...files, ...(withDependency ? [parent] : [])], scope: 'for 3', runId: 'prior', revision: base, environment: 'ci' };
  const prior = ['Safe', ...witnesses].map(name => buildFormalResult(root, { ...options, name, observed: name === 'Safe' ? 'UNSAT' : 'SAT' }));
  write(root, 'README.md', 'docs only\n'); git(root, 'add', '.'); git(root, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'docs');
  const revision = git(root, 'rev-parse', 'HEAD');
  const current = prior.map(r => buildFormalResult(root, { ...options, name: r.probe.name, observed: 'not-run', runId: 'current', revision, coveredBy: { run_id: 'prior', revision: base, source_digest: r.probe.source_digest } }));
  const f = { root, base, revision, options, prior, current }; save(f); return f;
}
function roll(f, options = {}) { save(f); return rollupEvidence(f.root, { baselineResultsDir: '.idd/evidence/baseline', ...options }); }
function rejected(f, pattern) {
  const r = roll(f); assert.ok(r.summary.errors > 0, JSON.stringify(r));
  assert.ok(r.findings.some(x => pattern.test(x.detail)), JSON.stringify(r.findings));
  assert.equal(r.summary.covered_records, 0);
}

// Instrument before loading the validator, without replacing Git's behavior.
// Count processes, not elapsed-time thresholds, so the regression is stable in CI.
function measuredRollups(f, roots = [f.root]) {
  const script = `
    const cp = require('node:child_process');
    const original = cp.execFileSync;
    let stats = {};
    cp.execFileSync = (command, args, options) => {
      if (command === 'git') stats[args[0]] = (stats[args[0]] || 0) + 1;
      return original(command, args, options);
    };
    const { rollupEvidence } = require(${JSON.stringify(path.join(ROOT, 'tools/lib/evidence-rollup'))});
    const observations = [];
    for (const root of ${JSON.stringify(roots)}) {
      stats = {};
      const started = performance.now();
      const result = rollupEvidence(root, { baselineResultsDir: '.idd/evidence/baseline', now: '2026-09-08T00:00:00.000Z' });
      observations.push({ result, stats, durationMs: performance.now() - started });
    }
    process.stdout.write(JSON.stringify(observations));
  `;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { env, maxBuffer: 16 * 1024 * 1024 }));
}

test('one roll-up reads each immutable tree input once while checking mutable state per probe', t => {
  const f = fixture(t, false, 100, 34); // 102 probes sharing 41 tracked inputs.
  const [observation] = measuredRollups(f);
  t.diagnostic(JSON.stringify({ durationMs: observation.durationMs, gitCalls: observation.stats }));
  assert.equal(observation.result.summary.errors, 0);
  assert.equal(observation.result.summary.covered_records, 102);
  assert.equal(observation.stats['ls-tree'], f.options.inputs.length * 2);
  assert.equal(observation.stats.show, f.options.inputs.length * 2);
  assert.equal(observation.stats['rev-parse'], f.current.length * 3);
  assert.equal(observation.stats['merge-base'], f.current.length);
});

test('immutable input caches end with each roll-up and do not cross repositories', t => {
  const f = fixture(t);
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-coverage-other-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  git(f.root, 'clone', '--no-hardlinks', f.root, other);
  save({ ...f, root: other });
  const observations = measuredRollups(f, [f.root, f.root, other]);
  for (const observation of observations) {
    assert.equal(observation.result.summary.errors, 0);
    assert.equal(observation.stats['ls-tree'], INPUTS.length * 2);
    assert.equal(observation.stats.show, INPUTS.length * 2);
  }
  assert.deepEqual(observations[0].result, observations[1].result);
  assert.deepEqual(observations[0].result.summary, observations[2].result.summary);
});

test('a warm cache still observes changed working bytes, symlinks, citations, outcomes and HEAD', t => {
  const f = fixture(t);
  const { maps } = loadVerificationMaps(f.root);
  const declared = declaredProbes(maps);
  const validate = createCoverageValidator(f.root);
  const check = index => validate(f.current[index], f.prior.map(record => ({ record })), claimsFor(declared, f.current[index].probe), maps);
  assert.equal(check(0).observed, 'UNSAT');
  const file = path.join(f.root, 'import.als');
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '// dirty\n');
  assert.throws(() => check(1), /coverage input changed/);
  fs.unlinkSync(file); fs.symlinkSync('model.als', file);
  assert.throws(() => check(1), /symlinks/);
  fs.unlinkSync(file); fs.writeFileSync(file, original);
  assert.equal(check(1).observed, 'SAT');
  f.prior[1].observed = 'UNSAT';
  assert.throws(() => check(1), /directly executed matching outcome/);
  f.prior[1].observed = 'SAT';
  f.current[1].covered_by.run_id = 'unknown';
  assert.throws(() => check(1), /exactly one matching baseline record/);
  f.current[1].covered_by.run_id = 'prior';
  write(f.root, 'README.md', 'a later head\n'); git(f.root, 'add', '.');
  git(f.root, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'later');
  assert.throws(() => check(1), /current run revision differs from checkout HEAD/);
});

test('unchanged tracked inputs reuse a baseline without counting it as fresh execution', t => {
  const f = fixture(t); const r = roll(f);
  assert.equal(r.summary.errors, 0, JSON.stringify(r.findings));
  assert.equal(r.rules['K-1'].derived, 'verified');
  assert.equal(r.rules['K-1'].coverage.alloy.matched, 0);
  assert.equal(r.rules['K-1'].coverage.alloy.covered, 2);
  assert.deepEqual(r.run.ids, ['current']); assert.deepEqual(r.run.revisions, [f.revision]);
  assert.equal(r.covered_results[0].observed, 'not-run');
  assert.ok(getValidator('evidence-rollup')(r).valid);
  assert.match(formatRollupMarkdown(r), /0\/2 \+2 covered/);
  assert.match(formatRollupMarkdown(r), new RegExp(`covered by run prior at revision ${f.base}`));
});

test('missing baseline is an error without strict mode and a plain missing probe stays unobserved', t => {
  const f = fixture(t); const r = roll(f, { baselineResultsDir: undefined });
  assert.ok(r.summary.errors > 0); assert.equal(r.rules['K-1'].coverage.alloy.covered, undefined);
  f.current = []; const empty = roll(f); assert.deepEqual(empty.rules['K-1'].coverage.alloy.unobserved, ['Safe', 'Witness']);
  assert.equal(empty.summary.covered_records, 0);
});

for (const file of INPUTS) test(`changed tracked input refuses reuse: ${file}`, t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, file), '\n');
  git(f.root, 'add', '.'); git(f.root, '-c', 'commit.gpgsign=false', 'commit', '-qm', 'changed input');
  for (const r of f.current) r.run.revision = git(f.root, 'rev-parse', 'HEAD');
  rejected(f, /coverage input changed/);
});

test('dirty and symlink inputs fail without mutating committed history', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.root, 'import.als'), '\n'); rejected(f, /coverage input changed/);
  git(f.root, 'restore', 'import.als'); fs.unlinkSync(path.join(f.root, 'import.als')); fs.symlinkSync('model.als', path.join(f.root, 'import.als'));
  rejected(f, /symlinks/);
});

for (const [name, mutate, pattern] of [
  ['scope', f => f.prior.forEach(r => r.probe.scope = 'for 4'), /scope differs/],
  ['source digest', f => f.prior.forEach(r => r.probe.source_digest = 'sha256:'+'d'.repeat(64)), /source digest differs/],
  ['tool digest', f => f.prior.forEach(r => r.tool.digest = 'sha256:'+'d'.repeat(64)), /tool digest differs/],
  ['input set', f => f.prior.forEach(r => r.probe.inputs.pop()), /input set/],
  ['map omitted', f => [...f.prior, ...f.current].forEach(r => r.probe.inputs = r.probe.inputs.filter(i => i.path !== MAP)), /omits required/],
  ['wrong outcome', f => f.prior.forEach(r => { r.observed = r.expected = r.probe.name === 'Safe' ? 'SAT' : 'UNSAT'; }), /current map expectation/],
  ['local baseline', f => f.prior.forEach(r => r.run.environment = 'local'), /CI baseline/],
  ['same run', f => f.current.forEach(r => r.run.id = 'prior'), /different run/],
  ['missing revision', f => f.current.forEach(r => r.covered_by.revision = 'd'.repeat(40)), /./],
  ['failure in run', f => f.prior.push({ ...f.prior[0], probe: { ...f.prior[0].probe, name: 'Other' }, verdict: 'mismatch' }), /failing record/],
  ['ambiguous baseline', f => f.prior.push(...structuredClone(f.prior)), /exactly one/],
  ['path escape', f => [...f.prior, ...f.current].forEach(r => r.probe.inputs[0].path = '../escape'), /canonical/],
]) test(`coverage refuses ${name}`, t => { const f = fixture(t); mutate(f); rejected(f, pattern); });

test('not-run requires complete metadata and executed records cannot carry coverage', t => {
  const f = fixture(t); const validate = getValidator('formal-result');
  for (const field of ['covered_by', 'tool', 'probe']) { const r = structuredClone(f.current[0]); delete r[field]; assert.equal(validate(r).valid, false); }
  for (const field of ['inputs', 'source', 'source_digest', 'scope']) { const r = structuredClone(f.current[0]); delete r.probe[field]; assert.equal(validate(r).valid, false); }
  for (const field of ['digest', 'lock']) { const r = structuredClone(f.current[0]); r.tool[field] = null; assert.equal(validate(r).valid, false); }
  const executed = { ...f.prior[0], covered_by: f.current[0].covered_by }; assert.equal(validate(executed).valid, false);
  assert.equal(validate({ ...f.prior[0], verdict: 'covered' }).valid, false);
});

test('baseline chains do not become evidence', t => {
  const f = fixture(t);
  f.prior = f.current.map(r => ({ ...r, run: { ...r.run, id: 'prior', revision: f.base } }));
  rejected(f, /directly executed/);
});

test('a non-ancestor baseline refuses even with identical files', t => {
  const f = fixture(t); const tree = git(f.root, 'rev-parse', `${f.base}^{tree}`);
  const unrelated = git(f.root, '-c', 'commit.gpgsign=false', 'commit-tree', tree, '-m', 'unrelated');
  f.prior.forEach(r => r.run.revision = unrelated); f.current.forEach(r => r.covered_by.revision = unrelated);
  rejected(f, /not a locally verifiable ancestor/);
});

test('CLI records inputs and separates baseline coverage in source and bundled reports', t => {
  const f = fixture(t);
  write(f.root, 'inputs.json', INPUTS); write(f.root, 'citation.json', f.current[0].covered_by);
  const args = ['evidence', 'record', '--tool', 'alloy', '--lock', 'formal-tools.lock.json', '--kind', 'alloy-command', '--name', 'Safe', '--source', 'model.als', '--scope', 'for 3', '--observed', 'not-run', '--run-id', 'current', '--revision', f.revision, '--environment', 'ci', '--inputs-file', 'inputs.json', '--covered-by-file', 'citation.json', '--results-dir', '.idd/cli', '--json'];
  const result = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'bin/idd.js'), ...args], { cwd: f.root, env }));
  assert.equal(result.record.verdict, 'covered');
  for (const bin of ['bin/idd.js', 'dist/bin/idd.js']) {
    const report = path.join(f.root, '.idd/cli-report.json');
    const counts = path.join(f.root, '.idd/cli-counts.json');
    const program = `
      const fs = require('node:fs'); const cp = require('node:child_process');
      const original = cp.execFileSync; const calls = {};
      cp.execFileSync = (command, args, options) => {
        if (command === 'git') calls[args[0]] = (calls[args[0]] || 0) + 1;
        return original(command, args, options);
      };
      process.on('exit', () => fs.writeFileSync(${JSON.stringify(counts)}, JSON.stringify(calls)));
      process.argv = [process.execPath, ${JSON.stringify(path.join(ROOT, bin))}, 'evidence', 'rollup',
        '--baseline-results-dir', '.idd/evidence/baseline', '--out', ${JSON.stringify(report)}];
      require(${JSON.stringify(path.join(ROOT, bin))});
    `;
    const r = spawnSync(process.execPath, ['-e', program], { cwd: f.root, env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.equal(JSON.parse(fs.readFileSync(report)).summary.covered_records, 2);
    const calls = JSON.parse(fs.readFileSync(counts));
    assert.equal(calls['ls-tree'], INPUTS.length * 2, bin);
    assert.equal(calls.show, INPUTS.length * 2, bin);
  }
});

test('malformed supplied baseline cannot count, including alongside valid records', t => {
  const f = fixture(t); write(f.root, '.idd/evidence/baseline/malformed.json', '{');
  rejected(f, /baseline records unavailable or invalid/);
});

test('fresh failures are never hidden by valid coverage of the same probe', t => {
  const f = fixture(t);
  f.current.push(buildFormalResult(f.root, { ...f.options, runId: 'current', revision: f.revision, name: 'Safe', observed: 'SAT' }));
  const r = roll(f); assert.ok(r.summary.errors > 0); assert.equal(r.rules['K-1'].derived, 'not-verified');
});

test('missing input manifests leave historical executed records valid but ineligible for reuse', t => {
  const f = fixture(t); f.prior.forEach(r => delete r.probe.inputs);
  assert.ok(f.prior.every(r => getValidator('formal-result')(r).valid));
  rejected(f, /tracked inputs/);
});


test('coverage requires transitive verification-map inputs', t => {
  const f = fixture(t, true); assert.equal(roll(f).summary.errors, 0);
  [...f.current, ...f.prior].forEach(r => r.probe.inputs = r.probe.inputs.filter(i => !i.path.includes('/upstream/')));
  rejected(f, /omits required file: specs\/verification\/upstream/);
});
