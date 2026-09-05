'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { getValidator, loadIndex } = require('../tools/lib/schema-loader');
const { validateVerificationFile } = require('../tools/lib/verification');
const { buildFormalResult } = require('../tools/lib/formal-results');

function write(repoRoot, relativePath, content) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, typeof content === 'string' ? content : /\.json$/.test(relativePath) ? `${JSON.stringify(content, null, 2)}\n` : yaml.dump(content, { lineWidth: -1 }));
}

const ALS = `sig Principal {}\nsig Event { principal: one Principal }\n\nfact OneRoot { some Principal }\n\npred ConcurrentExample { some Event }\n\nassert OneGenesisPerPrincipal { all p: Principal | lone e: Event | e.principal = p }\n\ncheck OneGenesisPerPrincipal for 8\nrun ConcurrentExample for 4\n`;
const TLA = `---- MODULE Genesis ----\nVARIABLE admitted\nTypeOK == admitted \\in SUBSET {1,2}\nAtMostOneGenesis == Cardinality(admitted) <= 1\nSpec == TRUE\n====\n`;
const CFG = `SPECIFICATION Spec\nINVARIANT TypeOK\nINVARIANT AtMostOneGenesis\nPROPERTY SelectionIsFrozen\n`;

function fixture(t, ruleExtras = {}, mapExtras = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-formal-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  write(repoRoot, 'specs/modules.yaml', { version: 1, modules: { kernel: { root: 'specs', capabilities: ['specs/capabilities/kernel.capability.yaml'], rule_families: ['I'], depends_on: [] } } });
  write(repoRoot, 'specs/capabilities/kernel.capability.yaml', { id: 'kernel', type: 'capability', scope: { models: ['specs/models/principal.model.yaml'], features: [], contracts: [] } });
  write(repoRoot, 'specs/models/principal.model.yaml', { id: 'principal', type: 'model', entity: 'Principal' });
  write(repoRoot, 'alloy/kernel.als', ALS);
  write(repoRoot, 'alloy/kernel_closed.als', ALS.replace('pred ConcurrentExample', 'pred ClosedOnlyExample'));
  write(repoRoot, 'specs/verification/kernel/tla/Genesis.tla', TLA);
  write(repoRoot, 'specs/verification/kernel/tla/Genesis.cfg', CFG);
  write(repoRoot, 'formal-tools.lock.json', { alloy: { version: '6.2.0', file: 'alloy-6.2.0.jar', url: 'https://example/alloy.jar', sha256: 'a'.repeat(64) } });
  write(repoRoot, 'specs/fixtures/conformance/competing-genesis.json', { _meta: { id: 'competing-genesis', type: 'fixture', kind: 'conformance-vector', rules: ['I-2-principal-genesis-root'] }, events: [], expected: { admitted: [] } });
  write(repoRoot, 'specs/verification/kernel/verification.yaml', {
    id: 'kernel-verification', type: 'verification', capability: 'specs/capabilities/kernel.capability.yaml', status: 'locally-verified', depends_on: [],
    tooling: { alloy: { checker: 'Alloy Analyzer', version: '6.2.0', sources: ['alloy/kernel.als'], lock: 'formal-tools.lock.json' }, tla: { checker: 'TLC', sources: ['specs/verification/kernel/tla/Genesis.tla', 'specs/verification/kernel/tla/Genesis.cfg'] } },
    rules: [{
      id: 'I-2-principal-genesis-root', source_models: ['specs/models/principal.model.yaml'],
      alloy: { assertions: [{ name: 'OneGenesisPerPrincipal', expected: 'UNSAT' }], predicates: [{ name: 'ConcurrentExample', expected: { 'alloy/kernel.als': 'SAT', 'alloy/kernel_closed.als': 'UNSAT' } }], profiles: ['alloy/kernel_closed.als'] },
      tla: { model: 'specs/verification/kernel/tla/Genesis.tla', invariants: ['AtMostOneGenesis'], properties: [{ name: 'SelectionIsFrozen', expected: 'holds' }] },
      conformance_vectors: ['specs/fixtures/conformance/competing-genesis.json'],
      mutation_probes: [{ id: 'invert-genesis-order', mutation: 'invert the genesis tie-break', detected_by: ['specs/fixtures/conformance/competing-genesis.json'] }],
      ...ruleExtras,
    }],
    evidence: { classification: { intent: 'exploratory', verification: 'locally-verified', certification: 'not-certified', production: 'not-ready' } },
    ...mapExtras,
  });
  return repoRoot;
}

function run(repoRoot) {
  return validateVerificationFile({ repoRoot });
}

function mutateMap(repoRoot, fn) {
  const file = path.join(repoRoot, 'specs/verification/kernel/verification.yaml');
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  fn(doc);
  fs.writeFileSync(file, yaml.dump(doc, { lineWidth: -1 }));
}

test('schema registry version is bumped to 1.13.x or later', () => {
  const [maj, min] = loadIndex().version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 13);
});

test('verification-map schema accepts the formal evidence kinds and rejects malformed probes', () => {
  const v = getValidator('verification-map');
  const base = {
    id: 'kernel-verification', type: 'verification', capability: 'specs/capabilities/kernel.capability.yaml', status: 'x',
    rules: [{ id: 'I-1-rule', source_models: [], alloy: { assertions: ['A', { name: 'B', expected: 'UNSAT' }], status: 'deferred' }, tla: { invariants: [{ name: 'Inv', expected: 'violated' }] }, conformance_vectors: 'specs/fixtures/conformance/', crypto_vectors: ['specs/fixtures/crypto/a.json'], mutation_probes: [{ mutation: 'x', detected_by: ['tests/a.test.js'] }] }],
    tooling: { alloy: { sources: ['alloy/a.als'], lock: 'formal-tools.lock.json' } },
    evidence: { classification: { intent: 'exploratory', verification: 'not-verified', certification: 'not-certified', production: 'not-ready' } },
  };
  assert.ok(v(base).valid, JSON.stringify(v(base).errors));
  const badOutcome = structuredClone(base); badOutcome.rules[0].alloy.assertions = [{ name: 'B', expected: 'MAYBE' }];
  assert.equal(v(badOutcome).valid, false);
  const badProbe = structuredClone(base); badProbe.rules[0].mutation_probes = [{ mutation: 'x' }];
  assert.equal(v(badProbe).valid, false, 'mutation probe needs detected_by');
  const badTooling = structuredClone(base); badTooling.tooling.alloy.sources = 'alloy/a.als';
  assert.equal(v(badTooling).valid, false, 'tooling sources is a list');
});

test('grounded formal claims validate clean', (t) => {
  const repoRoot = fixture(t);
  const result = run(repoRoot);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.info.some((m) => /Validated 2 alloy command\(s\), 2 tla name\(s\), 1 vector file\(s\)/.test(m)), result.info.join('\n'));
});

test('an alloy command that no source declares is an error; a pinned profile must be a source', (t) => {
  const repoRoot = fixture(t);
  mutateMap(repoRoot, (doc) => {
    doc.rules[0].alloy.assertions.push('NoSuchAssertion');
    doc.rules[0].alloy.predicates[0].expected = { 'alloy/other.als': 'SAT' };
  });
  const result = run(repoRoot);
  assert.ok(result.errors.some((m) => /alloy assertion NoSuchAssertion is not declared in alloy\/kernel\.als, alloy\/kernel_closed\.als/.test(m)), result.errors.join('\n'));
  assert.ok(result.errors.some((m) => /pins an outcome for alloy\/other\.als, which is not one of its sources/.test(m)));
});

test('a tla name must be defined in the model or listed in a cfg', (t) => {
  const repoRoot = fixture(t);
  mutateMap(repoRoot, (doc) => { doc.rules[0].tla.invariants.push('Phantom'); });
  const result = run(repoRoot);
  assert.ok(result.errors.some((m) => /tla invariant Phantom is not declared in/.test(m)), result.errors.join('\n'));
  // A property only present in the cfg (no definition in the .tla) still resolves.
  assert.ok(!result.errors.some((m) => /SelectionIsFrozen/.test(m)));
});

test('conformance vectors must name the rule back in _meta.rules', (t) => {
  const repoRoot = fixture(t);
  write(repoRoot, 'specs/fixtures/conformance/competing-genesis.json', { _meta: { id: 'competing-genesis', type: 'fixture', rules: ['I-9-other'] }, events: [] });
  write(repoRoot, 'specs/fixtures/conformance/unlabelled.json', { _meta: { id: 'unlabelled', type: 'fixture' }, events: [] });
  mutateMap(repoRoot, (doc) => { doc.rules[0].conformance_vectors = 'specs/fixtures/conformance/'; });
  const result = run(repoRoot);
  assert.ok(result.errors.some((m) => /competing-genesis\.json: _meta\.rules must name I-2-principal-genesis-root/.test(m)), result.errors.join('\n'));
  assert.ok(result.warnings.some((m) => /unlabelled\.json: conformance vector has no _meta\.rules/.test(m)), result.warnings.join('\n'));
});

test('a tooling lock must carry the tool, a sha256, and an agreeing version', (t) => {
  const repoRoot = fixture(t);
  write(repoRoot, 'formal-tools.lock.json', { alloy: { version: '6.1.0', sha256: 'nope' } });
  let result = run(repoRoot);
  assert.ok(result.errors.some((m) => /entry alloy must pin a sha256/.test(m)), result.errors.join('\n'));
  assert.ok(result.errors.some((m) => /tooling\.alloy\.version 6\.2\.0 disagrees with formal-tools\.lock\.json \(6\.1\.0\)/.test(m)));
  write(repoRoot, 'formal-tools.lock.json', { tla2tools: { version: '1.7.4', sha256: 'b'.repeat(64) } });
  result = run(repoRoot);
  assert.ok(result.errors.some((m) => /has no entry for alloy/.test(m)));
});

test('Alloy natural outcomes need no pinning reminder and still adjudicate observations (#100)', (t) => {
  const repoRoot = fixture(t);
  mutateMap(repoRoot, (doc) => {
    doc.rules[0].alloy.assertions = ['OneGenesisPerPrincipal'];
    doc.rules[0].alloy.predicates = ['ConcurrentExample'];
  });
  const result = run(repoRoot);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.doesNotMatch(result.info.join('\n'), /carry no expected outcome|pin SAT\/UNSAT/);
  assert.match(result.info.join('\n'), /Validated 2 alloy command\(s\)/);
  for (const [name, expected] of [['OneGenesisPerPrincipal', 'UNSAT'], ['ConcurrentExample', 'SAT']]) {
    for (const observed of ['SAT', 'UNSAT']) {
      const record = buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name, source: 'alloy/kernel.als', observed });
      assert.equal(record.expected, expected);
      assert.equal(record.verdict, observed === expected ? 'match' : 'mismatch');
    }
  }
});

test('explicit Alloy counterexample and per-profile pins still override natural outcomes', (t) => {
  const repoRoot = fixture(t);
  mutateMap(repoRoot, (doc) => {
    doc.rules[0].alloy.assertions = [{ name: 'OneGenesisPerPrincipal', expected: 'SAT' }];
    doc.rules[0].alloy.predicates = [{ name: 'ConcurrentExample', expected: { 'alloy/kernel.als': 'UNSAT', 'alloy/kernel_closed.als': 'SAT' } }];
  });
  assert.deepEqual(run(repoRoot).errors, []);
  for (const [name, source, expected] of [
    ['OneGenesisPerPrincipal', 'alloy/kernel.als', 'SAT'],
    ['ConcurrentExample', 'alloy/kernel.als', 'UNSAT'],
    ['ConcurrentExample', 'alloy/kernel_closed.als', 'SAT'],
  ]) {
    for (const observed of ['SAT', 'UNSAT']) {
      const record = buildFormalResult(repoRoot, { tool: 'alloy', kind: 'alloy-command', name, source, observed });
      assert.equal(record.expected, expected);
      assert.equal(record.verdict, observed === expected ? 'match' : 'mismatch');
    }
  }
});

test('a mutation probe detected by a missing path is an error', (t) => {
  const repoRoot = fixture(t);
  mutateMap(repoRoot, (doc) => { doc.rules[0].mutation_probes[0].detected_by = ['tests/missing.test.ts']; });
  const result = run(repoRoot);
  assert.ok(result.errors.some((m) => /mutation probe invert-genesis-order is detected by missing path tests\/missing\.test\.ts/.test(m)), result.errors.join('\n'));
});
