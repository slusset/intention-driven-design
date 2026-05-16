'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { getValidator, formatAjvErrors, loadIndex } = require('../../tools/lib/schema-loader');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SPECS_ROOT = path.join(REPO_ROOT, 'specs');

function findFiles(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findFiles(full, pattern));
    else if (pattern.test(e.name)) out.push(full);
  }
  return out;
}

function parseYaml(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return yaml.load(raw);
}

function parseMarkdownFrontMatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  return yaml.load(m[1]);
}

function parseGherkinFrontMatter(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const m = trimmed.match(/^#\s+([a-z_-]+):\s*(.*)$/);
    if (m) {
      out[m[1]] = m[2].trim();
    } else if (trimmed.startsWith('#')) {
      continue;
    } else {
      break;
    }
  }
  return Object.keys(out).length ? out : null;
}

function parseJsonFixture(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function assertConforms(kind, file, data) {
  if (data === null || data === undefined) {
    assert.fail(`${path.relative(REPO_ROOT, file)}: no parseable content (expected ${kind} document or front-matter)`);
  }
  const validator = getValidator(kind);
  const result = validator(data);
  if (!result.valid) {
    const detail = formatAjvErrors(result.errors).map((m) => `  - ${m}`).join('\n');
    assert.fail(`${path.relative(REPO_ROOT, file)} failed ${kind} schema:\n${detail}`);
  }
}

const PERSONA_FILES = findFiles(path.join(SPECS_ROOT, 'personas'), /\.md$/);
const JOURNEY_FILES = findFiles(path.join(SPECS_ROOT, 'journeys'), /\.md$/);
const STORY_FILES = findFiles(path.join(SPECS_ROOT, 'stories'), /\.md$/);
const FEATURE_FILES = findFiles(path.join(SPECS_ROOT, 'features'), /\.feature$/);
const MODEL_FILES = findFiles(path.join(SPECS_ROOT, 'models'), /\.model\.ya?ml$/);
const LIFECYCLE_FILES = findFiles(path.join(SPECS_ROOT, 'models'), /\.lifecycle\.ya?ml$/);
const JOURNEY_MAP_FILES = findFiles(path.join(SPECS_ROOT, 'journey-maps'), /\.(journey-map|map)\.ya?ml$/);
const CAPABILITY_FILES = findFiles(path.join(SPECS_ROOT, 'capabilities'), /\.capability\.ya?ml$/);
const FIXTURE_YAML_FILES = findFiles(path.join(SPECS_ROOT, 'fixtures'), /\.fixture\.ya?ml$/);
const FIXTURE_JSON_FILES = findFiles(path.join(SPECS_ROOT, 'fixtures'), /\.json$/);

test('schema registry loads', () => {
  const index = loadIndex();
  assert.equal(index.dialect, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(index.artifacts && Object.keys(index.artifacts).length >= 8);
});

for (const file of PERSONA_FILES) {
  test(`persona conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('persona', file, parseMarkdownFrontMatter(file));
  });
}

for (const file of JOURNEY_FILES) {
  test(`journey conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('journey', file, parseMarkdownFrontMatter(file));
  });
}

for (const file of STORY_FILES) {
  test(`story conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('story', file, parseMarkdownFrontMatter(file));
  });
}

for (const file of FEATURE_FILES) {
  test(`feature conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('feature', file, parseGherkinFrontMatter(file));
  });
}

for (const file of MODEL_FILES) {
  test(`model conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('model', file, parseYaml(file));
  });
}

for (const file of LIFECYCLE_FILES) {
  test(`lifecycle conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('lifecycle', file, parseYaml(file));
  });
}

for (const file of JOURNEY_MAP_FILES) {
  test(`journey-map conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('journey-map', file, parseYaml(file));
  });
}

for (const file of CAPABILITY_FILES) {
  test(`capability conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('capability', file, parseYaml(file));
  });
}

for (const file of FIXTURE_YAML_FILES) {
  test(`fixture (yaml) conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('fixture', file, parseYaml(file));
  });
}

for (const file of FIXTURE_JSON_FILES) {
  test(`fixture (json) conforms: ${path.relative(REPO_ROOT, file)}`, () => {
    assertConforms('fixture', file, parseJsonFixture(file));
  });
}
