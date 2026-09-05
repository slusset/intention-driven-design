/**
 * Shared front-matter parsing utilities for IDD check scripts.
 *
 * Handles all artifact types and their different metadata conventions:
 * - Markdown files: YAML front-matter between --- fences
 * - YAML files: top-level id/type fields
 * - Gherkin files: # key: value comment headers
 * - JSON files: _meta block
 *
 * See docs/idd/front-matter-spec.md for the full specification.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ── Valid artifact types ──────────────────────────────────────────────
const VALID_TYPES = [
  'persona', 'journey', 'story', 'model', 'feature',
  'fixture', 'journey-map', 'capability'
];

// ── File pattern → expected type mapping ──────────────────────────────
const FILE_TYPE_MAP = [
  { pattern: /(?:^|\/)personas\/.*\.md$/, type: 'persona' },
  { pattern: /(?:^|\/)journeys\/.*\.md$/, type: 'journey' },
  { pattern: /(?:^|\/)stories\/.*\.md$/, type: 'story' },
  { pattern: /(?:^|\/)models\/.*\.model\.ya?ml$/, type: 'model' },
  { pattern: /(?:^|\/)models\/.*\.lifecycle\.ya?ml$/, type: 'model' },
  { pattern: /(?:^|\/)features\/.*\.feature$/, type: 'feature' },
  { pattern: /(?:^|\/)fixtures\/.*\.(?:json|fixture\.ya?ml)$/, type: 'fixture' },
  { pattern: /(?:^|\/)journey-maps\/.*\.(?:map|journey-map)\.ya?ml$/, type: 'journey-map' },
  { pattern: /(?:^|\/)capabilities\/.*\.capability\.ya?ml$/, type: 'capability' },
];

// ── Required fields by type ───────────────────────────────────────────
const REQUIRED_FIELDS = {
  persona:      { required: ['id', 'type'], recommended: [] },
  journey:      { required: ['id', 'type'], recommended: ['refs.persona'] },
  story:        { required: ['id', 'type'], recommended: ['refs.journey', 'refs.persona'] },
  model:        { required: ['id', 'type'], recommended: [] },
  feature:      { required: ['id', 'type'], recommended: ['story'] },
  fixture:      { required: ['id', 'type'], recommended: ['story', 'scenario'] },
  'journey-map': { required: ['id', 'type'], recommended: ['journey'] },
  capability:   { required: ['id', 'type', 'scope'], recommended: [] },
};

const REFERENCE_PLURALS = { story: 'stories', journey: 'journeys', scenario: 'scenarios', contract: 'contracts' };

// Combine primary and plural metadata without losing secondary links (#99).
function referenceValues(metadata, field) {
  const values = new Set();
  function add(value) {
    if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === 'string' && value.trim()) values.add(value.trim());
    else if (value && typeof value === 'object' && typeof value.ref === 'string') add(value.ref);
  }
  add(metadata?.[field]);
  if (REFERENCE_PLURALS[field]) add(metadata?.[REFERENCE_PLURALS[field]]);
  return [...values];
}

/**
 * Determine the expected artifact type from a file path.
 * Returns null if the file doesn't match any known pattern.
 */
function getExpectedType(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const { pattern, type } of FILE_TYPE_MAP) {
    if (pattern.test(normalized)) {
      return type;
    }
  }
  return null;
}

/**
 * Parse front-matter from a markdown file (--- fenced YAML).
 * Returns { frontMatter: object|null, body: string }
 */
function parseMarkdownFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { frontMatter: null, body: content };
  }

  try {
    const frontMatter = yaml.load(match[1]);
    const body = content.slice(match[0].length).trim();
    return { frontMatter: frontMatter || {}, body };
  } catch (e) {
    return { frontMatter: null, body: content, parseError: e.message };
  }
}

/**
 * Parse front-matter from a Gherkin feature file (# key: value comments).
 * Returns { frontMatter: object|null, body: string }
 */
function parseGherkinFrontMatter(content) {
  const lines = content.split('\n');
  const frontMatter = {};
  let lastHeaderLine = -1;
  let listKey = null;
  const referenceHeaders = new Set(['story', 'stories', 'journey', 'journeys']);

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') continue;

      const item = line.match(/^#\s+-(?:\s+(.*))?$/);
      if (item && listKey) {
        const value = yaml.load(item[1] || '');
        if (typeof value !== 'string') throw new Error(`${listKey} list items must be strings`);
        frontMatter[listKey].push(value);
        lastHeaderLine = i;
        continue;
      }

      const match = line.match(/^#\s+([a-z_-]+):\s*(.*)$/i);
      if (match) {
        // Also retain legacy capitalized Story/Journey comment headers.
        const key = match[1].toLowerCase();
        const rawValue = match[2].trim();
        let value = rawValue;
        listKey = null;
        if (referenceHeaders.has(key)) {
          if (rawValue === '') {
            value = [];
            listKey = key;
          } else if (/^[\["']/.test(rawValue)) {
            value = yaml.load(rawValue);
          }
          const plural = key === 'stories' || key === 'journeys';
          if ((plural && !Array.isArray(value)) ||
              ![value].flat().every((entry) => typeof entry === 'string')) {
            throw new Error(`${key} must contain ${plural ? 'a list of strings' : 'strings'}`);
          }
        }
        frontMatter[key] = Object.hasOwn(frontMatter, key) ? [frontMatter[key], value].flat() : value;
        lastHeaderLine = i;
      } else if (!line.startsWith('#')) {
        // Ordinary comments do not end the header; Gherkin tokens do.
        break;
      }
    }
  } catch (error) {
    return { frontMatter: null, body: content, parseError: error.message };
  }

  if (Object.keys(frontMatter).length === 0) {
    return { frontMatter: null, body: content };
  }

  return { frontMatter, body: lines.slice(lastHeaderLine + 1).join('\n').trim() };
}

/**
 * Parse front-matter from a JSON fixture file (_meta block).
 * Returns { frontMatter: object|null, body: object }
 */
function parseJsonFrontMatter(content) {
  try {
    const data = JSON.parse(content);
    if (data._meta && typeof data._meta === 'object') {
      return { frontMatter: data._meta, body: data };
    }
    return { frontMatter: null, body: data };
  } catch (e) {
    return { frontMatter: null, body: null, parseError: e.message };
  }
}

/**
 * Parse front-matter from a YAML file (top-level id/type fields).
 * Returns { frontMatter: object|null, body: object }
 */
function parseYamlFrontMatter(content) {
  try {
    const data = yaml.load(content);
    if (!data || typeof data !== 'object') {
      return { frontMatter: null, body: data };
    }

    if (data._meta && typeof data._meta === 'object' && !Array.isArray(data._meta)) {
      return { frontMatter: data._meta, body: data };
    }

    // Extract id, type, and refs-like fields as front-matter
    const frontMatter = {};
    if (data.id) frontMatter.id = data.id;
    if (data.type) frontMatter.type = data.type;
    if (data.refs) frontMatter.refs = data.refs;
    if (data.journey) frontMatter.journey = data.journey;
    if (data.story) frontMatter.story = data.story;
    if (data.feature) frontMatter.feature = data.feature;
    if (data.contract) frontMatter.contract = data.contract;
    if (data.scenario) frontMatter.scenario = data.scenario;
    for (const field of Object.values(REFERENCE_PLURALS)) {
      if (Object.hasOwn(data, field)) frontMatter[field] = data[field];
    }
    if (data.sources) frontMatter.sources = data.sources;
    if (data.scope) frontMatter.scope = data.scope;

    if (Object.keys(frontMatter).length === 0) {
      return { frontMatter: null, body: data };
    }

    return { frontMatter, body: data };
  } catch (e) {
    return { frontMatter: null, body: null, parseError: e.message };
  }
}

/**
 * Parse front-matter from any spec file, auto-detecting format.
 * Returns { frontMatter: object|null, body: any, type: string|null, parseError?: string }
 */
function parseFrontMatter(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.md') {
    return parseMarkdownFrontMatter(content);
  }

  if (ext === '.feature') {
    return parseGherkinFrontMatter(content);
  }

  if (ext === '.json') {
    return parseJsonFrontMatter(content);
  }

  if (ext === '.yaml' || ext === '.yml') {
    return parseYamlFrontMatter(content);
  }

  return { frontMatter: null, body: content };
}

/**
 * Get a nested value from an object using a dot-separated path.
 * e.g., getNestedValue(obj, 'refs.persona') → obj.refs.persona
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((curr, key) => {
    if (curr == null || typeof curr !== 'object') return undefined;
    return curr[key];
  }, obj);
}

/**
 * Validate front-matter for a given file against the expected schema.
 * Returns { errors: string[], warnings: string[] }
 */
function validateFrontMatter(filePath, frontMatter, expectedType) {
  const errors = [];
  const warnings = [];

  if (!expectedType) {
    return { errors, warnings };
  }

  const schema = REQUIRED_FIELDS[expectedType];
  if (!schema) {
    return { errors, warnings };
  }

  if (!frontMatter) {
    errors.push(`Missing front-matter (expected type: ${expectedType})`);
    return { errors, warnings };
  }

  // Check required fields
  for (const field of schema.required) {
    const value = getNestedValue(frontMatter, field);
    if (value === undefined || value === null || value === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check type matches expected
  const declaredType = frontMatter.type || frontMatter['_meta.type'];
  if (declaredType && declaredType !== expectedType) {
    warnings.push(`Declared type '${declaredType}' doesn't match expected '${expectedType}' for path`);
  }

  // Check recommended fields
  for (const field of schema.recommended) {
    if ((expectedType === 'feature' || expectedType === 'fixture') && REFERENCE_PLURALS[field]) {
      if (referenceValues(frontMatter, field).length === 0) warnings.push(`Missing recommended field: ${field}`);
      continue;
    }
    let value = getNestedValue(frontMatter, field);
    // Journey maps may keep the canonical journey link in sources.journey.
    if ((value === undefined || value === null || value === '') &&
        expectedType === 'journey-map' &&
        field === 'journey') {
      value = getNestedValue(frontMatter, 'sources.journey');
    }
    if (value === undefined || value === null || value === '') {
      warnings.push(`Missing recommended field: ${field}`);
    }
  }

  return { errors, warnings };
}

/**
 * Extract all reference paths from front-matter.
 * Returns an array of file paths that should exist.
 */
function extractRefs(frontMatter) {
  if (!frontMatter) return [];

  const refs = [];
  const isSpecRef = (value) => typeof value === 'string' && /^(specs|examples)\//.test(value);

  // From markdown refs block
  if (frontMatter.refs) {
    for (const [key, value] of Object.entries(frontMatter.refs)) {
      if (isSpecRef(value)) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (isSpecRef(item)) {
            refs.push(item);
          }
        }
      }
    }
  }

  // From YAML sources block (models)
  if (frontMatter.sources) {
    for (const [key, value] of Object.entries(frontMatter.sources)) {
      if (isSpecRef(value)) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (isSpecRef(item)) {
            refs.push(item);
          }
        }
      }
    }
  }

  // From YAML scope block (capabilities)
  if (frontMatter.scope) {
    for (const [key, value] of Object.entries(frontMatter.scope)) {
      if (isSpecRef(value)) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (isSpecRef(item)) {
            refs.push(item);
          }
        }
      }
    }
  }

  // Feature headers and flattened fixture metadata share reference aliases.
  for (const field of ['story', 'journey', 'feature', 'contract', 'scenario']) {
    refs.push(...referenceValues(frontMatter, field).filter(isSpecRef));
  }

  return [...new Set(refs)];
}

/**
 * Recursively find files matching a pattern in a directory.
 */
function findFiles(dir, pattern) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Check if a file exists relative to project root.
 */
function fileExists(relativePath, projectRoot) {
  const root = projectRoot || process.cwd();
  return fs.existsSync(path.join(root, relativePath));
}

/**
 * Format results as a summary string.
 */
function formatResults(results) {
  let output = '';

  if (results.errors.length > 0) {
    output += 'ERRORS:\n';
    results.errors.forEach(e => output += `  ❌ ${e}\n`);
    output += '\n';
  }

  if (results.warnings.length > 0) {
    output += 'WARNINGS:\n';
    results.warnings.forEach(w => output += `  ⚠️  ${w}\n`);
    output += '\n';
  }

  if (results.info.length > 0) {
    output += 'INFO:\n';
    results.info.forEach(i => output += `  ℹ️  ${i}\n`);
  }

  output += `\nErrors: ${results.errors.length}, Warnings: ${results.warnings.length}\n`;
  return output;
}

module.exports = {
  VALID_TYPES,
  FILE_TYPE_MAP,
  REQUIRED_FIELDS,
  referenceValues,
  getExpectedType,
  parseFrontMatter,
  parseMarkdownFrontMatter,
  parseGherkinFrontMatter,
  parseJsonFrontMatter,
  parseYamlFrontMatter,
  validateFrontMatter,
  extractRefs,
  getNestedValue,
  findFiles,
  fileExists,
  formatResults,
};
