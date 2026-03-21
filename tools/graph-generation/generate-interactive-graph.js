#!/usr/bin/env node

/**
 * Generates an interactive Cytoscape.js + ELK spec traceability graph.
 *
 * UX: Progressive drill-down starting from personas.
 *   Click persona  → reveals journeys + journey maps
 *   Click journey  → reveals stories
 *   Click story    → reveals features, contracts, models
 *   Click feature  → reveals fixtures
 *   Click model    → reveals lifecycles
 *   Double-click   → collapse back
 *
 * Usage: node tools/graph-generation/generate-spec-graph.js [specs-dir]
 * Output: specs-graph.html (in project root or next to specs-dir)
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { extractContractOperations, loadContractDocuments } = require('../lib/contracts');
const { parseFrontMatter } = require('../lib/parse-front-matter');

const SPECS_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), 'specs');
const PROJECT_NAME = path.basename(path.resolve(SPECS_DIR, '..'));
const OUTPUT_FILE = path.join(path.resolve(SPECS_DIR, '..'), 'specs-graph.html');

// ── Graph data structures ─────────────────────────────────────────

const nodes = [];
const edges = [];
const nodeIds = new Set();

function addNode(id, type, label, data = {}) {
  if (nodeIds.has(id)) return;
  nodeIds.add(id);
  nodes.push({ id, type, label, data });
}

function addEdge(source, target, relationship) {
  if (!source || !target) return;
  edges.push({ source, target, relationship });
}

// ── File discovery ────────────────────────────────────────────────

function findFiles(dir, pattern) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (pattern.test(entry.name)) files.push(fullPath);
    }
  }
  walk(dir);
  return files;
}

function relPath(fullPath) {
  return path.relative(process.cwd(), fullPath);
}

function titleCase(str) {
  return str.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Indexes ───────────────────────────────────────────────────────

const storyIndex = new Map();
const entityIndex = new Map();

function buildStoryIndex() {
  const storyFiles = findFiles(path.join(SPECS_DIR, 'stories'), /\.md$/);
  for (const f of storyFiles) {
    storyIndex.set(path.basename(f, '.md'), relPath(f));
  }
}

function resolveStoryName(kebabName, tag) {
  if (storyIndex.has(kebabName)) return storyIndex.get(kebabName);
  const withTag = `specs/stories/${tag}/${kebabName}.md`;
  if (fs.existsSync(path.join(process.cwd(), withTag))) return withTag;
  for (const [name, p] of storyIndex) {
    if (name === kebabName) return p;
  }
  return null;
}

function buildEntityIndex() {
  const modelFiles = findFiles(path.join(SPECS_DIR, 'models'), /\.model\.ya?ml$/);
  for (const f of modelFiles) {
    try {
      const model = yaml.load(fs.readFileSync(f, 'utf8'));
      if (model.entity) entityIndex.set(model.entity, relPath(f));
    } catch (_) { }
  }
}

// ── Parsers (same as before) ──────────────────────────────────────

function parsePersonas() {
  for (const f of findFiles(path.join(SPECS_DIR, 'personas'), /\.md$/)) {
    const id = relPath(f);
    const content = fs.readFileSync(f, 'utf8');
    const m = content.match(/^#\s*Persona:\s*(.+)$/m);
    addNode(id, 'persona', m ? m[1].trim() : titleCase(path.basename(f, '.md')), { file: id });
  }
}

function parseJourneys() {
  for (const f of findFiles(path.join(SPECS_DIR, 'journeys'), /\.md$/)) {
    const id = relPath(f);
    const content = fs.readFileSync(f, 'utf8');
    const m = content.match(/^#\s*Journey:\s*(.+)$/m);
    addNode(id, 'journey', m ? m[1].trim() : titleCase(path.basename(f, '.md')), { file: id });

    const pm = content.match(/Source Persona:\s*(specs\/personas\/[^\s]+)/);
    if (pm) addEdge(id, pm[1], 'actor');

    for (const sm of content.matchAll(/- (specs\/stories\/[^\s]+)/g)) {
      addEdge(id, sm[1], 'includes-story');
    }
  }
}

function parseStories() {
  for (const f of findFiles(path.join(SPECS_DIR, 'stories'), /\.md$/)) {
    const id = relPath(f);
    const content = fs.readFileSync(f, 'utf8');
    const m = content.match(/^#\s*Story:\s*(.+)$/m);
    addNode(id, 'story', m ? m[1].trim() : titleCase(path.basename(f, '.md')), { file: id });

    const jm = content.match(/Journey:\s*(specs\/journeys\/[^\s]+)/);
    if (jm) addEdge(id, jm[1], 'belongs-to-journey');

    const pm = content.match(/Persona:\s*(specs\/personas\/[^\s]+)/);
    if (pm) addEdge(id, pm[1], 'persona');
  }
}

function parseFeatures() {
  for (const f of findFiles(path.join(SPECS_DIR, 'features'), /\.feature$/)) {
    const id = relPath(f);
    const content = fs.readFileSync(f, 'utf8');
    const fm = content.match(/Feature:\s*(.+)/);
    const scenarioCount = (content.match(/Scenario:/g) || []).length;
    addNode(id, 'feature', fm ? fm[1].trim() : titleCase(path.basename(f, '.feature')), { file: id, scenarioCount });

    const sm = content.match(/^#\s*Story:\s*(specs\/stories\/[^\s]+)/m);
    if (sm) addEdge(id, sm[1], 'specifies');

    const jm = content.match(/^#\s*Journey:\s*(specs\/journeys\/[^\s]+)/m);
    if (jm) addEdge(id, jm[1], 'traces-to-journey');

    const cm = content.match(/^#\s*Contract:\s*((?:GET|POST|PUT|PATCH|DELETE)\s+\S+)/m);
    if (cm) addEdge(id, `contract:${cm[1].trim()}`, 'tests-endpoint');
  }
}

function parseModels() {
  for (const f of findFiles(path.join(SPECS_DIR, 'models'), /\.model\.ya?ml$/)) {
    const id = relPath(f);
    let model;
    try { model = yaml.load(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }

    const label = model.entity || titleCase(path.basename(f, '.model.yaml'));
    const attrCount = model.attributes ? Object.keys(model.attributes).length : 0;
    const ruleCount = model.rules ? model.rules.length : 0;
    addNode(id, 'model', label, { file: id, entity: model.entity, attrCount, ruleCount });

    for (const s of model.sources?.stories ?? []) addEdge(id, s, 'defined-by');
    for (const j of model.sources?.journeys ?? []) addEdge(id, j, 'supports');
    for (const [, rel] of Object.entries(model.relationships ?? {})) {
      const tp = entityIndex.get(rel.entity);
      if (tp) addEdge(id, tp, rel.type || 'relates-to');
    }
  }
}

function parseLifecycles() {
  for (const f of findFiles(path.join(SPECS_DIR, 'models'), /\.lifecycle\.ya?ml$/)) {
    const id = relPath(f);
    let lc;
    try { lc = yaml.load(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }

    const stateCount = lc.states ? Object.keys(lc.states).length : 0;
    const transitionCount = lc.transitions ? Object.keys(lc.transitions).length : 0;
    addNode(id, 'lifecycle', `${lc.entity || ''} Lifecycle`, { file: id, stateCount, transitionCount });

    for (const s of lc.sources?.stories ?? []) addEdge(id, s, 'governs');
    for (const j of lc.sources?.journeys ?? []) addEdge(id, j, 'supports');
    const mp = entityIndex.get(lc.entity);
    if (mp) addEdge(id, mp, 'lifecycle-of');
  }
}

function parseContracts() {
  const contracts = loadContractDocuments(SPECS_DIR, null);
  for (const contract of contracts) {
    for (const operation of extractContractOperations(contract)) {
      const id = `contract:${operation.signature}`;
      addNode(id, 'contract', operation.signature, {
        operationId: operation.operationId || operation.methodName || '',
        summary: operation.label || '',
        protocol: operation.protocol,
      });
      for (const journeyRef of operation.journeyRefs) addEdge(id, journeyRef, 'serves');
      for (const storyRef of operation.storyRefs) addEdge(id, storyRef, 'implements');
      for (const featureRef of operation.featureRefs) addEdge(id, featureRef, 'tested-by');
    }
  }
}

function parseJourneyMaps() {
  for (const f of findFiles(path.join(SPECS_DIR, 'journey-maps'), /\.map\.ya?ml$/)) {
    const id = relPath(f);
    let map;
    try { map = yaml.load(fs.readFileSync(f, 'utf8')); } catch (_) { continue; }

    const stepCount = map.steps ? Object.keys(map.steps).length : 0;
    addNode(id, 'journey-map', `${titleCase(map.journey || path.basename(f, '.map.yaml'))} (Map)`, { file: id, stepCount });

    if (map.sources?.journey) addEdge(id, map.sources.journey, 'maps');
    for (const s of map.sources?.stories ?? []) addEdge(id, s, 'covers');
    for (const fe of map.sources?.features ?? []) addEdge(id, fe, 'validates');
    if (map.fixtures) {
      for (const [, fix] of Object.entries(map.fixtures)) {
        if (fix?.ref) addEdge(id, fix.ref, 'uses-fixture');
      }
    }
  }
}

function parseFixtures() {
  for (const f of findFiles(path.join(SPECS_DIR, 'fixtures'), /\.(json|ya?ml)$/)) {
    const id = relPath(f);
    let fixture;
    try {
      const parsed = parseFrontMatter(f, fs.readFileSync(f, 'utf8'));
      fixture = parsed.body;
    } catch (_) { continue; }
    addNode(id, 'fixture', titleCase(path.basename(f, '.json')), { file: id });
    const storyRef = fixture?.story || fixture?._meta?.story;
    const featureRef = fixture?.feature || fixture?._meta?.feature;
    if (storyRef) addEdge(id, storyRef, 'test-data-for');
    if (featureRef) addEdge(id, featureRef, 'feeds');
  }
}

// ── Hierarchy computation ─────────────────────────────────────────
// Assigns each node a hierarchyParent and depth based on the traceability chain.
// Depth: 0=persona, 1=journey/journey-map, 2=story, 3=feature/contract/model, 4=fixture/lifecycle

function computeHierarchy(graph) {
  const parentMap = new Map();   // nodeId → parentNodeId
  const depthMap = new Map();    // nodeId → depth
  const childrenMap = new Map(); // nodeId → Set<childNodeId>

  // Build edge lookup: for each node, what edges connect to it?
  const edgesBySource = new Map();
  const edgesByTarget = new Map();
  for (const e of graph.edges) {
    if (!edgesBySource.has(e.source)) edgesBySource.set(e.source, []);
    edgesBySource.get(e.source).push(e);
    if (!edgesByTarget.has(e.target)) edgesByTarget.set(e.target, []);
    edgesByTarget.get(e.target).push(e);
  }

  const nodeMap = new Map();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  function setParent(childId, parentId, depth) {
    if (parentMap.has(childId)) return; // first assignment wins
    parentMap.set(childId, parentId);
    depthMap.set(childId, depth);
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, new Set());
    childrenMap.get(parentId).add(childId);
  }

  // Depth 0: Personas
  for (const n of graph.nodes) {
    if (n.type === 'persona') {
      depthMap.set(n.id, 0);
    }
  }

  // Depth 1: Journeys → parent is persona (via 'actor' edge: journey→persona)
  for (const n of graph.nodes) {
    if (n.type === 'journey') {
      const actorEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'actor');
      if (actorEdge && nodeMap.get(actorEdge.target)?.type === 'persona') {
        setParent(n.id, actorEdge.target, 1);
      } else {
        depthMap.set(n.id, 1); // orphan journey
      }
    }
  }

  // Depth 1: Journey maps → parent is journey (via 'maps' edge: jm→journey)
  for (const n of graph.nodes) {
    if (n.type === 'journey-map') {
      const mapsEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'maps');
      if (mapsEdge && nodeMap.get(mapsEdge.target)?.type === 'journey') {
        // Parent is the journey's parent persona (so jm is sibling of journey)
        const journeyParent = parentMap.get(mapsEdge.target);
        if (journeyParent) {
          setParent(n.id, mapsEdge.target, 1);
        } else {
          depthMap.set(n.id, 1);
        }
      } else {
        depthMap.set(n.id, 1);
      }
    }
  }

  // Depth 2: Stories → parent is journey
  // Via 'belongs-to-journey' (story→journey) or 'includes-story' (journey→story)
  for (const n of graph.nodes) {
    if (n.type === 'story') {
      // Try belongs-to-journey first
      const btj = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'belongs-to-journey');
      if (btj && nodeMap.get(btj.target)?.type === 'journey') {
        setParent(n.id, btj.target, 2);
        continue;
      }
      // Try reverse: journey includes-story → this story
      const incEdge = (edgesByTarget.get(n.id) || []).find(e => e.relationship === 'includes-story');
      if (incEdge && nodeMap.get(incEdge.source)?.type === 'journey') {
        setParent(n.id, incEdge.source, 2);
        continue;
      }
      depthMap.set(n.id, 2); // orphan story
    }
  }

  // Depth 3: Features → parent is story (via 'specifies' edge: feature→story)
  for (const n of graph.nodes) {
    if (n.type === 'feature') {
      const specEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'specifies');
      if (specEdge && nodeMap.get(specEdge.target)?.type === 'story') {
        setParent(n.id, specEdge.target, 3);
      } else {
        depthMap.set(n.id, 3);
      }
    }
  }

  // Depth 3: Contracts → parent is story (via 'implements' edge: contract→story)
  for (const n of graph.nodes) {
    if (n.type === 'contract') {
      const implEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'implements');
      if (implEdge && nodeMap.get(implEdge.target)?.type === 'story') {
        setParent(n.id, implEdge.target, 3);
      } else {
        depthMap.set(n.id, 3);
      }
    }
  }

  // Depth 3: Models → parent is story (via 'defined-by' edge: model→story, take first)
  for (const n of graph.nodes) {
    if (n.type === 'model') {
      const defEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'defined-by');
      if (defEdge && nodeMap.get(defEdge.target)?.type === 'story') {
        setParent(n.id, defEdge.target, 3);
      } else {
        depthMap.set(n.id, 3);
      }
    }
  }

  // Depth 4: Fixtures → parent is feature (via 'feeds': fixture→feature)
  //           or parent is story (via 'test-data-for': fixture→story)
  for (const n of graph.nodes) {
    if (n.type === 'fixture') {
      const feedsEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'feeds');
      if (feedsEdge && nodeMap.get(feedsEdge.target)?.type === 'feature') {
        setParent(n.id, feedsEdge.target, 4);
        continue;
      }
      const tdEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'test-data-for');
      if (tdEdge && nodeMap.get(tdEdge.target)?.type === 'story') {
        setParent(n.id, tdEdge.target, 4);
        continue;
      }
      depthMap.set(n.id, 4);
    }
  }

  // Depth 4: Lifecycles → parent is model (via 'lifecycle-of': lifecycle→model)
  for (const n of graph.nodes) {
    if (n.type === 'lifecycle') {
      const lcEdge = (edgesBySource.get(n.id) || []).find(e => e.relationship === 'lifecycle-of');
      if (lcEdge && nodeMap.get(lcEdge.target)?.type === 'model') {
        setParent(n.id, lcEdge.target, 4);
      } else {
        depthMap.set(n.id, 4);
      }
    }
  }

  // Handle orphans: nodes with no parent get depth 0 so they appear at startup
  const orphans = graph.nodes.filter(n => n.type !== 'persona' && !parentMap.has(n.id));
  for (const o of orphans) {
    depthMap.set(o.id, 0); // visible at top level alongside personas
  }

  console.log(`  Hierarchy: ${parentMap.size} parented, ${orphans.length} orphans (shown at top level)`);
  if (orphans.length > 0) {
    for (const o of orphans) {
      console.log(`    orphan: [${o.type}] ${o.label}`);
    }
  }

  return { parentMap, depthMap, childrenMap };
}

// ── Build graph ───────────────────────────────────────────────────

function buildGraph() {
  console.log('Building spec graph...\n');

  buildStoryIndex();
  buildEntityIndex();

  parsePersonas();
  parseJourneys();
  parseStories();
  parseFeatures();
  parseModels();
  parseLifecycles();
  parseContracts();
  parseJourneyMaps();
  parseFixtures();

  const validEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  const dropped = edges.length - validEdges.length;

  console.log(`  Nodes: ${nodes.length}`);
  console.log(`  Edges: ${validEdges.length} (${dropped} dropped)`);

  const typeCounts = {};
  for (const n of nodes) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }
  console.log('');

  return { nodes, edges: validEdges };
}

// ── Convert to Cytoscape elements ─────────────────────────────────

function toCytoscapeElements(graph, hierarchy) {
  const { parentMap, depthMap, childrenMap } = hierarchy;
  const elements = [];

  // Nodes
  for (const node of graph.nodes) {
    const depth = depthMap.get(node.id) ?? 99;
    const hParent = parentMap.get(node.id) || null;
    const childCount = childrenMap.get(node.id)?.size || 0;
    const children = childrenMap.has(node.id) ? Array.from(childrenMap.get(node.id)) : [];

    elements.push({
      data: {
        id: node.id,
        label: node.label,
        nodeType: node.type,
        depth,
        hParent,
        childCount,
        children: JSON.stringify(children),
        ...flatData(node.data),
      },
      classes: node.type,
    });
  }

  // Edges
  for (const edge of graph.edges) {
    elements.push({
      data: {
        id: `${edge.source}→${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: edge.relationship,
        edgeType: edge.relationship,
      },
    });
  }

  return elements;
}

function flatData(data) {
  const flat = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      flat[k] = v;
    }
  }
  return flat;
}

// ── HTML template ─────────────────────────────────────────────────

function generateHtml(elements) {
  const elementsJson = JSON.stringify(elements, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${titleCase(PROJECT_NAME)} — Spec Traceability Graph</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0f1117; color: #e1e4e8;
  }
  #container { display: flex; height: 100vh; }
  #cy { flex: 1; }

  /* Detail panel */
  #detail-panel {
    width: 380px; background: #161b22; border-left: 1px solid #30363d;
    padding: 20px; overflow-y: auto; display: none; flex-direction: column;
    position: relative;
  }
  #detail-panel.open { display: flex; }
  #detail-panel h2 { font-size: 16px; margin-bottom: 8px; color: #f0f6fc; }
  .type-badge {
    display: inline-block; padding: 2px 10px; border-radius: 12px;
    font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 12px;
  }
  .meta { font-size: 13px; color: #8b949e; margin-bottom: 16px; line-height: 1.7; }
  .connections { font-size: 13px; }
  .connections h3 {
    font-size: 12px; color: #8b949e; margin: 14px 0 6px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .connections li {
    list-style: none; padding: 4px 0; cursor: pointer; color: #58a6ff;
  }
  .connections li:hover { text-decoration: underline; }
  .conn-type { color: #484f58; font-size: 11px; }
  #close-btn {
    position: absolute; right: 12px; top: 12px; background: none; border: none;
    color: #8b949e; cursor: pointer; font-size: 20px; line-height: 1;
  }

  /* Breadcrumb */
  #breadcrumb {
    position: absolute; top: 56px; left: 12px; z-index: 10;
    display: flex; gap: 4px; align-items: center; font-size: 13px;
  }
  .crumb {
    padding: 4px 10px; border-radius: 6px; cursor: pointer;
    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
  }
  .crumb:hover { background: #30363d; }
  .crumb.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .crumb-sep { color: #484f58; }

  /* Toolbar */
  #toolbar {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    display: flex; gap: 8px; flex-wrap: wrap;
  }
  .toolbar-btn {
    padding: 6px 14px; border-radius: 6px; border: 1px solid #30363d;
    background: #21262d; color: #c9d1d9; cursor: pointer; font-size: 12px;
  }
  .toolbar-btn:hover { background: #30363d; }

  /* Legend */
  #legend {
    position: absolute; bottom: 12px; left: 12px; z-index: 10;
    background: #161b22cc; border: 1px solid #30363d; border-radius: 8px;
    padding: 10px 16px; font-size: 12px; display: flex; gap: 14px; flex-wrap: wrap;
    backdrop-filter: blur(8px);
  }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }

  /* Stats */
  #stats {
    position: absolute; top: 12px; right: 12px; z-index: 10;
    background: #161b22cc; border: 1px solid #30363d; border-radius: 8px;
    padding: 8px 14px; font-size: 12px; color: #8b949e;
    backdrop-filter: blur(8px);
  }
  #stats.with-panel { right: 392px; }

  /* Hint */
  #hint {
    position: absolute; bottom: 56px; left: 50%; transform: translateX(-50%);
    z-index: 10; background: #1f6feb; color: #fff; padding: 8px 18px;
    border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity 0.4s;
    pointer-events: none;
  }
  #hint.show { opacity: 1; }

  /* Column headers */
  #column-headers {
    position: absolute; top: 46px; left: 0; right: 0; z-index: 5;
    pointer-events: none; height: 0; overflow: visible;
  }
  .col-header {
    position: absolute; top: 0;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 1px; color: #484f58;
    border-bottom: 1px solid #21262d;
    padding: 4px 12px; white-space: nowrap;
  }
</style>
</head>
<body>

<div id="container">
  <div id="cy"></div>
  <div id="detail-panel">
    <button id="close-btn">&times;</button>
    <div id="detail-content"></div>
  </div>
</div>

<div id="toolbar">
  <button class="toolbar-btn" onclick="resetView()">⌂ Reset</button>
  <button class="toolbar-btn" onclick="showAll()">Show All</button>
  <button class="toolbar-btn" onclick="adjustSpacing(40)">+ Spacing</button>
  <button class="toolbar-btn" onclick="adjustSpacing(-40)">− Spacing</button>
</div>

<div id="column-headers"></div>

<div id="breadcrumb"></div>

<div id="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#f97583"></div> Persona</div>
  <div class="legend-item"><div class="legend-dot" style="background:#79c0ff"></div> Journey</div>
  <div class="legend-item"><div class="legend-dot" style="background:#56d364"></div> Story</div>
  <div class="legend-item"><div class="legend-dot" style="background:#d2a8ff"></div> Feature</div>
  <div class="legend-item"><div class="legend-dot" style="background:#ffa657"></div> Contract</div>
  <div class="legend-item"><div class="legend-dot" style="background:#ff7b72"></div> Model</div>
  <div class="legend-item"><div class="legend-dot" style="background:#ffd866"></div> Lifecycle</div>
  <div class="legend-item"><div class="legend-dot" style="background:#a5d6ff"></div> Journey Map</div>
  <div class="legend-item"><div class="legend-dot" style="background:#7ee787"></div> Fixture</div>
</div>

<div id="stats"></div>
<div id="hint">Click a node to explore deeper</div>

<script src="https://unpkg.com/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
<script src="https://unpkg.com/elkjs@0.9.3/lib/elk.bundled.js"></script>
<script src="https://unpkg.com/cytoscape-elk@2.2.0/dist/cytoscape-elk.js"></script>

<script>
cytoscapeElk(cytoscape);

// ── Constants ──────────────────────────────────────────────────

const TYPE_COLORS = {
  persona:      { bg: '#f97583', text: '#0d1117' },
  journey:      { bg: '#79c0ff', text: '#0d1117' },
  story:        { bg: '#56d364', text: '#0d1117' },
  feature:      { bg: '#d2a8ff', text: '#0d1117' },
  contract:     { bg: '#ffa657', text: '#0d1117' },
  model:        { bg: '#ff7b72', text: '#0d1117' },
  lifecycle:    { bg: '#ffd866', text: '#0d1117' },
  'journey-map':{ bg: '#a5d6ff', text: '#0d1117' },
  fixture:      { bg: '#7ee787', text: '#0d1117' },
};

const TYPE_SHAPES = {
  persona: 'ellipse', journey: 'round-rectangle', story: 'round-rectangle',
  feature: 'diamond', contract: 'hexagon', model: 'rectangle',
  lifecycle: 'octagon', 'journey-map': 'round-pentagon', fixture: 'round-triangle',
};

const DEPTH_LABELS = ['Personas', 'Journeys', 'Stories', 'Specs', 'Details'];

// ── Init Cytoscape ─────────────────────────────────────────────

const elements = ${elementsJson};

const cy = cytoscape({
  container: document.getElementById('cy'),
  elements: elements,
  style: [
    {
      selector: 'node',
      style: {
        'label': function(ele) {
          const cc = ele.data('childCount');
          const lbl = ele.data('label');
          return cc > 0 ? lbl + ' (' + cc + ')' : lbl;
        },
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'text-wrap': 'wrap',
        'text-max-width': '140px',
        'width': 'label',
        'height': 'label',
        'padding': '14px',
        'border-width': 2,
        'border-color': '#30363d',
        'transition-property': 'opacity, width, height, border-color',
        'transition-duration': '0.3s',
      }
    },
    ...Object.entries(TYPE_COLORS).map(([type, colors]) => ({
      selector: '.' + type,
      style: {
        'background-color': colors.bg,
        'color': colors.text,
        'shape': TYPE_SHAPES[type] || 'round-rectangle',
        'font-weight': (type === 'persona') ? 700 : 500,
        'font-size': (type === 'persona') ? '14px' : '11px',
        'padding': (type === 'persona') ? '20px' : '14px',
      }
    })),
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': '#30363d',
        'target-arrow-color': '#58a6ff',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'arrow-scale': 0.8,
        'opacity': 0.5,
        'transition-property': 'opacity, line-color',
        'transition-duration': '0.3s',
      }
    },
    {
      selector: 'edge.visible-edge',
      style: {
        'line-color': '#484f58',
        'target-arrow-color': '#79c0ff',
        'opacity': 0.7,
        'width': 2,
      }
    },
    {
      selector: 'node.highlighted',
      style: {
        'border-width': 3,
        'border-color': '#f0f6fc',
        'z-index': 20,
      }
    },
    {
      selector: 'node.expanded',
      style: {
        'border-width': 3,
        'border-color': '#58a6ff',
      }
    },
    {
      selector: 'node.faded',
      style: { 'opacity': 0.2 }
    },
    {
      selector: 'edge.faded',
      style: { 'opacity': 0.05 }
    },
  ],
  layout: { name: 'preset' },
  wheelSensitivity: 0.3,
});

// ── State ──────────────────────────────────────────────────────

const expandedNodes = new Set();       // IDs of expanded nodes
const visibleNodes = new Set();        // IDs of currently visible nodes
let breadcrumbTrail = [];              // [{id, label, type}] for navigation
let currentLayout = 'layered';
let showAllMode = false;

// ── Visibility engine ──────────────────────────────────────────

function hideAll() {
  cy.elements().style('display', 'none');
  visibleNodes.clear();
}

function showNode(id, startPosition = null) {
  const node = cy.getElementById(id);
  if (node.length) {
    const wasHidden = node.style('display') === 'none';
    node.style('display', 'element');
    if (wasHidden && startPosition) {
      // Seed newly revealed nodes at their parent location so they emerge from that node.
      node.position({ x: startPosition.x, y: startPosition.y });
    }
    visibleNodes.add(id);
    return wasHidden;
  }
  return false;
}

function showEdgesBetweenVisible() {
  // Hide all first, then show one preferred edge per node pair.
  cy.edges().forEach(edge => {
    edge.style('display', 'none');
    edge.removeClass('visible-edge');
  });

  const grouped = new Map(); // unordered node-pair key -> [edge]
  cy.edges().forEach(edge => {
    const s = edge.data('source');
    const t = edge.data('target');
    if (!visibleNodes.has(s) || !visibleNodes.has(t)) return;
    const key = [s, t].sort().join('↔');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(edge);
  });

  function edgeScore(edge) {
    const s = edge.data('source');
    const t = edge.data('target');
    const sourceNode = cy.getElementById(s);
    const targetNode = cy.getElementById(t);
    const sDepth = sourceNode.data('depth') ?? 99;
    const tDepth = targetNode.data('depth') ?? 99;
    let score = 0;

    // Prefer hierarchy direction (parent -> child) where available.
    if ((targetNode.data('hParent') || null) === s) score += 100;
    // Prefer flow from lower depth to higher depth.
    if (sDepth < tDepth) score += 10;
    return score;
  }

  grouped.forEach(edgesForPair => {
    let best = edgesForPair[0];
    let bestScore = edgeScore(best);
    for (let i = 1; i < edgesForPair.length; i++) {
      const candidate = edgesForPair[i];
      const candidateScore = edgeScore(candidate);
      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }
    best.style('display', 'element');
    best.addClass('visible-edge');
  });
}

function getChildren(nodeId) {
  const node = cy.getElementById(nodeId);
  if (!node.length) return [];
  try {
    return JSON.parse(node.data('children') || '[]');
  } catch { return []; }
}

// Show initial state: only personas
function showPersonas() {
  hideAll();
  expandedNodes.clear();
  breadcrumbTrail = [];
  showAllMode = false;

  cy.nodes().forEach(n => {
    if (n.data('depth') === 0) {
      showNode(n.id());
    }
  });

  showEdgesBetweenVisible();
  runLayout(() => {
    cy.fit(cy.elements(':visible'), 80);
    updateColumnHeaders();
    showHint('Click a persona to see their journeys');
  });
  updateBreadcrumb();
  updateStats();
}

// Expand a node: reveal its children
function expandNode(nodeId) {
  if (expandedNodes.has(nodeId)) return;
  expandedNodes.add(nodeId);
  const parentNode = cy.getElementById(nodeId);
  parentNode.addClass('expanded');
  const parentPos = parentNode.position();

  const children = getChildren(nodeId);
  for (const childId of children) {
    showNode(childId, parentPos);
  }

  showEdgesBetweenVisible();
  runLayout(() => {
    // Center on the expanded node and its children
    const expandedEle = cy.getElementById(nodeId);
    const childEles = cy.collection();
    for (const cid of children) {
      const c = cy.getElementById(cid);
      if (c.length) childEles.merge(c);
    }
    const focus = expandedEle.union(childEles);
    if (focus.length > 0) {
      cy.animate({
        fit: { eles: cy.elements(':visible'), padding: 60 },
      }, { duration: 400 });
    }
    updateColumnHeaders();
  });

  updateStats();
}

// Collapse a node: hide its children (and their children recursively)
function collapseNode(nodeId) {
  if (!expandedNodes.has(nodeId)) return;
  expandedNodes.delete(nodeId);
  cy.getElementById(nodeId).removeClass('expanded');

  const toHide = new Set();
  function collectDescendants(id) {
    const children = getChildren(id);
    for (const childId of children) {
      toHide.add(childId);
      expandedNodes.delete(childId);
      cy.getElementById(childId).removeClass('expanded');
      collectDescendants(childId);
    }
  }
  collectDescendants(nodeId);

  for (const id of toHide) {
    cy.getElementById(id).style('display', 'none');
    visibleNodes.delete(id);
  }

  showEdgesBetweenVisible();
  runLayout(() => {
    cy.animate({ fit: { eles: cy.elements(':visible'), padding: 60 } }, { duration: 400 });
    updateColumnHeaders();
  });

  // Trim breadcrumb if we collapsed something in the trail
  breadcrumbTrail = breadcrumbTrail.filter(b => !toHide.has(b.id));
  updateBreadcrumb();
  updateStats();
}

// ── Layout ─────────────────────────────────────────────────────
//
// Column-based layout: each depth level occupies a vertical lane
// flowing left→right like a sequence diagram.
//
//  Col 0        Col 1         Col 2         Col 3          Col 4
//  Personas  → Journeys   → Stories     → Features     → Fixtures
//                                          Contracts      Lifecycles
//                                          Models
//
// Within each column, nodes are sorted to cluster near their parent's Y.

let COL_WIDTH = 280;     // horizontal spacing between depth columns
let ROW_HEIGHT = 80;     // vertical spacing between nodes in a column
const LEFT_PAD = 100;    // left margin
const TOP_PAD = 80;      // top margin

function runLayout(callback) {
  const visibleNodes = cy.nodes(':visible');
  if (visibleNodes.length === 0) { if (callback) callback(); return; }

  // Group visible nodes by depth
  const columns = new Map(); // depth → [node]
  visibleNodes.forEach(n => {
    const d = n.data('depth') ?? 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d).push(n);
  });

  // Sort nodes within each column to cluster children near their parent's Y
  // First pass: position depth-0 nodes
  const positions = new Map(); // nodeId → {x, y}

  // Sort columns by depth
  const depths = Array.from(columns.keys()).sort((a, b) => a - b);

  for (const depth of depths) {
    const col = columns.get(depth);
    const x = LEFT_PAD + depth * COL_WIDTH;

    if (depth === 0) {
      // Top-level: sort alphabetically by type then label
      col.sort((a, b) => {
        const ta = a.data('nodeType'), tb = b.data('nodeType');
        if (ta !== tb) return ta === 'persona' ? -1 : tb === 'persona' ? 1 : ta.localeCompare(tb);
        return a.data('label').localeCompare(b.data('label'));
      });
      col.forEach((n, i) => {
        positions.set(n.id(), { x, y: TOP_PAD + i * ROW_HEIGHT });
      });
    } else {
      // Sort by parent's Y position so children cluster near parent
      col.sort((a, b) => {
        const pa = positions.get(a.data('hParent'));
        const pb = positions.get(b.data('hParent'));
        const ya = pa ? pa.y : 9999;
        const yb = pb ? pb.y : 9999;
        if (ya !== yb) return ya - yb;
        return a.data('label').localeCompare(b.data('label'));
      });

      // Position with spacing, trying to align near parent Y
      let nextY = TOP_PAD;
      for (const n of col) {
        const parentPos = positions.get(n.data('hParent'));
        const targetY = parentPos ? parentPos.y : nextY;
        const y = Math.max(nextY, targetY);
        positions.set(n.id(), { x, y });
        nextY = y + ROW_HEIGHT;
      }
    }
  }

  // Animate nodes to their new positions
  const animPromises = [];
  positions.forEach((pos, id) => {
    const node = cy.getElementById(id);
    if (node.length) {
      animPromises.push(
        node.animation({ position: pos, duration: 500, easing: 'ease-in-out-cubic' }).play().promise()
      );
    }
  });

  Promise.all(animPromises).then(() => {
    if (callback) callback();
  });
}

// ── Interaction ────────────────────────────────────────────────

const detailPanel = document.getElementById('detail-panel');
const detailContent = document.getElementById('detail-content');

// Single click: toggle expand/collapse + show detail
cy.on('tap', 'node', function(evt) {
  const node = evt.target;
  const nodeId = node.id();
  const childCount = node.data('childCount') || 0;

  if (childCount > 0) {
    if (expandedNodes.has(nodeId)) {
      collapseNode(nodeId);
      breadcrumbTrail = breadcrumbTrail.filter(b => b.id !== nodeId);
      updateBreadcrumb();
    } else {
      expandNode(nodeId);

      // Add to breadcrumb
      const existing = breadcrumbTrail.find(b => b.id === nodeId);
      if (!existing) {
        breadcrumbTrail.push({
          id: nodeId,
          label: node.data('label'),
          type: node.data('nodeType'),
        });
        updateBreadcrumb();
      }
    }
  }

  // Show detail and highlight after expansion state changes.
  showDetail(node);
  highlightNode(node);
});

// Double click: collapse
cy.on('dbltap', 'node', function(evt) {
  const nodeId = evt.target.id();
  if (expandedNodes.has(nodeId)) {
    collapseNode(nodeId);
    breadcrumbTrail = breadcrumbTrail.filter(b => b.id !== nodeId);
    updateBreadcrumb();
  }
});

// Click background: clear highlight
cy.on('tap', function(evt) {
  if (evt.target === cy) {
    clearHighlight();
    closePanel();
  }
});

function highlightNode(node) {
  clearHighlight();
  const visible = cy.elements(':visible');
  visible.addClass('faded');
  node.removeClass('faded').addClass('highlighted');

  // Un-fade connected visible nodes
  const connectedEdges = node.connectedEdges(':visible');
  connectedEdges.removeClass('faded');
  connectedEdges.connectedNodes(':visible').removeClass('faded');
}

function clearHighlight() {
  cy.elements().removeClass('faded highlighted');
}

function showDetail(node) {
  const data = node.data();
  const type = data.nodeType;
  const colors = TYPE_COLORS[type] || { bg: '#484f58', text: '#fff' };

  const incoming = node.incomers('edge:visible').map(e => ({
    id: e.source().id(), label: e.source().data('label'),
    type: e.source().data('nodeType'), rel: e.data('label'),
  }));
  const outgoing = node.outgoers('edge:visible').map(e => ({
    id: e.target().id(), label: e.target().data('label'),
    type: e.target().data('nodeType'), rel: e.data('label'),
  }));

  const childCount = data.childCount || 0;
  const isExpanded = expandedNodes.has(node.id());

  let html = '<span class="type-badge" style="background:' + colors.bg + ';color:' + colors.text + '">' + type + '</span>';
  html += '<h2>' + data.label + '</h2>';

  html += '<div class="meta">';
  if (data.file) html += '<strong>File:</strong> ' + data.file + '<br>';
  if (data.operationId) html += '<strong>Operation:</strong> ' + data.operationId + '<br>';
  if (data.summary) html += '<strong>Summary:</strong> ' + data.summary + '<br>';
  if (data.tag) html += '<strong>Tag:</strong> ' + data.tag + '<br>';
  if (data.entity) html += '<strong>Entity:</strong> ' + data.entity + '<br>';
  if (data.attrCount) html += '<strong>Attributes:</strong> ' + data.attrCount + '<br>';
  if (data.ruleCount) html += '<strong>Rules:</strong> ' + data.ruleCount + '<br>';
  if (data.scenarioCount) html += '<strong>Scenarios:</strong> ' + data.scenarioCount + '<br>';
  if (data.stateCount) html += '<strong>States:</strong> ' + data.stateCount + '<br>';
  if (data.transitionCount) html += '<strong>Transitions:</strong> ' + data.transitionCount + '<br>';
  if (data.stepCount) html += '<strong>Steps:</strong> ' + data.stepCount + '<br>';
  html += '</div>';

  // Expand/collapse button
  if (childCount > 0) {
    if (isExpanded) {
      html += '<button class="toolbar-btn" style="margin-bottom:12px;width:100%" onclick="collapseNode(\\'' + node.id().replace(/'/g, "\\\\'") + '\\')">▼ Collapse ' + childCount + ' children</button>';
    } else {
      html += '<button class="toolbar-btn" style="margin-bottom:12px;width:100%;background:#1f6feb;border-color:#1f6feb;color:#fff" onclick="expandAndFocus(\\'' + node.id().replace(/'/g, "\\\\'") + '\\')">▶ Expand ' + childCount + ' children</button>';
    }
  }

  html += '<div class="connections">';
  if (incoming.length > 0) {
    html += '<h3>← Referenced by</h3><ul>';
    for (const c of incoming) {
      html += '<li onclick="focusNode(\\'' + c.id.replace(/'/g, "\\\\'") + '\\')">' + c.label + ' <span class="conn-type">(' + c.rel + ')</span></li>';
    }
    html += '</ul>';
  }
  if (outgoing.length > 0) {
    html += '<h3>→ References</h3><ul>';
    for (const c of outgoing) {
      html += '<li onclick="focusNode(\\'' + c.id.replace(/'/g, "\\\\'") + '\\')">' + c.label + ' <span class="conn-type">(' + c.rel + ')</span></li>';
    }
    html += '</ul>';
  }
  html += '</div>';

  detailContent.innerHTML = html;
  detailPanel.classList.add('open');
  document.getElementById('stats').classList.add('with-panel');
}

function closePanel() {
  detailPanel.classList.remove('open');
  document.getElementById('stats').classList.remove('with-panel');
}

document.getElementById('close-btn').addEventListener('click', () => {
  clearHighlight();
  closePanel();
});

function focusNode(id) {
  const node = cy.getElementById(id);
  if (!node.length) return;

  // Make sure it's visible
  if (node.style('display') === 'none') {
    showNode(id);
    showEdgesBetweenVisible();
    runLayout(() => {
      cy.animate({ center: { eles: node }, zoom: 1.2 }, { duration: 400 });
      setTimeout(() => { showDetail(node); highlightNode(node); }, 450);
    });
  } else {
    cy.animate({ center: { eles: node }, zoom: 1.2 }, { duration: 400 });
    setTimeout(() => { showDetail(node); highlightNode(node); }, 450);
  }
}

function expandAndFocus(id) {
  expandNode(id);
  breadcrumbTrail.push({
    id, label: cy.getElementById(id).data('label'),
    type: cy.getElementById(id).data('nodeType'),
  });
  updateBreadcrumb();
}

// ── Breadcrumb ─────────────────────────────────────────────────

function updateBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  let html = '<span class="crumb" onclick="resetView()">⌂ All Personas</span>';

  for (let i = 0; i < breadcrumbTrail.length; i++) {
    const b = breadcrumbTrail[i];
    const isLast = i === breadcrumbTrail.length - 1;
    html += '<span class="crumb-sep">›</span>';
    html += '<span class="crumb' + (isLast ? ' active' : '') + '" onclick="navigateBreadcrumb(' + i + ')">' + b.label + '</span>';
  }

  el.innerHTML = html;
}

function navigateBreadcrumb(index) {
  // Collapse everything after this index
  const toCollapse = breadcrumbTrail.slice(index + 1).reverse();
  for (const b of toCollapse) {
    collapseNode(b.id);
  }
  breadcrumbTrail = breadcrumbTrail.slice(0, index + 1);
  updateBreadcrumb();

  // Focus on the node
  const nodeId = breadcrumbTrail[index].id;
  const node = cy.getElementById(nodeId);
  if (node.length) {
    cy.animate({ center: { eles: node }, zoom: 1 }, { duration: 400 });
    setTimeout(() => { showDetail(node); highlightNode(node); }, 450);
  }
}

// ── Toolbar ────────────────────────────────────────────────────

function resetView() {
  closePanel();
  clearHighlight();
  showPersonas();
}

function showAll() {
  showAllMode = true;
  expandedNodes.clear();
  breadcrumbTrail = [];
  cy.elements().style('display', 'element');
  cy.nodes().forEach(n => visibleNodes.add(n.id()));
  showEdgesBetweenVisible();
  runLayout(() => {
    cy.fit(cy.elements(), 40);
    updateColumnHeaders();
  });
  updateBreadcrumb();
  updateStats();
}

function adjustSpacing(delta) {
  COL_WIDTH = Math.max(180, Math.min(500, COL_WIDTH + delta));
  ROW_HEIGHT = Math.max(50, Math.min(120, ROW_HEIGHT + Math.round(delta / 3)));
  runLayout(() => {
    cy.fit(cy.elements(':visible'), 60);
    updateColumnHeaders();
  });
}

// ── Stats ──────────────────────────────────────────────────────

function updateStats() {
  const total = cy.nodes().length;
  const visible = cy.nodes(':visible').length;
  const visEdges = cy.edges(':visible').length;
  document.getElementById('stats').textContent =
    visible + ' of ' + total + ' specs · ' + visEdges + ' links';
}

// ── Hint ───────────────────────────────────────────────────────

function showHint(text) {
  const el = document.getElementById('hint');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Column headers ─────────────────────────────────────────────

const COL_LABELS = {
  0: 'Personas',
  1: 'Journeys',
  2: 'Stories',
  3: 'Features / Contracts / Models',
  4: 'Fixtures / Lifecycles',
};

function updateColumnHeaders() {
  const container = document.getElementById('column-headers');
  container.innerHTML = '';

  // Determine which depth columns are currently visible
  const activeDepths = new Set();
  cy.nodes(':visible').forEach(n => {
    activeDepths.add(n.data('depth') ?? 0);
  });

  // Get the current pan/zoom to convert model coords → screen coords
  const pan = cy.pan();
  const zoom = cy.zoom();

  for (const depth of activeDepths) {
    const screenX = LEFT_PAD * zoom + pan.x + depth * COL_WIDTH * zoom;
    const label = COL_LABELS[depth] || ('Depth ' + depth);

    const header = document.createElement('div');
    header.className = 'col-header';
    header.style.left = screenX + 'px';
    header.textContent = label;
    container.appendChild(header);
  }
}

// Update headers on pan/zoom
cy.on('pan zoom', function() {
  updateColumnHeaders();
});

// ── Boot ───────────────────────────────────────────────────────

showPersonas();

</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────

function main() {
  const graph = buildGraph();
  const hierarchy = computeHierarchy(graph);
  const elements = toCytoscapeElements(graph, hierarchy);

  console.log(`\nGenerating HTML...`);
  const html = generateHtml(elements);
  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
  console.log(`\n✅ Written to ${OUTPUT_FILE}`);
  console.log(`   Open in browser: open ${OUTPUT_FILE}`);
}

main();
