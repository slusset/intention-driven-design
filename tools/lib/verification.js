'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getValidator, formatAjvErrors } = require('./schema-loader');
const { missingModuleManifestResult, moduleRoots, normalizeRepoPath, validateModulesDocument } = require('./modules');
const { validateEvidenceBindings } = require('./evidence-bindings');
const { validateFormalEvidence } = require('./formal-evidence');
const { digestJsonFile } = require('./contract-digests');

const CLASSIFICATION_RANKS = {
  verification: new Map([
    ['not-verified', 0],
    ['locally-verified', 1],
    ['verified', 2],
  ]),
  certification: new Map([
    ['not-certified', 0],
    ['locally-certified', 1],
    ['certified', 2],
  ]),
};

// Free-text citations require the descriptive rule slug. Structured rule IDs
// (rules[].id and inherits[]) are validated separately. Requiring the slug
// prevents algorithm/encoding names such as SHA-256 and UTF-8 from being
// mistaken for multi-letter rule families.
const RULE_ID_PATTERN = /\b([A-Z][A-Z0-9]*)-[0-9]+-[a-z][a-z0-9]*(?:-[a-z0-9]+)*\b/g;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function capabilityId(capabilityPath) {
  return path.posix.basename(capabilityPath).replace(/\.capability\.ya?ml$/i, '');
}

function expectedVerificationPath(capabilityPath, module) {
  const root = normalizeRepoPath(module.root || 'specs');
  return `${root}/verification/${capabilityId(capabilityPath)}/verification.yaml`;
}

function findVerificationMaps(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findVerificationMaps(full));
    else if (/^verification\.ya?ml$/i.test(entry.name)) files.push(full);
  }
  return files;
}

function transitiveDependencies(modules, name) {
  const seen = new Set();
  const pending = [...(modules[name].depends_on || [])];
  while (pending.length > 0) {
    const dependency = pending.pop();
    if (seen.has(dependency) || !modules[dependency]) continue;
    seen.add(dependency);
    pending.push(...(modules[dependency].depends_on || []));
  }
  return seen;
}

function classificationOf(map) {
  return map.evidence?.classification || map.evidence_plan?.classification || null;
}

function ruleFamily(ruleId) {
  return typeof ruleId === 'string' ? ruleId.split('-', 1)[0] : null;
}

function citedFamilies(text) {
  return new Set([...text.matchAll(RULE_ID_PATTERN)].map((match) => match[1]));
}

function parseYamlFile(filePath, label, results) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    results.errors.push(`${label}: invalid YAML: ${error.message}`);
    return null;
  }
}

function validateVerificationFile(options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const manifestPath = options.manifestPath || path.join(repoRoot, 'specs', 'modules.yaml');
  const results = { errors: [], warnings: [], info: [] };
  const manifestLabel = toPosix(path.relative(repoRoot, manifestPath));

  if (!fs.existsSync(manifestPath)) {
    return missingModuleManifestResult(repoRoot, manifestPath, 'verification-map');
  }

  const manifest = parseYamlFile(manifestPath, manifestLabel, results);
  if (!manifest) return results;

  const moduleResults = validateModulesDocument(manifest, { repoRoot, label: manifestLabel });
  if (moduleResults.errors.length > 0) {
    results.errors.push(...moduleResults.errors);
    return results;
  }

  const modules = manifest.modules;
  const assignments = new Map();
  const familyOwners = new Map();
  const expectedPaths = new Map();
  const reachability = new Map();

  for (const [moduleName, module] of Object.entries(modules)) {
    reachability.set(moduleName, transitiveDependencies(modules, moduleName));
    for (const family of module.rule_families) familyOwners.set(family, moduleName);
    for (const capability of module.capabilities) {
      const normalized = normalizeRepoPath(capability);
      assignments.set(normalized, moduleName);
      expectedPaths.set(expectedVerificationPath(normalized, module), {
        capability: normalized,
        moduleName,
      });
    }
  }

  const discovered = new Set();
  for (const root of moduleRoots(manifest)) {
    for (const file of findVerificationMaps(path.join(repoRoot, root, 'verification'))) {
      discovered.add(toPosix(path.relative(repoRoot, file)));
    }
  }

  for (const expectedPath of expectedPaths.keys()) {
    if (!discovered.has(expectedPath)) {
      const expected = expectedPaths.get(expectedPath);
      results.errors.push(
        `${expectedPath}: missing verification map for ${expected.capability} in module ${expected.moduleName}`,
      );
    }
  }

  const maps = new Map();
  const ruleIds = new Set();
  for (const mapPath of [...discovered].sort()) {
    const filePath = path.join(repoRoot, mapPath);
    const document = parseYamlFile(filePath, mapPath, results);
    if (!document) continue;

    const schemaCheck = getValidator('verification-map')(document);
    if (!schemaCheck.valid) {
      for (const message of formatAjvErrors(schemaCheck.errors)) {
        results.errors.push(`${mapPath}: schema: ${message}`);
      }
      continue;
    }

    const expected = expectedPaths.get(mapPath);
    if (!expected) {
      results.errors.push(`${mapPath}: verification map is not the declared map for any module capability`);
      continue;
    }
    if (document.capability !== expected.capability) {
      results.errors.push(
        `${mapPath}: capability is ${document.capability}; expected ${expected.capability}`,
      );
    }
    if (document.evidence_plan?.classification) {
      results.warnings.push(
        `${mapPath}: evidence_plan.classification is legacy-compatible; move it to evidence.classification`,
      );
    }
    if (!Object.hasOwn(document, 'depends_on')) {
      results.warnings.push(`${mapPath}: add explicit depends_on: [] when this map has no dependencies`);
    }
    if (document.rules.length === 0) {
      results.warnings.push(`${mapPath}: no rules declared yet; add the module rule inventory before claiming verification`);
    }

    const module = modules[expected.moduleName];
    const allowedModules = new Set([
      expected.moduleName,
      ...(reachability.get(expected.moduleName) || []),
    ]);
    const localRuleIds = new Set();

    for (const rule of document.rules) {
      if (localRuleIds.has(rule.id)) {
        results.errors.push(`${mapPath}: rule ${rule.id} is listed more than once`);
      }
      localRuleIds.add(rule.id);
      const family = ruleFamily(rule.id);
      const owner = familyOwners.get(family);
      if (!owner) {
        results.errors.push(`${mapPath}: rule ${rule.id} uses family ${family}, which no module owns`);
      } else if (!allowedModules.has(owner)) {
        results.errors.push(
          `${mapPath}: module ${expected.moduleName} includes ${rule.id} from ${owner}, outside its dependency DAG`,
        );
      }
      ruleIds.add(rule.id);

      const sourceRoot = owner && modules[owner]
        ? normalizeRepoPath(modules[owner].root || 'specs')
        : normalizeRepoPath(module.root || 'specs');
      const sourceModelPrefix = `${sourceRoot}/models/`;
      for (const modelPath of rule.source_models) {
        const normalized = normalizeRepoPath(modelPath);
        if (!normalized || !normalized.startsWith(sourceModelPrefix)) {
          results.errors.push(`${mapPath}: rule ${rule.id} source model ${modelPath} must be under ${sourceModelPrefix}`);
        } else if (!fs.existsSync(path.join(repoRoot, normalized))) {
          results.errors.push(`${mapPath}: rule ${rule.id} lists missing source model ${normalized}`);
        }
      }

      for (const inherited of rule.inherits || []) {
        const inheritedFamily = ruleFamily(inherited);
        const inheritedOwner = familyOwners.get(inheritedFamily);
        if (!inheritedOwner) {
          results.errors.push(`${mapPath}: ${rule.id} inherits ${inherited}, whose family has no owner`);
        } else if (!allowedModules.has(inheritedOwner)) {
          results.errors.push(
            `${mapPath}: module ${expected.moduleName} may not inherit ${inherited} from ${inheritedOwner}; it is outside the dependency DAG`,
          );
        }
      }
    }

    maps.set(mapPath, { document, ...expected, allowedModules });
  }

  const contractOwners = new Map();
  for (const expected of expectedPaths.values()) {
    const capability = parseYamlFile(path.join(repoRoot, expected.capability), expected.capability, results);
    if (!capability) continue;
    for (const contract of capability.scope?.contracts || []) {
      const normalized = normalizeRepoPath(contract);
      if (!normalized) continue;
      const owners = contractOwners.get(normalized) || new Set();
      owners.add(expected.moduleName);
      contractOwners.set(normalized, owners);
    }
  }

  for (const [mapPath, entry] of maps) {
    const dependencies = entry.document.depends_on || [];
    for (const dependencyPath of dependencies) {
      const target = maps.get(dependencyPath);
      if (!target) {
        results.errors.push(`${mapPath}: depends_on ${dependencyPath}, which is not a declared capability map`);
        continue;
      }
      if (!entry.allowedModules.has(target.moduleName)) {
        results.errors.push(
          `${mapPath}: module ${entry.moduleName} may not depend on ${target.moduleName}; it is outside the dependency DAG`,
        );
      }

      const ownClassification = classificationOf(entry.document);
      const targetClassification = classificationOf(target.document);
      for (const [field, ranks] of Object.entries(CLASSIFICATION_RANKS)) {
        const ownRank = ranks.get(ownClassification[field]);
        const targetRank = ranks.get(targetClassification[field]);
        if (ownRank > targetRank) {
          results.errors.push(
            `${mapPath}: claims ${field} ${ownClassification[field]} but depends on ${dependencyPath} at ${targetClassification[field]}`,
          );
        }
      }
    }

    const capability = parseYamlFile(path.join(repoRoot, entry.capability), entry.capability, results);
    if (!capability) continue;
    const chainPaths = [
      ...(capability.scope?.models || []),
      ...(capability.scope?.features || []),
    ];
    for (const chainPath of chainPaths) {
      const normalized = normalizeRepoPath(chainPath);
      if (!normalized || !fs.existsSync(path.join(repoRoot, normalized))) continue;
      const text = fs.readFileSync(path.join(repoRoot, normalized), 'utf8');
      for (const family of citedFamilies(text)) {
        const owner = familyOwners.get(family);
        if (!owner) {
          results.errors.push(`${normalized}: cites rule family ${family}, which no module owns`);
        } else if (!entry.allowedModules.has(owner)) {
          results.errors.push(
            `${normalized}: module ${entry.moduleName} cites ${family}-family rules owned by ${owner}, outside its dependency DAG`,
          );
        }
      }
    }
  }

  for (const [mapPath, entry] of maps) {
    const pins = entry.document.contract_pins || [];
    const seenPins = new Set();
    for (const pin of pins) {
      const contract = normalizeRepoPath(pin.contract);
      if (!contract) continue;
      if (seenPins.has(contract)) {
        results.errors.push(`${mapPath}: contract pin repeats ${contract}`);
      }
      seenPins.add(contract);
      if (!fs.existsSync(path.join(repoRoot, contract))) {
        results.errors.push(`${mapPath}: contract pin references missing contract ${contract}`);
        continue;
      }
      const owners = contractOwners.get(contract) || new Set();
      const dependencyOwner = [...owners].find((owner) => owner !== entry.moduleName && entry.allowedModules.has(owner));
      if (!dependencyOwner) {
        results.errors.push(
          `${mapPath}: contract pin ${contract} must target a contract owned by a declared dependency module`,
        );
      }
      let actual;
      try {
        actual = digestJsonFile(path.join(repoRoot, contract));
      } catch (error) {
        results.errors.push(`${mapPath}: contract pin ${contract} cannot be parsed as JSON: ${error.message}`);
        continue;
      }
      if (actual !== pin.digest) {
        results.errors.push(`${mapPath}: contract pin ${contract} expects ${pin.digest}, found ${actual}`);
      }
    }
  }

  const evidenceResults = validateEvidenceBindings({ repoRoot, manifest, maps, ruleIds });
  results.errors.push(...evidenceResults.errors);
  results.warnings.push(...evidenceResults.warnings);
  results.info.push(...evidenceResults.info);

  const formalResults = validateFormalEvidence({ repoRoot, maps });
  results.errors.push(...formalResults.errors);
  results.warnings.push(...formalResults.warnings);
  results.info.push(...formalResults.info);

  if (results.errors.length === 0) {
    results.info.push(
      `Validated ${maps.size} verification map(s), ${ruleIds.size} distinct rule id(s), roots: ${moduleRoots(manifest).join(', ')}`,
    );
  }
  return results;
}

module.exports = {
  CLASSIFICATION_RANKS,
  classificationOf,
  expectedVerificationPath,
  validateVerificationFile,
};
