const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(REPO_ROOT, 'package.json'));
const pluginManifest = require(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'));
const marketplace = require(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'));
const codexManifest = require(path.join(REPO_ROOT, '.codex-plugin', 'plugin.json'));
const codexMarketplace = require(path.join(REPO_ROOT, '.agents', 'plugins', 'marketplace.json'));

test('plugin.json version stays in lockstep with package.json', () => {
  assert.equal(pluginManifest.version, pkg.version,
    'Bump both with `just release <version>` — plugin users only see updates when plugin.json changes');
  assert.equal(codexManifest.version, pkg.version,
    'Bump all three with `just release <version>` — Codex plugin users need the new manifest version');
});

test('Codex manifest exposes core skills only', () => {
  assert.equal(codexManifest.skills, './skills/');
  assert.doesNotMatch(JSON.stringify(codexManifest), /technical-skills/);
  assert.equal(codexManifest.interface.displayName, 'Intention-Driven Design');
});

test('Claude manifest exposes the same core-only skill surface', () => {
  assert.deepEqual(pluginManifest.skills, ['./skills']);
  assert.doesNotMatch(JSON.stringify(pluginManifest), /technical-skills/);
  assert.equal(pkg.files.includes('technical-skills/'), false);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'technical-skills')), false);
});

test('repo overlay is the only stack-specific skill selection authority', () => {
  const workflow = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'idd-workflow', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(workflow, /technical-skills\//);
  assert.match(workflow, /only authority for selecting stack-specific implementation/i);
});

test('repo marketplace exposes the Codex plugin with explicit install policy', () => {
  const entry = codexMarketplace.plugins.find((p) => p.name === codexManifest.name);
  assert.ok(entry, `marketplace.json has no entry for plugin '${codexManifest.name}'`);
  assert.deepEqual(entry.source, { source: 'local', path: './' });
  assert.deepEqual(entry.policy, { installation: 'AVAILABLE', authentication: 'ON_INSTALL' });
  assert.equal(entry.category, 'Productivity');
});

test('repository plugin manifest/tooling gate passes', () => {
  const output = execFileSync(process.execPath, [
    path.join(REPO_ROOT, 'tools', 'validate-plugin-manifests.js'),
    '--json',
  ], { cwd: REPO_ROOT, encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.ok, true, result.errors.join('\n'));
});

test('marketplace entry names match and only one place declares a version', () => {
  const entry = marketplace.plugins.find((p) => p.name === pluginManifest.name);
  assert.ok(entry, `marketplace.json has no entry for plugin '${pluginManifest.name}'`);
  assert.equal(entry.version, undefined,
    'Do not set version in the marketplace entry — plugin.json silently wins and the mismatch hides updates');
});

test('every skills path in the plugin manifest resolves to a directory with skills', () => {
  assert.ok(Array.isArray(pluginManifest.skills) && pluginManifest.skills.length > 0);
  for (const skillsPath of pluginManifest.skills) {
    const resolved = path.join(REPO_ROOT, skillsPath);
    assert.ok(fs.statSync(resolved).isDirectory(), `${skillsPath} is not a directory`);
    const skillDirs = fs.readdirSync(resolved, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => fs.existsSync(path.join(resolved, d.name, 'SKILL.md')));
    assert.ok(skillDirs.length > 0, `${skillsPath} contains no SKILL.md skill directories`);
  }
});

test('bin/idd shim is executable and runs the CLI', () => {
  const shim = path.join(REPO_ROOT, 'bin', 'idd');
  assert.ok(fs.statSync(shim).mode & 0o111, 'bin/idd is not executable');
  const output = execFileSync(process.execPath, [shim, 'version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.match(output, new RegExp(`idd-toolkit ${pkg.version.replace(/\./g, '\\.')}`));
  const help = execFileSync(process.execPath, [path.join(REPO_ROOT, 'bin', 'idd.js'), 'help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.doesNotMatch(help, /with-technical|technical-skills/);
});
