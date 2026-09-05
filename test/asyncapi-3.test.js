'use strict';

// SCHEMA.md: AsyncAPI operation discovery; regression for #103.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { extractContractOperations } = require('../tools/lib/contracts');
const { validateEvidenceBindings } = require('../tools/lib/evidence-bindings');

const ROOT = path.resolve(__dirname, '..');
const CONTRACT = 'specs/contracts/asyncapi/events.yaml';
const STORY = 'specs/stories/operation.md';
const MESSAGE_STORY = 'specs/stories/message.md';
const FEATURE = 'specs/features/events.feature';
const JOURNEY = 'specs/journeys/events.md';
const refs = { 'x-story': STORY, 'x-feature': FEATURE, 'x-journey': JOURNEY };

function document() {
  return {
    asyncapi: '3.0.0', info: { title: 'Events', version: '1' },
    channels: { events: { address: 'journal/events', messages: {
      created: { $ref: '#/components/messages/Created' },
      deleted: { $ref: '#/components/messages/Deleted' },
    } } },
    operations: {
      receiveCreated: { action: 'receive', channel: { $ref: '#/channels/events' }, messages: [{ $ref: '#/channels/events/messages/created' }], ...refs, 'x-rules': ['T-1-events'] },
      sendEvents: { action: 'send', channel: { $ref: '#/channels/events' }, ...refs },
    },
    components: { messages: {
      Created: { payload: { type: 'object', required: ['created'], properties: { created: { type: 'string' } } }, 'x-story': MESSAGE_STORY, 'x-rules': ['T-1-events'] },
      Deleted: { payload: { type: 'object', required: ['deleted'], properties: { deleted: { type: 'string' } } }, 'x-story': 'specs/stories/deleted.md' },
    } },
  };
}

function operations(doc) {
  return extractContractOperations({ protocol: 'asyncapi', relativePath: CONTRACT, filePath: CONTRACT, document: doc });
}

function write(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : yaml.dump(value));
}

function fixture(t, doc = document()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-asyncapi3-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, CONTRACT, doc);
  for (const file of [STORY, MESSAGE_STORY, FEATURE, JOURNEY, 'specs/stories/deleted.md']) write(root, file, '# Fixture\n');
  return root;
}

function run(root, check, selected) {
  const child = spawnSync(process.execPath, [path.join(ROOT, 'bin/idd.js'), 'validate', check, '--json', ...(selected ? ['--files', selected] : [])], { cwd: root, encoding: 'utf8' });
  assert.ok(child.stdout, child.stderr);
  return { status: child.status, ...JSON.parse(child.stdout) };
}

test('3.x operations retain IDs, channel addresses, message selection, and message references', () => {
  const [receive, send] = operations(document());
  assert.equal(receive.operationId, 'receiveCreated');
  assert.equal(receive.channelName, 'events');
  assert.equal(receive.channelAddress, 'journal/events');
  assert.equal(receive.action, 'receive');
  assert.deepEqual(receive.storyRefs, [STORY, MESSAGE_STORY]);
  assert.deepEqual(receive.payloadSchema.required, ['created']);
  assert.equal(send.payloadSchema.oneOf.length, 2);
  assert.deepEqual(receive.errors, []);
  assert.notEqual(receive.signature, send.signature);
});

test('local operation/channel/message chains and escaped JSON pointers resolve', () => {
  const doc = document();
  doc.channels['events/~all'] = { $ref: '#/components/channels/Events' };
  doc.components.channels = { Events: doc.channels.events };
  delete doc.channels.events;
  doc.components.messages.Created = { $ref: '#/components/messages/Alias' };
  doc.components.messages.Alias = { payload: { type: 'string' }, ...refs };
  doc.components.operations = { Receive: { action: 'receive', channel: { $ref: '#/channels/events~1~0all' }, messages: [{ $ref: '#/channels/events~1~0all/messages/created' }] } };
  doc.operations = { receive: { $ref: '#/components/operations/Receive' } };
  const [operation] = operations(doc);
  assert.equal(operation.operationId, 'receive');
  assert.equal(operation.channelName, 'events/~all');
  assert.deepEqual(operation.payloadSchema, { type: 'string' });
  assert.deepEqual(operation.errors, []);
});

test('an explicit empty messages list does not fall back to all channel messages', () => {
  const doc = document();
  doc.operations.receiveCreated.messages = [];
  const [operation] = operations(doc);
  assert.equal(operation.payloadSchema, null);
  assert.deepEqual(operation.storyRefs, [STORY]);
});

test('contracts and traceability discover 3.x operations and validate selected message links', (t) => {
  const root = fixture(t);
  assert.deepEqual(run(root, 'contracts').warnings, []);
  assert.match(run(root, 'contracts').info.join('\n'), /validated 2 operations/);
  assert.deepEqual(run(root, 'traceability', CONTRACT).errors, []);
  const graph = spawnSync(process.execPath, [path.join(ROOT, 'tools/graph-generation/generate-spec-graph.js'), 'specs', '--format', 'json'], { cwd: root, encoding: 'utf8' });
  assert.equal(graph.status, 0, graph.stderr);
  assert.equal(JSON.parse(graph.stdout).nodes.filter(node => node.type === 'contract').length, 2);
  fs.unlinkSync(path.join(root, MESSAGE_STORY));
  const broken = run(root, 'traceability', CONTRACT);
  assert.equal(broken.status, 1);
  assert.ok(broken.errors.some(x => x.includes('receiveCreated') && x.endsWith(MESSAGE_STORY)));
});

for (const [name, breakDocument] of Object.entries({
  'missing channel': doc => { doc.operations.receiveCreated.channel.$ref = '#/channels/missing'; },
  'external channel': doc => { doc.operations.receiveCreated.channel.$ref = 'elsewhere.yaml#/channels/events'; },
  'missing message': doc => { doc.operations.receiveCreated.messages[0].$ref = '#/channels/events/messages/missing'; },
  'foreign message': doc => { doc.operations.receiveCreated.messages[0].$ref = '#/components/messages/Created'; },
  'cyclic message': doc => { doc.components.messages.Created = { $ref: '#/components/messages/Created' }; },
  'invalid action': doc => { doc.operations.receiveCreated.action = 'publish'; },
  'multi-format payload': doc => { doc.components.messages.Created.payload = { schemaFormat: 'application/vnd.apache.avro;version=1.9.0', schema: { type: 'string' } }; },
})) {
  test(`${name} fails with a diagnostic instead of silently skipping`, (t) => {
    const doc = document(); breakDocument(doc);
    const root = fixture(t, doc);
    for (const check of ['contracts', 'traceability']) {
      const result = run(root, check, CONTRACT);
      assert.equal(result.status, 1, JSON.stringify(result));
      assert.ok(result.errors.some(x => x.includes('receiveCreated')));
      assert.ok(!result.warnings.some(x => /No contract operations found/.test(x)));
    }
  });
}

test('fixture payload checks honor send/receive and message subsets; ambiguous operations require an ID', (t) => {
  const doc = document();
  const root = fixture(t, doc);
  const file = 'specs/fixtures/event.fixture.yaml';
  const data = { id: 'event', type: 'fixture', contract: { protocol: 'asyncapi', ref: CONTRACT, action: 'receive', channel: 'events' }, request: { payload: { created: 'c1' } } };
  write(root, file, data);
  assert.equal(run(root, 'fixtures', file).status, 0);
  data.request.payload = { deleted: 'd1' }; write(root, file, data);
  assert.equal(run(root, 'fixtures', file).status, 1);
  data.contract.action = 'send'; data.contract.channel = 'journal/events'; write(root, file, data);
  assert.equal(run(root, 'fixtures', file).status, 0);
  doc.operations.sendOther = structuredClone(doc.operations.sendEvents); write(root, CONTRACT, doc);
  assert.match(run(root, 'fixtures', file).errors.join('\n'), /ambiguous.*contract.operation/i);
  data.contract.operation = 'sendOther'; write(root, file, data);
  assert.equal(run(root, 'fixtures', file).status, 0);
});

test('a false payload schema rejects every fixture instead of being treated as missing', (t) => {
  const doc = document();
  doc.components.messages.Created.payload = false;
  const root = fixture(t, doc);
  const file = 'specs/fixtures/never.fixture.yaml';
  write(root, file, { id: 'never', type: 'fixture', contract: { protocol: 'asyncapi', action: 'receive', channel: 'events' }, request: { payload: {} } });
  const result = run(root, 'fixtures', file);
  assert.equal(result.status, 1);
  assert.match(result.errors.join('\n'), /Message payload validation failed/);
});

test('verification checks nested x-rules on active operations and messages', (t) => {
  const doc = document();
  doc.components.messages.Unused = { 'x-rules': ['UNUSED-1-not-an-active-claim'] };
  const root = fixture(t, doc);
  const options = { repoRoot: root, manifest: { modules: {} }, maps: new Map(), ruleIds: new Set(['T-1-events']) };
  assert.deepEqual(validateEvidenceBindings(options).errors, []);
  doc.components.messages.Created['x-rules'] = ['GHOST-9-unknown']; write(root, CONTRACT, doc);
  assert.match(validateEvidenceBindings(options).errors.join('\n'), /x-rules names GHOST-9-unknown/);
  doc.components.messages.Created['x-rules'] = 'T-1-events'; write(root, CONTRACT, doc);
  assert.match(validateEvidenceBindings(options).errors.join('\n'), /x-rules must be an array/);
  doc.components.messages.Created['x-rules'] = ['T-1-events'];
  doc.operations.receiveCreated['x-rules'] = ['UNKNOWN-2-operation']; write(root, CONTRACT, doc);
  assert.match(validateEvidenceBindings(options).errors.join('\n'), /x-rules names UNKNOWN-2-operation/);
});

test('2.x publish/subscribe discovery and message-level links remain supported', () => {
  const doc = { asyncapi: '2.6.0', channels: { events: { publish: { operationId: 'publishEvent', ...refs, message: { payload: { type: 'string' }, 'x-story': MESSAGE_STORY } } } } };
  const [operation] = operations(doc);
  assert.equal(operation.signature, 'asyncapi publish events');
  assert.equal(operation.action, 'publish');
  assert.deepEqual(operation.payloadSchema, { type: 'string' });
  assert.deepEqual(operation.storyRefs, [STORY, MESSAGE_STORY]);
});
