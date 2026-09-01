'use strict';

/**
 * Regression tests for canonical shapes promoted in schema v1.12.
 *
 * Each addition came from the second AlloyIdentity contact (idd #81–#84 and
 * the unfiled items in slusset/AlloyIdentity#235): closed-world validation
 * rejecting load-bearing IDD patterns rather than consumer inventions.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yaml = require('js-yaml');
const { execFileSync } = require('node:child_process');
const { getValidator, loadIndex } = require('../../tools/lib/schema-loader');
const { categorize: categorizeKind } = require('../../tools/lib/kinds');
const { extractReferences } = require('../../tools/lib/reference-graph');

const REPO_ROOT = path.join(__dirname, '..', '..');
const VALIDATE_MODELS = path.join(REPO_ROOT, 'tools', 'validate-models.js');

function runModels(specsDir) {
  // The validator exits non-zero when it reports errors; the JSON is still on stdout.
  try {
    return JSON.parse(execFileSync(process.execPath, [VALIDATE_MODELS, specsDir, '--json'], { cwd: REPO_ROOT, encoding: 'utf8' }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function tempSpecs(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-v1-12-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, doc] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof doc === 'string' ? doc : yaml.dump(doc));
  }
  return root;
}

function allMessages(result, bucket) {
  return result[bucket] || [];
}

test('schema registry version is bumped to 1.12.x or later', () => {
  const [maj, min] = loadIndex().version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 12, `expected minor >= 12, got ${loadIndex().version}`);
});

// ── #84 lifecycle over a value object ────────────────────────────────

test('lifecycle: accepts value_object as its subject', () => {
  const v = getValidator('lifecycle');
  const doc = {
    id: 'artifact-materialization-lifecycle', type: 'model', value_object: 'ArtifactMaterialization',
    initial_state: 'unmaterialized', shape: 'unbounded',
    states: { unmaterialized: {}, materialized: {} },
  };
  assert.ok(v(doc).valid, JSON.stringify(v(doc).errors));
  assert.ok(v({ ...doc, value_object: undefined, entity: 'Artifact' }).valid);
  assert.equal(v({ ...doc, entity: 'Artifact' }).valid, false, 'entity and value_object together must be rejected');
  const { value_object, ...neither } = doc;
  assert.equal(v(neither).valid, false, 'a lifecycle must name a subject');
});

test('lifecycle subject: model and lifecycle must agree on kind and name', (t) => {
  const specs = tempSpecs(t, {
    'specs/models/thing.model.yaml': { id: 'thing', type: 'model', value_object: 'Thing', lifecycle: 'specs/models/thing.lifecycle.yaml', sources: { stories: ['specs/stories/x.md'] } },
    'specs/models/thing.lifecycle.yaml': { id: 'thing-lifecycle', type: 'model', entity: 'Thing', initial_state: 'a', shape: 'unbounded', states: { a: {} } },
    'specs/models/other.model.yaml': { id: 'other', type: 'model', entity: 'Other', identity: { field: 'id', type: 'string' }, lifecycle: 'specs/models/other.lifecycle.yaml', sources: { stories: ['specs/stories/x.md'] } },
    'specs/models/other.lifecycle.yaml': { id: 'other-lifecycle', type: 'model', entity: 'Different', initial_state: 'a', shape: 'unbounded', states: { a: {} } },
  });
  const result = runModels(path.join(specs, 'specs'));
  const errors = allMessages(result, 'errors');
  assert.ok(errors.some((m) => /subject kind mismatch/.test(m)), errors.join('\n'));
  assert.ok(errors.some((m) => /subject mismatch: model entity "Other"/.test(m)), errors.join('\n'));
});

// ── #83 identity kinds ───────────────────────────────────────────────

test('model: identity accepts field, composite, and content kinds', () => {
  const v = getValidator('model');
  const base = { id: 'x', type: 'model', entity: 'X' };
  assert.ok(v({ ...base, identity: { kind: 'field', field: 'id', type: 'string' } }).valid);
  assert.ok(v({ ...base, identity: { fields: ['principalId', 'resourceId', 'instrumentDigest'], equality: 'exact string equality for all three fields' } }).valid);
  assert.ok(v({ ...base, identity: { kind: 'content', equality: 'canonical-bytes', immutable: true } }).valid);
  assert.equal(v({ ...base, identity: { notes: 'nothing identifying' } }).valid, false);
  assert.equal(v({ ...base, identity: { kind: 'composite', field: 'id' } }).valid, false, 'kind:composite needs fields');
  assert.equal(v({ ...base, identity: { kind: 'content', field: 'id' } }).valid, false, 'kind:content needs equality');
});

test('validator: infers identity kind and reports it as info', (t) => {
  const specs = tempSpecs(t, {
    'specs/models/ctx.model.yaml': { id: 'ctx', type: 'model', entity: 'Context', identity: { fields: ['a', 'b'], equality: 'exact' }, sources: { stories: ['specs/stories/x.md'] } },
    'specs/models/bad.model.yaml': { id: 'bad', type: 'model', entity: 'Bad', identity: { kind: 'composite', fields: ['only'] }, sources: { stories: ['specs/stories/x.md'] } },
  });
  const result = runModels(path.join(specs, 'specs'));
  assert.ok(allMessages(result, 'info').some((m) => /inferred as composite/.test(m)));
  assert.ok(allMessages(result, 'warnings').some((m) => /single field/.test(m)));
  assert.equal(allMessages(result, 'errors').length, 0, allMessages(result, 'errors').join('\n'));
});

// ── #82 conditional required ─────────────────────────────────────────

test('model: attribute.required accepts boolean, { when }, legacy string, and required_when', () => {
  const v = getValidator('model');
  const model = (required, extra = {}) => ({ id: 'e', type: 'model', entity: 'Event', attributes: { revokedGrantId: { type: 'string', required, ...extra } } });
  assert.ok(v(model(true)).valid);
  assert.ok(v(model('conditional-journal-append')).valid);
  assert.ok(v(model({ when: 'conditional-journal-append' })).valid);
  assert.ok(v(model({ when: { state: ['materialized', 'integrity-failed'] } })).valid);
  assert.ok(v(model({ when: { variant: 'revoke' } })).valid);
  assert.ok(v(model({ when: { rule: 'A-5-causal-revocation' } })).valid);
  assert.ok(v(model(undefined, { required_when: ['materialized'] })).valid);
  assert.equal(v(model({ condition: 'x' })).valid, false, 'object form must carry when');
  assert.equal(v(model({ when: { state: [] } })).valid, false);
});

test('validator: bare-string required is reported as a legacy spelling', (t) => {
  const specs = tempSpecs(t, {
    'specs/models/event.model.yaml': { id: 'event', type: 'model', entity: 'Event', identity: { field: 'id', type: 'string' }, attributes: { scope: { type: 'string', required: 'conditional-grant' } }, sources: { stories: ['specs/stories/x.md'] } },
  });
  const result = runModels(path.join(specs, 'specs'));
  assert.ok(allMessages(result, 'warnings').some((m) => /legacy conditional spelling/.test(m)));
  assert.equal(allMessages(result, 'errors').length, 0);
});

// ── attribute without type; rules as strings; model contract/lifecycle keys ──

test('model: attribute type may be implied by values, const, source, or ref', () => {
  const v = getValidator('model');
  const doc = {
    id: 'e', type: 'model', entity: 'Event',
    attributes: {
      kind: { values: ['grant', 'revoke'] },
      version: { const: 1 },
      digest: { source: 'sha-256 of canonical bytes' },
      email: { ref: 'specs/models/shared/email-address.model.yaml' },
    },
  };
  assert.ok(v(doc).valid, JSON.stringify(v(doc).errors));
  assert.equal(v({ ...doc, attributes: { bare: { description: 'nothing' } } }).valid, false);
});

test('model: rules accept narrative strings beside id-carrying objects; contract and lifecycle keys are canonical', () => {
  const v = getValidator('model');
  const doc = {
    id: 'stmt', type: 'model', value_object: 'ContextStatement',
    lifecycle: 'specs/models/context.lifecycle.yaml',
    contract: 'specs/contracts/context-statement.schema.json',
    contracts: { instrument: 'specs/contracts/context-instrument.schema.json' },
    rules: ['Statements carry no signer.', { id: 'P-1-context-instrument-required', description: 'An instrument is required.' }],
  };
  assert.ok(v(doc).valid, JSON.stringify(v(doc).errors));
});

// ── #81 fixture _meta ─────────────────────────────────────────────────

test('fixture: _meta accepts kind, plural stories/contracts, rules, sentinels, and author keys', () => {
  const v = getValidator('fixture');
  const doc = {
    _meta: {
      id: 'claude-hook-cases', type: 'fixture', kind: 'application-contract-fixture',
      harness: 'claude-code 2.1.185',
      stories: ['specs/stories/a.md', 'specs/stories/b.md'],
      feature: 'specs/features/x.feature',
      contracts: ['specs/contracts/lifecycle-delivery.schema.json'],
      rules: ['U-1-normalize-lifecycle'],
      statement: 'Sentinels ride in every field the adapter must discard.',
      sentinels: ['FIXTURE-TRANSCRIPT-PATH'],
      adapter: 'claude',
    },
  };
  assert.ok(v(doc).valid, JSON.stringify(v(doc).errors));
  assert.ok(v({ _meta: { ...doc._meta, sentinels: { outerId: '0000' } } }).valid);
  assert.equal(v({ _meta: { ...doc._meta, type: 'application-contract-fixture' } }).valid, false, 'type stays the constant fixture; the taxonomy goes in kind');
  assert.equal(v({ _meta: { ...doc._meta, kind: 'Not Kebab' } }).valid, false);
});

test('reference graph: fixture stories, contracts, and journey are traced', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-fixture-refs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'cases.json');
  fs.writeFileSync(file, JSON.stringify({ _meta: { id: 'c', type: 'fixture', stories: ['specs/stories/a.md'], contracts: ['specs/contracts/x.schema.json'], journey: 'specs/journeys/j.md' } }));
  const refs = extractReferences(file);
  for (const expected of ['specs/stories/a.md', 'specs/contracts/x.schema.json', 'specs/journeys/j.md']) {
    assert.ok(refs.has(expected), `missing ${expected} in ${[...refs].join(', ')}`);
  }
});

// ── journey-map protocol vocabulary ───────────────────────────────────

test('journey-map: cli / install / mcp / harness actions and lifecycle / authority / content / package assertions', () => {
  const v = getValidator('journey-map');
  const doc = {
    id: 'install-and-recover', type: 'journey-map', journey: 'specs/journeys/install.md',
    steps: [
      { id: 'install', actions: [{ type: 'npm-global-install', scope: 'isolated-temporary-prefix' }, { kind: 'cli', verb: 'run', command: 'alloy-journal verify' }, { type: 'installed-mcp', tool: 'orient' }],
        assertions: [{ type: 'principal-continuity' }, { kind: 'lifecycle', property: 'state', target: 'context', expected: 'active' }, { type: 'package-removal' }] },
    ],
  };
  assert.ok(v(doc).valid, JSON.stringify(v(doc).errors));
  assert.deepEqual(categorizeKind('action', { type: 'installed-cli' }).expansion, { kind: 'cli', verb: 'run' });
  assert.equal(categorizeKind('action', { kind: 'mcp' }).status, 'kinded');
  assert.deepEqual(categorizeKind('assertion', { type: 'principal-continuity' }).expansion, { kind: 'authority', property: 'continuity', target: 'principal' });
  assert.equal(categorizeKind('assertion', { kind: 'authority' }).status, 'kinded');
});
