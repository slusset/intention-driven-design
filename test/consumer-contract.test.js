'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getValidator } = require('../tools/lib/schema-loader');

const VALID = {
  idd_consumer: {
    schemaVersion: 1,
    toolkit: {
      version: '0.1.0-uat.1',
      schema: {
        version: '1.11.0',
        digest: `sha256:${'a'.repeat(64)}`,
      },
      source: {
        kind: 'github-tag',
        ref: 'v0.1.0-uat.1',
      },
    },
  },
};

test('consumer contract accepts explicit toolkit/schema/source pins', () => {
  const result = getValidator('consumer-contract')(VALID);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('consumer contract rejects malformed schema digests', () => {
  const result = getValidator('consumer-contract')({
    ...VALID,
    idd_consumer: {
      ...VALID.idd_consumer,
      toolkit: {
        ...VALID.idd_consumer.toolkit,
        schema: { ...VALID.idd_consumer.toolkit.schema, digest: 'sha256:stale' },
      },
    },
  });
  assert.equal(result.valid, false);
});
