#!/usr/bin/env node

/**
 * Checks that artifacts properly reference each other for traceability.
 *
 * Validates:
 * - Feature files reference stories and journeys
 * - OpenAPI operations reference features
 * - Journey maps reference journeys
 * - Models reference stories
 * - Stories reference journeys
 * - Fixtures reference stories and features
 *
 * Prefers front-matter (id/type/refs) when present, falls back to
 * legacy conventions (inline comments, prose patterns).
 * See docs/idd/front-matter-spec.md for the front-matter specification.
 *
 * Usage: node tools/check-traceability.js [specs-dir]
 *
 * Options:
 *   --json    Output results as JSON (for GitHub Action parsing)
 *
 * Exit: 0 = pass, 1 = errors found
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const {
  parseFrontMatter,
  extractRefs,
  findFiles,
  fileExists,
  formatResults,
} = require('./lib/parse-front-matter');

// ── Parse arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);
let specsDir = null;
let jsonOutput = false;

for (const arg of args) {
  if (arg === '--json') {
    jsonOutput = true;
  } else if (!arg.startsWith('--')) {
    specsDir = path.resolve(arg);
  }
}

if (!specsDir) {
  specsDir = path.join(process.cwd(), 'specs');
}

const results = {
  errors: [],
  warnings: [],
  info: []
};

// ── Feature files ─────────────────────────────────────────────────────
function checkFeatureFiles() {
  const featureDir = path.join(specsDir, 'features');
  const features = findFiles(featureDir, /\.feature$/);

  for (const featureFile of features) {
    const content = fs.readFileSync(featureFile, 'utf8');
    const relativePath = path.relative(process.cwd(), featureFile);

    // Try front-matter first
    const parsed = parseFrontMatter(featureFile, content);
    let storyFound = false;
    let journeyFound = false;
    let contractFound = false;

    if (parsed.frontMatter) {
      // Front-matter path: # story: specs/stories/...
      const story = parsed.frontMatter.story;
      if (story) {
        storyFound = true;
        if (story.startsWith('specs/') && !fileExists(story)) {
          results.errors.push(`${relativePath}: Referenced story not found: ${story}`);
        }
      }

      const journey = parsed.frontMatter.journey;
      if (journey) {
        journeyFound = true;
        if (journey.startsWith('specs/') && !fileExists(journey)) {
          results.errors.push(`${relativePath}: Referenced journey not found: ${journey}`);
        }
      }

      const contract = parsed.frontMatter.contract;
      if (contract) {
        contractFound = true;
      }
    }

    // Fall back to legacy patterns if front-matter didn't provide the ref
    if (!storyFound) {
      const storyMatch = content.match(/# [Ss]tory:\s*(specs\/stories\/[^\s]+)/);
      if (storyMatch) {
        storyFound = true;
        if (!fileExists(storyMatch[1])) {
          results.errors.push(`${relativePath}: Referenced story not found: ${storyMatch[1]}`);
        }
      }
    }

    if (!journeyFound) {
      const journeyMatch = content.match(/# [Jj]ourney:\s*(specs\/journeys\/[^\s]+)/);
      if (journeyMatch) {
        journeyFound = true;
        if (!fileExists(journeyMatch[1])) {
          results.errors.push(`${relativePath}: Referenced journey not found: ${journeyMatch[1]}`);
        }
      }
    }

    if (!contractFound) {
      const contractMatch = content.match(/# [Cc]ontract:\s*(GET|POST|PUT|PATCH|DELETE)\s/);
      contractFound = !!contractMatch;
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

// ── OpenAPI contract ──────────────────────────────────────────────────
function checkOpenAPIContract() {
  const apiFile = path.join(specsDir, 'contracts/openapi/api.yaml');

  if (!fs.existsSync(apiFile)) {
    results.info.push('OpenAPI contract not found, skipping');
    return;
  }

  let api;
  try {
    const content = fs.readFileSync(apiFile, 'utf8');
    api = yaml.load(content);
  } catch (e) {
    results.errors.push(`Failed to parse OpenAPI spec: ${e.message}`);
    return;
  }

  if (!api.paths) {
    results.info.push('OpenAPI spec has no paths defined');
    return;
  }

  let operationCount = 0;

  for (const [pathKey, pathItem] of Object.entries(api.paths)) {
    // Skip $ref paths (they'll be validated when resolved)
    if (pathItem.$ref) continue;

    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = pathItem[method];
      if (!operation) continue;

      operationCount++;
      const opId = operation.operationId || `${method.toUpperCase()} ${pathKey}`;

      // Check for x-story
      if (!operation['x-story']) {
        results.warnings.push(`Operation ${opId}: Missing x-story extension`);
      }

      // Check for x-feature
      if (!operation['x-feature']) {
        results.warnings.push(`Operation ${opId}: Missing x-feature extension`);
      } else if (!fileExists(operation['x-feature'])) {
        results.errors.push(`Operation ${opId}: Referenced feature not found: ${operation['x-feature']}`);
      }

      // Check for x-journey (new — from front-matter conventions)
      if (!operation['x-journey']) {
        results.info.push(`Operation ${opId}: No x-journey extension (optional)`);
      } else if (operation['x-journey'].startsWith('specs/') && !fileExists(operation['x-journey'])) {
        results.errors.push(`Operation ${opId}: Referenced journey not found: ${operation['x-journey']}`);
      }
    }
  }

  results.info.push(`Checked ${operationCount} API operation(s)`);
}

// ── Journey maps ──────────────────────────────────────────────────────
function checkJourneyMaps() {
  const mapsDir = path.join(specsDir, 'journey-maps');
  const maps = findFiles(mapsDir, /\.map\.ya?ml$/);

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
      journeyRef = `specs/journeys/${map.journey}.md`;
    }

    if (journeyRef) {
      if (!fileExists(journeyRef)) {
        results.errors.push(`${relativePath}: Referenced journey not found: ${journeyRef}`);
      }
    } else {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    }

    // Check fixture references
    if (map.fixtures) {
      for (const [name, fixture] of Object.entries(map.fixtures)) {
        if (fixture && fixture.ref && !fileExists(fixture.ref)) {
          results.errors.push(`${relativePath}: Fixture "${name}" references missing file: ${fixture.ref}`);
        }
      }
    }

    // Check story references in sources block
    if (map.sources && map.sources.stories) {
      for (const storyRef of map.sources.stories) {
        if (typeof storyRef === 'string' && !fileExists(storyRef)) {
          results.errors.push(`${relativePath}: Referenced story not found: ${storyRef}`);
        }
      }
    }

    // Check feature references in sources block
    if (map.sources && map.sources.features) {
      for (const featureRef of map.sources.features) {
        if (typeof featureRef === 'string' && !fileExists(featureRef)) {
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
  const models = findFiles(modelsDir, /\.model\.ya?ml$/);

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
          if (typeof storyRef === 'string' && !fileExists(storyRef)) {
            results.errors.push(`${relativePath}: Referenced story not found: ${storyRef}`);
          }
        }
      }

      if (model.sources.journeys) {
        for (const journeyRef of model.sources.journeys) {
          if (typeof journeyRef === 'string' && !fileExists(journeyRef)) {
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
  const stories = findFiles(storiesDir, /\.md$/);

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
        if (typeof refs.journey === 'string' && refs.journey.startsWith('specs/') && !fileExists(refs.journey)) {
          results.errors.push(`${relativePath}: Referenced journey not found: ${refs.journey}`);
        }
      }

      if (refs.persona) {
        personaFound = true;
        if (typeof refs.persona === 'string' && refs.persona.startsWith('specs/') && !fileExists(refs.persona)) {
          results.errors.push(`${relativePath}: Referenced persona not found: ${refs.persona}`);
        }
      }
    }

    // Fall back to legacy patterns
    if (!journeyFound) {
      const journeyMatch = content.match(/[Jj]ourney:\s*(?:specs\/journeys\/)?([^\s\n]+)/);
      if (journeyMatch) {
        journeyFound = true;
        const ref = journeyMatch[1];
        // Could be a full path or just a slug
        const journeyPath = ref.startsWith('specs/')
          ? ref
          : `specs/journeys/${ref}${ref.endsWith('.md') ? '' : '.md'}`;
        if (!fileExists(journeyPath)) {
          results.warnings.push(`${relativePath}: Referenced journey may not exist: ${ref}`);
        }
      }
    }

    if (!journeyFound) {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    }

    if (!personaFound) {
      // Check legacy pattern
      const personaMatch = content.match(/[Pp]ersona:\s*(?:specs\/personas\/)?([^\s\n]+)/);
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
  const fixtures = findFiles(fixturesDir, /\.json$/);

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

    if (!parsed.frontMatter) {
      results.warnings.push(`${relativePath}: Missing _meta block`);
      continue;
    }

    const meta = parsed.frontMatter;

    // Check story reference
    if (meta.story) {
      if (typeof meta.story === 'string' && meta.story.startsWith('specs/') && !fileExists(meta.story)) {
        results.errors.push(`${relativePath}: Referenced story not found: ${meta.story}`);
      }
    } else {
      results.warnings.push(`${relativePath}: Missing _meta.story reference`);
    }

    // Check feature reference
    if (meta.feature) {
      if (typeof meta.feature === 'string' && meta.feature.startsWith('specs/') && !fileExists(meta.feature)) {
        results.errors.push(`${relativePath}: Referenced feature not found: ${meta.feature}`);
      }
    } else {
      results.info.push(`${relativePath}: No _meta.feature reference (optional)`);
    }
  }

  results.info.push(`Checked ${fixtures.length} fixture file(s)`);
}

// ── Personas ──────────────────────────────────────────────────────────
function checkPersonas() {
  const personaDir = path.join(specsDir, 'personas');
  const personas = findFiles(personaDir, /\.md$/);

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
  const journeys = findFiles(journeyDir, /\.md$/);

  for (const journeyFile of journeys) {
    const content = fs.readFileSync(journeyFile, 'utf8');
    const relativePath = path.relative(process.cwd(), journeyFile);

    const parsed = parseFrontMatter(journeyFile, content);
    let personaFound = false;

    if (parsed.frontMatter && parsed.frontMatter.refs && parsed.frontMatter.refs.persona) {
      personaFound = true;
      const personaRef = parsed.frontMatter.refs.persona;
      if (typeof personaRef === 'string' && personaRef.startsWith('specs/') && !fileExists(personaRef)) {
        results.errors.push(`${relativePath}: Referenced persona not found: ${personaRef}`);
      }
    }

    if (!personaFound) {
      // Legacy: check for inline persona reference
      const personaMatch = content.match(/[Pp]ersona:\s*(?:specs\/personas\/)?([^\s\n]+)/);
      if (personaMatch) {
        personaFound = true;
        const ref = personaMatch[1];
        const personaPath = ref.startsWith('specs/')
          ? ref
          : `specs/personas/${ref}${ref.endsWith('.md') ? '' : '.md'}`;
        if (!fileExists(personaPath)) {
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
  checkOpenAPIContract();
  checkFixtures();
  checkJourneyMaps();
  checkModels();

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
