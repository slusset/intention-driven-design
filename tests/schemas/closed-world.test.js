'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { getValidator, categorize } = require('../../tools/lib/schema-loader');

test('unknown top-level property in a model is reported as a warning', () => {
  const data = {
    id: 'test',
    type: 'model',
    entity: 'Test',
    rogueKey: 'value',
  };
  const result = getValidator('model')(data);
  const c = categorize(result.errors, data, { schemaUrl: 'X' });
  assert.equal(c.errors.length, 0);
  assert.ok(c.warnings.some((m) => m.includes('rogueKey')), `expected warning about rogueKey, got: ${JSON.stringify(c)}`);
});

test('unknown nested property under an attribute is reported as a warning', () => {
  const data = {
    id: 'test',
    type: 'model',
    entity: 'Test',
    attributes: {
      profileDescription: {
        type: 'string',
        placeholder: 'some text',
      },
    },
  };
  const result = getValidator('model')(data);
  const c = categorize(result.errors, data, {});
  assert.equal(c.errors.length, 0);
  assert.ok(c.warnings.some((m) => m.includes('placeholder')), `expected warning about placeholder, got: ${JSON.stringify(c)}`);
});

test('unknown nested property tagged $conformance:experimental is demoted to info', () => {
  const data = {
    id: 'test',
    type: 'model',
    entity: 'Test',
    attributes: {
      profileDescription: {
        type: 'string',
        placeholder: {
          $conformance: 'experimental',
          value: 'Chiropractor providing family and prenatal care...',
        },
      },
    },
  };
  const result = getValidator('model')(data);
  const c = categorize(result.errors, data, {});
  assert.equal(c.errors.length, 0);
  assert.equal(c.warnings.length, 0);
  assert.ok(
    c.info.some((m) => m.includes('placeholder') && m.includes('experimental')),
    `expected info for experimental placeholder, got: ${JSON.stringify(c)}`,
  );
});

test('unknown property tagged $conformance:legacy-compatible is a warning with retention note', () => {
  const data = {
    id: 'test',
    type: 'capability',
    scope: {
      stories: ['specs/stories/x.story.md'],
      legacyBucket: {
        $conformance: 'legacy-compatible',
        items: ['a'],
      },
    },
  };
  const result = getValidator('capability')(data);
  const c = categorize(result.errors, data, {});
  assert.equal(c.errors.length, 0);
  assert.ok(
    c.warnings.some((m) => m.includes('legacyBucket') && m.includes('legacy-compatible')),
    `expected warning for legacy-compatible legacyBucket, got: ${JSON.stringify(c)}`,
  );
});

test('shape violation (wrong required field) remains an error, not a warning', () => {
  const data = {
    type: 'model',
    entity: 'Test',
  };
  const result = getValidator('model')(data);
  const c = categorize(result.errors, data, {});
  assert.ok(c.errors.length > 0, `expected hard error for missing id, got: ${JSON.stringify(c)}`);
});

test('$conformance with an invalid tier is rejected as an error', () => {
  const data = {
    id: 'test',
    type: 'model',
    entity: 'Test',
    $conformance: 'experimentalish',
  };
  const result = getValidator('model')(data);
  const c = categorize(result.errors, data, {});
  assert.ok(c.errors.length > 0, `expected error for invalid $conformance tier, got: ${JSON.stringify(c)}`);
});

test('schema registry version is bumped to 1.1.x or later', () => {
  const { loadIndex } = require('../../tools/lib/schema-loader');
  const index = loadIndex();
  const [maj, min] = index.version.split('.').map(Number);
  assert.equal(maj, 1);
  assert.ok(min >= 1, `expected minor >= 1 for the closed-world bump, got ${index.version}`);
});
