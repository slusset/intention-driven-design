'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { OUTCOMES, sha256 } = require('./formal-results');

const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
function fail(message) { throw new Error(message); }
function repoPath(value) {
  if (typeof value !== 'string' || !value || /[\\\x00-\x1f:]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) fail('input paths must be canonical repository-relative paths');
  return value;
}
function inputMap(inputs) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 256) fail('coverage requires 1..256 tracked inputs');
  const result = new Map();
  for (const input of inputs) {
    const name = repoPath(input.path);
    if (result.has(name) || !/^sha256:[0-9a-f]{64}$/.test(input.digest)) fail('duplicate input path or invalid input digest');
    result.set(name, input.digest);
  }
  return result;
}
function workingBytes(repoRoot, relative) {
  const root = fs.realpathSync(repoRoot);
  const file = path.join(root, repoPath(relative));
  if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail('coverage inputs must be regular files without symlinks');
  return fs.readFileSync(file);
}
function buildInputs(repoRoot, paths) {
  if (!Array.isArray(paths)) fail('inputs file must contain an array of repository-relative paths');
  const inputs = paths.map(p => ({ path: repoPath(p), digest: sha256(workingBytes(repoRoot, p)) })).sort((a, b) => a.path.localeCompare(b.path));
  inputMap(inputs);
  return inputs;
}
function git(repoRoot, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return execFileSync('git', args, { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
function commit(repoRoot, revision) {
  if (!COMMIT.test(revision || '')) fail('coverage requires full Git commit IDs');
  const resolved = git(repoRoot, ['rev-parse', '--verify', `${revision}^{commit}`]).toString().trim();
  if (resolved !== revision) fail('revision must name a commit directly');
}
function treeDigest(repoRoot, revision, relative, cache) {
  const key = JSON.stringify([fs.realpathSync(repoRoot), revision, relative]);
  if (cache.has(key)) return cache.get(key);
  const entry = git(repoRoot, ['ls-tree', '-z', revision, '--', relative]).toString();
  if (!/^(100644|100755) blob [0-9a-f]+\t/.test(entry) || entry.slice(entry.indexOf('\t') + 1) !== `${relative}\0`) fail(`input is not a regular tracked file: ${relative}`);
  const digest = sha256(git(repoRoot, ['show', `${revision}:${relative}`]));
  // Only successful reads of immutable Git objects are cached. Never cache
  // working bytes, HEAD, ancestry, failures or the coverage decision itself.
  cache.set(key, digest);
  return digest;
}
function requiredMaps(claims, maps) {
  const seen = new Set();
  const queue = claims.map(c => c.mapPath);
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const map = maps.get(name)?.document;
    if (!map) fail(`missing verification map: ${name}`);
    for (const dep of map.depends_on || []) queue.push(dep);
  }
  return seen;
}

// This checks content/ancestry consistency. Authenticating the supplied CI
// artifact and enumerating the complete dependency set remain consumer duties.
function validateCoverageWithCache(repoRoot, record, baselines, claims, maps, manifestPath, treeCache) {
  const cite = record.covered_by;
  if (!claims.length) fail('coverage requires a current verification-map claim');
  if (cite.run_id === record.run.id) fail('coverage must cite a different run');
  commit(repoRoot, record.run.revision);
  commit(repoRoot, cite.revision);
  if (git(repoRoot, ['rev-parse', 'HEAD']).toString().trim() !== record.run.revision) fail('current run revision differs from checkout HEAD');
  try { git(repoRoot, ['merge-base', '--is-ancestor', cite.revision, record.run.revision]); }
  catch { fail('baseline revision is not a locally verifiable ancestor'); }
  const candidates = baselines.filter(({ record: r }) => r.run.id === cite.run_id && r.run.revision === cite.revision && r.probe.kind === record.probe.kind && r.probe.name === record.probe.name && r.probe.source === record.probe.source);
  if (candidates.length !== 1) fail('coverage requires exactly one matching baseline record');
  const baseline = candidates[0]; const prior = baseline.record;
  if (prior.observed === 'not-run' || prior.verdict !== 'match' || !OUTCOMES[prior.probe.kind].includes(prior.observed) || prior.expected !== prior.observed) fail('baseline must be a directly executed matching outcome');
  if (baselines.some(({ record: r }) => r.run.id === cite.run_id && r.run.revision === cite.revision && r.verdict === 'mismatch')) fail('supplied baseline run contains a failing record');
  if (record.run.environment === 'ci' && prior.run.environment !== 'ci') fail('CI coverage requires a CI baseline');
  for (const key of ['name', 'version', 'digest', 'lock']) if ((record.tool[key] ?? null) !== (prior.tool[key] ?? null)) fail(`baseline tool ${key} differs`);
  if (record.probe.scope !== prior.probe.scope || !record.probe.scope) fail('baseline scope differs or is absent');
  if (record.probe.source_digest !== prior.probe.source_digest || cite.source_digest !== prior.probe.source_digest) fail('baseline source digest differs');
  const current = inputMap(record.probe.inputs); const previous = inputMap(prior.probe.inputs);
  if (current.size !== previous.size || [...current].some(([name, digest]) => previous.get(name) !== digest)) fail('baseline input set or digests differ');
  for (const required of [manifestPath, record.probe.source, record.tool.lock, ...requiredMaps(claims, maps)]) if (!current.has(required)) fail(`coverage input set omits required file: ${required}`);
  if (current.get(record.probe.source) !== record.probe.source_digest) fail('source digest differs from input manifest');
  for (const [name, digest] of current) {
    if (treeDigest(repoRoot, cite.revision, name, treeCache) !== digest || treeDigest(repoRoot, record.run.revision, name, treeCache) !== digest || sha256(workingBytes(repoRoot, name)) !== digest) fail(`coverage input changed: ${name}`);
  }
  const lock = JSON.parse(workingBytes(repoRoot, record.tool.lock));
  const pinned = lock[record.tool.name];
  if (!pinned || `sha256:${String(pinned.sha256).toLowerCase()}` !== record.tool.digest || (pinned.version || null) !== (record.tool.version || null)) fail('current lock does not pin the cited tool identity');
  return { baseline, observed: prior.observed };
}

// The roll-up owns this closure and discards it when that invocation ends.
// Callers cannot seed cache entries or reuse a process-global verdict cache.
function createCoverageValidator(repoRoot) {
  const treeCache = new Map();
  return (record, baselines, claims, maps, manifestPath = 'specs/modules.yaml') =>
    validateCoverageWithCache(repoRoot, record, baselines, claims, maps, manifestPath, treeCache);
}

// Preserve the existing single-record entry point without shared state.
function validateCoverage(repoRoot, record, baselines, claims, maps, manifestPath) {
  return createCoverageValidator(repoRoot)(record, baselines, claims, maps, manifestPath);
}

module.exports = { buildInputs, validateCoverage, createCoverageValidator };
