/**
 * Reference-graph extractor (#40).
 *
 * Given an artifact file, return the set of repo-relative paths it references.
 * The graph captures which front-matter and body conventions count as
 * references; the schema for cross-document constraints (capability scope as
 * a closure obligation) consumes this graph.
 *
 * Reference conventions by artifact type:
 *
 *   persona     → refs.* (any string path under refs)
 *   journey     → refs.persona (one or many)
 *   story       → refs.journey, refs.persona (one or many)
 *   feature     → story, journey, contract (Gherkin '# key: value' headers)
 *   model       → sources.{stories, journeys, features}
 *   lifecycle   → sources.{stories, journeys, features}
 *   journey-map → sources.journey, sources.stories, sources.features,
 *                 fixtures.*.ref
 *   fixture     → story, feature, contract (string or .ref)
 *   capability  → NOT used as a source for closure walking; the capability
 *                 scope is the *declared* set the closure is compared against.
 *   contract    → x-story, x-feature, x-journey extensions on any node
 *                 (OpenAPI, AsyncAPI, JSON-RPC formats)
 *
 * Only paths under specs/ or examples/ count as references; absolute and
 * external URLs are ignored.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SPEC_REF = /^(specs|examples)\//;

function isSpecRef(value) {
  return typeof value === 'string' && SPEC_REF.test(value);
}

function pushRef(set, value) {
  if (isSpecRef(value)) set.add(value);
}

function pushRefs(set, value) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) pushRefs(set, item); // items may be strings or { ref } objects
  } else if (typeof value === 'string') {
    pushRef(set, value);
  } else if (typeof value === 'object') {
    // Some refs like { ref: "specs/..." }; walk one level.
    if (typeof value.ref === 'string') pushRef(set, value.ref);
  }
}

function extractFromMarkdownFrontMatter(content) {
  const refs = new Set();
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return refs;
  let fm;
  try {
    fm = yaml.load(m[1]);
  } catch {
    return refs;
  }
  if (!fm || typeof fm !== 'object') return refs;

  if (fm.refs && typeof fm.refs === 'object') {
    for (const value of Object.values(fm.refs)) pushRefs(refs, value);
  }
  return refs;
}

function extractFromGherkin(content) {
  const refs = new Set();
  for (const line of content.split('\n')) {
    const t = line.trim();
    const m = t.match(/^#\s+([a-z_-]+):\s*(.*)$/);
    if (!m) {
      if (t === '' || t.startsWith('#')) continue;
      break;
    }
    const key = m[1];
    const rawValue = m[2].trim();
    if (key === 'story' || key === 'journey' || key === 'contract' || key === 'feature') {
      // contract values may be prose ("openapi POST /accounts"); only extract spec paths.
      const tokens = rawValue.split(/[\s,]+/);
      for (const tok of tokens) {
        if (isSpecRef(tok)) refs.add(tok);
      }
    }
  }
  return refs;
}

function extractFromYamlDocument(filePath, content) {
  const refs = new Set();
  let doc;
  try {
    doc = yaml.load(content);
  } catch {
    return refs;
  }
  if (!doc || typeof doc !== 'object') return refs;

  const isLifecycle = /\.lifecycle\.ya?ml$/i.test(filePath);
  const isJourneyMap = /\.(journey-map|map)\.ya?ml$/i.test(filePath);
  const isCapability = /\.capability\.ya?ml$/i.test(filePath);
  const isContract = /\/contracts\//.test(filePath.replace(/\\/g, '/'));
  const isFixture = /\/fixtures\//.test(filePath.replace(/\\/g, '/'));

  if (isCapability) {
    // Capability scope is the *declared* set; reference-graph extraction does
    // not walk it. Callers use loadCapabilityScope() instead.
    return refs;
  }

  // Models, lifecycles
  if (doc.sources && typeof doc.sources === 'object') {
    pushRefs(refs, doc.sources.stories);
    pushRefs(refs, doc.sources.journeys);
    pushRefs(refs, doc.sources.features);
    if (typeof doc.sources.journey === 'string') pushRef(refs, doc.sources.journey);
  }

  // Journey-map: fixtures.*.ref
  if (isJourneyMap && doc.fixtures && typeof doc.fixtures === 'object') {
    for (const entry of Object.values(doc.fixtures)) {
      if (entry && typeof entry === 'object' && typeof entry.ref === 'string') {
        pushRef(refs, entry.ref);
      }
    }
  }

  // Fixtures
  if (isFixture) {
    const meta = doc._meta && typeof doc._meta === 'object' ? doc._meta : doc;
    pushRefs(refs, meta.story);
    pushRefs(refs, meta.stories);
    pushRefs(refs, meta.feature);
    pushRefs(refs, meta.journey);
    pushRefs(refs, meta.contract);
    pushRefs(refs, meta.contracts);
  }

  // Contracts: walk recursively for x-story / x-feature / x-journey extensions.
  if (isContract) {
    walkContractExtensions(doc, refs);
  }

  return refs;
}

function walkContractExtensions(node, refs) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkContractExtensions(item, refs);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'x-story' || key === 'x-feature' || key === 'x-journey') {
      pushRefs(refs, value);
    } else if (typeof value === 'object') {
      walkContractExtensions(value, refs);
    }
  }
}

function extractFromJsonFixture(content) {
  const refs = new Set();
  let doc;
  try {
    doc = JSON.parse(content);
  } catch {
    return refs;
  }
  if (!doc || typeof doc !== 'object') return refs;
  const meta = doc._meta && typeof doc._meta === 'object' ? doc._meta : doc;
  pushRefs(refs, meta.story);
  pushRefs(refs, meta.stories);
  pushRefs(refs, meta.feature);
  pushRefs(refs, meta.journey);
  pushRefs(refs, meta.contract);
  pushRefs(refs, meta.contracts);
  return refs;
}

/**
 * Extract outgoing references from one artifact file.
 * @param {string} filePath - absolute or repo-relative path
 * @returns {Set<string>} - repo-relative paths the artifact references
 */
function extractReferences(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return new Set();
  }
  if (normalized.endsWith('.md')) return extractFromMarkdownFrontMatter(content);
  if (normalized.endsWith('.feature')) return extractFromGherkin(content);
  if (normalized.endsWith('.json')) return extractFromJsonFixture(content);
  if (normalized.endsWith('.yaml') || normalized.endsWith('.yml')) {
    return extractFromYamlDocument(filePath, content);
  }
  return new Set();
}

/**
 * Load a capability file's declared scope.
 * @returns {{ id: string, file: string, scope: Record<string,string[]>, excluded: string[] } | null}
 */
function loadCapability(capabilityFilePath) {
  let doc;
  try {
    doc = yaml.load(fs.readFileSync(capabilityFilePath, 'utf8'));
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object' || !doc.scope) return null;

  const scope = {};
  const excluded = [];
  for (const [category, value] of Object.entries(doc.scope)) {
    if (category === 'excluded') {
      if (Array.isArray(value)) {
        for (const v of value) if (isSpecRef(v)) excluded.push(v);
      }
      continue;
    }
    if (category.startsWith('$')) continue;
    if (Array.isArray(value)) {
      scope[category] = value.filter(isSpecRef);
    }
  }

  return {
    id: doc.id || path.basename(capabilityFilePath, '.capability.yaml'),
    file: capabilityFilePath,
    scope,
    excluded,
  };
}

/**
 * Compute the transitive closure of references reachable from a capability's
 * declared scope. Stops at `excluded:` entries.
 *
 * @param {{ scope: Record<string,string[]>, excluded: string[] }} capability
 * @param {{ repoRoot?: string }} [opts]
 * @returns {{
 *   closure: Set<string>,
 *   incomingRefs: Map<string, Set<string>>
 * }}
 *   - closure: every path reachable from the declared scope (including the
 *              declared scope itself), excluding entries listed under `excluded:`
 *   - incomingRefs: for each path in the closure, the set of paths that
 *                   reference it. A path with no entry (or an empty set) is
 *                   only present via the seed; nothing else points to it.
 */
function computeClosure(capability, opts = {}) {
  const repoRoot = opts.repoRoot || process.cwd();
  const excluded = new Set(capability.excluded || []);
  const closure = new Set();
  const incomingRefs = new Map();
  const queue = [];

  for (const [, items] of Object.entries(capability.scope)) {
    for (const item of items) {
      if (excluded.has(item)) continue;
      if (!closure.has(item)) {
        closure.add(item);
        queue.push(item);
      }
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const absolute = path.isAbsolute(current) ? current : path.join(repoRoot, current);
    if (!fs.existsSync(absolute)) continue;
    const refs = extractReferences(absolute);
    for (const ref of refs) {
      if (excluded.has(ref)) continue;
      if (!incomingRefs.has(ref)) incomingRefs.set(ref, new Set());
      incomingRefs.get(ref).add(current);
      if (!closure.has(ref)) {
        closure.add(ref);
        queue.push(ref);
      }
    }
  }

  return { closure, incomingRefs };
}

/**
 * Heuristic: artifact kinds whose graph role is to be referenced *by*
 * downstream artifacts. Used by the unreachable check — only narrative-tier
 * artifacts (personas, journeys, stories) trip the warning, because the
 * structured tier (features, models, lifecycles, journey-maps, fixtures,
 * contracts) often legitimately sits at graph leaves with no incoming refs.
 */
function isNarrativeTier(refPath) {
  const p = refPath.replace(/\\/g, '/');
  return /(^|\/)(personas|journeys|stories)\//.test(p);
}

module.exports = {
  extractReferences,
  loadCapability,
  computeClosure,
  isSpecRef,
  isNarrativeTier,
};
