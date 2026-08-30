const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILL_ROOTS = ['skills'];

function readFrontMatter(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, `${path.relative(REPO_ROOT, filePath)} has no YAML front matter`);
  return yaml.load(match[1]);
}

for (const rootName of SKILL_ROOTS) {
  const root = path.join(REPO_ROOT, rootName);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const skillPath = path.join(root, entry.name, 'SKILL.md');
    if (!entry.isDirectory() || !fs.existsSync(skillPath)) continue;

    test(`${rootName}/${entry.name} is portable Agent Skills front matter`, () => {
      const frontMatter = readFrontMatter(skillPath);
      assert.equal(frontMatter.name, entry.name, 'skill name must match its directory');
      assert.equal(typeof frontMatter.description, 'string');
      assert.ok(frontMatter.description.trim().length > 0, 'description must not be empty');
      assert.equal(frontMatter.license, 'MIT');
      if (frontMatter['allowed-tools'] !== undefined) {
        assert.equal(
          typeof frontMatter['allowed-tools'],
          'string',
          'Agent Skills requires allowed-tools to be a space-delimited scalar',
        );
      }
    });
  }
}
