'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const INSTALLER = path.join(REPO_ROOT, 'install', 'idd-install.sh');
const VERSION = require(path.join(REPO_ROOT, 'package.json')).version;

test('standalone installer places a release beside others and links idd, with no node_modules', (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-standalone-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  execFileSync('npm', ['pack', '--pack-destination', work], { cwd: REPO_ROOT, stdio: 'ignore' });
  const tarball = path.join(work, `idd-toolkit-${VERSION}.tgz`);
  assert.ok(fs.existsSync(tarball));

  const prefix = path.join(work, 'prefix');
  const binDir = path.join(work, 'bin');
  const out = execFileSync('sh', [INSTALLER, '--from-file', tarball, '--prefix', prefix, '--bin-dir', binDir], { encoding: 'utf8' });
  assert.match(out, new RegExp(`Installed idd-toolkit ${VERSION.replace(/\./g, '\\.')} to `));

  const target = path.join(prefix, 'toolkits', VERSION);
  assert.ok(fs.existsSync(path.join(target, 'dist', 'bin', 'idd.js')));
  assert.ok(fs.existsSync(path.join(target, 'schemas', 'v1', 'index.json')));
  assert.ok(fs.existsSync(path.join(target, 'migrations', 'catalog.json')));
  assert.equal(fs.existsSync(path.join(target, 'node_modules')), false);
  assert.equal(fs.readlinkSync(path.join(binDir, 'idd')), path.join(target, 'bin', 'idd'));

  // Runs from an unrelated directory with an empty PATH-independent invocation.
  const elsewhere = path.join(work, 'elsewhere');
  fs.mkdirSync(elsewhere);
  const version = execFileSync(path.join(binDir, 'idd'), ['version'], { cwd: elsewhere, encoding: 'utf8' });
  assert.equal(version.trim(), `idd-toolkit ${VERSION}`);
  const report = JSON.parse(execFileSync(path.join(target, 'bin', 'idd'), ['doctor', '--json'], { cwd: elsewhere, encoding: 'utf8' }));
  assert.equal(report.repository.doctor_toolkit_version, VERSION);

  // Reinstalling the same version replaces in place; --no-link leaves the link alone.
  const again = execFileSync('sh', [INSTALLER, '--from-file', tarball, '--prefix', prefix, '--bin-dir', binDir, '--no-link'], { encoding: 'utf8' });
  assert.match(again, /Replacing existing/);
  assert.equal(fs.readlinkSync(path.join(binDir, 'idd')), path.join(target, 'bin', 'idd'));

  // A version mismatch between the request and the tarball is refused.
  assert.throws(() => execFileSync('sh', [INSTALLER, '--from-file', tarball, '--prefix', prefix, '--bin-dir', binDir, '--version', '9.9.9'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), /requested 9\.9\.9 but the tarball is/);
});
