'use strict';

/**
 * Regression tests for canonical keys promoted in schema v1.6 / toolkit v1.1.0.
 *
 * Each addition came from contact with the edyoucate-ai repo where closed-world
 * validation surfaced a load-bearing pattern not enumerated in v1.0. These
 * tests pin the schema's acceptance so the keys can't silently regress.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getValidator, loadIndex } = require('../../tools/lib/schema-loader');
const { categorize: categorizeKind } = require('../../tools/lib/kinds');

test('schema registry version is bumped to 1.6.x or later', () => {
  const index = loadIndex();
  const [maj, min] = index.version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 6, `expected minor >= 6, got ${index.version}`);
});

test('model: constraints accepts object form (minLength/maxLength) in addition to array', () => {
  const v = getValidator('model');
  const r = v({
    id: 'business-account', type: 'model', entity: 'BusinessAccount',
    attributes: {
      legalName: {
        type: 'string',
        constraints: { minLength: 2, maxLength: 200 },
      },
    },
  });
  assert.ok(r.valid, `expected valid, got: ${JSON.stringify(r.errors)}`);
});

test('model: identity carries format/prefix/example for prefixed-ulid IDs', () => {
  const v = getValidator('model');
  const r = v({
    id: 'customer', type: 'model', entity: 'Customer',
    identity: {
      field: 'customerId',
      type: 'string',
      format: 'prefixed-ulid',
      prefix: 'cust_',
      example: 'cust_01HZZ5M2Q3R4S5T6U7V8W9X0Y',
    },
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('model: attribute accepts immutable, default, ref, format, example, sensitive, itemType', () => {
  const v = getValidator('model');
  const r = v({
    id: 'customer', type: 'model', entity: 'Customer',
    attributes: {
      createdAt: { type: 'datetime', immutable: true },
      emailConfirmationPending: { type: 'boolean', default: true },
      email: { type: 'string', ref: 'specs/models/shared/email-address.model.yaml', format: 'email' },
      apiToken: { type: 'string', sensitive: true, example: 'tok_…' },
      providersImpacted: { type: 'array', itemType: 'string' },
    },
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('model: attribute accepts prefix for ID-like attributes', () => {
  const v = getValidator('model');
  const r = v({
    id: 'truth-file', type: 'model', entity: 'TruthFile',
    attributes: {
      currentRevisionId: { type: 'string', format: 'prefixed-ulid', prefix: 'trev_' },
    },
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('model: versioning, invariants, retires are accepted at the document root', () => {
  const v = getValidator('model');
  const r = v({
    id: 'entitlement', type: 'model', entity: 'Entitlement',
    versioning: 'append-only-revisions',
    invariants: ['No retroactive changes to confirmed revisions.'],
    retires: ['specs/archive/token-ledger.model.yaml'],
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('model: primitive value-object form (value_type + format + constraints + example) is accepted', () => {
  const v = getValidator('model');
  const r = v({
    id: 'email-address', type: 'model',
    value_object: 'EmailAddress',
    value_type: 'string',
    format: 'email',
    constraints: { maxLength: 254 },
    example: 'user@example.com',
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('model: complex value-object form (value_type:object + required + properties + validation + equality) is accepted', () => {
  const v = getValidator('model');
  const r = v({
    id: 'money', type: 'model',
    value_object: 'Money',
    value_type: 'object',
    required: ['amount', 'currency'],
    properties: {
      amount: { type: 'number', description: 'Decimal amount', example: 199 },
      currency: { type: 'string', example: 'USD' },
    },
    validation: ['Amount must be >= 0'],
    equality: 'Currency and amount must match',
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('lifecycle: sources accepts reference and issues; root accepts invariants; transitions accept guards/effects/api', () => {
  const v = getValidator('lifecycle');
  const r = v({
    id: 'customer-lifecycle', type: 'model', entity: 'Customer',
    sources: {
      stories: ['specs/stories/x.md'],
      reference: 'specs/journeys/sign-up.journey.md',
      issues: ['#123'],
    },
    invariants: ['emailConfirmedAt is monotonic.'],
    initial_state: 'pending_confirmation',
    states: { pending_confirmation: {}, confirmed: { terminal: false } },
    transitions: {
      confirm_via_magic_link_exchange: {
        from: 'pending_confirmation', to: 'confirmed',
        trigger: 'system',
        guards: ['link is bound to current email'],
        effects: ['emit Customer.Confirmed event'],
        api: { protocol: 'openapi', operation: 'exchangeMagicLink' },
      },
    },
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('capability: retires is accepted at both the root and under scope', () => {
  const v = getValidator('capability');
  const r = v({
    id: 'billing-entitlements', type: 'capability',
    retires: ['specs/archive/token-ledger.model.yaml'],
    scope: {
      stories: ['specs/stories/x.md'],
      retires: ['specs/archive/another.model.yaml'],
    },
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('journey-map: root description/preconditions/state_diagram/landing_decision_table accepted', () => {
  const v = getValidator('journey-map');
  const r = v({
    id: 'customer-sign-in', type: 'journey-map', journey: 'customer-sign-in',
    description: 'Magic-link redemption flow with link and code branches.',
    preconditions: ['Customer exists in pending_confirmation state'],
    state_diagram: 'see docs/state-diagrams/sign-in.mmd',
    landing_decision_table: { 'cookie present': 'fast-path', 'no cookie': 'full-redeem' },
    shape: 'branching',
    steps: { open: { journey_step: 1, title: 'Open link', branch: 'link' } },
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('journey-map: action/assertion are open-keyed so per-kind property vocabulary is author-extensible', () => {
  const v = getValidator('journey-map');
  const r = v({
    id: 'x', type: 'journey-map', journey: 'x',
    steps: [{
      id: 's',
      actions: [{ type: 'navigate', url: '/foo', variant: 'mobile' }],
      assertions: [{ type: 'api', endpoint: '/foo', expected_status: 200, equals: { ok: true }, fields: ['ok'] }],
    }],
  });
  assert.ok(r.valid, JSON.stringify(r.errors));
});

test('kinds: cookie/classification/tag/context legacy shorthands expand to their named combinations', () => {
  for (const name of ['cookie-set', 'cookie-present', 'cookie-max-age',
                       'principal-classification', 'lead-tag-present', 'intake-prefill-available']) {
    const r = categorizeKind('assertion', { type: name });
    assert.equal(r.status, 'expanded', `${name} should expand`);
    assert.ok(r.expansion.kind, `${name} expansion missing kind`);
  }
});
