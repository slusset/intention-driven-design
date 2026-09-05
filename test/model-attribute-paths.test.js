'use strict';

// SCHEMA.md: Dotted attribute paths; regression for #104.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const MODEL = 'specs/models/descriptor.model.yaml';
const VALID = ['id', 'schemaVersion', 'x', 'artifact.address', 'artifact.byteLength', 'archive1.artifact2.byteLength3'];

function fixture(t, subject, names = VALID) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'idd-attribute-paths-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const block = subject === 'catalog' ? 'properties' : 'attributes';
  const document = {
    id: 'descriptor', type: 'model', [subject]: 'ArtifactDescriptor', description: 'A descriptor with nested field paths.',
    ...(subject === 'catalog' ? {} : { identity: { kind: 'field', field: 'artifact.address', type: 'string' } }),
    [block]: Object.fromEntries(names.map(name => [name, { type: 'string' }])),
    sources: { stories: [] },
  };
  const file = path.join(root, MODEL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump(document));
  return { root, file, document };
}

function validate(root, strict = false) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'bin/idd.js'), 'validate', 'models', '--files', MODEL, '--json', ...(strict ? ['--strict'] : [])], { cwd: root, encoding: 'utf8' });
  assert.ok(result.stdout, result.stderr);
  return { status: result.status, ...JSON.parse(result.stdout) };
}

for (const subject of ['entity', 'value_object', 'catalog']) {
  test(`${subject} accepts camelCase segments in dotted paths, including strict mode`, (t) => {
    const { root, file } = fixture(t, subject);
    const original = fs.readFileSync(file, 'utf8');
    for (const strict of [false, true]) {
      const result = validate(root, strict);
      assert.equal(result.status, 0, JSON.stringify(result));
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.warnings, []);
    }
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  });
}

test('invalid flat names and invalid or empty path segments still warn once per key and fail strict mode', (t) => {
  const invalid = ['BadName', 'bad_name', 'bad-name', '.artifact', 'artifact.', 'artifact..address', 'artifact.Address', 'Artifact.address', 'artifact.2address', 'artifact.bad_name', 'artifact address', ''];
  const { root } = fixture(t, 'value_object', [...VALID, ...invalid]);
  const result = validate(root);
  assert.equal(result.status, 0);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, invalid.length);
  for (const name of invalid) assert.ok(result.warnings.includes(`${MODEL}: Attribute "${name}" should be camelCase`));
  const strict = validate(root, true);
  assert.equal(strict.status, 1);
  assert.deepEqual(strict.warnings, []);
  assert.deepEqual(strict.errors, result.warnings.map(warning => `${warning} (strict mode)`));
});

test('a valid dotted name does not mask a malformed attribute definition', (t) => {
  const { root, file, document } = fixture(t, 'value_object');
  document.attributes['artifact.address'] = { description: 'Missing a type.' };
  fs.writeFileSync(file, yaml.dump(document));
  const result = validate(root);
  assert.equal(result.status, 1);
  assert.ok(result.errors.some(error => error.includes('artifact.address') && error.includes('missing type')));
});
