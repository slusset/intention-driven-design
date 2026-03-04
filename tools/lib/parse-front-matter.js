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
  { pattern: /specs\/personas\/.*\.md$/, type: 'persona' },
  { pattern: /specs\/journeys\/.*\.md$/, type: 'journey' },
  { pattern: /specs\/stories\/.*\.md$/, type: 'story' },
  { pattern: /specs\/models\/.*\.model\.ya?ml$/, type: 'model' },
  { pattern: /specs\/models\/.*\.lifecycle\.ya?ml$/, type: 'model' },
  { pattern: /specs\/features\/.*\.feature$/, type: 'feature' },
  { pattern: /specs\/fixtures\/.*\.json$/, type: 'fixture' },
  { pattern: /specs\/journey-maps\/.*\.map\.ya?ml$/, type: 'journey-map' },
  { pattern: /specs\/capabilities\/.*\.capability\.ya?ml$/, type: 'capability' },
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines at the top
    if (line === '' && lastHeaderLine === -1) continue;

    // Match # key: value pattern (but not # followed by space then word = regular comment)
    const match = line.match(/^#\s+([a-z_-]+):\s*(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();
      frontMatter[key] = value;
      lastHeaderLine = i;
    } else if (line.startsWith('#') && lastHeaderLine === -1) {
      // Regular comment before any headers — skip
      continue;
    } else {
      break;
    }
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

    // Extract id, type, and refs-like fields as front-matter
    const frontMatter = {};
    if (data.id) frontMatter.id = data.id;
    if (data.type) frontMatter.type = data.type;
    if (data.refs) frontMatter.refs = data.refs;
    if (data.journey) frontMatter.journey = data.journey;
    if (data.story) frontMatter.story = data.story;
    if (data.scenario) frontMatter.scenario = data.scenario;
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

  // From markdown refs block
  if (frontMatter.refs) {
    for (const [key, value] of Object.entries(frontMatter.refs)) {
      if (typeof value === 'string' && value.startsWith('specs/')) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.startsWith('specs/')) {
            refs.push(item);
          }
        }
      }
    }
  }

  // From YAML sources block (models)
  if (frontMatter.sources) {
    for (const [key, value] of Object.entries(frontMatter.sources)) {
      if (typeof value === 'string' && value.startsWith('specs/')) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.startsWith('specs/')) {
            refs.push(item);
          }
        }
      }
    }
  }

  // From YAML scope block (capabilities)
  if (frontMatter.scope) {
    for (const [key, value] of Object.entries(frontMatter.scope)) {
      if (typeof value === 'string' && value.startsWith('specs/')) {
        refs.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.startsWith('specs/')) {
            refs.push(item);
          }
        }
      }
    }
  }

  // From Gherkin comment headers
  if (typeof frontMatter.story === 'string' && frontMatter.story.startsWith('specs/')) {
    refs.push(frontMatter.story);
  }
  if (typeof frontMatter.journey === 'string' && frontMatter.journey.startsWith('specs/')) {
    refs.push(frontMatter.journey);
  }

  // From JSON _meta (fixture front-matter is already flattened)
  if (typeof frontMatter.feature === 'string' && frontMatter.feature.startsWith('specs/')) {
    refs.push(frontMatter.feature);
  }

  return refs;
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
