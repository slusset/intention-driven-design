'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getValidator, formatAjvErrors } = require('./schema-loader');

const CAPABILITY_PATTERN = /\.capability\.ya?ml$/i;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizeRepoPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return null;
  if (path.posix.isAbsolute(value)) return null;
  const normalized = path.posix.normalize(value).replace(/\/+$/, '');
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function findCapabilityFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findCapabilityFiles(full));
    else if (CAPABILITY_PATTERN.test(entry.name)) files.push(full);
  }
  return files;
}

function moduleRoots(manifest) {
  const roots = new Set(['specs']);
  for (const module of Object.values(manifest.modules || {})) {
    const root = normalizeRepoPath(module.root || 'specs');
    if (root) roots.add(root);
  }
  return [...roots].sort();
}

function dependencyCycleProblems(modules, label) {
  const problems = [];
  const state = new Map();
  const reported = new Set();

  function visit(name, trail) {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      const start = trail.indexOf(name);
      const cycle = [...trail.slice(start), name];
      const key = [...new Set(cycle)].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        problems.push(`${label}: dependency cycle: ${cycle.join(' -> ')}`);
      }
      return;
    }

    state.set(name, 'visiting');
    const dependencies = modules[name].depends_on || [];
    for (const dependency of dependencies) {
      if (modules[dependency]) visit(dependency, [...trail, name]);
    }
    state.set(name, 'done');
  }

  for (const name of Object.keys(modules)) visit(name, []);
  return problems;
}

function validateModulesDocument(manifest, options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const label = options.label || 'specs/modules.yaml';
  const results = { errors: [], warnings: [], info: [] };

  const schemaCheck = getValidator('modules')(manifest);
  if (!schemaCheck.valid) {
    for (const message of formatAjvErrors(schemaCheck.errors)) {
      results.errors.push(`${label}: schema: ${message}`);
    }
    return results;
  }

  const modules = manifest.modules;
  const assignments = new Map();
  const familyOwners = new Map();
  const validRoots = new Set(['specs']);

  for (const [name, module] of Object.entries(modules)) {
    const root = normalizeRepoPath(module.root || 'specs');
    if (!root) {
      results.errors.push(`${label}: module ${name} has invalid root ${JSON.stringify(module.root)}`);
      continue;
    }
    validRoots.add(root);

    const rootPath = path.join(repoRoot, root);
    if (!fs.existsSync(rootPath) || !fs.statSync(rootPath).isDirectory()) {
      results.errors.push(`${label}: module ${name} root does not exist: ${root}`);
    }

    const capabilityPrefix = `${root}/capabilities/`;
    for (const declaredPath of module.capabilities) {
      const capability = normalizeRepoPath(declaredPath);
      if (!capability) {
        results.errors.push(`${label}: module ${name} has invalid capability path ${JSON.stringify(declaredPath)}`);
        continue;
      }
      if (!capability.startsWith(capabilityPrefix)) {
        results.errors.push(`${label}: module ${name} capability ${capability} must be under ${capabilityPrefix}`);
      }
      if (!fs.existsSync(path.join(repoRoot, capability))) {
        results.errors.push(`${label}: module ${name} lists missing capability ${capability}`);
      }
      if (assignments.has(capability)) {
        results.errors.push(`${label}: ${capability} assigned to both ${assignments.get(capability)} and ${name}`);
      } else {
        assignments.set(capability, name);
      }
    }

    for (const family of module.rule_families) {
      if (familyOwners.has(family)) {
        results.errors.push(`${label}: rule family ${family} owned by both ${familyOwners.get(family)} and ${name}`);
      } else {
        familyOwners.set(family, name);
      }
    }

    for (const dependency of module.depends_on) {
      if (!modules[dependency]) {
        results.errors.push(`${label}: module ${name} depends on unknown module ${dependency}`);
      }
    }
  }

  for (const root of [...validRoots].sort()) {
    const capabilitiesDir = path.join(repoRoot, root, 'capabilities');
    for (const capabilityFile of findCapabilityFiles(capabilitiesDir)) {
      const capability = toPosix(path.relative(repoRoot, capabilityFile));
      if (!assignments.has(capability)) {
        results.errors.push(`${label}: ${capability} is not assigned to any module`);
      }
    }
  }

  results.errors.push(...dependencyCycleProblems(modules, label));

  if (results.errors.length === 0) {
    results.info.push(
      `${label}: ${Object.keys(modules).length} module(s), ${assignments.size} capability assignment(s), roots: ${moduleRoots(manifest).join(', ')}`,
    );
  }
  return results;
}

function validateModulesFile(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const manifestPath = options.manifestPath || path.join(repoRoot, 'specs', 'modules.yaml');
  const label = toPosix(path.relative(repoRoot, manifestPath));

  if (!fs.existsSync(manifestPath)) {
    return {
      errors: [],
      warnings: [],
      info: [`${label}: not present — module validation skipped`],
    };
  }

  let manifest;
  try {
    manifest = yaml.load(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return { errors: [`${label}: invalid YAML: ${error.message}`], warnings: [], info: [] };
  }

  return validateModulesDocument(manifest, { repoRoot, label });
}

module.exports = {
  moduleRoots,
  normalizeRepoPath,
  validateModulesDocument,
  validateModulesFile,
};
