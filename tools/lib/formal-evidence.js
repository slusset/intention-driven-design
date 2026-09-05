'use strict';

/**
 * Formal evidence kinds (schema v1.13).
 *
 * A verification map may claim Alloy assertions, TLA+ invariants, replayed
 * vectors, and mutation probes for a rule. Those claims were author-extensible
 * prose until a consumer (AlloyIdentity) showed them carrying the whole
 * verification spine. This validator makes them checkable in the same
 * closed-world spirit as literal evidence bindings:
 *
 * - every Alloy command a rule names is declared (`assert` / `pred` / `check`
 *   / `run` / `fact`) in one of the map's `tooling.alloy.sources` or the
 *   rule's `profiles`;
 * - every TLA+ invariant or property is declared in the model (`Name ==`) or
 *   listed in a configuration (INVARIANT / PROPERTY);
 * - every conformance vector names the rule in `_meta.rules`, the same
 *   two-way reciprocity contracts have through `x-rules`;
 * - a tooling `lock` pins the checker the map claims (entry present, sha256,
 *   version agreement).
 *
 * Path existence is reported by the evidence-binding validator, so this one
 * stays quiet about missing files and speaks only to names, outcomes, and
 * reciprocity. Bounded results are evidence for their scope, never proofs:
 * the validator checks that the map's claims are grounded, not that they hold.
 */

const fs = require('fs');
const path = require('path');
const { normalizeRepoPath } = require('./modules');

const ALLOY_DECL = (name) => new RegExp(`(^|\\n)\\s*(?:assert|pred|check|run|fact)\\s+${escape(name)}\\b`);
const TLA_DEF = (name) => new RegExp(`(^|\\n)\\s*${escape(name)}\\s*(?:\\(.*?\\))?\\s*==`);
const TLA_CFG = (name) => new RegExp(`(^|\\n)\\s*(?:INVARIANTS?|PROPERTY|PROPERTIES)\\s+(?:[^\\n]*\\s)?${escape(name)}\\b`);

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readText(repoRoot, relativePath) {
  try {
    const absolute = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

function listPaths(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return [];
}

function probeName(ref) {
  if (typeof ref === 'string') return { name: ref, expected: undefined };
  if (ref && typeof ref === 'object' && typeof ref.name === 'string') return { name: ref.name, expected: ref.expected };
  return null;
}

function filesUnder(repoRoot, relativePath, out = []) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return out;
  if (fs.statSync(absolute).isFile()) { out.push(relativePath); return out; }
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = `${relativePath.replace(/\/$/, '')}/${entry.name}`;
    if (entry.isDirectory()) filesUnder(repoRoot, child, out);
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

function validateFormalEvidence({ repoRoot, maps }) {
  const errors = new Set();
  const warnings = new Set();
  const info = [];
  let alloyCount = 0;
  let tlaCount = 0;
  let vectorCount = 0;

  for (const [mapPath, entry] of maps) {
    const document = entry.document;
    const tooling = document.tooling && typeof document.tooling === 'object' ? document.tooling : {};

    // Tooling locks pin the checker the map claims.
    for (const [tool, config] of Object.entries(tooling)) {
      if (!config || typeof config !== 'object' || typeof config.lock !== 'string') continue;
      const lockText = readText(repoRoot, config.lock);
      if (lockText === null) continue; // existence is reported by evidence bindings
      let lock;
      try { lock = JSON.parse(lockText); } catch (error) {
        errors.add(`${mapPath}: tooling.${tool}.lock ${config.lock} is not valid JSON: ${error.message}`);
        continue;
      }
      const pinned = lock && typeof lock === 'object' ? lock[tool] : null;
      if (!pinned || typeof pinned !== 'object') {
        errors.add(`${mapPath}: tooling.${tool}.lock ${config.lock} has no entry for ${tool}`);
        continue;
      }
      if (!/^[0-9a-f]{64}$/i.test(String(pinned.sha256 || ''))) {
        errors.add(`${mapPath}: tooling.${tool}.lock ${config.lock} entry ${tool} must pin a sha256`);
      }
      if (config.version && pinned.version && config.version !== pinned.version) {
        errors.add(`${mapPath}: tooling.${tool}.version ${config.version} disagrees with ${config.lock} (${pinned.version})`);
      }
    }

    const alloySources = listPaths(tooling.alloy?.sources);
    const tlaSources = listPaths(tooling.tla?.sources);
    // Inherited probes live in the sources of the maps this one depends on
    // (transitively): a downstream map cites an upstream assertion by name.
    const dependencySources = { alloy: [], tla: [] };
    const seen = new Set([mapPath]);
    const queue = listPaths(document.depends_on).map((dep) => normalizeRepoPath(dep) || dep);
    while (queue.length > 0) {
      const dep = queue.shift();
      if (seen.has(dep)) continue;
      seen.add(dep);
      const upstream = maps.get(dep)?.document;
      if (!upstream) continue;
      dependencySources.alloy.push(...listPaths(upstream.tooling?.alloy?.sources));
      dependencySources.tla.push(...listPaths(upstream.tooling?.tla?.sources));
      queue.push(...listPaths(upstream.depends_on).map((next) => normalizeRepoPath(next) || next));
    }
    const alloyCorpus = new Map();
    const corpusFor = (sources) => sources.map((source) => {
      if (!alloyCorpus.has(source)) alloyCorpus.set(source, readText(repoRoot, source));
      return [source, alloyCorpus.get(source)];
    }).filter(([, text]) => text !== null);

    for (const rule of document.rules || []) {
      // Alloy commands resolve to declarations in the sources or profiles.
      if (rule.alloy && typeof rule.alloy === 'object') {
        const own = [...new Set([...alloySources, ...listPaths(rule.alloy.profiles)])];
        for (const key of ['assertions', 'predicates', 'inherited_assertions']) {
          const sources = key === 'inherited_assertions' ? [...new Set([...own, ...dependencySources.alloy])] : own;
          const corpus = corpusFor(sources);
          for (const ref of rule.alloy[key] || []) {
            const probe = probeName(ref);
            if (!probe) continue;
            alloyCount += 1;
            if (corpus.length === 0) {
              if (sources.length === 0) errors.add(`${mapPath}: rule ${rule.id} names alloy ${key} but the map declares no tooling.alloy.sources or profiles`);
              continue;
            }
            const declared = corpus.some(([, text]) => ALLOY_DECL(probe.name).test(text));
            if (!declared) {
              errors.add(`${mapPath}: rule ${rule.id} alloy ${key.replace(/s$/, '')} ${probe.name} is not declared in ${sources.join(', ')}`);
            }
            if (probe.expected && typeof probe.expected === 'object') {
              for (const profile of Object.keys(probe.expected)) {
                if (!sources.includes(normalizeRepoPath(profile) || profile)) {
                  errors.add(`${mapPath}: rule ${rule.id} alloy ${probe.name} pins an outcome for ${profile}, which is not one of its sources`);
                }
              }
            }
          }
        }
      }

      // TLA+ names resolve to a definition in the model or a cfg entry.
      if (rule.tla && typeof rule.tla === 'object') {
        const models = [...new Set([...listPaths(rule.tla.model), ...listPaths(rule.tla.inherited_model), ...tlaSources, ...(rule.tla.inherited_model ? dependencySources.tla : [])])];
        const corpus = corpusFor(models);
        for (const key of ['invariants', 'properties', 'preserved_invariants']) {
          for (const ref of rule.tla[key] || []) {
            const probe = probeName(ref);
            if (!probe) continue;
            tlaCount += 1;
            if (corpus.length === 0) {
              if (models.length === 0) errors.add(`${mapPath}: rule ${rule.id} names tla ${key} but neither the rule nor tooling.tla declares a model`);
              continue;
            }
            const declared = corpus.some(([source, text]) => (/\.cfg$/i.test(source) ? TLA_CFG(probe.name) : TLA_DEF(probe.name)).test(text));
            if (!declared) {
              errors.add(`${mapPath}: rule ${rule.id} tla ${key.replace(/s$/, '').replace('propertie', 'property')} ${probe.name} is not declared in ${models.join(', ')}`);
            }
          }
        }
      }

      // Vectors name the rule back (reciprocity, like x-rules on contracts).
      for (const [key, value] of Object.entries(rule)) {
        if (!/^[a-z][a-z0-9]*_vectors$/.test(key)) continue;
        for (const declared of listPaths(value)) {
          for (const file of filesUnder(repoRoot, declared)) {
            if (!/\.json$/i.test(file)) continue;
            const text = readText(repoRoot, file);
            if (text === null) continue;
            let vector;
            try { vector = JSON.parse(text); } catch (error) {
              errors.add(`${file}: vector cannot be parsed as JSON: ${error.message}`);
              continue;
            }
            vectorCount += 1;
            const rules = vector?._meta?.rules;
            if (key !== 'conformance_vectors') continue; // other corpora may be shared across rules
            if (!Array.isArray(rules)) {
              warnings.add(`${file}: conformance vector has no _meta.rules; it should name ${rule.id} (replayed by ${mapPath})`);
            } else if (!rules.includes(rule.id)) {
              errors.add(`${file}: _meta.rules must name ${rule.id} (replayed by ${mapPath})`);
            }
          }
        }
      }

      // Mutation probes name the evidence that caught them.
      for (const probe of rule.mutation_probes || []) {
        if (!probe || typeof probe !== 'object') continue;
        for (const target of listPaths(probe.detected_by)) {
          if (/[\/.]/.test(target) && !fs.existsSync(path.join(repoRoot, target))) {
            errors.add(`${mapPath}: rule ${rule.id} mutation probe ${probe.id || probe.mutation} is detected by missing path ${target}`);
          }
        }
      }
    }
  }

  info.push(`Validated ${alloyCount} alloy command(s), ${tlaCount} tla name(s), ${vectorCount} vector file(s)`);
  return { errors: [...errors], warnings: [...warnings], info };
}

module.exports = { validateFormalEvidence };
