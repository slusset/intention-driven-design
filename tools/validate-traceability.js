#!/usr/bin/env node

/**
 * Checks that artifacts properly reference each other for traceability.
 *
 * Validates:
 * - Feature files reference stories and journeys
 * - Contract operations reference stories, features, and journeys
 * - Journey maps reference journeys
 * - Models reference stories
 * - Stories reference journeys
 * - Fixtures reference stories and features
 *
 * Prefers front-matter (id/type/refs) when present, falls back to
 * legacy conventions (inline comments, prose patterns).
 * See docs/idd/front-matter-spec.md for the front-matter specification.
 *
 * Usage:
 *   node tools/validate-traceability.js [specs-dir]
 *   node tools/validate-traceability.js --files file1.feature file2.yaml
 *
 * Options:
 *   --files <paths...>  Check only specific files
 *   --json              Output results as JSON (for GitHub Action parsing)
 *   --strict            Treat warnings as errors
 *
 * Exit: 0 = pass, 1 = errors found
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {
  extractContractOperations,
  loadContractDocuments,
  protocolDisplayName,
} = require('./lib/contracts');
const {
  parseFrontMatter,
  referenceValues,
  findFiles,
  fileExists,
  formatResults,
} = require('./lib/parse-front-matter');

// ── Parse arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);
let specsDir = null;
let specificFiles = null;
let jsonOutput = false;
let strict = false;

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--files') {
    specificFiles = [];
    i += 1;
    while (i < args.length && !args[i].startsWith('--')) {
      specificFiles.push(args[i]);
      i += 1;
    }
    i -= 1;
  } else if (args[i] === '--json') {
    jsonOutput = true;
  } else if (args[i] === '--strict') {
    strict = true;
  } else if (!args[i].startsWith('--')) {
    specsDir = path.resolve(args[i]);
  }
}

if (!specsDir) {
  specsDir = path.join(process.cwd(), 'specs');
}

const rootPrefix = path.relative(process.cwd(), specsDir).replace(/\\/g, '/');
const specificFileSet = specificFiles
  ? new Set(
    specificFiles
      .map(filePath => path.relative(process.cwd(), path.resolve(filePath)).replace(/\\/g, '/'))
  )
  : null;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isScopedRef(ref) {
  return typeof ref === 'string' && (rootPrefix === '' || ref.startsWith(`${rootPrefix}/`));
}

function normalizeReferencePath(ref) {
  if (typeof ref !== 'string') return ref;
  return ref.replace(/\s+\([^)]*\)\s*$/, '');
}

function fileExistsIfScoped(ref) {
  const normalizedRef = normalizeReferencePath(ref);
  return !isScopedRef(normalizedRef) || fileExists(normalizedRef);
}

function filterFilesBySelection(files) {
  if (!specificFileSet) return files;
  return files.filter(filePath => specificFileSet.has(path.relative(process.cwd(), filePath).replace(/\\/g, '/')));
}

const results = {
  errors: [],
  warnings: [],
  info: []
};

// ── Feature files ─────────────────────────────────────────────────────
function checkFeatureFiles() {
  const featureDir = path.join(specsDir, 'features');
  const features = filterFilesBySelection(findFiles(featureDir, /\.feature$/));

  for (const featureFile of features) {
    const content = fs.readFileSync(featureFile, 'utf8');
    const relativePath = path.relative(process.cwd(), featureFile);

    // Try front-matter first
    const parsed = parseFrontMatter(featureFile, content);
    if (parsed.parseError) {
      results.errors.push(`${relativePath}: Parse error: ${parsed.parseError}`);
      continue;
    }
    let storyFound = false;
    let journeyFound = false;
    let contractFound = false;

    if (parsed.frontMatter) {
      // Front-matter path: # story: <root>/stories/...
      for (const story of referenceValues(parsed.frontMatter, 'story')) {
        storyFound = true;
        if (!fileExistsIfScoped(story)) {
          results.errors.push(`${relativePath}: Referenced story not found: ${story}`);
        }
      }

      for (const journey of referenceValues(parsed.frontMatter, 'journey')) {
        journeyFound = true;
        if (!fileExistsIfScoped(journey)) {
          results.errors.push(`${relativePath}: Referenced journey not found: ${journey}`);
        }
      }

      const contract = parsed.frontMatter.contract;
      if (contract) {
        contractFound = true;
      }
    }

    // Report missing references
    if (!storyFound) {
      results.warnings.push(`${relativePath}: Missing story reference`);
    }
    if (!journeyFound) {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    }
    if (!contractFound) {
      results.info.push(`${relativePath}: No contract reference found`);
    }
  }

  results.info.push(`Checked ${features.length} feature file(s)`);
}

// ── Contracts ─────────────────────────────────────────────────────────
function checkContracts() {
  const selectedPaths = specificFileSet
    ? new Set(Array.from(specificFileSet).map(filePath => path.resolve(filePath)))
    : null;
  const loadedContracts = loadContractDocuments(specsDir, results)
    .filter(contract => !selectedPaths || selectedPaths.has(contract.filePath));

  if (loadedContracts.length === 0) {
    results.info.push('No contract artifacts found, skipping');
    return;
  }

  let operationCount = 0;

  for (const contract of loadedContracts) {
    const contractLabel = contract.relativePath;
    const operations = extractContractOperations(contract);

    if (operations.length === 0) {
      results.info.push(`${contractLabel}: ${protocolDisplayName(contract.protocol)} contract has no operations defined`);
      continue;
    }

    for (const operation of operations) {
      operationCount += 1;
      if (operation.errors?.length) {
        results.errors.push(...operation.errors.map(error => `${contractLabel}: ${error}`));
        continue;
      }
      const opId = operation.label || operation.signature;

      if (operation.storyRefs.length === 0) {
        results.warnings.push(`${contractLabel}: Operation ${opId}: Missing x-story extension`);
      } else {
        for (const storyRef of operation.storyRefs) {
          if (!fileExistsIfScoped(storyRef)) {
            results.errors.push(`${contractLabel}: Operation ${opId}: Referenced story not found: ${storyRef}`);
          }
        }
      }

      if (operation.featureRefs.length === 0) {
        results.warnings.push(`${contractLabel}: Operation ${opId}: Missing x-feature extension`);
      } else {
        for (const featureRef of operation.featureRefs) {
          if (!fileExistsIfScoped(featureRef)) {
            results.errors.push(`${contractLabel}: Operation ${opId}: Referenced feature not found: ${featureRef}`);
          }
        }
      }

      if (operation.journeyRefs.length === 0) {
        results.info.push(`${contractLabel}: Operation ${opId}: No x-journey extension (optional)`);
      } else {
        for (const journeyRef of operation.journeyRefs) {
          if (!fileExistsIfScoped(journeyRef)) {
            results.errors.push(`${contractLabel}: Operation ${opId}: Referenced journey not found: ${journeyRef}`);
          }
        }
      }
    }
  }

  results.info.push(`Checked ${operationCount} contract operation(s) across ${loadedContracts.length} contract file(s)`);
}

// ── Journey maps ──────────────────────────────────────────────────────
function checkJourneyMaps() {
  const mapsDir = path.join(specsDir, 'journey-maps');
  const maps = filterFilesBySelection(findFiles(mapsDir, /\.(?:map|journey-map)\.ya?ml$/));

  for (const mapFile of maps) {
    const relativePath = path.relative(process.cwd(), mapFile);

    let map;
    try {
      const content = fs.readFileSync(mapFile, 'utf8');
      map = yaml.load(content);
    } catch (e) {
      results.errors.push(`${relativePath}: Failed to parse: ${e.message}`);
      continue;
    }

    // Check journey reference — prefer sources.journey (front-matter style),
    // fall back to top-level journey field (legacy)
    let journeyRef = null;

    if (map.sources && map.sources.journey) {
      journeyRef = map.sources.journey;
    } else if (map.journey) {
      // Legacy: journey field is a slug, not a full path
      journeyRef = `${rootPrefix}/journeys/${map.journey}.md`;
    }

    if (journeyRef) {
      if (!fileExistsIfScoped(journeyRef)) {
        results.errors.push(`${relativePath}: Referenced journey not found: ${journeyRef}`);
      }
    } else {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    }

    // Check fixture references
    if (map.fixtures) {
      for (const [name, fixture] of Object.entries(map.fixtures)) {
        if (fixture && fixture.ref && !fileExistsIfScoped(fixture.ref)) {
          results.errors.push(`${relativePath}: Fixture "${name}" references missing file: ${fixture.ref}`);
        }
      }
    }

    // Check story references in sources block
    if (map.sources && map.sources.stories) {
      for (const storyRef of map.sources.stories) {
        if (!fileExistsIfScoped(storyRef)) {
          results.errors.push(`${relativePath}: Referenced story not found: ${storyRef}`);
        }
      }
    }

    // Check feature references in sources block
    if (map.sources && map.sources.features) {
      for (const featureRef of map.sources.features) {
        if (!fileExistsIfScoped(featureRef)) {
          results.errors.push(`${relativePath}: Referenced feature not found: ${featureRef}`);
        }
      }
    }
  }

  results.info.push(`Checked ${maps.length} journey map(s)`);
}

// ── Models ────────────────────────────────────────────────────────────
function checkModels() {
  const modelsDir = path.join(specsDir, 'models');
  const models = filterFilesBySelection(findFiles(modelsDir, /\.model\.ya?ml$/));

  for (const modelFile of models) {
    const relativePath = path.relative(process.cwd(), modelFile);

    let model;
    try {
      const content = fs.readFileSync(modelFile, 'utf8');
      model = yaml.load(content);
    } catch (e) {
      results.errors.push(`${relativePath}: Failed to parse: ${e.message}`);
      continue;
    }

    // Check source references (stories, journeys)
    if (model.sources) {
      if (model.sources.stories) {
        for (const storyRef of model.sources.stories) {
          if (!fileExistsIfScoped(storyRef)) {
            results.errors.push(`${relativePath}: Referenced story not found: ${storyRef}`);
          }
        }
      }

      if (model.sources.journeys) {
        for (const journeyRef of model.sources.journeys) {
          if (!fileExistsIfScoped(journeyRef)) {
            results.errors.push(`${relativePath}: Referenced journey not found: ${journeyRef}`);
          }
        }
      }
    }

    // Check lifecycle reference if present
    if (model.status && model.status.see) {
      const lifecyclePath = path.join(path.dirname(modelFile), model.status.see);
      if (!fs.existsSync(lifecyclePath)) {
        results.warnings.push(`${relativePath}: Referenced lifecycle not found: ${model.status.see}`);
      }
    }
  }

  results.info.push(`Checked ${models.length} model file(s)`);
}

// ── Stories ───────────────────────────────────────────────────────────
function checkStories() {
  const storiesDir = path.join(specsDir, 'stories');
  const stories = filterFilesBySelection(findFiles(storiesDir, /\.md$/));

  for (const storyFile of stories) {
    const content = fs.readFileSync(storyFile, 'utf8');
    const relativePath = path.relative(process.cwd(), storyFile);

    // Try front-matter first
    const parsed = parseFrontMatter(storyFile, content);
    let journeyFound = false;
    let personaFound = false;

    if (parsed.frontMatter && parsed.frontMatter.refs) {
      const refs = parsed.frontMatter.refs;

      if (refs.journey) {
        journeyFound = true;
        if (!fileExistsIfScoped(refs.journey)) {
          results.errors.push(`${relativePath}: Referenced journey not found: ${refs.journey}`);
        }
      }

      if (refs.persona) {
        personaFound = true;
        if (!fileExistsIfScoped(refs.persona)) {
          results.errors.push(`${relativePath}: Referenced persona not found: ${refs.persona}`);
        }
      }
    }

    // Fall back to legacy patterns
    if (!journeyFound) {
      const journeyMatch = content.match(new RegExp(`[Jj]ourney:\\s*(?:${escapeRegExp(rootPrefix)}\\/journeys\\/)?([^\\s\\n]+)`));
      if (journeyMatch) {
        journeyFound = true;
        const ref = journeyMatch[1];
        // Could be a full path or just a slug
        const journeyPath = ref.startsWith(`${rootPrefix}/`)
          ? ref
          : `${rootPrefix}/journeys/${ref}${ref.endsWith('.md') ? '' : '.md'}`;
        if (!fileExistsIfScoped(journeyPath)) {
          results.warnings.push(`${relativePath}: Referenced journey may not exist: ${ref}`);
        }
      }
    }

    if (!journeyFound) {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    }

    if (!personaFound) {
      // Check legacy pattern
      const personaMatch = content.match(new RegExp(`[Pp]ersona:\\s*(?:${escapeRegExp(rootPrefix)}\\/personas\\/)?([^\\s\\n]+)`));
      if (!personaMatch) {
        results.info.push(`${relativePath}: No persona reference found (optional)`);
      }
    }
  }

  results.info.push(`Checked ${stories.length} story file(s)`);
}

// ── Fixtures ──────────────────────────────────────────────────────────
function checkFixtures() {
  const fixturesDir = path.join(specsDir, 'fixtures');
  const fixtures = filterFilesBySelection(findFiles(fixturesDir, /\.(?:json|fixture\.ya?ml)$/));

  for (const fixtureFile of fixtures) {
    const relativePath = path.relative(process.cwd(), fixtureFile);

    let content;
    try {
      content = fs.readFileSync(fixtureFile, 'utf8');
    } catch (e) {
      results.errors.push(`${relativePath}: Cannot read file: ${e.message}`);
      continue;
    }

    const parsed = parseFrontMatter(fixtureFile, content);

    if (parsed.parseError) {
      results.errors.push(`${relativePath}: Parse error: ${parsed.parseError}`);
      continue;
    }

    if (!parsed.frontMatter) {
      results.warnings.push(`${relativePath}: Missing fixture metadata`);
      continue;
    }

    const meta = parsed.frontMatter;

    // Check story reference
    const stories = referenceValues(meta, 'story');
    if (stories.length > 0) {
      for (const story of stories) {
        if (!fileExistsIfScoped(story)) {
          results.errors.push(`${relativePath}: Referenced story not found: ${story}`);
        }
      }
    } else {
      results.warnings.push(`${relativePath}: Missing story reference`);
    }

    // Check feature reference
    if (meta.feature) {
      if (!fileExistsIfScoped(meta.feature)) {
        results.errors.push(`${relativePath}: Referenced feature not found: ${meta.feature}`);
      }
    } else {
      results.info.push(`${relativePath}: No feature reference (optional)`);
    }
    for (const field of ['journey', 'scenario']) {
      for (const ref of referenceValues(meta, field)) {
        if (!fileExistsIfScoped(ref)) {
          results.errors.push(`${relativePath}: Referenced ${field} not found: ${ref}`);
        }
      }
    }
  }

  results.info.push(`Checked ${fixtures.length} fixture file(s)`);
}

// ── Personas ──────────────────────────────────────────────────────────
function checkPersonas() {
  const personaDir = path.join(specsDir, 'personas');
  const personas = filterFilesBySelection(findFiles(personaDir, /\.md$/));

  // Personas are root nodes — no upstream refs to check.
  // Just verify they're parseable and have front-matter.
  for (const personaFile of personas) {
    const content = fs.readFileSync(personaFile, 'utf8');
    const relativePath = path.relative(process.cwd(), personaFile);
    const parsed = parseFrontMatter(personaFile, content);

    if (!parsed.frontMatter) {
      results.info.push(`${relativePath}: No front-matter (legacy format)`);
    }
  }

  results.info.push(`Found ${personas.length} persona file(s)`);
}

// ── Journeys ──────────────────────────────────────────────────────────
function checkJourneys() {
  const journeyDir = path.join(specsDir, 'journeys');
  const journeys = filterFilesBySelection(findFiles(journeyDir, /\.md$/));

  for (const journeyFile of journeys) {
    const content = fs.readFileSync(journeyFile, 'utf8');
    const relativePath = path.relative(process.cwd(), journeyFile);

    const parsed = parseFrontMatter(journeyFile, content);
    let personaFound = false;

    if (parsed.frontMatter && parsed.frontMatter.refs && parsed.frontMatter.refs.persona) {
      personaFound = true;
      const personaRef = parsed.frontMatter.refs.persona;
      if (!fileExistsIfScoped(personaRef)) {
        results.errors.push(`${relativePath}: Referenced persona not found: ${personaRef}`);
      }
    }

    if (!personaFound) {
      // Legacy: check for inline persona reference
      const personaMatch = content.match(new RegExp(`[Pp]ersona:\\s*(?:${escapeRegExp(rootPrefix)}\\/personas\\/)?([^\\s\\n]+)`));
      if (personaMatch) {
        personaFound = true;
        const ref = personaMatch[1];
        const personaPath = ref.startsWith(`${rootPrefix}/`)
          ? ref
          : `${rootPrefix}/personas/${ref}${ref.endsWith('.md') ? '' : '.md'}`;
        if (!fileExistsIfScoped(personaPath)) {
          results.warnings.push(`${relativePath}: Referenced persona may not exist: ${ref}`);
        }
      }
    }

    if (!personaFound) {
      results.warnings.push(`${relativePath}: Missing persona reference`);
    }
  }

  results.info.push(`Checked ${journeys.length} journey file(s)`);
}

// ── Main ──────────────────────────────────────────────────────────────
function main() {
  if (!jsonOutput) {
    console.log('Checking traceability links...\n');
  }

  checkPersonas();
  checkJourneys();
  checkStories();
  checkFeatureFiles();
  checkContracts();
  checkFixtures();
  checkJourneyMaps();
  checkModels();

  if (strict && results.warnings.length > 0) {
    results.errors.push(...results.warnings.map(warning => `${warning} (strict mode)`));
    results.warnings = [];
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('--- Results ---\n');
    console.log(formatResults(results));
  }

  if (results.errors.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main();
