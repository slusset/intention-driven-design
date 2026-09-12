const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getValidator } = require('../tools/lib/schema-loader');
const {
  getExpectedType,
  parseFrontMatter,
  validateFrontMatter,
} = require('../tools/lib/parse-front-matter');

const REPO_ROOT = path.resolve(__dirname, '..');
const VALID = { id: 'telos', type: 'telos', purpose: 'Why this system exists.' };

test('the telos schema accepts a purpose, with non-goals optional', () => {
  const validate = getValidator('telos');
  assert.equal(validate(VALID).valid, true);
  assert.equal(validate({ ...VALID, non_goals: ['not a planning tool'] }).valid, true);
});

test('the telos schema rejects a missing purpose, a foreign type, and unknown keys', () => {
  const validate = getValidator('telos');
  assert.equal(validate({ id: 'telos', type: 'telos' }).valid, false);
  assert.equal(validate({ ...VALID, type: 'persona' }).valid, false);
  assert.equal(validate({ ...VALID, preserved_qualities: ['continuity'] }).valid, false);
  assert.equal(validate({ ...VALID, non_goals: 'not a list' }).valid, false);
});

test('a telos is recognized by path and requires a purpose in front-matter checks', () => {
  assert.equal(getExpectedType('specs/telos.md'), 'telos');
  assert.equal(getExpectedType('specs/personas/someone.md'), 'persona');

  const missingPurpose = validateFrontMatter('specs/telos.md', { id: 'telos', type: 'telos' }, 'telos');
  assert.ok(
    missingPurpose.errors.some((message) => message.includes('purpose')),
    'a telos without a purpose must be an error, not a warning',
  );
});

test('this repository\'s own telos is valid', () => {
  const file = path.join(REPO_ROOT, 'specs', 'telos.md');
  const parsed = parseFrontMatter(file, fs.readFileSync(file, 'utf8'));
  assert.deepEqual(validateFrontMatter('specs/telos.md', parsed.frontMatter, 'telos').errors, []);
  assert.equal(getValidator('telos')(parsed.frontMatter).valid, true);
});
