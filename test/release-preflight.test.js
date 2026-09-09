const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-preflight-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.copyFileSync(path.join(__dirname, '../tools/release-preflight.js'), path.join(root, 'tools/release-preflight.js'));
  fs.writeFileSync(path.join(root, '.release-please-manifest.json'), '{".":"0.1.0-uat.7"}\n');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init');
  git('config', 'user.name', 'Preflight Test');
  git('config', 'user.email', 'preflight@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  const commit = (subject) => git('commit', '--allow-empty', '-m', subject);
  commit('chore(main): release 0.1.0-uat.7');
  git('tag', 'v0.1.0-uat.7');
  const run = (...args) => spawnSync(process.execPath, ['tools/release-preflight.js', ...args], { cwd: root, encoding: 'utf8' });
  return { git, commit, run };
}

for (const subject of ['feat: capability', 'fix(cli): repair', 'perf(evidence): cache trees', 'revert: undo regression', 'chore!: breaking tooling']) {
  test(`preflight accepts ${subject}`, (t) => {
    const { commit, run } = fixture(t);
    commit(subject);
    const result = run('--json');
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.releasable, 1);
    assert.equal(report.would_release, true);
    assert.equal(report.basis, 'local-subjects-only');
    assert.match(report.limitations, /PR-body overrides/);
  });
}

test('valid non-release types are not diagnosed as malformed titles', (t) => {
  const { commit, run } = fixture(t);
  for (const type of ['chore', 'docs', 'style', 'refactor', 'test', 'build', 'ci']) commit(`${type}: maintenance`);
  const report = JSON.parse(run('--json').stdout);
  assert.equal(report.parsed_non_releasable, 7);
  assert.equal(report.unparsed, 0);
  assert.equal(report.would_release, false);
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /valid Conventional Commits/);
  assert.doesNotMatch(result.stdout, /For future squash merges|Release-As|would propose NO/);
});

test('unrecognized subjects get specific guidance without claiming remote certainty', (t) => {
  const { commit, run } = fixture(t);
  commit('Update everything');
  commit('docs: clarify');
  const report = JSON.parse(run('--json').stdout);
  assert.deepEqual(report.unparsed_subjects, ['Update everything']);
  assert.deepEqual(report.parsed_non_releasable_subjects, ['docs: clarify']);
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /For future squash merges/);
  assert.match(result.stdout, /does not prove Release Please will do nothing/);
  assert.match(result.stdout, /gh workflow run release-please.yml/);
  assert.doesNotMatch(result.stdout, /ignored by Release Please/);
});

test('empty release range and missing tags retain distinct diagnostics', (t) => {
  const { git, commit, run } = fixture(t);
  const empty = run();
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /no commits since the release boundary/);
  assert.doesNotMatch(empty.stdout, /For future squash merges|Parsed non-release types/);
  git('tag', '-d', 'v0.1.0-uat.7');
  commit('perf: optimize');
  const fallback = run('--json');
  assert.equal(fallback.status, 0);
  assert.equal(JSON.parse(fallback.stdout).anchor, 'release-commit');
});
