'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { moduleRoots, normalizeRepoPath } = require('./modules');

const COMMON_ROOTS = ['test', 'tests', 'src', 'alloy', 'scripts', 'certification', 'docs', '.github', 'evals'];
const NARRATIVE_KEYS = new Set([
  'statement',
  'note',
  'description',
  'command',
  'escalation_rule',
  'formal_reasoning',
  'integration_statement',
  'classification',
  'status',
]);
const SELECTOR_KEYS = new Set(['selector', 'selectors', 'integration_selectors']);

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function candidateRoots(manifest) {
  return [...new Set([...moduleRoots(manifest), ...COMMON_ROOTS])]
    .map((root) => root.replace(/\/+$/, ''))
    .sort((a, b) => b.length - a.length);
}

function normalizeCandidate(value, roots) {
  if (typeof value !== 'string' || /\s/.test(value)) return null;
  const withoutFragment = value.split('#', 1)[0].replace(/[),.;]+$/, '');
  if (!roots.some((root) => withoutFragment === root || withoutFragment.startsWith(`${root}/`))) {
    return null;
  }
  return normalizeRepoPath(withoutFragment);
}

function collectRepoPaths(value, roots, options = {}, found = new Set()) {
  if (typeof value === 'string') {
    const candidate = normalizeCandidate(value, roots);
    if (candidate) found.add(candidate);
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRepoPaths(item, roots, options, found);
    return found;
  }
  if (!value || typeof value !== 'object') return found;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'planned_evidence' || NARRATIVE_KEYS.has(key) || SELECTOR_KEYS.has(key)) continue;
    const keyCandidate = key.includes('/') ? normalizeCandidate(key, roots) : null;
    if (keyCandidate) found.add(keyCandidate);
    collectRepoPaths(child, roots, options, found);
  }
  return found;
}

function collectLegacySelectors(value, selectors = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectLegacySelectors(item, selectors);
    return selectors;
  }
  if (!value || typeof value !== 'object') return selectors;

  for (const [key, child] of Object.entries(value)) {
    if (key === 'planned_evidence') continue;
    if (SELECTOR_KEYS.has(key)) {
      const values = Array.isArray(child) ? child : [child];
      for (const selector of values) {
        if (typeof selector === 'string' && selector.length > 0) selectors.add(selector);
      }
      continue;
    }
    collectLegacySelectors(child, selectors);
  }
  return selectors;
}

function filesUnder(repoRoot, relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [absolute];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(repoRoot, toPosix(path.relative(repoRoot, child))));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function parseStructuredFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.json')) return JSON.parse(text);
  if (/\.ya?ml$/i.test(filePath)) return yaml.load(text);
  return null;
}

function contractRoots(manifest) {
  return moduleRoots(manifest).map((root) => `${root}/contracts/`);
}

function isContractPath(relativePath, roots) {
  return roots.some((root) => relativePath.startsWith(root))
    && /\.(?:schema\.json|json|ya?ml)$/i.test(relativePath);
}

function findStructuredContracts(repoRoot, roots) {
  const files = [];
  for (const root of roots) {
    const dir = path.join(repoRoot, root, 'contracts');
    if (!fs.existsSync(dir)) continue;
    for (const file of filesUnder(repoRoot, `${root}/contracts`)) {
      if (/\.(?:json|ya?ml)$/i.test(file)) files.push(file);
    }
  }
  return files;
}

function bindingLists(rule) {
  return [
    ...(rule.current_evidence?.bindings || []),
    ...(rule.evidence?.bindings || []),
  ];
}

function validateEvidenceBindings({ repoRoot, manifest, maps, ruleIds }) {
  const errors = new Set();
  const warnings = new Set();
  const roots = candidateRoots(manifest);
  const contractsRoots = contractRoots(manifest);
  let bindingCount = 0;
  let contractCount = 0;

  for (const [mapPath, entry] of maps) {
    const topLevel = { ...entry.document };
    delete topLevel.rules;
    delete topLevel.evidence_plan;
    const topRefs = collectRepoPaths(topLevel, roots);
    for (const ref of topRefs) {
      if (!fs.existsSync(path.join(repoRoot, ref))) {
        errors.add(`${mapPath}: referenced path ${ref} does not exist`);
      }
    }

    let usesLegacySelectors = false;
    for (const rule of entry.document.rules) {
      const refs = collectRepoPaths(rule, roots);
      for (const ref of refs) {
        if (!fs.existsSync(path.join(repoRoot, ref))) {
          errors.add(`${mapPath}: rule ${rule.id} references missing path ${ref}`);
        }
      }

      const bindings = bindingLists(rule);
      bindingCount += bindings.length;
      for (const binding of bindings) {
        const corpusFiles = binding.files.flatMap((file) => filesUnder(repoRoot, file));
        if (corpusFiles.length === 0) {
          errors.add(`${mapPath}: rule ${rule.id} binding declares no readable evidence files`);
          continue;
        }
        const corpus = corpusFiles.map((file) => fs.readFileSync(file, 'utf8'));
        for (const selector of binding.selectors) {
          if (!corpus.some((content) => content.includes(selector))) {
            errors.add(`${mapPath}: rule ${rule.id} selector ${selector} matches none of its bound files`);
          }
        }
      }

      const legacySelectors = collectLegacySelectors({
        current_evidence: rule.current_evidence,
        evidence: rule.evidence,
      });
      if (legacySelectors.size > 0 && bindings.length === 0) {
        usesLegacySelectors = true;
        const corpusFiles = [...refs, ...topRefs].flatMap((ref) => filesUnder(repoRoot, ref));
        if (corpusFiles.length === 0) {
          errors.add(`${mapPath}: rule ${rule.id} declares selectors but no evidence files`);
        } else {
          const corpus = corpusFiles.map((file) => fs.readFileSync(file, 'utf8'));
          for (const selector of legacySelectors) {
            if (!corpus.some((content) => content.includes(selector))) {
              errors.add(`${mapPath}: rule ${rule.id} selector ${selector} matches none of its declared evidence`);
            }
          }
        }
      }

      for (const ref of refs) {
        if (!isContractPath(ref, contractsRoots) || !fs.existsSync(path.join(repoRoot, ref))) continue;
        let contract;
        try {
          contract = parseStructuredFile(path.join(repoRoot, ref));
        } catch (error) {
          errors.add(`${ref}: cannot parse structured contract: ${error.message}`);
          continue;
        }
        const xRules = contract?.['x-rules'];
        const requiresBinding = ref.endsWith('.schema.json') || xRules !== undefined;
        if (!requiresBinding) continue;
        if (!Array.isArray(xRules)) {
          errors.add(`${ref}: x-rules must be an array naming ${rule.id}`);
        } else if (!xRules.includes(rule.id)) {
          errors.add(`${ref}: x-rules must name ${rule.id} (bound by ${mapPath})`);
        }
      }
    }

    if (usesLegacySelectors) {
      warnings.add(`${mapPath}: selector/selector(s) fields are legacy-compatible; migrate current evidence to bindings`);
    }
  }

  for (const filePath of findStructuredContracts(repoRoot, moduleRoots(manifest))) {
    let contract;
    try {
      contract = parseStructuredFile(filePath);
    } catch {
      continue;
    }
    if (contract?.['x-rules'] === undefined) continue;
    const relative = toPosix(path.relative(repoRoot, filePath));
    const xRules = contract['x-rules'];
    contractCount += 1;
    if (!Array.isArray(xRules) || xRules.some((id) => typeof id !== 'string')) {
      errors.add(`${relative}: x-rules must be an array of rule IDs`);
      continue;
    }
    for (const id of xRules) {
      if (!ruleIds.has(id)) {
        errors.add(`${relative}: x-rules names ${id}, which no verification map mentions`);
      }
    }
  }

  return {
    errors: [...errors],
    warnings: [...warnings],
    info: [`Validated ${bindingCount} explicit evidence binding(s) and ${contractCount} x-rules contract(s)`],
  };
}

module.exports = {
  collectLegacySelectors,
  collectRepoPaths,
  validateEvidenceBindings,
};
