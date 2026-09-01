'use strict';

/**
 * Formal-result records (schema v1.14).
 *
 * A formal-result is a record, not a report: one machine-emitted JSON object
 * per probe run, carrying the tool identity (from the formal-tools lock), the
 * digest of the source it ran, the probe name and scope, the observed
 * outcome, the outcome the verification map expects, and a verdict. Records
 * live in the gitignored `.idd/evidence/results/` workspace as `*.json` or
 * `*.jsonl` and are never committed; the roll-up derives every report from
 * them. The map's `expected` pins and the checker's observations therefore
 * meet in one comparison the toolkit owns, instead of in a consumer script.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { moduleRoots, normalizeRepoPath } = require('./modules');

const PROBE_KINDS = [
  'alloy-command',
  'tla-invariant',
  'tla-property',
  'conformance-vector',
  'test-selector',
  'mutation-probe',
  'independent-implementation',
];

const OUTCOMES = {
  'alloy-command': ['SAT', 'UNSAT'],
  'tla-invariant': ['holds', 'violated'],
  'tla-property': ['holds', 'violated'],
  'conformance-vector': ['pass', 'fail'],
  'test-selector': ['pass', 'fail'],
  'mutation-probe': ['detected', 'undetected'],
  'independent-implementation': ['pass', 'fail'],
};

const DEFAULT_EXPECTED = {
  'tla-invariant': 'holds',
  'tla-property': 'holds',
  'conformance-vector': 'pass',
  'test-selector': 'pass',
  'mutation-probe': 'detected',
  'independent-implementation': 'pass',
};

function sha256(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function digestFile(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  return sha256(fs.readFileSync(absolute));
}

function toolDigestFromLock(repoRoot, lockPath, tool) {
  if (!lockPath) return null;
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, lockPath), 'utf8'));
    const entry = lock && lock[tool];
    if (entry && /^[0-9a-f]{64}$/i.test(String(entry.sha256 || ''))) {
      return { digest: `sha256:${entry.sha256.toLowerCase()}`, version: entry.version || null };
    }
  } catch {
    // An unreadable lock leaves the tool digest unknown; the roll-up reports it.
  }
  return null;
}

/**
 * Load every verification map the module manifest reaches. The roll-up and
 * the record builder both need the maps as plain documents keyed by path.
 */
function loadVerificationMaps(repoRoot, manifestPath = 'specs/modules.yaml') {
  const maps = new Map();
  const absoluteManifest = path.join(repoRoot, manifestPath);
  if (!fs.existsSync(absoluteManifest)) return { manifest: null, maps };
  const manifest = yaml.load(fs.readFileSync(absoluteManifest, 'utf8'));
  if (!manifest || typeof manifest !== 'object' || !manifest.modules) return { manifest: null, maps };
  const capabilityModule = new Map();
  for (const [moduleName, module] of Object.entries(manifest.modules)) {
    for (const capability of module.capabilities || []) capabilityModule.set(normalizeRepoPath(capability), moduleName);
  }
  for (const root of moduleRoots(manifest)) {
    const dir = path.join(repoRoot, root, 'verification');
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = ['verification.yaml', 'verification.yml'].map((name) => path.join(dir, entry.name, name)).find((candidate) => fs.existsSync(candidate));
      if (!file) continue;
      const mapPath = path.relative(repoRoot, file).split(path.sep).join('/');
      let document;
      try { document = yaml.load(fs.readFileSync(file, 'utf8')); } catch { continue; }
      if (!document || typeof document !== 'object') continue;
      maps.set(mapPath, { document, capability: document.capability, moduleName: capabilityModule.get(normalizeRepoPath(document.capability)) || null });
    }
  }
  return { manifest, maps };
}

function probeRef(ref) {
  if (typeof ref === 'string') return { name: ref, expected: undefined, note: undefined };
  if (ref && typeof ref === 'object' && typeof ref.name === 'string') return { name: ref.name, expected: ref.expected, note: ref.note };
  return null;
}

function listPaths(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return [];
}

function underPath(file, declared) {
  const normalized = declared.replace(/\/$/, '');
  return file === normalized || file.startsWith(`${normalized}/`);
}

/**
 * Every claim the maps make, flattened to one entry per (rule, probe). This
 * is the declared side of the comparison: what a record can be matched to.
 */
function declaredProbes(maps) {
  const probes = [];
  for (const [mapPath, entry] of maps) {
    const tooling = entry.document.tooling || {};
    const alloySources = listPaths(tooling.alloy?.sources);
    for (const rule of entry.document.rules || []) {
      const base = { mapPath, capability: entry.capability, ruleId: rule.id };
      if (rule.alloy && typeof rule.alloy === 'object') {
        const sources = [...new Set([...alloySources, ...listPaths(rule.alloy.profiles)])];
        for (const list of ['assertions', 'predicates', 'inherited_assertions']) {
          for (const ref of rule.alloy[list] || []) {
            const probe = probeRef(ref);
            if (!probe) continue;
            probes.push({ ...base, kind: 'alloy-command', role: list === 'predicates' ? 'predicate' : 'assertion', inherited: list === 'inherited_assertions', name: probe.name, sources, expected: probe.expected });
          }
        }
      }
      if (rule.tla && typeof rule.tla === 'object') {
        const sources = [...new Set([...listPaths(rule.tla.model), ...listPaths(rule.tla.inherited_model), ...listPaths(tooling.tla?.sources)])];
        for (const [list, kind] of [['invariants', 'tla-invariant'], ['properties', 'tla-property'], ['preserved_invariants', 'tla-invariant']]) {
          for (const ref of rule.tla[list] || []) {
            const probe = probeRef(ref);
            if (!probe) continue;
            probes.push({ ...base, kind, name: probe.name, sources, expected: probe.expected === undefined ? DEFAULT_EXPECTED[kind] : probe.expected });
          }
        }
      }
      for (const [key, value] of Object.entries(rule)) {
        if (!/^[a-z][a-z0-9]*_vectors$/.test(key)) continue;
        for (const declared of listPaths(value)) {
          probes.push({ ...base, kind: 'conformance-vector', corpus: key, name: declared, sources: [declared], expected: 'pass' });
        }
      }
      for (const binding of [...(rule.current_evidence?.bindings || []), ...(rule.evidence?.bindings || [])]) {
        for (const selector of binding.selectors || []) {
          probes.push({ ...base, kind: 'test-selector', name: selector, sources: binding.files || [], expected: 'pass' });
        }
      }
      for (const probe of rule.mutation_probes || []) {
        if (!probe || typeof probe !== 'object') continue;
        probes.push({ ...base, kind: 'mutation-probe', name: probe.id || probe.mutation, sources: listPaths(probe.detected_by), expected: probe.expected || 'detected' });
      }
    }
  }
  return probes;
}

/**
 * The outcome a claim expects for a source. Alloy's own semantics supply the
 * default — a `check` (assertion) expects UNSAT, a `run` (predicate) expects
 * SAT — so a map only pins outcomes that differ: intentional counterexamples,
 * or a scenario that is representable in the open profile and closed in the
 * hardened one. Other kinds default per DEFAULT_EXPECTED.
 */
function expectedFor(declared, source) {
  if (declared.expected === undefined || declared.expected === null) {
    if (declared.kind === 'alloy-command') return declared.role === 'predicate' ? 'SAT' : 'UNSAT';
    return DEFAULT_EXPECTED[declared.kind] || null;
  }
  if (typeof declared.expected === 'string') return declared.expected;
  if (typeof declared.expected === 'object') {
    if (!source) return null;
    const normalized = normalizeRepoPath(source) || source;
    for (const [profile, outcome] of Object.entries(declared.expected)) {
      if ((normalizeRepoPath(profile) || profile) === normalized) return outcome;
    }
    return null;
  }
  return null;
}

/**
 * Match one observation to the claims that name it. A record matches a
 * declared probe when kinds agree, names agree (a vector by path prefix), and
 * — when the record names a source — the source is one the claim runs under.
 */
function claimsFor(declared, probe) {
  const source = probe.source ? (normalizeRepoPath(probe.source) || probe.source) : null;
  return declared.filter((claim) => {
    if (claim.kind !== probe.kind) return false;
    if (claim.kind === 'conformance-vector') return source ? underPath(source, claim.name) : claim.name === probe.name;
    if (claim.name !== probe.name) return false;
    if (!source || claim.sources.length === 0) return true;
    return claim.sources.some((candidate) => (normalizeRepoPath(candidate) || candidate) === source || underPath(source, candidate));
  });
}

function verdictFor(observed, expected) {
  if (expected === null || expected === undefined) return 'unpinned';
  return observed === expected ? 'match' : 'mismatch';
}

/**
 * Build a formal-result record from an observation. `expected` is resolved
 * from the verification maps when the caller does not supply it; the record
 * carries the rule ids of every claim it satisfies so the roll-up never has
 * to re-derive the match.
 */
function buildFormalResult(repoRoot, observation, options = {}) {
  const { maps } = options.maps ? { maps: options.maps } : loadVerificationMaps(repoRoot, options.manifestPath);
  const declared = options.declared || declaredProbes(maps);
  if (!PROBE_KINDS.includes(observation.kind)) throw new Error(`unknown probe kind: ${observation.kind}`);
  if (!OUTCOMES[observation.kind].includes(observation.observed)) {
    throw new Error(`observed must be one of ${OUTCOMES[observation.kind].join(', ')} for ${observation.kind}; got ${observation.observed}`);
  }
  const probe = { kind: observation.kind, name: observation.name, source: observation.source || null };
  const claims = claimsFor(declared, probe);
  let expected = observation.expected === undefined ? null : observation.expected;
  if (expected === null) {
    const pinned = [...new Set(claims.map((claim) => expectedFor(claim, probe.source)).filter((value) => value !== null))];
    if (pinned.length === 1) expected = pinned[0];
    else if (pinned.length > 1) expected = null; // claims disagree for this source; the roll-up reports per claim
  }
  const lock = toolDigestFromLock(repoRoot, observation.lock, observation.tool);
  return {
    record_version: 1,
    kind: 'formal-result',
    run: {
      id: observation.runId || process.env.IDD_RUN_ID || process.env.GITHUB_RUN_ID || 'local',
      at: observation.at || new Date().toISOString(),
      revision: observation.revision || process.env.GITHUB_SHA || null,
      environment: observation.environment || (process.env.GITHUB_ACTIONS === 'true' ? 'ci' : 'local'),
    },
    tool: {
      name: observation.tool,
      version: observation.toolVersion || lock?.version || null,
      digest: lock?.digest || null,
      lock: observation.lock || null,
    },
    probe: {
      kind: observation.kind,
      name: observation.name,
      source: probe.source,
      source_digest: probe.source ? digestFile(repoRoot, probe.source) : null,
      scope: observation.scope || null,
    },
    rules: [...new Set(claims.map((claim) => claim.ruleId))].sort(),
    observed: observation.observed,
    expected,
    verdict: claims.length === 0 && expected === null ? 'unclaimed' : verdictFor(observation.observed, expected),
    duration_ms: typeof observation.durationMs === 'number' ? observation.durationMs : null,
    detail: observation.detail || null,
  };
}

function appendFormalResult(repoRoot, record, resultsDir = '.idd/evidence/results') {
  const dir = path.join(repoRoot, resultsDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.run.id.replace(/[^A-Za-z0-9_.-]+/g, '_')}.jsonl`);
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  return path.relative(repoRoot, file).split(path.sep).join('/');
}

/** Read every record under the results workspace: `*.json` (one or an array) and `*.jsonl`. */
function readFormalResults(repoRoot, resultsDir = '.idd/evidence/results') {
  const dir = path.join(repoRoot, resultsDir);
  const records = [];
  const problems = [];
  if (!fs.existsSync(dir)) return { records, problems };
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    const relative = `${resultsDir.replace(/\/$/, '')}/${name}`;
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, 'utf8');
    try {
      if (name.endsWith('.jsonl')) {
        text.split(/\r?\n/).forEach((line, index) => {
          if (!line.trim()) return;
          records.push({ file: relative, line: index + 1, record: JSON.parse(line) });
        });
      } else if (name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        for (const record of Array.isArray(parsed) ? parsed : [parsed]) records.push({ file: relative, line: null, record });
      }
    } catch (error) {
      problems.push(`${relative}: ${error.message}`);
    }
  }
  return { records, problems };
}

module.exports = {
  DEFAULT_EXPECTED,
  OUTCOMES,
  PROBE_KINDS,
  appendFormalResult,
  buildFormalResult,
  claimsFor,
  declaredProbes,
  expectedFor,
  loadVerificationMaps,
  readFormalResults,
  sha256,
  verdictFor,
};
