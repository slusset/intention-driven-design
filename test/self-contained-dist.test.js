'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const TOOLKIT_VERSION = require(path.join(REPO_ROOT, 'package.json')).version;

// Files a plugin host cache actually has: the repository tree without
// node_modules. tools/ sources are excluded on purpose so the run below can
// only succeed through the committed self-contained bundle.
const PLUGIN_CACHE_SURFACES = ['dist', 'skills', 'schemas', 'migrations', 'bin', 'package.json'];

function makePluginCache(t) {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-plugin-cache-'));
  t.after(() => fs.rmSync(cacheRoot, { recursive: true, force: true }));
  for (const surface of PLUGIN_CACHE_SURFACES) {
    fs.cpSync(path.join(REPO_ROOT, surface), path.join(cacheRoot, surface), { recursive: true });
  }
  return cacheRoot;
}

test('committed dist bundle is current with the source tree', () => {
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'tools', 'build-dist.js'), '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
});

test('bundled CLI runs idd version without node_modules', (t) => {
  const cacheRoot = makePluginCache(t);
  const output = execFileSync(process.execPath, [path.join(cacheRoot, 'bin', 'idd'), 'version'], {
    cwd: cacheRoot,
    encoding: 'utf8',
  });
  assert.match(output, new RegExp(`idd-toolkit ${TOOLKIT_VERSION.replace(/\./g, '\\.')}`));
});

test('bundled CLI runs idd doctor --json against a consumer without node_modules', (t) => {
  const cacheRoot = makePluginCache(t);
  const consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bundle-consumer-'));
  t.after(() => fs.rmSync(consumerRoot, { recursive: true, force: true }));

  const report = JSON.parse(execFileSync(
    process.execPath,
    [path.join(cacheRoot, 'bin', 'idd'), 'doctor', '--repo', consumerRoot, '--json'],
    { cwd: consumerRoot, encoding: 'utf8' },
  ));

  assert.equal(report.mode, 'report-only');
  assert.equal(report.repository.doctor_toolkit_version, TOOLKIT_VERSION);
  assert.equal(report.migration.writes, false);
  // Every deterministic validator must have executed from the bundle.
  for (const check of ['modules', 'traceability', 'front-matter', 'fixtures']) {
    assert.notEqual(report.validators[check].status, undefined);
    assert.doesNotMatch(
      (report.validators[check].errors || []).join('\n'),
      /Cannot find module|validator did not produce JSON/,
    );
  }
});

test('bundled CLI runs idd validate all --json without node_modules', (t) => {
  const cacheRoot = makePluginCache(t);
  const consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-bundle-validate-'));
  t.after(() => fs.rmSync(consumerRoot, { recursive: true, force: true }));

  const output = execFileSync(
    process.execPath,
    [path.join(cacheRoot, 'bin', 'idd'), 'validate', 'all', '--json'],
    { cwd: consumerRoot, encoding: 'utf8' },
  );
  assert.match(output, /11\/11 checks passed\./);
});

test('npm pack ships the wrapper, source CLI, and self-contained bundle', () => {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }));
  const files = new Set(packed.files.map((file) => file.path));
  for (const required of ['bin/idd', 'bin/idd.js', 'dist/bin/idd.js', 'tools/lib/tool-runner.js', 'tools/lib/toolkit-root.js']) {
    assert.ok(files.has(required), `npm pack must include ${required}`);
  }
});
