const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(REPO_ROOT, 'package.json'));
const lock = require(path.join(REPO_ROOT, 'package-lock.json'));
const claude = require(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'));
const codex = require(path.join(REPO_ROOT, '.codex-plugin', 'plugin.json'));
const config = require(path.join(REPO_ROOT, 'release-please-config.json'));
const manifest = require(path.join(REPO_ROOT, '.release-please-manifest.json'));

test('all released surfaces share the current release-ledger version', () => {
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(claude.version, pkg.version);
  assert.equal(codex.version, pkg.version);
  assert.equal(manifest['.'], pkg.version);
});

test('Release Please owns both plugin manifest versions', () => {
  const root = config.packages['.'];
  assert.equal(root['release-type'], 'node');
  assert.equal(root['draft-pull-request'], true);
  assert.equal(root['include-v-in-tag'], true);
  assert.equal(root['include-component-in-tag'], false);

  const extraVersions = new Map(root['extra-files'].map((entry) => [entry.path, entry.jsonpath]));
  assert.equal(extraVersions.get('.claude-plugin/plugin.json'), '$.version');
  assert.equal(extraVersions.get('.codex-plugin/plugin.json'), '$.version');
});

test('release workflow creates the release, verifies it, and attaches the toolkit', () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, '.github', 'workflows', 'release-please.yml'),
    'utf8',
  );
  assert.match(workflow, /googleapis\/release-please-action@v4/);
  assert.match(workflow, /RELEASE_PLEASE_TOKEN \|\| secrets\.GITHUB_TOKEN/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /node tools\/validate-plugin-manifests\.js/);
  assert.match(workflow, /npm pack --pack-destination dist/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /refs\/tags\/v\$\{MAJOR\}/);
});
