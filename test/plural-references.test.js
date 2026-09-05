'use strict';

// docs/idd/front-matter-spec.md and SCHEMA.md reference graph; #99.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { parseFrontMatter, parseGherkinFrontMatter, validateFrontMatter, extractRefs } = require('../tools/lib/parse-front-matter');
const { extractReferences, computeClosure } = require('../tools/lib/reference-graph');
const { getValidator } = require('../tools/lib/schema-loader');

const ROOT = path.resolve(__dirname, '..');
const STORIES = ['specs/stories/a.md', 'specs/stories/b.md'];
const JOURNEYS = ['specs/journeys/a.md', 'specs/journeys/b.md'];
const FEATURE = 'specs/features/shared.feature';

function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-plural-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of [...STORIES, ...JOURNEYS]) write(root, file, '---\nid: sample\ntype: story\n---\n');
  return root;
}

function run(root, check, files = []) {
  const child = spawnSync(process.execPath, [path.join(ROOT, `tools/validate-${check}.js`), '--json', ...(files.length ? ['--files', ...files] : [])], { cwd: root, encoding: 'utf8' });
  assert.ok(child.stdout, child.stderr);
  return { status: child.status, ...JSON.parse(child.stdout) };
}

const featureHeaders = {
  block: `# stories:\n#   - ${STORIES[0]}\n#   - ${STORIES[1]}\n# journeys:\n#   - ${JOURNEYS[0]}\n#   - ${JOURNEYS[1]}`,
  flow: `# stories: ${JSON.stringify(STORIES)}\n# journeys: ${JSON.stringify(JOURNEYS)}`,
  repeated: `# story: ${STORIES[0]}\n# story: ${STORIES[1]}\n# journey: ${JOURNEYS[0]}\n# journey: ${JOURNEYS[1]}`,
  mixed: `# story: ${STORIES[0]}\n# stories: ${JSON.stringify(STORIES)}\n# journey: ${JOURNEYS[0]}\n# journeys: ${JSON.stringify(JOURNEYS)}`,
  legacy: `# Story: ${STORIES[0]}\n# Story: ${STORIES[1]}\n# Journey: ${JOURNEYS[0]}\n# Journey: ${JOURNEYS[1]}`,
};

for (const [kind, header] of Object.entries(featureHeaders)) {
  test(`feature ${kind} references agree across metadata, traceability, and closure`, (t) => {
    const root = fixture(t);
    const content = `# id: shared\n# type: feature\n${header}\nFeature: Shared\n`;
    write(root, FEATURE, content);
    const metadata = parseGherkinFrontMatter(content).frontMatter;
    assert.equal(getValidator('feature')(metadata).valid, true);
    assert.deepEqual(validateFrontMatter(FEATURE, metadata, 'feature'), { errors: [], warnings: [] });
    assert.deepEqual(new Set(extractRefs(metadata)), new Set([...STORIES, ...JOURNEYS]));
    assert.deepEqual(extractReferences(path.join(root, FEATURE)), new Set([...STORIES, ...JOURNEYS]));
    for (const check of ['front-matter', 'traceability']) {
      const result = run(root, check, [FEATURE]);
      assert.equal(result.status, 0, JSON.stringify(result));
      assert.deepEqual(result.warnings, []);
    }
    const { incomingRefs } = computeClosure({ scope: { features: [FEATURE], stories: STORIES, journeys: JOURNEYS } }, { repoRoot: root });
    for (const ref of [...STORIES, ...JOURNEYS]) assert.ok(incomingRefs.get(ref)?.has(FEATURE), ref);
    fs.unlinkSync(path.join(root, STORIES[1]));
    fs.unlinkSync(path.join(root, JOURNEYS[1]));
    const broken = run(root, 'traceability', [FEATURE]);
    assert.equal(broken.status, 1);
    for (const ref of [STORIES[1], JOURNEYS[1]]) assert.equal(broken.errors.filter((message) => message.endsWith(ref)).length, 1);
  });
}

for (const format of ['json', 'yaml', 'yaml-meta']) {
  test(`${format} fixtures combine primary and plural references without treating scenario labels as paths`, (t) => {
    const root = fixture(t);
    write(root, FEATURE, '# id: shared\n# type: feature\nFeature: Shared\n');
    const file = `specs/fixtures/cases.${format === 'json' ? 'json' : 'fixture.yaml'}`;
    const meta = { id: 'cases', type: 'fixture', story: STORIES[0], stories: STORIES, scenarios: ['A named scenario', FEATURE], feature: FEATURE };
    const content = format === 'json' ? JSON.stringify({ _meta: meta }) : yaml.dump(format === 'yaml' ? meta : { _meta: meta });
    write(root, file, content);
    const metadata = parseFrontMatter(file, content).frontMatter;
    assert.deepEqual(validateFrontMatter(file, metadata, 'fixture'), { errors: [], warnings: [] });
    assert.deepEqual(extractReferences(path.join(root, file)), new Set([...STORIES, FEATURE]));
    for (const check of ['front-matter', 'traceability']) {
      const result = run(root, check, [file]);
      assert.equal(result.status, 0, JSON.stringify(result));
      assert.deepEqual(result.warnings, []);
    }
    fs.unlinkSync(path.join(root, STORIES[1]));
    const broken = run(root, 'traceability', [file]);
    assert.equal(broken.status, 1);
    assert.ok(broken.errors.some((message) => message.endsWith(STORIES[1])));
    delete meta.story;
    delete meta.feature;
    const pluralOnly = format === 'json' ? JSON.stringify({ _meta: meta }) : yaml.dump(format === 'yaml' ? meta : { _meta: meta });
    write(root, file, pluralOnly);
    assert.deepEqual(validateFrontMatter(file, parseFrontMatter(file, pluralOnly).frontMatter, 'fixture').warnings, []);
    assert.deepEqual(extractReferences(path.join(root, file)), new Set([...STORIES, FEATURE]));
    fs.unlinkSync(path.join(root, FEATURE));
    assert.ok(run(root, 'traceability', [file]).errors.some((message) => message.endsWith(FEATURE)));
  });
}

test('header comments and CRLF do not truncate lists; scenario-body comments are not metadata', () => {
  const content = `\n# Intro\n# id: shared\n# type: feature\n\n# Explain the links\n${featureHeaders.block}\n@shared\nFeature: Shared\n# stories: [specs/stories/ghost.md]\n`.replace(/\n/g, '\r\n');
  const parsed = parseGherkinFrontMatter(content);
  assert.deepEqual(parsed.frontMatter.stories, STORIES);
  assert.deepEqual(parsed.frontMatter.journeys, JOURNEYS);
  assert.match(parsed.body, /^@shared/);
  assert.ok(!extractRefs(parsed.frontMatter).includes('specs/stories/ghost.md'));
});

test('empty and blank-only plural lists do not satisfy recommended references', () => {
  for (const value of [[], [''], ['   ']]) {
    assert.match(validateFrontMatter(FEATURE, { id: 'x', type: 'feature', stories: value }, 'feature').warnings.join('\n'), /Missing recommended field: story/);
    const result = validateFrontMatter('specs/fixtures/x.json', { id: 'x', type: 'fixture', stories: value, scenarios: value }, 'fixture');
    assert.deepEqual(result.warnings, ['Missing recommended field: story', 'Missing recommended field: scenario']);
  }
});

test('scenario-body comments cannot supply missing header references', (t) => {
  const root = fixture(t);
  write(root, FEATURE, `# id: x\n# type: feature\nFeature: X\n# Story: ${STORIES[0]}\n# journeys: ${JSON.stringify(JOURNEYS)}\n`);
  assert.deepEqual(extractReferences(path.join(root, FEATURE)), new Set());
  const result = run(root, 'traceability', [FEATURE]);
  assert.deepEqual(result.warnings, [`${FEATURE}: Missing story reference`, `${FEATURE}: Missing journey reference`]);
});

test('malformed reference lists are errors in both metadata and traceability', (t) => {
  const root = fixture(t);
  for (const header of [`# stories: [${STORIES[0]}`, '# stories: [42]', '# stories:\n#   -']) {
    write(root, FEATURE, `# id: x\n# type: feature\n${header}\nFeature: X\n`);
    for (const check of ['front-matter', 'traceability']) {
      const result = run(root, check, [FEATURE]);
      assert.equal(result.status, 1);
      assert.match(result.errors.join('\n'), /Parse error/);
    }
  }
});

test('feature schema accepts canonical plural headers and rejects non-string list items', () => {
  const validate = getValidator('feature');
  const metadata = { id: 'shared', type: 'feature', stories: STORIES, journeys: JOURNEYS };
  assert.equal(validate(metadata).valid, true);
  assert.equal(validate({ ...metadata, stories: [1] }).valid, false);
});
