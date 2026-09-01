'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');
const { getValidator } = require('../tools/lib/schema-loader');
const { appendFormalResult, buildFormalResult, declaredProbes, loadVerificationMaps, readFormalResults } = require('../tools/lib/formal-results');
const { formatRollupMarkdown, rollupEvidence } = require('../tools/lib/evidence-rollup');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');

function write(repoRoot, relativePath, content) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, typeof content === 'string' ? content : /\.json$/.test(relativePath) ? `${JSON.stringify(content, null, 2)}\n` : yaml.dump(content, { lineWidth: -1 }));
}

const ALS = 'sig E {}\npred Witness { some E }\nassert Safe { no E - E }\nassert Lonely { some E }\nrun Witness for 3\ncheck Safe for 3\ncheck Lonely for 3\n';

function fixture(t, options = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-rollup-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  write(repoRoot, 'specs/modules.yaml', { version: 1, modules: { kernel: { root: 'specs', capabilities: ['specs/capabilities/kernel.capability.yaml'], rule_families: ['K'], depends_on: [] } } });
  write(repoRoot, 'specs/capabilities/kernel.capability.yaml', { id: 'kernel', type: 'capability', scope: { models: [], features: [], contracts: [] } });
  write(repoRoot, 'alloy/kernel.als', ALS);
  write(repoRoot, 'formal-tools.lock.json', { alloy: { version: '6.2.0', sha256: 'c'.repeat(64) } });
  write(repoRoot, 'specs/fixtures/conformance/v1.json', { _meta: { id: 'v1', type: 'fixture', rules: ['K-1-safe'] }, expected: {} });
  write(repoRoot, 'tests/kernel.test.js', "test('rejects-unsafe', () => {});\n");
  write(repoRoot, 'specs/verification/kernel/verification.yaml', {
    id: 'kernel-verification', type: 'verification', capability: 'specs/capabilities/kernel.capability.yaml', status: 'x', depends_on: [],
    tooling: { alloy: { version: '6.2.0', sources: ['alloy/kernel.als'], lock: 'formal-tools.lock.json' } },
    rules: [
      { id: 'K-1-safe', source_models: [], alloy: { assertions: [{ name: 'Safe', expected: 'UNSAT' }], predicates: [{ name: 'Witness', expected: 'SAT' }] }, conformance_vectors: ['specs/fixtures/conformance/v1.json'], evidence: { bindings: [{ files: ['tests/kernel.test.js'], selectors: ['rejects-unsafe'] }] } },
      { id: 'K-2-lonely', source_models: [], alloy: { assertions: ['Lonely'] } },
      { id: 'K-3-prose', source_models: [], formal: { status: 'deferred' } },
    ],
    evidence: { classification: { intent: 'exploratory', verification: options.declared || 'locally-verified', certification: 'not-certified', production: 'not-ready' } },
  });
  return repoRoot;
}

const observe = (repoRoot, kind, name, observed, extra = {}) => appendFormalResult(repoRoot, buildFormalResult(repoRoot, { tool: 'alloy', lock: 'formal-tools.lock.json', kind, name, observed, source: 'alloy/kernel.als', runId: 'run-1', environment: 'local', ...extra }));

test('declared probes flatten every claim a map makes', (t) => {
  const repoRoot = fixture(t);
  const { maps } = loadVerificationMaps(repoRoot);
  const probes = declaredProbes(maps);
  assert.deepEqual(probes.map((p) => `${p.ruleId}:${p.kind}:${p.name}`), [
    'K-1-safe:alloy-command:Safe', 'K-1-safe:alloy-command:Witness', 'K-1-safe:conformance-vector:specs/fixtures/conformance/v1.json', 'K-1-safe:test-selector:rejects-unsafe', 'K-2-lonely:alloy-command:Lonely',
  ]);
});

test('a record resolves its expectation and rules from the map, digests its inputs, and validates', (t) => {
  const repoRoot = fixture(t);
  const record = buildFormalResult(repoRoot, { tool: 'alloy', lock: 'formal-tools.lock.json', kind: 'alloy-command', name: 'Safe', source: 'alloy/kernel.als', observed: 'UNSAT', scope: 'for 3', runId: 'run-1', environment: 'local' });
  assert.equal(record.expected, 'UNSAT');
  assert.equal(record.verdict, 'match');
  assert.deepEqual(record.rules, ['K-1-safe']);
  assert.equal(record.tool.version, '6.2.0');
  assert.equal(record.tool.digest, `sha256:${'c'.repeat(64)}`);
  assert.match(record.probe.source_digest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(getValidator('formal-result')(record).valid, JSON.stringify(getValidator('formal-result')(record).errors));
  // An assertion with no pin expects UNSAT by Alloy's own semantics; a predicate expects SAT.
  const defaulted = buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name: 'Lonely', source: 'alloy/kernel.als', observed: 'UNSAT' });
  assert.equal(defaulted.expected, 'UNSAT');
  assert.equal(defaulted.verdict, 'match');
  const counterexample = buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name: 'Lonely', source: 'alloy/kernel.als', observed: 'SAT' });
  assert.equal(counterexample.verdict, 'mismatch');
  const unclaimed = buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name: 'Nobody', observed: 'SAT' });
  assert.equal(unclaimed.verdict, 'unclaimed');
  const vector = buildFormalResult(repoRoot, { tool: 'node', kind: 'conformance-vector', name: 'v1', source: 'specs/fixtures/conformance/v1.json', observed: 'pass' });
  assert.equal(vector.expected, 'pass');
  assert.deepEqual(vector.rules, ['K-1-safe']);
  assert.throws(() => buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name: 'Safe', observed: 'pass' }), /observed must be one of SAT, UNSAT/);
});

test('records append as JSONL per run and read back with json files', (t) => {
  const repoRoot = fixture(t);
  const file = observe(repoRoot, 'alloy-command', 'Safe', 'UNSAT');
  observe(repoRoot, 'alloy-command', 'Witness', 'SAT');
  assert.equal(file, '.idd/evidence/results/run-1.jsonl');
  write(repoRoot, '.idd/evidence/results/extra.json', [buildFormalResult(repoRoot, { tool: 'node', kind: 'test-selector', name: 'rejects-unsafe', observed: 'pass', runId: 'run-1', environment: 'local' })]);
  write(repoRoot, '.idd/evidence/results/broken.json', '{ nope');
  const { records, problems } = readFormalResults(repoRoot);
  assert.equal(records.length, 3);
  assert.equal(problems.length, 1);
});

test('roll-up derives coverage, witnesses, and claims; declared above derived is an error', (t) => {
  const repoRoot = fixture(t, { declared: 'verified' });
  observe(repoRoot, 'alloy-command', 'Safe', 'UNSAT');
  observe(repoRoot, 'alloy-command', 'Witness', 'SAT');
  observe(repoRoot, 'alloy-command', 'Lonely', 'UNSAT');
  const rollup = rollupEvidence(repoRoot);
  assert.ok(getValidator('evidence-rollup')(rollup).valid, JSON.stringify(getValidator('evidence-rollup')(rollup).errors));
  const k1 = rollup.rules['K-1-safe'];
  assert.deepEqual(k1.coverage.alloy, { declared: 2, matched: 2, mismatched: 0, unpinned: 0, unobserved: [] });
  assert.deepEqual(k1.coverage.vectors.unobserved, ['specs/fixtures/conformance/v1.json']);
  assert.equal(k1.witness.witnessed, 1);
  assert.equal(k1.derived, 'locally-verified', k1.reasons.join('; '));
  const k2 = rollup.rules['K-2-lonely'];
  assert.equal(k2.coverage.alloy.matched, 1, 'an unpinned assertion observed UNSAT matches the Alloy default');
  assert.deepEqual(k2.witness.witnessless, [], 'a SAT predicate elsewhere in the map on the same source witnesses it');
  assert.equal(k2.derived, 'locally-verified');
  assert.equal(rollup.rules['K-3-prose'].derived, 'not-verified');
  const capability = rollup.capabilities['specs/capabilities/kernel.capability.yaml'];
  assert.equal(capability.derived.verification, 'not-verified');
  assert.equal(capability.status, 'overstated');
  assert.ok(rollup.findings.some((f) => f.id === 'declared-above-derived' && f.severity === 'error'));
  assert.ok(rollup.findings.some((f) => f.id === 'probe-unobserved' && /K-1-safe vectors/.test(f.subject)));
  assert.ok(!rollup.findings.some((f) => f.id === 'unpinned-probe'), 'alloy defaults leave nothing unpinned');
  assert.equal(rollup.summary.status, 'fail');
  const md = formatRollupMarkdown(rollup);
  assert.match(md, /\| specs\/capabilities\/kernel\.capability\.yaml \| 3 \(2\) \| verified \| not-verified \| overstated \|/);
  assert.match(md, /\| K-1-safe \| 2\/2 \| — \| 0\/1 \| 0\/1 \| — \| 1\/1 \| locally-verified \|/);
});

test('a mismatch is recomputed against the map pin, and a missing witness is flagged', (t) => {
  const repoRoot = fixture(t, { declared: 'not-verified' });
  // The record claims a match, but the map expects UNSAT: the roll-up trusts the map.
  const forged = buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name: 'Safe', source: 'alloy/kernel.als', observed: 'SAT', expected: 'SAT', runId: 'run-1', environment: 'local' });
  assert.equal(forged.verdict, 'match');
  appendFormalResult(repoRoot, forged);
  // Remove the witness predicate from the map: Safe has nothing exercising its scenario.
  const mapFile = path.join(repoRoot, 'specs/verification/kernel/verification.yaml');
  const doc = yaml.load(fs.readFileSync(mapFile, 'utf8'));
  delete doc.rules[0].alloy.predicates;
  fs.writeFileSync(mapFile, yaml.dump(doc, { lineWidth: -1 }));
  const rollup = rollupEvidence(repoRoot);
  assert.ok(rollup.findings.some((f) => f.id === 'formal-result-mismatch' && /observed SAT, map expects UNSAT/.test(f.detail)), JSON.stringify(rollup.findings));
  assert.equal(rollup.rules['K-1-safe'].coverage.alloy.mismatched, 1);
  assert.ok(rollup.findings.some((f) => f.id === 'witnessless-assertion' && /K-1-safe alloy Safe/.test(f.subject)));
  assert.equal(rollup.capabilities['specs/capabilities/kernel.capability.yaml'].status, 'consistent');
});

test('a ci run with one revision derives verified; orphan and invalid records are findings', (t) => {
  const repoRoot = fixture(t, { declared: 'not-verified' });
  const ci = { runId: 'ci-9', revision: 'abc123', environment: 'ci' };
  observe(repoRoot, 'alloy-command', 'Safe', 'UNSAT', ci);
  observe(repoRoot, 'alloy-command', 'Witness', 'SAT', ci);
  appendFormalResult(repoRoot, buildFormalResult(repoRoot, { tool: 'tlc', kind: 'tla-invariant', name: 'Phantom', observed: 'holds', ...ci }));
  write(repoRoot, '.idd/evidence/results/bad.json', { record_version: 1, kind: 'formal-result' });
  const rollup = rollupEvidence(repoRoot);
  assert.equal(rollup.rules['K-1-safe'].derived, 'verified');
  // The capability is the minimum over its rules: K-2 and K-3 stay not-verified, matching the declared claim.
  const capability = rollup.capabilities['specs/capabilities/kernel.capability.yaml'];
  assert.equal(capability.derived.verification, 'not-verified');
  assert.equal(capability.status, 'consistent');
  assert.equal(rollup.orphan_results.length, 1);
  assert.ok(rollup.findings.some((f) => f.id === 'orphan-result'));
  assert.ok(rollup.findings.some((f) => f.id === 'invalid-result-record'));
});

test('idd evidence record and rollup run end to end from the CLI', (t) => {
  const repoRoot = fixture(t, { declared: 'not-verified' });
  const run = (args, ok = true) => {
    try {
      return execFileSync(process.execPath, [IDD_BIN, 'evidence', ...args], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      if (ok) throw error;
      return error.stdout;
    }
  };
  const out = run(['record', '--tool', 'alloy', '--kind', 'alloy-command', '--name', 'Safe', '--source', 'alloy/kernel.als', '--observed', 'UNSAT', '--lock', 'formal-tools.lock.json', '--run-id', 'cli', '--environment', 'local']);
  assert.match(out, /^match: alloy-command Safe \(alloy\/kernel\.als\) observed UNSAT, expected UNSAT → \.idd\/evidence\/results\/cli\.jsonl/);
  const bad = run(['record', '--tool', 'alloy', '--kind', 'alloy-command', '--name', 'Witness', '--source', 'alloy/kernel.als', '--observed', 'UNSAT', '--run-id', 'cli', '--environment', 'local'], false);
  assert.match(bad, /^mismatch: /);
  const json = JSON.parse(run(['rollup', '--json', '--out', '.idd/evidence/rollup.json', '--markdown', '.idd/evidence/rollup.md'], false));
  assert.equal(json.summary.errors, 1);
  assert.ok(fs.existsSync(path.join(repoRoot, '.idd/evidence/rollup.json')));
  assert.match(fs.readFileSync(path.join(repoRoot, '.idd/evidence/rollup.md'), 'utf8'), /^# Evidence roll-up/);
});
