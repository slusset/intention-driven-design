'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TRANSFORMATIONS } = require('../tools/lib/transformations');

function consumer(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-transform-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('fixture-meta-kind moves a kind-typed _meta.type into kind and is idempotent', (t) => {
  const original = `{\n    "_meta": {\n        "id": "claude-hook-cases",\n        "type": "application-contract-fixture",\n        "stories": ["specs/stories/a.md"]\n    },\n    "cases": []\n}\n`;
  const root = consumer(t, {
    'specs/fixtures/a/cases.json': original,
    'specs/fixtures/plain.json': JSON.stringify({ _meta: { id: 'p', type: 'fixture' } }, null, 2) + '\n',
    'specs/fixtures/bad.json': '{ not json',
  });
  const first = TRANSFORMATIONS['fixture-meta-kind'].apply(root);
  assert.equal(first.changed, true);
  assert.deepEqual(first.paths, ['specs/fixtures/a/cases.json']);
  const meta = JSON.parse(read(root, 'specs/fixtures/a/cases.json'))._meta;
  assert.deepEqual(Object.keys(meta), ['id', 'type', 'kind', 'stories'], 'kind sits where type was');
  assert.equal(meta.type, 'fixture');
  assert.equal(meta.kind, 'application-contract-fixture');
  assert.match(read(root, 'specs/fixtures/a/cases.json'), /^\{\n {4}"_meta"/, 'original indent is kept');
  assert.equal(read(root, 'specs/fixtures/bad.json'), '{ not json');
  const second = TRANSFORMATIONS['fixture-meta-kind'].apply(root);
  assert.equal(second.changed, false);
});

test('identity-kind inserts the inferred kind and preserves comments and formatting', (t) => {
  const root = consumer(t, {
    'specs/models/ctx.model.yaml': [
      'id: ctx', 'type: model', 'entity: Context', '',
      'identity:', '  # three fields identify together', '  fields: [principalId, resourceId, instrumentDigest]', '  equality: Exact string equality for all three fields.', '',
      'attributes:', '  principalId:', '    type: string', '',
    ].join('\n'),
    'specs/models/manifest.model.yaml': 'id: m\ntype: model\nvalue_object: Manifest\nidentity:\n  authority: none\n  equality: Exact canonical manifest bytes.\n',
    'specs/models/done.model.yaml': 'id: d\ntype: model\nentity: D\nidentity:\n  kind: field\n  field: id\n',
    'specs/models/none.model.yaml': 'id: n\ntype: model\nentity: N\nidentity:\n  notes: nothing to infer\n',
  });
  const result = TRANSFORMATIONS['identity-kind'].apply(root);
  assert.equal(result.changed, true);
  assert.deepEqual(result.paths, ['specs/models/ctx.model.yaml', 'specs/models/manifest.model.yaml']);
  assert.match(read(root, 'specs/models/ctx.model.yaml'), /identity:\n  kind: composite\n  # three fields identify together\n  fields:/);
  assert.match(read(root, 'specs/models/manifest.model.yaml'), /identity:\n  kind: content\n  authority: none/);
  assert.equal(TRANSFORMATIONS['identity-kind'].apply(root).changed, false);
});

test('attribute-required-when rewrites bare conditional strings and leaves booleans alone', (t) => {
  const source = [
    'id: e', 'type: model', 'entity: Event',
    'attributes:',
    '  eventId:', '    type: string', '    required: true',
    '  note:', '    type: string', '    required: false  # optional',
    '  revokedGrantId:', '    type: string', '    required: conditional-revoke',
    '  scope:', '    type: string', '    required: { when: conditional-grant }',
    '',
  ].join('\n');
  const root = consumer(t, { 'specs/models/event.model.yaml': source });
  const result = TRANSFORMATIONS['attribute-required-when'].apply(root);
  assert.equal(result.changed, true);
  const next = read(root, 'specs/models/event.model.yaml');
  assert.match(next, /required: true\n/);
  assert.match(next, /required: false  # optional\n/);
  assert.match(next, /required: \{ when: conditional-revoke \}\n/);
  assert.equal((next.match(/\{ when: conditional-grant \}/g) || []).length, 1);
  assert.equal(TRANSFORMATIONS['attribute-required-when'].apply(root).changed, false);
});
