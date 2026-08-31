'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { digestJsonFile } = require('./contract-digests');
const { moduleRoots, normalizeRepoPath, validateModulesDocument } = require('./modules');

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const RULE_FAMILY_PATTERN = /^[A-Z][A-Z0-9]*$/;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relative(repoRoot, absolute) {
  return toPosix(path.relative(repoRoot, absolute));
}

function manifestPath(repoRoot) {
  return path.join(repoRoot, 'specs', 'modules.yaml');
}

function readYaml(filePath, label, errors) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`${label}: invalid YAML: ${error.message}`);
    return null;
  }
}

function readManifest(repoRoot, errors) {
  const filePath = manifestPath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return { path: filePath, raw: 'version: 1\nmodules:\n', document: { version: 1, modules: {} }, exists: false };
  }
  const document = readYaml(filePath, relative(repoRoot, filePath), errors);
  if (!document || document.version !== 1 || !document.modules || typeof document.modules !== 'object') {
    errors.push(`${relative(repoRoot, filePath)}: expected version: 1 and a modules mapping`);
    return null;
  }
  return { path: filePath, raw: fs.readFileSync(filePath, 'utf8'), document, exists: true };
}

function moduleRootOf(module) {
  return normalizeRepoPath(module.root || 'specs');
}

function capabilityId(capabilityPath) {
  return path.posix.basename(capabilityPath).replace(/\.capability\.ya?ml$/i, '');
}

function capabilityPath(root, capability) {
  return `${root}/capabilities/${capability}.capability.yaml`;
}

function verificationPath(root, capability) {
  return `${root}/verification/${capability}/verification.yaml`;
}

function capabilityTemplate(capability, description) {
  return [
    `id: ${capability}`,
    'type: capability',
    `description: ${JSON.stringify(description || `TODO: define the ${capability} capability`)}`,
    'scope:',
    '  personas: []',
    '  journeys: []',
    '  stories: []',
    '  features: []',
    '  models: []',
    '  contracts: []',
    '  fixtures: []',
    '  journey_maps: []',
    '',
  ].join('\n');
}

function verificationTemplate(capability, capabilityFile) {
  return [
    `id: ${capability}-verification`,
    'type: verification',
    `capability: ${capabilityFile}`,
    'status: planned',
    'depends_on: []',
    'rules: []',
    '',
    'evidence:',
    '  classification:',
    '    intent: exploratory',
    '    verification: not-verified',
    '    certification: not-certified',
    '    production: not-ready',
    '  gaps:',
    '    - Rule inventory and executable evidence are not declared yet.',
    '',
  ].join('\n');
}

function moduleBlock(name, record) {
  return [
    `  ${name}:`,
    `    root: ${record.root}`,
    '    capabilities:',
    ...record.capabilities.map((item) => `      - ${item}`),
    '    rule_families: []',
    '    depends_on: []',
    '',
  ].join('\n');
}

function appendModule(raw, name, record) {
  const suffix = raw.endsWith('\n') ? '' : '\n';
  return `${raw}${suffix}${moduleBlock(name, record)}`;
}

function moduleBounds(lines, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = lines.findIndex((line) => new RegExp(`^  ${escaped}:\\s*$`).test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^  [a-z][a-z0-9-]*:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function flowList(values) {
  return `[${values.join(', ')}]`;
}

function addDependencyToManifest(raw, moduleName, dependency) {
  const lines = raw.split('\n');
  const bounds = moduleBounds(lines, moduleName);
  if (!bounds) return raw;
  const keyIndex = lines.findIndex((line, index) => index > bounds.start && index < bounds.end && /^    depends_on:/.test(line));
  if (keyIndex >= 0) {
    const existing = lines[keyIndex].replace(/^    depends_on:\s*/, '').trim();
    if (existing.startsWith('[')) {
      const values = existing.slice(1, -1).split(',').map((value) => value.trim()).filter(Boolean);
      if (!values.includes(dependency)) values.push(dependency);
      lines[keyIndex] = `    depends_on: ${flowList(values)}`;
    } else if (existing === '') {
      lines.splice(keyIndex + 1, 0, `      - ${dependency}`);
    } else {
      let insertAt = keyIndex + 1;
      while (insertAt < bounds.end && /^      - /.test(lines[insertAt])) insertAt += 1;
      lines.splice(insertAt, 0, `      - ${dependency}`);
    }
  } else {
    lines.splice(bounds.end, 0, '    depends_on:', `      - ${dependency}`);
  }
  return lines.join('\n');
}

function appendContractPin(raw, pin) {
  const lines = raw.split('\n');
  const keyIndex = lines.findIndex((line) => /^contract_pins:/.test(line));
  const rendered = [
    `  - contract: ${pin.contract}`,
    `    canonicalization: ${pin.canonicalization}`,
    `    digest: ${pin.digest}`,
  ];
  if (keyIndex < 0) {
    const prefix = raw.endsWith('\n') ? '' : '\n';
    return `${raw}${prefix}contract_pins:\n${rendered.join('\n')}\n`;
  }
  const current = lines[keyIndex].replace(/^contract_pins:\s*/, '').trim();
  if (current === '[]') {
    lines[keyIndex] = 'contract_pins:';
    lines.splice(keyIndex + 1, 0, ...rendered);
    return lines.join('\n');
  }
  if (current.startsWith('[')) {
    let existing;
    try {
      existing = yaml.load(`contract_pins: ${current}`).contract_pins;
    } catch {
      existing = null;
    }
    if (Array.isArray(existing)) {
      const renderedPins = [...existing, pin].flatMap((item) => [
        `  - contract: ${item.contract}`,
        `    canonicalization: ${item.canonicalization}`,
        `    digest: ${item.digest}`,
      ]);
      lines[keyIndex] = 'contract_pins:';
      lines.splice(keyIndex + 1, 0, ...renderedPins);
      return lines.join('\n');
    }
  }
  let insertAt = keyIndex + 1;
  while (insertAt < lines.length && (lines[insertAt].trim() === '' || /^  - /.test(lines[insertAt]) || /^    /.test(lines[insertAt]))) {
    insertAt += 1;
  }
  lines.splice(insertAt, 0, ...rendered);
  return lines.join('\n');
}

function planDirectory(repoRoot, relativePath, operations, errors) {
  const absolute = path.join(repoRoot, relativePath);
  if (fs.existsSync(absolute)) {
    if (!fs.statSync(absolute).isDirectory()) errors.push(`${relativePath}: expected a directory`);
    return;
  }
  operations.push({ type: 'mkdir', path: absolute, relativePath });
}

function planFile(repoRoot, relativePath, content, operations, errors) {
  const absolute = path.join(repoRoot, relativePath);
  if (fs.existsSync(absolute)) {
    if (fs.statSync(absolute).isDirectory()) errors.push(`${relativePath}: expected a file`);
    else operations.push({ type: 'skip', path: absolute, relativePath });
    return;
  }
  operations.push({ type: 'write', path: absolute, relativePath, content });
}

function applyOperations(operations) {
  for (const operation of operations) {
    if (operation.type === 'mkdir') fs.mkdirSync(operation.path, { recursive: true });
    else if (operation.type === 'write') {
      fs.mkdirSync(path.dirname(operation.path), { recursive: true });
      fs.writeFileSync(operation.path, operation.content);
    }
  }
}

function createModule(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const name = options.name;
  const capability = options.capability || name;
  const root = normalizeRepoPath(options.root || 'specs');
  const errors = [];
  const warnings = [];
  const operations = [];

  if (!NAME_PATTERN.test(name || '')) errors.push(`module name must match ${NAME_PATTERN}`);
  if (!NAME_PATTERN.test(capability || '')) errors.push(`capability name must match ${NAME_PATTERN}`);
  if (!root) errors.push(`module root must be a repository-relative path: ${JSON.stringify(options.root || 'specs')}`);
  if (errors.length > 0) return { errors, warnings, actions: [], created: [], skipped: [] };

  const manifest = readManifest(repoRoot, errors);
  if (!manifest) return { errors, warnings, actions: [], created: [], skipped: [] };

  const existing = manifest.document.modules[name];
  const capabilityFile = capabilityPath(root, capability);
  if (existing) {
    const same = moduleRootOf(existing) === root
      && existing.capabilities?.length === 1
      && existing.capabilities[0] === capabilityFile;
    if (same) {
      return {
        errors: [],
        warnings: ['module already exists; create is idempotent and made no changes'],
        actions: [],
        created: [],
        skipped: [name],
      };
    }
    errors.push(`module ${name} already exists with a different root or capability; no files were changed`);
    return { errors, warnings, actions: [], created: [], skipped: [] };
  }

  for (const [otherName, other] of Object.entries(manifest.document.modules)) {
    if ((other.capabilities || []).includes(capabilityFile)) {
      errors.push(`${capabilityFile} is already assigned to module ${otherName}`);
    }
  }
  if (errors.length > 0) return { errors, warnings, actions: [], created: [], skipped: [] };

  const record = { root, capabilities: [capabilityFile] };
  const directories = [
    `${root}/capabilities`,
    `${root}/models/${capability}`,
    `${root}/features/${capability}`,
    `${root}/contracts/openapi/${capability}`,
    `${root}/contracts/asyncapi/${capability}`,
    `${root}/contracts/json-rpc/${capability}`,
    `${root}/fixtures/${capability}`,
    `${root}/verification/${capability}`,
  ];
  for (const directory of directories) planDirectory(repoRoot, directory, operations, errors);
  for (const directory of directories.slice(1, -1)) {
    planFile(repoRoot, `${directory}/.gitkeep`, '', operations, errors);
  }
  planFile(repoRoot, capabilityFile, capabilityTemplate(capability, options.description), operations, errors);
  planFile(
    repoRoot,
    verificationPath(root, capability),
    verificationTemplate(capability, capabilityFile),
    operations,
    errors,
  );

  const nextManifest = appendModule(manifest.raw, name, record);
  if (!manifest.exists) planFile(repoRoot, relative(repoRoot, manifest.path), nextManifest, operations, errors);
  else operations.push({ type: 'write', path: manifest.path, relativePath: relative(repoRoot, manifest.path), content: nextManifest });

  if (errors.length > 0) return { errors, warnings, actions: [], created: [], skipped: [] };
  if (!options.dryRun) applyOperations(operations);
  const created = operations.filter((operation) => operation.type === 'mkdir' || operation.type === 'write').map((operation) => operation.relativePath);
  const skipped = operations.filter((operation) => operation.type === 'skip').map((operation) => operation.relativePath);
  return { errors, warnings, actions: operations.map((operation) => ({ action: operation.type, path: operation.relativePath })), created, skipped };
}

function moduleDependencyClosure(modules, name) {
  const seen = new Set();
  const pending = [...(modules[name]?.depends_on || [])];
  while (pending.length > 0) {
    const dependency = pending.pop();
    if (seen.has(dependency) || !modules[dependency]) continue;
    seen.add(dependency);
    pending.push(...(modules[dependency].depends_on || []));
  }
  return seen;
}

function resolveCapability(module, value) {
  if (value && module.capabilities.includes(value)) return value;
  if (value) {
    const root = moduleRootOf(module);
    const candidate = `${root}/capabilities/${value.replace(/\.capability\.ya?ml$/i, '')}.capability.yaml`;
    if (module.capabilities.includes(candidate)) return candidate;
  }
  if (module.capabilities.length === 1) return module.capabilities[0];
  return null;
}

function contractOwners(repoRoot, modules) {
  const owners = new Map();
  const errors = [];
  for (const [moduleName, module] of Object.entries(modules)) {
    for (const capabilityPath of module.capabilities || []) {
      const filePath = path.join(repoRoot, capabilityPath);
      if (!fs.existsSync(filePath)) continue;
      const capability = readYaml(filePath, capabilityPath, errors);
      for (const contract of capability?.scope?.contracts || []) {
        const normalized = normalizeRepoPath(contract);
        if (!normalized) continue;
        const set = owners.get(normalized) || new Set();
        set.add(moduleName);
        owners.set(normalized, set);
      }
    }
  }
  return { owners, errors };
}

function linkModule(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const errors = [];
  const warnings = [];
  const actions = [];
  const manifest = readManifest(repoRoot, errors);
  if (!manifest) return { errors, warnings, actions };
  const module = manifest.document.modules[options.name];
  if (!module) errors.push(`unknown module ${options.name}`);
  if (options.dependency && !manifest.document.modules[options.dependency]) errors.push(`unknown dependency module ${options.dependency}`);
  if (options.dependency && options.dependency === options.name) errors.push('a module cannot depend on itself');
  if (!options.dependency && !options.contract) errors.push('provide --depends-on <module> and/or --contract <path>');
  if (errors.length > 0) return { errors, warnings, actions };

  const candidate = JSON.parse(JSON.stringify(manifest.document));
  if (options.dependency && !candidate.modules[options.name].depends_on.includes(options.dependency)) {
    candidate.modules[options.name].depends_on.push(options.dependency);
    actions.push({ action: 'update', path: relative(repoRoot, manifest.path), detail: `add dependency ${options.dependency}` });
  } else if (options.dependency) {
    warnings.push(`dependency ${options.dependency} already exists; link is idempotent`);
  }
  const moduleCheck = validateModulesDocument(candidate, { repoRoot, label: relative(repoRoot, manifest.path) });
  if (moduleCheck.errors.length > 0) {
    errors.push(...moduleCheck.errors);
    return { errors, warnings, actions: [] };
  }

  let mapUpdate = null;
  if (options.contract) {
    const capabilityPath = resolveCapability(module, options.capability);
    if (!capabilityPath) errors.push(`select --capability because module ${options.name} owns more than one capability`);
    const contract = normalizeRepoPath(options.contract);
    if (!contract || !/\.schema\.json$/i.test(contract)) errors.push('--contract must be a repository-relative .schema.json path');
    if (contract && !fs.existsSync(path.join(repoRoot, contract))) errors.push(`contract does not exist: ${contract}`);
    if (errors.length > 0) return { errors, warnings, actions: [] };

    const ownership = contractOwners(repoRoot, candidate.modules);
    errors.push(...ownership.errors);
    const owners = ownership.owners.get(contract) || new Set();
    const allowed = moduleDependencyClosure(candidate.modules, options.name);
    const owner = [...owners].find((name) => name !== options.name && allowed.has(name));
    if (!owner) errors.push(`${contract} must be listed in a capability scope owned by a declared dependency module`);

    const mapRelative = verificationPath(moduleRootOf(module), capabilityId(capabilityPath));
    const mapFile = path.join(repoRoot, mapRelative);
    if (!fs.existsSync(mapFile)) errors.push(`verification map does not exist: ${mapRelative}`);
    if (errors.length > 0) return { errors, warnings, actions: [] };

    const map = readYaml(mapFile, mapRelative, errors);
    if (!map) return { errors, warnings, actions: [] };
    let digest;
    try {
      digest = digestJsonFile(path.join(repoRoot, contract));
    } catch (error) {
      errors.push(`${contract}: cannot compute JCS digest: ${error.message}`);
      return { errors, warnings, actions: [] };
    }
    const pins = map.contract_pins || [];
    const existingPin = pins.find((pin) => pin.contract === contract);
    if (existingPin && existingPin.digest === digest && existingPin.canonicalization === 'jcs-sha256@1') {
      warnings.push(`contract pin already matches ${contract}; link is idempotent`);
    } else if (existingPin && !options.update) {
      errors.push(`${mapRelative}: pin for ${contract} differs; pass --update to replace it`);
    } else {
      const pin = { contract, canonicalization: 'jcs-sha256@1', digest };
      if (existingPin) {
        Object.assign(existingPin, pin);
        mapUpdate = { path: mapFile, relativePath: mapRelative, content: `${yaml.dump(map, { lineWidth: -1 })}` };
      } else {
        mapUpdate = { path: mapFile, relativePath: mapRelative, content: appendContractPin(fs.readFileSync(mapFile, 'utf8'), pin) };
      }
      actions.push({ action: 'update', path: mapRelative, detail: `pin ${contract} at ${digest}` });
    }
  }

  const manifestChanged = actions.some((action) => action.path === relative(repoRoot, manifest.path));
  const manifestUpdate = manifestChanged
    ? { path: manifest.path, relativePath: relative(repoRoot, manifest.path), content: addDependencyToManifest(manifest.raw, options.name, options.dependency) }
    : null;
  if (errors.length > 0) return { errors, warnings, actions: [] };
  if (!options.dryRun) {
    if (manifestUpdate) fs.writeFileSync(manifestUpdate.path, manifestUpdate.content);
    if (mapUpdate) fs.writeFileSync(mapUpdate.path, mapUpdate.content);
  }
  return { errors, warnings, actions };
}

function statusModules(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const errors = [];
  const manifest = readManifest(repoRoot, errors);
  if (!manifest) return { errors, modules: [], roots: [] };
  const modules = Object.entries(manifest.document.modules).map(([name, module]) => {
    const root = moduleRootOf(module);
    return {
      name,
      root,
      capabilities: module.capabilities || [],
      rule_families: module.rule_families || [],
      depends_on: module.depends_on || [],
      verification_maps: (module.capabilities || []).map((capability) => verificationPath(root, capabilityId(capability))),
    };
  });
  return { errors, modules, roots: moduleRoots(manifest.document) };
}

module.exports = {
  createModule,
  linkModule,
  statusModules,
};
