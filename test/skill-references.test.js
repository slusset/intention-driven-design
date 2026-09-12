const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { COPIES } = require('../tools/sync-skill-references.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');

function skillNames() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(SKILLS_DIR, name, 'SKILL.md')));
}

test('skill copies of the methodology docs are current', () => {
  try {
    execFileSync(process.execPath, [
      path.join(REPO_ROOT, 'tools', 'sync-skill-references.js'),
      '--check',
    ], { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (err) {
    assert.fail(`${err.stdout || ''}${err.stderr || ''}`.trim()
      || 'tools/sync-skill-references.js --check failed');
  }
});

test('every generated copy is tracked by git', () => {
  // A copy that exists locally but is ignored by .gitignore passes every other
  // check here and fails only in CI, where the checkout has tracked files only.
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: REPO_ROOT, stdio: 'ignore' });
  } catch {
    return; // not a git checkout (packed tarball, vendored copy)
  }

  for (const target of COPIES.flatMap((copy) => copy.targets)) {
    const tracked = execFileSync('git', ['ls-files', '--', target], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    assert.equal(
      tracked,
      target,
      `${target} is not tracked by git — check .gitignore for a pattern that swallows it`,
    );
  }
});

test('every relative link in a SKILL.md resolves inside its own skill directory', () => {
  for (const name of skillNames()) {
    const skillDir = path.join(SKILLS_DIR, name);
    const source = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    for (const [, target] of source.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      assert.ok(
        fs.existsSync(path.join(skillDir, target)),
        `skills/${name}/SKILL.md links ${target}, which does not exist in that skill directory`,
      );
    }
  }
});

test('no SKILL.md resolves a resource through the toolkit repository layout', () => {
  // Hosts resolve a skill's relative paths from the skill directory, and a
  // skills-only install ships no docs/ tree and no sibling skills, so these
  // paths resolve against nothing in a consumer checkout. Consumer-owned
  // paths such as specs/skills/repo-overlay.md stay legal.
  const forbidden = [
    { pattern: /docs\/idd\//, hint: 'copy the document into the skill\'s references/ via tools/sync-skill-references.js' },
    { pattern: /(?<![\w/-])skills\/[a-z-]+\//, hint: 'reference the skill by its slash command, or keep the file inside this skill' },
  ];

  for (const name of skillNames()) {
    const source = fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
    for (const { pattern, hint } of forbidden) {
      const match = source.match(pattern);
      assert.equal(
        match,
        null,
        `skills/${name}/SKILL.md references ${match && match[0]} — ${hint}`,
      );
    }
  }
});
