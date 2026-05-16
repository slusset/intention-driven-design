/**
 * Enforcement-binding parser and resolver (#41).
 *
 * Each `enforced` entry on a model rule carries a `kind` and a `binding`
 * locator. The resolver verifies that the artifact named by the binding
 * exists in the repository and that the named anchor/label is syntactically
 * present.
 *
 * Binding format:
 *   <path>#<anchor>     — file with a named anchor (SQL constraint, JSON
 *                         pointer in YAML/JSON, Markdown heading slug)
 *   <path>:<label>      — file with a labeled entity (Gherkin scenario name,
 *                         test name)
 *   <path>              — file existence only (no anchor / label)
 *
 * Resolution rules:
 *   .sql        → anchor is a named CONSTRAINT / INDEX / TABLE / TYPE
 *                 appearing in the file (case-insensitive substring match)
 *   .yaml/.yml  → anchor is a JSON pointer (#/components/schemas/...)
 *   .json       → anchor is a JSON pointer
 *   .md         → anchor is a heading slug (kebab-case of any heading)
 *   .feature    → label is a `Scenario:` or `Scenario Outline:` name
 *   .test.js,
 *   .test.ts,
 *   .spec.js,
 *   .spec.ts    → label is a `test('...')` or `it('...')` name
 *
 * Per-kind expectations are advisory — a `persistence` binding pointing at a
 * `.feature` file gets a warning that the kind and file type look mismatched,
 * but the binding still resolves if the file is present.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function parseBinding(binding) {
  if (typeof binding !== 'string' || binding.length === 0) {
    return { file: null, anchor: null, label: null, error: 'empty binding' };
  }

  // Split protocol-style prefix only if it looks like one (openapi:, asyncapi:, json-rpc:).
  // Otherwise `:` after the path is a label separator.
  const hashIndex = binding.indexOf('#');
  if (hashIndex >= 0) {
    return {
      file: binding.slice(0, hashIndex),
      anchor: binding.slice(hashIndex + 1),
      label: null,
    };
  }

  const colonIndex = binding.lastIndexOf(':');
  if (colonIndex > 0 && colonIndex < binding.length - 1) {
    const maybeLabel = binding.slice(colonIndex + 1);
    const maybeFile = binding.slice(0, colonIndex);
    // Heuristic: only treat as label if the right side has a space, mixed case,
    // or doesn't look like part of a Windows-style drive path. For our repo,
    // any `:` after column 1 is safe to treat as a label separator.
    return { file: maybeFile, anchor: null, label: maybeLabel };
  }

  return { file: binding, anchor: null, label: null };
}

function resolvePointer(doc, pointer) {
  if (!pointer.startsWith('/')) return undefined;
  const segments = pointer.split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cursor = doc;
  for (const seg of segments) {
    if (cursor == null) return undefined;
    if (Array.isArray(cursor)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx)) return undefined;
      cursor = cursor[idx];
    } else if (typeof cursor === 'object') {
      cursor = cursor[seg];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[`'"*_]+/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveInSql(absPath, anchor) {
  const content = fs.readFileSync(absPath, 'utf8');
  const needle = anchor.toLowerCase();
  // Match CONSTRAINT / INDEX / TABLE / TYPE / TRIGGER names case-insensitively.
  const re = new RegExp(`\\b(constraint|index|table|unique|primary key|foreign key|type|trigger)\\b[^,;\\n]*?${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'i');
  if (re.test(content)) return true;
  // Fall back: substring (lets us locate named constraints that aren't on the
  // same line as the keyword).
  return content.toLowerCase().includes(needle);
}

function resolveInOpenApiLike(absPath, anchor) {
  let doc;
  try { doc = yaml.load(fs.readFileSync(absPath, 'utf8')); }
  catch { return false; }
  const target = resolvePointer(doc, anchor);
  return target !== undefined;
}

function resolveInJson(absPath, anchor) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(absPath, 'utf8')); }
  catch { return false; }
  const target = resolvePointer(doc, anchor);
  return target !== undefined;
}

function resolveInMarkdown(absPath, anchor) {
  const content = fs.readFileSync(absPath, 'utf8');
  const slug = anchor.toLowerCase().trim();
  for (const line of content.split('\n')) {
    const m = line.match(/^#+\s+(.+?)\s*$/);
    if (!m) continue;
    if (slugify(m[1]) === slug) return true;
  }
  return false;
}

function resolveInFeature(absPath, label) {
  const content = fs.readFileSync(absPath, 'utf8');
  const re = new RegExp(`^\\s*Scenario(?:\\s+Outline)?:\\s+${escapeRe(label)}\\s*$`, 'mi');
  return re.test(content);
}

function resolveInJsTest(absPath, label) {
  const content = fs.readFileSync(absPath, 'utf8');
  const re = new RegExp(`\\b(test|it)\\s*\\(\\s*['"\`]${escapeRe(label)}['"\`]`);
  return re.test(content);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ADVISORY_KIND_FILE_MAP = {
  persistence: [/\.(sql)$/i, /\/repository\//i, /\.ts$/i],
  validation: [/contracts\//i, /\.(yaml|yml|json|feature)$/i, /\/dto\//i],
  invariant: [/invariants-in-production\.md$/i],
  domain: [/\.(test|spec)\.(js|ts|tsx|mjs|cjs)$/i, /\.feature$/i],
};

function kindFileLooksOff(kind, filePath) {
  const patterns = ADVISORY_KIND_FILE_MAP[kind];
  if (!patterns) return false;
  const norm = filePath.replace(/\\/g, '/');
  return !patterns.some((re) => re.test(norm));
}

/**
 * Resolve a single binding.
 * @returns {{ resolved: boolean, reason?: string, advisory?: string }}
 */
function resolveBinding({ kind, binding }, opts = {}) {
  const repoRoot = opts.repoRoot || process.cwd();
  const parsed = parseBinding(binding);
  if (parsed.error || !parsed.file) {
    return { resolved: false, reason: `unparseable binding: ${binding}` };
  }

  const absPath = path.isAbsolute(parsed.file) ? parsed.file : path.join(repoRoot, parsed.file);
  if (!fs.existsSync(absPath)) {
    return { resolved: false, reason: `file not found: ${parsed.file}` };
  }

  const advisory = kindFileLooksOff(kind, parsed.file)
    ? `kind:${kind} binding usually points at a different file kind — check that ${parsed.file} actually enforces this rule`
    : null;

  // No anchor or label → file existence is enough.
  if (!parsed.anchor && !parsed.label) {
    return { resolved: true, advisory };
  }

  const lower = parsed.file.toLowerCase();
  let ok = false;
  let detail = '';

  if (parsed.anchor) {
    if (lower.endsWith('.sql')) {
      ok = resolveInSql(absPath, parsed.anchor);
      detail = `SQL identifier "${parsed.anchor}"`;
    } else if (lower.endsWith('.yaml') || lower.endsWith('.yml')) {
      ok = resolveInOpenApiLike(absPath, parsed.anchor);
      detail = `JSON pointer ${parsed.anchor}`;
    } else if (lower.endsWith('.json')) {
      ok = resolveInJson(absPath, parsed.anchor);
      detail = `JSON pointer ${parsed.anchor}`;
    } else if (lower.endsWith('.md')) {
      ok = resolveInMarkdown(absPath, parsed.anchor);
      detail = `heading "${parsed.anchor}"`;
    } else {
      // Unknown anchor format — degrade gracefully: substring search.
      const content = fs.readFileSync(absPath, 'utf8');
      ok = content.includes(parsed.anchor);
      detail = `substring "${parsed.anchor}"`;
    }
  } else if (parsed.label) {
    if (lower.endsWith('.feature')) {
      ok = resolveInFeature(absPath, parsed.label);
      detail = `Scenario "${parsed.label}"`;
    } else if (/\.(test|spec)\.(js|ts|tsx|mjs|cjs)$/.test(lower)) {
      ok = resolveInJsTest(absPath, parsed.label);
      detail = `test name "${parsed.label}"`;
    } else {
      const content = fs.readFileSync(absPath, 'utf8');
      ok = content.includes(parsed.label);
      detail = `substring "${parsed.label}"`;
    }
  }

  if (!ok) {
    return { resolved: false, reason: `${parsed.file}: ${detail} not found`, advisory };
  }
  return { resolved: true, advisory };
}

/**
 * Classify a rule's `enforced` field.
 * @returns {
 *   { form: 'narrative', value: string }
 *   | { form: 'pending', tracker: string }
 *   | { form: 'bound', bindings: Array<{kind, binding}> }
 *   | { form: 'missing' }
 * }
 */
function classifyEnforced(value) {
  if (value === undefined || value === null) return { form: 'missing' };
  if (typeof value === 'string') return { form: 'narrative', value };
  if (Array.isArray(value)) return { form: 'bound', bindings: value };
  if (typeof value === 'object' && typeof value.pending === 'string') {
    return { form: 'pending', tracker: value.pending };
  }
  return { form: 'missing' };
}

module.exports = {
  parseBinding,
  resolveBinding,
  classifyEnforced,
};
