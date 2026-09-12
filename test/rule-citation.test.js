'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');

const {
  appendFormalResult,
  buildFormalResult,
  citedRuleId,
  citesRule,
  declaredProbes,
  loadVerificationMaps,
} = require('../tools/lib/formal-results');
const { formatRollupMarkdown, rollupEvidence } = require('../tools/lib/evidence-rollup');

function write(repoRoot, relativePath, content) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, typeof content === 'string' ? content : yaml.dump(content, { lineWidth: -1 }));
}

function fixture(t) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-citation-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));

  write(repoRoot, 'specs/modules.yaml', {
    version: 1,
    modules: { kernel: { root: 'specs', capabilities: ['specs/capabilities/kernel.capability.yaml'], rule_families: ['T', 'U', 'S'], depends_on: [] } },
  });
  write(repoRoot, 'specs/capabilities/kernel.capability.yaml', { id: 'kernel', type: 'capability', scope: { models: [], features: [], contracts: [] } });
  write(repoRoot, 'tests/admission.test.js', "test('T-3: rejects malformed envelopes', () => {});\n");
  write(repoRoot, 'tests/other.test.js', "test('T-3: elsewhere', () => {});\n");
  write(repoRoot, 'specs/verification/kernel/verification.yaml', {
    id: 'kernel-verification',
    type: 'verification',
    capability: 'specs/capabilities/kernel.capability.yaml',
    status: 'specified',
    depends_on: [],
    rules: [
      { id: 'T-3-bounded-untrusted-ingestion', kind: 'boundary', source_models: [], cited_tests: ['tests/admission.test.js'] },
      { id: 'U-5-rotation-preserves-principal', kind: 'domain', source_models: [], cited_tests: [] },
      { id: 'S-1-selector-bound', kind: 'validation', source_models: [], evidence: { bindings: [{ files: ['tests/admission.test.js'], selectors: ['an explicit selector'] }] } },
    ],
    evidence: { classification: { intent: 'exploratory', verification: 'not-verified', certification: 'not-certified', production: 'not-ready' } },
  });
  return repoRoot;
}

const observe = (repoRoot, name, observed, extra = {}) => appendFormalResult(
  repoRoot,
  buildFormalResult(repoRoot, { tool: 'junit', kind: 'test-selector', name, observed, runId: 'run-1', environment: 'local', ...extra }),
);

test('a citation matches the full id and the family-and-number prefix, and nothing else', () => {
  const rule = 'T-3-bounded-untrusted-ingestion';

  assert.equal(citesRule('T-3: rejects malformed envelopes', rule), true);
  assert.equal(citesRule('covers T-3-bounded-untrusted-ingestion end to end', rule), true);
  assert.equal(citesRule('T-30: a different rule', rule), false);
  assert.equal(citesRule('XT-3 is not a citation', rule), false);
  assert.equal(citesRule('no citation at all', rule), false);

  assert.equal(citedRuleId('T-3: rejects malformed envelopes'), 'T-3');
  assert.equal(citedRuleId('no citation at all'), null);
});

test('cited_tests declares one claim per rule, however many tests cite it', (t) => {
  const repoRoot = fixture(t);
  const { maps } = loadVerificationMaps(repoRoot);

  const probes = declaredProbes(maps).filter((probe) => probe.kind === 'test-selector');
  assert.deepEqual(probes.map((probe) => `${probe.ruleId}:${probe.name}`), [
    'T-3-bounded-untrusted-ingestion:cites:T-3-bounded-untrusted-ingestion',
    'U-5-rotation-preserves-principal:cites:U-5-rotation-preserves-principal',
    'S-1-selector-bound:an explicit selector',
  ]);
  assert.equal(probes.filter((probe) => probe.citation).length, 2);
});

test('a citing test carries its rule into the record', (t) => {
  const repoRoot = fixture(t);

  const cited = buildFormalResult(repoRoot, { tool: 'junit', kind: 'test-selector', name: 'T-3: rejects malformed envelopes', observed: 'pass' });
  assert.deepEqual(cited.rules, ['T-3-bounded-untrusted-ingestion']);
  assert.equal(cited.expected, 'pass');
  assert.equal(cited.verdict, 'match');

  const neighbour = buildFormalResult(repoRoot, { tool: 'junit', kind: 'test-selector', name: 'T-30: a different rule', observed: 'pass' });
  assert.deepEqual(neighbour.rules, []);
  assert.equal(neighbour.verdict, 'unclaimed');
});

test('a scoped citation ignores a test recorded from another file', (t) => {
  const repoRoot = fixture(t);

  const outside = buildFormalResult(repoRoot, { tool: 'junit', kind: 'test-selector', name: 'T-3: elsewhere', observed: 'pass', source: 'tests/other.test.js' });
  assert.deepEqual(outside.rules, [], 'a scoped citation must not reach outside its declared files');

  const inside = buildFormalResult(repoRoot, { tool: 'junit', kind: 'test-selector', name: 'T-3: rejects malformed envelopes', observed: 'pass', source: 'tests/admission.test.js' });
  assert.deepEqual(inside.rules, ['T-3-bounded-untrusted-ingestion']);

  // An unscoped citation accepts any file.
  const anywhere = buildFormalResult(repoRoot, { tool: 'junit', kind: 'test-selector', name: 'U-5: rotation keeps the principal', observed: 'pass', source: 'tests/other.test.js' });
  assert.deepEqual(anywhere.rules, ['U-5-rotation-preserves-principal']);
});

test('the roll-up counts one claim and reports how many tests cited it', (t) => {
  const repoRoot = fixture(t);
  observe(repoRoot, 'T-3: rejects malformed envelopes', 'pass');
  observe(repoRoot, 'T-3: rejects truncated envelopes', 'pass');
  observe(repoRoot, 'T-3-bounded-untrusted-ingestion holds under load', 'pass');

  const rollup = rollupEvidence(repoRoot);
  const tests = rollup.rules['T-3-bounded-untrusted-ingestion'].coverage.tests;

  assert.equal(tests.declared, 1, 'a citation is one claim, not one per citing test');
  assert.equal(tests.matched, 1);
  assert.equal(tests.cited, 3);
  assert.equal(tests.mismatched, 0);
  assert.match(formatRollupMarkdown(rollup), /·3 cited/);
});

test('a failing cited test contradicts its rule', (t) => {
  const repoRoot = fixture(t);
  observe(repoRoot, 'T-3: rejects malformed envelopes', 'pass');
  observe(repoRoot, 'T-3: rejects truncated envelopes', 'fail');

  const rollup = rollupEvidence(repoRoot);
  const tests = rollup.rules['T-3-bounded-untrusted-ingestion'].coverage.tests;

  assert.equal(tests.mismatched, 1);
  assert.equal(tests.matched, 0);
  const mismatch = rollup.findings.find((item) => item.id === 'formal-result-mismatch');
  assert.ok(mismatch, 'a failing citation must be an error finding');
  assert.equal(mismatch.rule, 'T-3-bounded-untrusted-ingestion');
  assert.match(mismatch.detail, /rejects truncated envelopes/);
});

test('a test citing a rule no map declares is an unowned citation', (t) => {
  const repoRoot = fixture(t);
  observe(repoRoot, 'Z-9: nothing declares this rule', 'pass');
  observe(repoRoot, 'a test with no citation at all', 'pass');

  const rollup = rollupEvidence(repoRoot);
  const unowned = rollup.findings.filter((item) => item.id === 'unowned-citation');
  const orphans = rollup.findings.filter((item) => item.id === 'orphan-result');

  assert.equal(unowned.length, 1);
  assert.match(unowned[0].detail, /cites Z-9, which no verification map declares/);
  assert.equal(unowned[0].severity, 'advisory');
  assert.equal(orphans.length, 1, 'a record with no citation stays a plain orphan');
});
