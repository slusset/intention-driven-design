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
  assert.match(pkg.version, /^0\.1\.0-uat\.(?:0|[1-9]\d*)$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(claude.version, pkg.version);
  assert.equal(codex.version, pkg.version);
  assert.equal(manifest['.'], pkg.version);
});

test('Release Please owns both plugin manifest versions', () => {
  const root = config.packages['.'];
  assert.equal(config['bootstrap-sha'], 'c913347b61055df0310e9ab3169457ff44f65031');
  assert.equal(root['release-type'], 'node');
  assert.equal(root.versioning, 'prerelease');
  assert.equal(root.prerelease, true);
  assert.equal(root['prerelease-type'], 'uat');
  assert.equal(root['release-as'], undefined);
  assert.equal(root['bump-minor-pre-major'], true);
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
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /operation:/);
  assert.match(workflow, /- prepare/);
  assert.match(workflow, /- publish/);
  assert.match(workflow, /target-branch: main/);
  assert.match(workflow, /skip-github-release: \$\{\{ inputs\.operation == 'prepare' \}\}/);
  assert.match(workflow, /skip-github-pull-request: \$\{\{ inputs\.operation == 'publish' \}\}/);
  assert.match(workflow, /RELEASE_PLEASE_TOKEN \|\| secrets\.GITHUB_TOKEN/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /node tools\/validate-plugin-manifests\.js/);
  assert.match(workflow, /npm pack --pack-destination dist/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /steps\.release\.outputs\.major != '0'/);
  assert.match(workflow, /!contains\(steps\.release\.outputs\.version, '-'\)/);
  assert.match(workflow, /refs\/tags\/v\$\{MAJOR\}/);
});

test('a conventional pull request title is enforced for squash merges', () => {
  const workflow = fs.readFileSync(
    path.join(REPO_ROOT, '.github', 'workflows', 'pr-title.yml'),
    'utf8',
  );
  assert.match(workflow, /amannn\/action-semantic-pull-request@v5/);
  assert.match(workflow, /types: \[opened, edited, reopened, synchronize\]/);
  // feat and fix are the types that move the UAT version line; a title
  // Release Please cannot parse yields an empty release, not a failure.
  assert.match(workflow, /^\s+feat$/m);
  assert.match(workflow, /^\s+fix$/m);
});

test('release-prepare is guarded by the release preflight', () => {
  const justfile = fs.readFileSync(path.join(REPO_ROOT, 'justfile'), 'utf8');
  assert.match(justfile, /release-prepare: release-preflight/);
  assert.match(justfile, /release-preflight:\n\s+node tools\/release-preflight\.js/);
});
