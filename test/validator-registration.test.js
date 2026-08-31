const test = require('node:test');
const assert = require('node:assert/strict');
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

test('modules, capability-closure, and enforcement-bindings are registered validators', () => {
  const listing = runNode([IDD_BIN, 'validate']);

  assert.match(listing, /modules/);
  assert.match(listing, /capability-closure/);
  assert.match(listing, /enforcement-bindings/);
});

test('idd validate modules passes on the example manifest', () => {
  const result = runJson([IDD_BIN, 'validate', 'modules', '--json']);

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /1 module\(s\), 1 capability assignment\(s\)/);
});

test('idd validate capability-closure passes on the example specs', () => {
  const result = runJson([IDD_BIN, 'validate', 'capability-closure', '--json']);

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /trade-show-signup\.capability\.yaml: closure OK/);
});

test('idd validate enforcement-bindings passes on the example specs', () => {
  const result = runJson([IDD_BIN, 'validate', 'enforcement-bindings', '--json']);

  assert.deepEqual(result.errors, []);
  assert.match(result.info.join('\n'), /narrative enforced/);
});
