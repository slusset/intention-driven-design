'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getValidator, formatAjvErrors } = require('./schema-loader');

function parseOverlayFrontMatter(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  return yaml.load(match[1]);
}

function readConsumerContract(repoRoot, options = {}) {
  const overlayRelative = options.overlayPath || 'specs/skills/repo-overlay.md';
  const overlayPath = path.join(repoRoot, overlayRelative);
  const result = { path: overlayRelative, status: 'missing', record: null, errors: [], warnings: [] };
  if (!fs.existsSync(overlayPath)) return result;

  let frontMatter;
  try {
    frontMatter = parseOverlayFrontMatter(overlayPath);
  } catch (error) {
    result.status = 'invalid';
    result.errors.push(`${overlayRelative}: invalid YAML front matter: ${error.message}`);
    return result;
  }
  if (!frontMatter || !frontMatter.idd_consumer) {
    result.status = 'unrecorded';
    return result;
  }

  const check = getValidator('consumer-contract')(frontMatter);
  if (!check.valid) {
    result.status = 'invalid';
    result.errors.push(...formatAjvErrors(check.errors).map((message) => `${overlayRelative}: schema: ${message}`));
    return result;
  }
  result.status = 'valid';
  result.record = frontMatter.idd_consumer;
  return result;
}

module.exports = { readConsumerContract };
