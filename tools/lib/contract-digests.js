'use strict';

const crypto = require('crypto');
const fs = require('fs');

// RFC 8785 JCS for the JSON values used by IDD schemas: object keys are
// sorted by their UTF-16 code units, arrays retain order, and JSON's native
// scalar serialization supplies the required string/number forms.
function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JCS does not permit non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`JCS does not permit ${typeof value}`);
}

function jcsSha256(value) {
  return `sha256:${crypto.createHash('sha256').update(canonicalize(value), 'utf8').digest('hex')}`;
}

function digestJsonFile(filePath) {
  return jcsSha256(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

module.exports = { canonicalize, digestJsonFile, jcsSha256 };
