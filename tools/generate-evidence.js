#!/usr/bin/env node

/**
 * Generate a certification evidence manifest from a capability definition.
 *
 * Evidence is derived output — recomputed from specs and test reports on the
 * commit being certified. It feeds the CI evidence report (job summary, PR
 * comment, workflow artifact) and is never committed to the repository. The
 * default output location is the gitignored `.idd/evidence/` workspace.
 *
 * This is intentionally a first-pass generator:
 * - Loads the capability scope
 * - Verifies referenced scope files exist
 * - Computes deterministic traceability ratios that can be inferred from specs
 * - Incorporates optional test report metadata when report paths are provided
 * - Emits YAML or JSON
 *
 * Usage:
 *   node tools/generate-evidence.js --capability specs/capabilities/foo.capability.yaml
 *   node tools/generate-evidence.js --capability ... --write
 *   node tools/generate-evidence.js --capability ... --json
 *
 * Options:
 *   --capability <path>      Required capability file
 *   --modules-manifest <path> Module manifest used for root/module metadata (default: specs/modules.yaml)
 *   --output <path>          Output evidence path (default: .idd/evidence/{id}/evidence.yaml)
 *   --reports-dir <path>     Directory containing report files
 *   --unit-report <path>     Unit/integration report file
 *   --contract-report <path> Contract/API report file
 *   --e2e-report <path>      E2E report file
 *   --coverage-report <path> Coverage report file
 *   --certified-by <value>   Defaults to CI when GITHUB_ACTIONS=true, else Codex
 *   --certified-at <value>   Defaults to current UTC timestamp
 *   --write                  Write evidence manifest to disk
 *   --json                   Output machine-readable results (includes the full manifest)
 *
 * Exit: 0 = generated, 1 = invalid capability or blocking errors
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { extractContractOperations, parseContractDocument } = require('./lib/contracts');
const { parseFrontMatter, fileExists, findFiles, formatResults } = require('./lib/parse-front-matter');

const args = process.argv.slice(2);

let capabilityPath = null;
let modulesManifestPath = null;
let outputPath = null;
let reportsDir = null;
let unitReportPath = null;
let contractReportPath = null;
let e2eReportPath = null;
let coverageReportPath = null;
let certifiedBy = process.env.GITHUB_ACTIONS === 'true' ? 'CI' : 'Codex';
let certifiedAt = new Date().toISOString();
let writeOutput = false;
let jsonOutput = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--capability') {
    capabilityPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--modules-manifest') {
    modulesManifestPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--output') {
    outputPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--reports-dir') {
    reportsDir = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--unit-report') {
    unitReportPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--contract-report') {
    contractReportPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--e2e-report') {
    e2eReportPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--coverage-report') {
    coverageReportPath = path.resolve(args[i + 1]);
    i += 1;
  } else if (arg === '--certified-by') {
    certifiedBy = args[i + 1];
    i += 1;
  } else if (arg === '--certified-at') {
    certifiedAt = args[i + 1];
    i += 1;
  } else if (arg === '--write') {
    writeOutput = true;
  } else if (arg === '--json') {
    jsonOutput = true;
  }
}

const results = {
  errors: [],
  warnings: [],
  info: [],
};

function toProjectRelative(absolutePath) {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
}

function normalizeRef(ref) {
  return String(ref || '').replace(/\\/g, '/');
}

function moduleContextForCapability() {
  const manifestPath = modulesManifestPath || path.join(process.cwd(), 'specs', 'modules.yaml');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = readYaml(manifestPath);
  } catch (error) {
    results.warnings.push(`${toProjectRelative(manifestPath)}: Failed to read module context: ${error.message}`);
    return null;
  }

  const capabilityRel = normalizeRef(path.relative(process.cwd(), capabilityPath));
  for (const [name, module] of Object.entries(manifest?.modules || {})) {
    for (const declared of module.capabilities || []) {
      if (normalizeRef(declared) !== capabilityRel) continue;
      const root = normalizeRef(module.root || 'specs').replace(/\/+$/, '');
      const capabilityId = capabilityRel
        .replace(/^.*\//, '')
        .replace(/\.capability\.ya?ml$/i, '');
      return {
        name,
        root,
        verification_map: `${root}/verification/${capabilityId}/verification.yaml`,
      };
    }
  }

  results.warnings.push(`${capabilityRel}: capability is not assigned to a module in ${toProjectRelative(manifestPath)}`);
  return null;
}

function ratio(covered, total) {
  return `${covered}/${total}`;
}

function readYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureCapability() {
  if (!capabilityPath) {
    results.errors.push('Missing required option: --capability <path>');
    return null;
  }

  if (!fs.existsSync(capabilityPath)) {
    results.errors.push(`Capability file not found: ${toProjectRelative(capabilityPath)}`);
    return null;
  }

  let capability;
  try {
    capability = readYaml(capabilityPath);
  } catch (error) {
    results.errors.push(`Failed to parse capability file: ${error.message}`);
    return null;
  }

  if (!capability || capability.type !== 'capability' || !capability.scope) {
    results.errors.push(`${toProjectRelative(capabilityPath)} is not a valid capability artifact`);
    return null;
  }

  if (!capability.id) {
    results.errors.push(`${toProjectRelative(capabilityPath)} is missing required field: id`);
    return null;
  }

  return capability;
}

function getScopeEntries(scope, key) {
  const direct = scope[key];
  if (Array.isArray(direct)) return direct.map(normalizeRef);

  const aliases = {
    journeyMaps: ['journey_maps', 'journey-maps'],
    contracts: ['contracts'],
    features: ['features'],
    stories: ['stories'],
    journeys: ['journeys'],
    models: ['models'],
    fixtures: ['fixtures'],
    personas: ['personas'],
  };

  for (const alias of aliases[key] || []) {
    if (Array.isArray(scope[alias])) {
      return scope[alias].map(normalizeRef);
    }
  }

  return [];
}

function validateScopeFiles(scope) {
  const categories = ['personas', 'journeys', 'stories', 'features', 'models', 'contracts', 'fixtures'];
  const optionalCategories = ['journeyMaps'];

  for (const category of categories.concat(optionalCategories)) {
    const entries = getScopeEntries(scope, category);
    for (const entry of entries) {
      if (!fileExists(entry)) {
        results.errors.push(`Capability scope references missing ${category} file: ${entry}`);
      }
    }
  }
}

function loadFeatureHeaders(featurePaths) {
  const featureHeaders = new Map();

  for (const featurePath of featurePaths) {
    try {
      const content = readText(path.resolve(featurePath));
      const parsed = parseFrontMatter(featurePath, content);
      featureHeaders.set(normalizeRef(featurePath), parsed.frontMatter || {});
    } catch (error) {
      results.warnings.push(`${featurePath}: Failed to read feature header: ${error.message}`);
    }
  }

  return featureHeaders;
}

function loadContractOperations(contractPaths) {
  const operations = [];

  for (const contractPath of contractPaths) {
    const resolvedPath = path.resolve(contractPath);
    const relativePath = normalizeRef(contractPath);

    try {
      const document = parseContractDocument(resolvedPath);
      let protocol = null;
      if (document && document.openapi) protocol = 'openapi';
      else if (document && document.asyncapi) protocol = 'asyncapi';
      else if (document && (document.jsonrpc || document.methods)) protocol = 'json-rpc';

      if (!protocol) {
        results.warnings.push(`${contractPath}: Unable to infer contract protocol for evidence generation`);
        continue;
      }

      const contract = {
        protocol,
        filePath: resolvedPath,
        relativePath,
        document,
      };

      operations.push(...extractContractOperations(contract).map(operation => ({
        signature: operation.signature,
        xStory: operation.storyRefs[0] || '',
        xFeatures: operation.featureRefs,
        xJourney: operation.journeyRefs[0] || '',
      })));
    } catch (error) {
      results.errors.push(`${contractPath}: Failed to parse contract: ${error.message}`);
    }
  }

  return operations;
}

function computeTraceability(scope) {
  const stories = getScopeEntries(scope, 'stories');
  const journeys = getScopeEntries(scope, 'journeys');
  const features = getScopeEntries(scope, 'features');
  const contracts = getScopeEntries(scope, 'contracts');
  const journeyMaps = getScopeEntries(scope, 'journeyMaps');

  const featureHeaders = loadFeatureHeaders(features);
  const operations = loadContractOperations(contracts);

  let coveredStories = 0;
  for (const story of stories) {
    const hasFeature = features.some(featurePath => {
      const header = featureHeaders.get(featurePath) || {};
      return normalizeRef(header.story) === story;
    });
    if (hasFeature) coveredStories += 1;
  }

  let coveredFeatures = 0;
  let orphanFeatures = 0;
  for (const featurePath of features) {
    const header = featureHeaders.get(featurePath) || {};
    if (!header.story) {
      orphanFeatures += 1;
    }
    const hasContract = operations.some(operation => operation.xFeatures.includes(featurePath));
    if (hasContract) coveredFeatures += 1;
  }

  let orphanEndpoints = 0;
  for (const operation of operations) {
    if (!operation.xStory || operation.xFeatures.length === 0) {
      orphanEndpoints += 1;
    }
  }

  let coveredJourneys = 0;
  for (const journeyRef of journeys) {
    const journeyBase = path.basename(journeyRef).replace(/\.journey\.md$/, '');
    const hasJourneyMap = journeyMaps.some(journeyMapPath => {
      try {
        const data = readYaml(path.resolve(journeyMapPath));
        return normalizeRef(data?.sources?.journey) === journeyRef
          || normalizeRef(data?.journey) === journeyBase
          || normalizeRef(data?.journey) === journeyRef;
      } catch (error) {
        results.warnings.push(`${journeyMapPath}: Failed to inspect journey map: ${error.message}`);
        return false;
      }
    });

    const e2eCandidates = [
      `frontend/e2e/journeys/${journeyBase}.spec.ts`,
      `frontend/e2e/journeys/${journeyBase}.spec.js`,
      `frontend/e2e/${journeyBase}.spec.ts`,
      `frontend/e2e/${journeyBase}.spec.js`,
    ];
    const hasE2E = e2eCandidates.some(candidate => fileExists(candidate));

    if (hasJourneyMap && hasE2E) {
      coveredJourneys += 1;
    }
  }

  const endpointTraceability = contracts.length > 0
    ? results.warnings.push('Contract-operation-to-test coverage is not fully inferable yet; endpoints_with_tests requires report-aware or test-aware validation')
    : null;
  void endpointTraceability;

  return {
    storiesWithFeatures: ratio(coveredStories, stories.length),
    featuresWithContracts: ratio(coveredFeatures, features.length),
    endpointsWithTests: 'manual',
    journeysWithE2E: ratio(coveredJourneys, journeys.length),
    orphanTests: 0,
    orphanFeatures,
    orphanEndpoints,
  };
}

function resolveReportPath(explicitPath, defaultName) {
  if (explicitPath) return explicitPath;
  if (reportsDir) {
    const candidate = path.join(reportsDir, defaultName);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseXmlCounts(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return null;

  const content = readText(reportPath);
  const match = content.match(/<(testsuite|testsuites)\b[^>]*\btests="(\d+)"[^>]*?(?:\bfailures="(\d+)")?[^>]*?(?:\bskipped="(\d+)")?[^>]*?(?:\berrors="(\d+)")?/i);
  if (!match) {
    results.warnings.push(`${toProjectRelative(reportPath)}: Could not infer test counts from XML report`);
    return null;
  }

  const tests = Number(match[2] || 0);
  const failures = Number(match[3] || 0);
  const skipped = Number(match[4] || 0);
  const errors = Number(match[5] || 0);
  const failed = failures + errors;
  const passed = Math.max(tests - failed - skipped, 0);

  return { passed, failed, skipped };
}

function parseCoverageReport(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return null;

  try {
    const data = JSON.parse(readText(reportPath));
    const line = data?.total?.lines?.pct ?? data?.line ?? null;
    const branch = data?.total?.branches?.pct ?? data?.branch ?? null;
    return {
      line: typeof line === 'number' ? line : null,
      branch: typeof branch === 'number' ? branch : null,
    };
  } catch (error) {
    results.warnings.push(`${toProjectRelative(reportPath)}: Failed to parse coverage report: ${error.message}`);
    return null;
  }
}

function toManifestReportPath(reportPath, capabilityOutputDir) {
  if (!reportPath) return null;
  return path.relative(capabilityOutputDir, reportPath).replace(/\\/g, '/');
}

function buildEvidenceManifest(capability, traceability) {
  const capabilityRel = toProjectRelative(capabilityPath);
  const resolvedOutputPath = outputPath
    || path.join(process.cwd(), '.idd', 'evidence', capability.id, 'evidence.yaml');
  const capabilityOutputDir = path.dirname(resolvedOutputPath);

  const resolvedUnitReport = resolveReportPath(unitReportPath, 'unit.xml');
  const resolvedContractReport = resolveReportPath(contractReportPath, 'contract.xml');
  const resolvedE2EReport = resolveReportPath(e2eReportPath, 'e2e.xml');
  const resolvedCoverageReport = resolveReportPath(coverageReportPath, 'coverage.json');

  const unitCounts = parseXmlCounts(resolvedUnitReport);
  const contractCounts = parseXmlCounts(resolvedContractReport);
  const e2eCounts = parseXmlCounts(resolvedE2EReport);
  const coverage = parseCoverageReport(resolvedCoverageReport);

  const gaps = [];
  if (traceability.storiesWithFeatures.split('/')[0] !== traceability.storiesWithFeatures.split('/')[1]) {
    gaps.push('Some in-scope stories do not yet have feature coverage.');
  }
  if (traceability.featuresWithContracts.split('/')[0] !== traceability.featuresWithContracts.split('/')[1]) {
    gaps.push('Some in-scope features do not yet map to contract operations.');
  }
  if (traceability.journeysWithE2E.split('/')[0] !== traceability.journeysWithE2E.split('/')[1]) {
    gaps.push('Some in-scope journeys do not yet have both a journey map and e2e coverage.');
  }
  if (traceability.endpointsWithTests === 'manual') {
    gaps.push('Endpoint-to-test coverage still requires manual confirmation or a future report-aware validator.');
  }
  if (!resolvedUnitReport || !resolvedContractReport || !resolvedE2EReport) {
    gaps.push('One or more report files were not provided; evidence counts may need manual completion.');
  }

  const manifest = {
    capability: capabilityRel,
    certified_at: certifiedAt,
    certified_by: certifiedBy,
    evidence: {
      unit_tests: {
        report: toManifestReportPath(resolvedUnitReport, capabilityOutputDir) || null,
        passed: unitCounts?.passed ?? null,
        failed: unitCounts?.failed ?? null,
        skipped: unitCounts?.skipped ?? null,
      },
      contract_tests: {
        report: toManifestReportPath(resolvedContractReport, capabilityOutputDir) || null,
        passed: contractCounts?.passed ?? null,
        failed: contractCounts?.failed ?? null,
        description: 'Populate with the contract behavior or endpoints verified by this report.',
      },
      e2e_tests: {
        report: toManifestReportPath(resolvedE2EReport, capabilityOutputDir) || null,
        passed: e2eCounts?.passed ?? null,
        failed: e2eCounts?.failed ?? null,
        journey_steps_covered: null,
        journey_steps_total: null,
      },
      coverage: {
        report: toManifestReportPath(resolvedCoverageReport, capabilityOutputDir) || null,
        line: coverage?.line ?? null,
        branch: coverage?.branch ?? null,
      },
    },
    traceability: {
      stories_with_features: traceability.storiesWithFeatures,
      features_with_contracts: traceability.featuresWithContracts,
      endpoints_with_tests: traceability.endpointsWithTests,
      journeys_with_e2e: traceability.journeysWithE2E,
      orphan_tests: traceability.orphanTests,
      orphan_features: traceability.orphanFeatures,
      orphan_endpoints: traceability.orphanEndpoints,
    },
    gaps,
  };

  const module = moduleContextForCapability();
  if (module) manifest.module = module;

  return {
    manifest,
    resolvedOutputPath,
  };
}

function main() {
  const capability = ensureCapability();
  if (!capability) {
    return finish(null, null);
  }

  validateScopeFiles(capability.scope);
  if (results.errors.length > 0) {
    return finish(null, null);
  }

  const traceability = computeTraceability(capability.scope);
  const { manifest, resolvedOutputPath } = buildEvidenceManifest(capability, traceability);

  results.info.push(`Loaded capability: ${capability.id}`);
  results.info.push(`Prepared evidence manifest for ${toProjectRelative(resolvedOutputPath)}`);
  if (!writeOutput) {
    results.info.push('Dry run only. Use --write to save the evidence manifest.');
  }

  const yamlOutput = yaml.dump(manifest, {
    lineWidth: 120,
    noRefs: true,
  });

  if (writeOutput) {
    fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
    fs.writeFileSync(resolvedOutputPath, yamlOutput);
  }

  finish(manifest, resolvedOutputPath, yamlOutput);
}

function finish(manifest, resolvedOutputPath, yamlOutput) {
  if (jsonOutput) {
    console.log(JSON.stringify({
      ...results,
      evidence_path: resolvedOutputPath ? toProjectRelative(resolvedOutputPath) : null,
      traceability: manifest ? manifest.traceability : null,
      manifest: manifest || null,
    }, null, 2));
  } else if (results.errors.length > 0) {
    console.log(formatResults(results));
  } else if (!writeOutput && yamlOutput) {
    console.log(yamlOutput);
  } else {
    console.log(formatResults(results));
  }

  process.exit(results.errors.length > 0 ? 1 : 0);
}

main();
