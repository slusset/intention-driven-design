#!/usr/bin/env node

/**
 * Generate a Mermaid traceability graph from IDD front-matter metadata.
 *
 * Usage:
 *   node tools/graph-generation/generate-spec-graph.js [specs-dir] [--format mermaid|json]
 *
 * Examples:
 *   node tools/graph-generation/generate-spec-graph.js --format mermaid > specs/GRAPH.md
 *   node tools/graph-generation/generate-spec-graph.js examples --format mermaid
 */

const fs = require('fs');
const path = require('path');
const { extractContractOperations, loadContractDocuments } = require('../lib/contracts');
const {
  getExpectedType,
  parseFrontMatter,
  findFiles,
} = require('../lib/parse-front-matter');

const SUPPORTED_FORMATS = new Set(['mermaid', 'json']);
const DEFAULT_FORMAT = 'mermaid';
const NODE_TYPES = new Set([
  'persona',
  'journey',
  'story',
  'feature',
  'model',
  'fixture',
  'journey-map',
  'capability',
  'contract',
]);
function parseArgs(argv) {
  const args = {
    specsDir: null,
    format: DEFAULT_FORMAT,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--format') {
      args.format = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg.startsWith('--format=')) {
      args.format = arg.slice('--format='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!args.specsDir) {
      args.specsDir = path.resolve(arg);
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  if (!args.specsDir) {
    args.specsDir = path.join(process.cwd(), 'specs');
  }

  args.format = String(args.format || DEFAULT_FORMAT).toLowerCase();
  if (!SUPPORTED_FORMATS.has(args.format)) {
    throw new Error(`Unsupported format '${args.format}'. Expected one of: ${Array.from(SUPPORTED_FORMATS).join(', ')}`);
  }

  return args;
}

function printHelp() {
  process.stdout.write([
    'Generate a spec traceability graph from front-matter.',
    '',
    'Usage:',
    '  node tools/graph-generation/generate-spec-graph.js [specs-dir] [--format mermaid|json]',
    '',
    'Options:',
    '  --format <value>   Output format (default: mermaid)',
    '  --help, -h         Show this help text',
    '',
    'Examples:',
    '  node tools/graph-generation/generate-spec-graph.js --format mermaid > specs/GRAPH.md',
    '  node tools/graph-generation/generate-spec-graph.js examples --format mermaid',
    '',
  ].join('\n'));
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

function normalizeRef(ref) {
  if (!ref || typeof ref !== 'string') return null;
  return toPosix(ref.trim().replace(/^\.\//, ''));
}

function inferIdFromPath(filePath) {
  let id = path.basename(filePath);
  id = id.replace(/\.(md|feature|json|yaml|yml)$/i, '');
  id = id.replace(/\.(persona|journey|story|feature|fixture|journey-map|map|capability|model|lifecycle)$/i, '');
  return id;
}

function operationSlug(method, routePath) {
  return `${String(method || '').toUpperCase()}_${String(routePath || '')
    .replace(/^\//, '')
    .replace(/[{}]/g, '')
    .replace(/\//g, '_')
    .replace(/[^A-Za-z0-9_]+/g, '_')}`;
}

function toArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

function normalizeContractSignature(value) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inferLegacyScopedRef(rootPrefix, section, rawValue) {
  const normalized = normalizeRef(rawValue);
  if (!normalized) return null;

  if (rootPrefix && normalized.startsWith(`${rootPrefix}/`)) {
    return normalized;
  }

  if (rootPrefix && normalized.startsWith(`${section}/`)) {
    return `${rootPrefix}/${normalized}`;
  }

  if (normalized.includes('/')) {
    return normalized;
  }

  const withExtension = normalized.endsWith('.md') ? normalized : `${normalized}.md`;
  return rootPrefix ? `${rootPrefix}/${section}/${withExtension}` : `${section}/${withExtension}`;
}

function extractLegacyRefs(record, rootPrefix) {
  const text = String(record.content || '');
  if (!text) return {};

  const prefix = escapeRegExp(rootPrefix);
  const includePrefix = rootPrefix ? `${prefix}\\/` : '';
  const result = {};

  if (record.type === 'journey') {
    const personaMatch = text.match(new RegExp(`[Pp]ersona:\\s*(?:${includePrefix}personas\\/)?([^\\s\\n]+)`));
    if (personaMatch) {
      result.persona = inferLegacyScopedRef(rootPrefix, 'personas', personaMatch[1]);
    }
  }

  if (record.type === 'story') {
    const journeyMatch = text.match(new RegExp(`[Jj]ourney:\\s*(?:${includePrefix}journeys\\/)?([^\\s\\n]+)`));
    if (journeyMatch) {
      result.journey = inferLegacyScopedRef(rootPrefix, 'journeys', journeyMatch[1]);
    }

    const personaMatch = text.match(new RegExp(`[Pp]ersona:\\s*(?:${includePrefix}personas\\/)?([^\\s\\n]+)`));
    if (personaMatch) {
      result.persona = inferLegacyScopedRef(rootPrefix, 'personas', personaMatch[1]);
    }
  }

  if (record.type === 'feature') {
    const storyMatch = text.match(new RegExp(`#\\s*[Ss]tory:\\s*(?:${includePrefix}stories\\/)?([^\\s\\n]+)`));
    if (storyMatch) {
      result.story = inferLegacyScopedRef(rootPrefix, 'stories', storyMatch[1]);
    }

    const journeyMatch = text.match(new RegExp(`#\\s*[Jj]ourney:\\s*(?:${includePrefix}journeys\\/)?([^\\s\\n]+)`));
    if (journeyMatch) {
      result.journey = inferLegacyScopedRef(rootPrefix, 'journeys', journeyMatch[1]);
    }

    const contractMatch = text.match(/#\s*[Cc]ontract:\s*((?:GET|POST|PUT|PATCH|DELETE)\s+\S+)/);
    if (contractMatch) {
      result.contract = normalizeContractSignature(contractMatch[1]);
    }
  }

  return result;
}

function createGraphState() {
  return {
    nodesByUid: new Map(),
    nodeUidByPath: new Map(),
    nodeUidByTypeId: new Map(),
    edgesByKey: new Map(),
    artifactRecords: [],
    contractsBySignature: new Map(),
    contractUidsByFile: new Map(),
    capabilityMembers: new Map(),
    warnings: [],
    specRootPrefix: '',
    nextNodeCounter: 1,
  };
}

function addNode(state, node) {
  if (!NODE_TYPES.has(node.type)) return null;

  const normalizedPath = node.path ? normalizeRef(node.path) : null;
  if (normalizedPath && state.nodeUidByPath.has(normalizedPath)) {
    return state.nodeUidByPath.get(normalizedPath);
  }

  const uid = `n${state.nextNodeCounter}`;
  state.nextNodeCounter += 1;

  const fullNode = {
    uid,
    id: node.id,
    type: node.type,
    label: node.label || `${node.type}:${node.id}`,
    path: normalizedPath,
    meta: node.meta || {},
  };

  state.nodesByUid.set(uid, fullNode);

  if (normalizedPath) {
    state.nodeUidByPath.set(normalizedPath, uid);
  }

  if (node.id) {
    const typeIdKey = `${node.type}:${node.id}`;
    if (!state.nodeUidByTypeId.has(typeIdKey)) {
      state.nodeUidByTypeId.set(typeIdKey, uid);
    }
  }

  return uid;
}

function addEdge(state, edge) {
  if (!edge.source || !edge.target || edge.source === edge.target) return;

  const key = [
    edge.source,
    edge.target,
    edge.style || 'solid',
    edge.category || 'trace',
  ].join('|');

  if (state.edgesByKey.has(key)) return;

  state.edgesByKey.set(key, {
    source: edge.source,
    target: edge.target,
    style: edge.style || 'solid',
    category: edge.category || 'trace',
    label: edge.label || '',
  });
}

function getAllSpecFiles(specsDir) {
  return findFiles(specsDir, /\.(md|feature|json|ya?ml)$/i);
}

function registerArtifactsFromFrontMatter(state, specsDir) {
  const files = getAllSpecFiles(specsDir);

  for (const filePath of files) {
    const relativePath = toPosix(path.relative(process.cwd(), filePath));
    const expectedType = getExpectedType(relativePath);
    if (!expectedType || !NODE_TYPES.has(expectedType)) {
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      state.warnings.push(`Failed to read ${relativePath}: ${error.message}`);
      continue;
    }

    const parsed = parseFrontMatter(filePath, content);
    if (parsed.parseError) {
      state.warnings.push(`Front-matter parse error in ${relativePath}: ${parsed.parseError}`);
    }

    const frontMatter = parsed.frontMatter || {};
    const type = frontMatter.type || expectedType;
    if (!NODE_TYPES.has(type)) {
      continue;
    }

    const id = frontMatter.id || inferIdFromPath(filePath);
    const uid = addNode(state, {
      type,
      id,
      path: relativePath,
      label: `${type}:${id}`,
      meta: {
        file: relativePath,
      },
    });

    state.artifactRecords.push({
      uid,
      type,
      id,
      path: relativePath,
      frontMatter,
      content,
    });
  }
}

function registerContracts(state, specsDir) {
  const contracts = loadContractDocuments(specsDir, {
    errors: state.warnings,
    warnings: state.warnings,
    info: [],
  });

  for (const contract of contracts) {
    const relativePath = toPosix(path.relative(process.cwd(), contract.filePath));
    const operations = extractContractOperations(contract);

    for (const operation of operations) {
      const operationKey = operation.operationId
        || operation.methodName
        || `${operation.protocol}_${operation.action || operation.method || 'op'}_${operation.channelName || operation.routePath || operation.label}`;
      const id = operationSlug(operation.protocol, operationKey);
      const signature = normalizeContractSignature(operation.signature);
      const uid = addNode(state, {
        type: 'contract',
        id,
        path: `${relativePath}#${signature}`,
        label: `${operation.protocol}:${operation.label}`,
        meta: {
          file: relativePath,
          signature,
          operationId: operation.operationId || '',
        },
      });

      if (!uid) continue;

      if (signature) {
        if (!state.contractsBySignature.has(signature)) {
          state.contractsBySignature.set(signature, new Set());
        }
        state.contractsBySignature.get(signature).add(uid);
      }
      if (!state.contractUidsByFile.has(relativePath)) {
        state.contractUidsByFile.set(relativePath, []);
      }
      state.contractUidsByFile.get(relativePath).push(uid);

      addContractReferenceEdges(state, uid, {
        'x-story': operation.storyRefs,
        'x-feature': operation.featureRefs,
        'x-journey': operation.journeyRefs,
      }, relativePath);
    }
  }
}

function resolveReferenceToUids(state, ref, typeHint) {
  const normalized = normalizeRef(ref);
  if (!normalized) return [];

  if (typeHint === 'contract') {
    const directSignature = normalizeContractSignature(normalized);
    if (directSignature && state.contractsBySignature.has(directSignature)) {
      return Array.from(state.contractsBySignature.get(directSignature));
    }

    if (state.contractUidsByFile.has(normalized)) {
      return state.contractUidsByFile.get(normalized);
    }
  }

  if (state.nodeUidByPath.has(normalized)) {
    return [state.nodeUidByPath.get(normalized)];
  }

  const inferredId = inferIdFromPath(normalized);
  if (typeHint) {
    const hintedKey = `${typeHint}:${inferredId}`;
    if (state.nodeUidByTypeId.has(hintedKey)) {
      return [state.nodeUidByTypeId.get(hintedKey)];
    }
  }

  if (!typeHint && inferredId) {
    const matches = [];
    for (const [key, uid] of state.nodeUidByTypeId.entries()) {
      if (key.endsWith(`:${inferredId}`)) {
        matches.push(uid);
      }
    }
    return matches;
  }

  return [];
}

function connectFromReference(state, ref, typeHint, targetUid, edgeLabel) {
  for (const value of toArray(ref)) {
    const sourceUids = resolveReferenceToUids(state, value, typeHint);

    for (const sourceUid of sourceUids) {
      addEdge(state, {
        source: sourceUid,
        target: targetUid,
        style: 'solid',
        category: 'trace',
        label: edgeLabel,
      });
    }
  }
}

function addContractReferenceEdges(state, contractUid, operation, contractFilePath) {
  const storyRefs = toArray(operation['x-story']);
  const featureRefs = toArray(operation['x-feature']);
  const journeyRefs = toArray(operation['x-journey']);

  for (const ref of storyRefs) {
    connectFromReference(state, ref, 'story', contractUid, 'x-story');
  }

  for (const ref of featureRefs) {
    connectFromReference(state, ref, 'feature', contractUid, 'x-feature');
  }

  for (const ref of journeyRefs) {
    connectFromReference(state, ref, 'journey', contractUid, 'x-journey');
  }

  if (storyRefs.length === 0 && featureRefs.length === 0 && journeyRefs.length === 0) {
    state.warnings.push(`No x-story/x-feature/x-journey links for contract operation in ${contractFilePath}`);
  }
}

function addArtifactEdges(state) {
  for (const record of state.artifactRecords) {
    if (!record.uid) continue;

    const refs = record.frontMatter.refs || {};
    const sources = record.frontMatter.sources || {};
    const legacyRefs = extractLegacyRefs(record, state.specRootPrefix);

    if (record.type === 'journey') {
      connectFromReference(state, refs.persona || legacyRefs.persona, 'persona', record.uid, 'refs.persona');
    }

    if (record.type === 'story') {
      connectFromReference(state, refs.journey || legacyRefs.journey, 'journey', record.uid, 'refs.journey');
      connectFromReference(state, refs.persona || legacyRefs.persona, 'persona', record.uid, 'refs.persona');
    }

    if (record.type === 'feature') {
      connectFromReference(state, record.frontMatter.story || legacyRefs.story, 'story', record.uid, 'story');
      connectFromReference(state, record.frontMatter.journey || legacyRefs.journey, 'journey', record.uid, 'journey');

      const contractRefs = [
        ...toArray(record.frontMatter.contract),
        ...toArray(legacyRefs.contract),
      ];
      for (const contractRef of contractRefs) {
        const targetContracts = resolveReferenceToUids(state, contractRef, 'contract');
        for (const contractUid of targetContracts) {
          addEdge(state, {
            source: record.uid,
            target: contractUid,
            style: 'solid',
            category: 'trace',
            label: 'contract',
          });
        }
      }
    }

    if (record.type === 'fixture') {
      connectFromReference(state, record.frontMatter.story, 'story', record.uid, 'story');
      connectFromReference(state, record.frontMatter.feature, 'feature', record.uid, 'feature');
    }

    if (record.type === 'model') {
      for (const storyRef of toArray(sources.stories)) {
        connectFromReference(state, storyRef, 'story', record.uid, 'sources.stories');
      }
      for (const journeyRef of toArray(sources.journeys)) {
        connectFromReference(state, journeyRef, 'journey', record.uid, 'sources.journeys');
      }
    }

    if (record.type === 'journey-map') {
      connectFromReference(state, sources.journey, 'journey', record.uid, 'sources.journey');

      for (const storyRef of toArray(sources.stories)) {
        connectFromReference(state, storyRef, 'story', record.uid, 'sources.stories');
      }

      for (const featureRef of toArray(sources.features)) {
        connectFromReference(state, featureRef, 'feature', record.uid, 'sources.features');
      }
    }
  }
}

function scopeTypeHint(scopeKey) {
  const normalized = String(scopeKey || '').toLowerCase();
  const key = normalized.replace(/[-_]/g, '');

  if (key === 'personas') return 'persona';
  if (key === 'journeys') return 'journey';
  if (key === 'stories') return 'story';
  if (key === 'features') return 'feature';
  if (key === 'models') return 'model';
  if (key === 'fixtures') return 'fixture';
  if (key === 'journeymaps') return 'journey-map';
  if (key === 'contracts') return 'contract';

  return null;
}

function addCapabilityScope(state) {
  for (const record of state.artifactRecords) {
    if (record.type !== 'capability' || !record.uid) continue;

    const members = new Set([record.uid]);
    const scope = record.frontMatter.scope || {};

    for (const [scopeKey, scopeRefs] of Object.entries(scope)) {
      const typeHint = scopeTypeHint(scopeKey);
      if (!typeHint) continue;

      for (const ref of toArray(scopeRefs)) {
        const targetUids = resolveReferenceToUids(state, ref, typeHint);
        for (const targetUid of targetUids) {
          members.add(targetUid);
          addEdge(state, {
            source: record.uid,
            target: targetUid,
            style: 'dashed',
            category: 'scope',
            label: `scope.${scopeKey}`,
          });
        }
      }
    }

    state.capabilityMembers.set(record.uid, members);
  }
}

function computeOrphans(state) {
  const inDegree = new Map();
  const outDegree = new Map();

  for (const uid of state.nodesByUid.keys()) {
    inDegree.set(uid, 0);
    outDegree.set(uid, 0);
  }

  for (const edge of state.edgesByKey.values()) {
    if (edge.category !== 'trace') continue;
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const orphanUids = [];

  for (const node of state.nodesByUid.values()) {
    if (node.type === 'capability') continue;
    const incoming = inDegree.get(node.uid) || 0;
    const outgoing = outDegree.get(node.uid) || 0;
    if (incoming === 0 && outgoing === 0) {
      orphanUids.push(node.uid);
    }
  }

  return orphanUids;
}

function escapeMermaidLabel(value) {
  return String(value)
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function typeClassDefs() {
  return {
    persona: 'fill:#dbeafe,stroke:#1d4ed8,color:#1e3a8a,stroke-width:1.5px',
    journey: 'fill:#dcfce7,stroke:#166534,color:#14532d,stroke-width:1.5px',
    story: 'fill:#fef9c3,stroke:#854d0e,color:#713f12,stroke-width:1.5px',
    feature: 'fill:#fce7f3,stroke:#be185d,color:#831843,stroke-width:1.5px',
    contract: 'fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e,stroke-width:1.5px',
    model: 'fill:#ede9fe,stroke:#5b21b6,color:#4c1d95,stroke-width:1.5px',
    fixture: 'fill:#ecfccb,stroke:#4d7c0f,color:#365314,stroke-width:1.5px',
    'journey-map': 'fill:#ffedd5,stroke:#c2410c,color:#7c2d12,stroke-width:1.5px',
    capability: 'fill:#f3f4f6,stroke:#374151,color:#111827,stroke-width:2px',
  };
}

function renderMermaid(state) {
  const nodes = Array.from(state.nodesByUid.values())
    .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));

  const edges = Array.from(state.edgesByKey.values())
    .sort((a, b) => {
      const sourceA = state.nodesByUid.get(a.source);
      const sourceB = state.nodesByUid.get(b.source);
      const targetA = state.nodesByUid.get(a.target);
      const targetB = state.nodesByUid.get(b.target);
      const aKey = `${sourceA.type}:${sourceA.id}->${targetA.type}:${targetA.id}`;
      const bKey = `${sourceB.type}:${sourceB.id}->${targetB.type}:${targetB.id}`;
      return aKey.localeCompare(bKey);
    });

  const orphanSet = new Set(computeOrphans(state));
  const lines = [];

  lines.push('graph LR');
  lines.push('  %% Generated by tools/graph-generation/generate-spec-graph.js');
  lines.push('  %% Orphan nodes are highlighted with the orphan class.');

  for (const node of nodes) {
    lines.push(`  ${node.uid}["${escapeMermaidLabel(node.label)}"]`);
  }

  if (state.capabilityMembers.size > 0) {
    lines.push('');
    lines.push('  %% Capability boundary groupings');

    for (const [capabilityUid, members] of Array.from(state.capabilityMembers.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const capabilityNode = state.nodesByUid.get(capabilityUid);
      if (!capabilityNode) continue;

      const subgraphId = `sg_${capabilityNode.id.replace(/[^A-Za-z0-9_]/g, '_')}`;
      lines.push(`  subgraph ${subgraphId}["${escapeMermaidLabel(capabilityNode.label)} scope"]`);

      const memberUids = Array.from(members)
        .sort((uidA, uidB) => {
          const aNode = state.nodesByUid.get(uidA);
          const bNode = state.nodesByUid.get(uidB);
          return aNode.label.localeCompare(bNode.label);
        });

      for (const memberUid of memberUids) {
        lines.push(`    ${memberUid}`);
      }

      lines.push('  end');
    }
  }

  if (edges.length > 0) {
    lines.push('');
    lines.push('  %% Traceability links');

    for (const edge of edges) {
      const connector = edge.style === 'dashed' ? '-.->' : '-->';
      lines.push(`  ${edge.source} ${connector} ${edge.target}`);
    }
  }

  const classDefs = typeClassDefs();
  lines.push('');
  lines.push('  %% Styles');
  for (const [type, definition] of Object.entries(classDefs)) {
    lines.push(`  classDef ${type.replace(/-/g, '_')} ${definition}`);
  }
  lines.push('  classDef orphan fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-width:3px');

  const typeToNodes = new Map();
  for (const node of nodes) {
    if (!typeToNodes.has(node.type)) typeToNodes.set(node.type, []);
    typeToNodes.get(node.type).push(node.uid);
  }

  for (const [type, uids] of typeToNodes.entries()) {
    if (uids.length === 0) continue;
    const className = type.replace(/-/g, '_');
    lines.push(`  class ${uids.join(',')} ${className}`);
  }

  if (orphanSet.size > 0) {
    lines.push(`  class ${Array.from(orphanSet).sort().join(',')} orphan`);
  }

  return {
    mermaid: lines.join('\n'),
    orphanUids: Array.from(orphanSet),
  };
}

function toJsonGraph(state, renderResult) {
  return {
    nodes: Array.from(state.nodesByUid.values()).map((node) => ({
      uid: node.uid,
      id: node.id,
      type: node.type,
      label: node.label,
      path: node.path,
      orphan: renderResult.orphanUids.includes(node.uid),
    })),
    edges: Array.from(state.edgesByKey.values()),
    capabilities: Array.from(state.capabilityMembers.entries()).map(([capabilityUid, members]) => ({
      capabilityUid,
      members: Array.from(members),
    })),
    warnings: state.warnings,
  };
}

function buildGraph(specsDir) {
  const state = createGraphState();
  state.specRootPrefix = toPosix(path.relative(process.cwd(), specsDir));

  registerArtifactsFromFrontMatter(state, specsDir);
  registerContracts(state, specsDir);
  addArtifactEdges(state);
  addCapabilityScope(state);

  return state;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n`);
    process.stderr.write('Run with --help for usage.\n');
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(args.specsDir)) {
    process.stderr.write(`Error: specs directory not found: ${args.specsDir}\n`);
    process.exit(1);
  }

  const graphState = buildGraph(args.specsDir);
  const renderResult = renderMermaid(graphState);

  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(toJsonGraph(graphState, renderResult), null, 2)}\n`);
  } else {
    process.stdout.write(`${renderResult.mermaid}\n`);
  }

  if (graphState.warnings.length > 0) {
    for (const warning of graphState.warnings) {
      process.stderr.write(`Warning: ${warning}\n`);
    }
  }
}

main();
