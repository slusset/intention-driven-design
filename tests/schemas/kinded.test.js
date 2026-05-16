'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  categorize,
  RELATIONSHIP_COMBINATIONS,
  ACTION_COMBINATIONS,
  ASSERTION_COMBINATIONS,
} = require('../../tools/lib/kinds');
const { getValidator, loadIndex } = require('../../tools/lib/schema-loader');

test('schema registry version is bumped to 1.2.x or later', () => {
  const index = loadIndex();
  const [maj, min] = index.version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 2, `expected minor >= 2 for the kinded-grammar bump, got ${index.version}`);
});

test('every legacy relationship name has a named-combination expansion', () => {
  for (const name of ['belongs-to', 'has-one', 'has-many', 'many-to-many']) {
    const r = categorize('relationship', { type: name, entity: 'X' });
    assert.equal(r.status, 'expanded', `${name} should resolve to expanded`);
    assert.ok(r.expansion.kind, `${name} expansion missing kind`);
    assert.ok(r.expansion.cardinality, `${name} expansion missing cardinality`);
  }
});

test('every legacy action verb has a named-combination expansion', () => {
  for (const name of Object.keys(ACTION_COMBINATIONS)) {
    const r = categorize('action', { type: name });
    assert.equal(r.status, 'expanded', `${name} should resolve to expanded`);
    assert.ok(r.expansion.kind, `${name} expansion missing kind`);
  }
});

test('every legacy assertion name has a named-combination expansion', () => {
  for (const name of Object.keys(ASSERTION_COMBINATIONS)) {
    const r = categorize('assertion', { type: name });
    assert.equal(r.status, 'expanded', `${name} should resolve to expanded`);
    assert.ok(r.expansion.kind, `${name} expansion missing kind`);
  }
});

test('expanded relationship form (pointer + pinned) is accepted without a legacy type', () => {
  const rel = {
    entity: 'TruthFileRevision',
    kind: 'pointer',
    temporality: 'pinned',
    cardinality: 'many-to-one',
  };
  const r = categorize('relationship', rel);
  assert.equal(r.status, 'kinded');
  assert.equal(r.kind, 'pointer');
});

test('schema accepts the expanded relationship form', () => {
  const model = {
    id: 'scan',
    type: 'model',
    entity: 'Scan',
    relationships: {
      pinnedRevision: {
        entity: 'TruthFileRevision',
        kind: 'pointer',
        temporality: 'pinned',
        cardinality: 'many-to-one',
      },
    },
  };
  const result = getValidator('model')(model);
  assert.ok(result.valid, `expected valid, errors: ${JSON.stringify(result.errors)}`);
});

test('schema accepts the expanded assertion form (cookie kind)', () => {
  const map = {
    id: 'auth',
    type: 'journey-map',
    journey: 'auth',
    steps: [
      {
        id: 'sign-in',
        assertions: [
          { kind: 'cookie', property: 'set', target: 'session-cookie' },
        ],
      },
    ],
  };
  const result = getValidator('journey-map')(map);
  assert.ok(result.valid, `expected valid, errors: ${JSON.stringify(result.errors)}`);
});

test('schema accepts the expanded assertion form (classification kind)', () => {
  const map = {
    id: 'auth',
    type: 'journey-map',
    journey: 'auth',
    steps: [
      {
        id: 'classify-principal',
        assertions: [
          { kind: 'classification', target: 'principal-classification', expected: 'returning' },
        ],
      },
    ],
  };
  const result = getValidator('journey-map')(map);
  assert.ok(result.valid, `expected valid, errors: ${JSON.stringify(result.errors)}`);
});

test('relationship requires either type or kind', () => {
  const result = getValidator('model')({
    id: 'x', type: 'model', entity: 'X',
    relationships: { y: { entity: 'Y' } },
  });
  assert.ok(!result.valid, 'expected invalid when relationship has neither type nor kind');
});

test('action requires either type or kind', () => {
  const result = getValidator('journey-map')({
    id: 'x', type: 'journey-map', journey: 'x',
    steps: [{ id: 'a', actions: [{ target: '#btn' }] }],
  });
  assert.ok(!result.valid, 'expected invalid when action has neither type nor kind');
});

test('mixed form (legacy type + expanded fields that conflict) surfaces conflicts', () => {
  const rel = {
    entity: 'Y',
    type: 'belongs-to',
    kind: 'composition', // conflicts with belongs-to → association
  };
  const r = categorize('relationship', rel);
  assert.equal(r.status, 'mixed');
  assert.ok(r.conflicts.length > 0);
  assert.ok(r.conflicts.some((c) => c.includes('kind')), `expected kind conflict, got ${JSON.stringify(r.conflicts)}`);
});

test('unknown relationship type with no kind returns status: unknown with legacyType set', () => {
  const r = categorize('relationship', { type: 'references', entity: 'X' });
  assert.equal(r.status, 'unknown');
  assert.equal(r.legacyType, 'references');
});

test('relationship named-combinations cover the load-bearing four', () => {
  assert.deepEqual(Object.keys(RELATIONSHIP_COMBINATIONS).sort(), [
    'belongs-to', 'has-many', 'has-one', 'many-to-many',
  ]);
});
