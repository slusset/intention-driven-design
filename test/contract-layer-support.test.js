const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const IDD_BIN = path.join(REPO_ROOT, 'bin', 'idd.js');

function runNode(args) {
  return execFileSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function runJson(args) {
  return JSON.parse(runNode(args));
}

test('contract validator supports all configured contract families', () => {
  const result = runJson([IDD_BIN, 'validate', 'contracts', '--json']);

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /asyncapi/i);
  assert.match(result.info.join('\n'), /json-rpc/i);
  assert.match(result.info.join('\n'), /openapi/i);
});

test('fixture validator validates OpenAPI, AsyncAPI, and JSON-RPC fixtures', () => {
  const result = runJson([IDD_BIN, 'validate', 'fixtures', '--json']);

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /mobile-signup\.fixture\.yaml: valid/);
  assert.match(result.info.join('\n'), /quick-start-audit-event\.fixture\.yaml: valid/);
  assert.match(result.info.join('\n'), /quick-start-audit-rpc\.fixture\.yaml: valid/);
});

test('traceability validator includes all contract families', () => {
  const result = runJson([IDD_BIN, 'validate', 'traceability', '--json']);

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /Checked 4 contract operation\(s\) across 3 contract file\(s\)/);
});

test('spec graph includes asyncapi and json-rpc contract nodes', () => {
  const graph = runJson([path.join(REPO_ROOT, 'tools', 'graph-generation', 'generate-spec-graph.js'), 'specs', '--format', 'json']);
  const labels = graph.nodes.filter(node => node.type === 'contract').map(node => node.label);

  assert.ok(labels.some(label => label.includes('asyncapi:')));
  assert.ok(labels.some(label => label.includes('json-rpc:')));
  assert.ok(labels.some(label => label.includes('openapi:')));
});

test('idd init scaffolds protocol-specific contract directories', () => {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-init-'));

  runNode([IDD_BIN, 'init', targetDir]);

  assert.ok(fs.existsSync(path.join(targetDir, 'specs', 'contracts', 'openapi')));
  assert.ok(fs.existsSync(path.join(targetDir, 'specs', 'contracts', 'asyncapi')));
  assert.ok(fs.existsSync(path.join(targetDir, 'specs', 'contracts', 'json-rpc')));
});
