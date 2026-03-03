#!/usr/bin/env node

/**
 * Checks that artifacts properly reference each other for traceability.
 *
 * Validates:
 * - Feature files reference stories and journeys
 * - OpenAPI operations reference features
 * - Journey maps reference journeys
 * - Models reference stories
 *
 * Usage: node tools/check-traceability.js [specs-dir]
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const SPECS_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), 'specs');

const results = {
  errors: [],
  warnings: [],
  info: []
};

function fileExists(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.existsSync(fullPath);
}

function findFiles(dir, pattern) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (pattern.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function checkFeatureFiles() {
  const featureDir = path.join(SPECS_DIR, 'features');
  const features = findFiles(featureDir, /\.feature$/);

  for (const featureFile of features) {
    const content = fs.readFileSync(featureFile, 'utf8');
    const relativePath = path.relative(process.cwd(), featureFile);

    // Check for story reference
    const storyMatch = content.match(/# Story: (specs\/stories\/[^\s]+)/);
    if (!storyMatch) {
      results.warnings.push(`${relativePath}: Missing story reference (# Story: specs/stories/...)`);
    } else if (!fileExists(storyMatch[1])) {
      results.errors.push(`${relativePath}: Referenced story not found: ${storyMatch[1]}`);
    }

    // Check for journey reference
    const journeyMatch = content.match(/# Journey: (specs\/journeys\/[^\s]+)/);
    if (!journeyMatch) {
      results.warnings.push(`${relativePath}: Missing journey reference (# Journey: specs/journeys/...)`);
    } else if (!fileExists(journeyMatch[1])) {
      results.errors.push(`${relativePath}: Referenced journey not found: ${journeyMatch[1]}`);
    }

    // Check for contract reference
    const contractMatch = content.match(/# Contract: (GET|POST|PUT|PATCH|DELETE) /);
    if (!contractMatch) {
      results.info.push(`${relativePath}: No contract reference found`);
    }
  }

  results.info.push(`Checked ${features.length} feature file(s)`);
}

function checkOpenAPIContract() {
  const apiFile = path.join(SPECS_DIR, 'contracts/openapi/api.yaml');

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
    // Skip $ref paths (they'll be validated separately)
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
    }
  }

  results.info.push(`Checked ${operationCount} API operation(s)`);
}

function checkJourneyMaps() {
  const mapsDir = path.join(SPECS_DIR, 'journey-maps');
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

    // Check journey reference
    if (map.journey) {
      const journeyPath = `specs/journeys/${map.journey}.md`;
      if (!fileExists(journeyPath)) {
        results.errors.push(`${relativePath}: Referenced journey not found: ${journeyPath}`);
      }
    } else {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    }

    // Check fixture references
    if (map.fixtures) {
      for (const [name, fixture] of Object.entries(map.fixtures)) {
        if (fixture.ref && !fileExists(fixture.ref)) {
          results.errors.push(`${relativePath}: Fixture "${name}" references missing file: ${fixture.ref}`);
        }
      }
    }
  }

  results.info.push(`Checked ${maps.length} journey map(s)`);
}

function checkModels() {
  const modelsDir = path.join(SPECS_DIR, 'models');
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

    // Check source references
    if (model.sources) {
      if (model.sources.stories) {
        for (const storyRef of model.sources.stories) {
          if (!fileExists(storyRef)) {
            results.errors.push(`${relativePath}: Referenced story not found: ${storyRef}`);
          }
        }
      }

      if (model.sources.journeys) {
        for (const journeyRef of model.sources.journeys) {
          if (!fileExists(journeyRef)) {
            results.errors.push(`${relativePath}: Referenced journey not found: ${journeyRef}`);
          }
        }
      }
    }
  }

  results.info.push(`Checked ${models.length} model file(s)`);
}

function checkStories() {
  const storiesDir = path.join(SPECS_DIR, 'stories');
  const stories = findFiles(storiesDir, /\.md$/);

  for (const storyFile of stories) {
    const content = fs.readFileSync(storyFile, 'utf8');
    const relativePath = path.relative(process.cwd(), storyFile);

    // Check for journey reference in story
    const journeyMatch = content.match(/Journey:\s*([^\s\n]+)/);
    if (!journeyMatch) {
      results.warnings.push(`${relativePath}: Missing journey reference`);
    } else {
      const journeyPath = `specs/journeys/${journeyMatch[1]}.md`;
      if (!fileExists(journeyPath)) {
        // Try with .md already included
        if (!fileExists(`specs/journeys/${journeyMatch[1]}`)) {
          results.warnings.push(`${relativePath}: Referenced journey may not exist: ${journeyMatch[1]}`);
        }
      }
    }
  }

  results.info.push(`Checked ${stories.length} story file(s)`);
}

function main() {
  console.log('Checking traceability links...\n');

  checkFeatureFiles();
  checkOpenAPIContract();
  checkJourneyMaps();
  checkModels();
  checkStories();

  console.log('--- Results ---\n');

  if (results.errors.length > 0) {
    console.log('ERRORS:');
    results.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }

  if (results.warnings.length > 0) {
    console.log('WARNINGS:');
    results.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    console.log('');
  }

  console.log('INFO:');
  results.info.forEach(i => console.log(`  ℹ️  ${i}`));

  console.log('\n---');
  console.log(`Errors: ${results.errors.length}, Warnings: ${results.warnings.length}`);

  if (results.errors.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main();
