'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { digestJsonFile } = require('./contract-digests');
const { readConsumerContract } = require('./consumer-contract');
const { adoptionMigration, findMigrationPath, readMigrationCatalog } = require('./migrations');
const { toolCommand } = require('./tool-runner');
const { findToolkitRoot } = require('./toolkit-root');

const DIAGNOSTIC_CHECKS = [
  'modules',
  'verification',
  'contracts',
  'traceability',
  'front-matter',
  'capability-scope',
  'capability-closure',
  'fixtures',
  'models',
  'enforcement-bindings',
  'journey-maps',
];

const VALID_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const UAT_VERSION = /^0\.\d+\.\d+-uat\.\d+$/;

function relative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function findFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findFiles(full, predicate));
    else if (predicate(full, entry.name)) files.push(full);
  }
  return files;
}

function finding(id, severity, subject, current, expected, continuityImpact, recommendation, paths = []) {
  return {
    id,
    severity,
    subject,
    current,
    expected,
    continuity_impact: continuityImpact,
    recommendation,
    paths,
  };
}

function recordMigrationCatalog(repoRoot, report, fromSchemaVersion = null, toSchemaVersion = null) {
  const migrationCatalog = readMigrationCatalog(repoRoot);
  const migrationPath = migrationCatalog.status === 'valid'
    ? findMigrationPath(migrationCatalog.catalog, fromSchemaVersion, toSchemaVersion)
    : [];
  // A consumer with nothing recorded has no cataloged edge to follow, but the
  // doctor does know the path: the synthetic adoption migration that doctor
  // plan synthesizes. Name it here so "migration_ids: []" never reads as
  // "no path exists".
  const synthetic = report.repository.toolkit_repository === false && fromSchemaVersion === null && toSchemaVersion
    ? [adoptionMigration(toSchemaVersion)]
    : [];
  const resolvedPath = migrationPath.length > 0 ? migrationPath : synthetic;
  report.migration.catalog = {
    path: migrationCatalog.path,
    status: migrationCatalog.status,
    from_schema_version: fromSchemaVersion,
    to_schema_version: toSchemaVersion,
    migration_ids: resolvedPath.map((migration) => migration.id),
    synthetic: synthetic.length > 0 && migrationPath.length === 0,
    steps: resolvedPath.flatMap((migration) => migration.steps.map((step) => ({
      migration_id: migration.id,
      id: step.id,
      mode: step.mode,
      ...(step.transformation ? { transformation: step.transformation } : {}),
      description: step.description,
    }))),
  };
  if (migrationCatalog.status === 'invalid') {
    for (const message of migrationCatalog.errors) {
      report.findings.push(finding(
        'migration-catalog-invalid',
        'error',
        migrationCatalog.path,
        message,
        'valid report-only migration catalog',
        'requires-migration-review',
        'Repair the toolkit migration catalog before relying on a reported migration path',
        [migrationCatalog.path],
      ));
    }
  }
  return { migrationCatalog, migrationPath };
}

function inspectToolkitSurfaces(repoRoot, report) {
  const packageJson = readJson(path.join(repoRoot, 'package.json'));
  if (!packageJson) {
    report.findings.push(finding(
      'package-metadata-missing',
      'error',
      'package.json',
      'missing',
      'readable package metadata',
      'requires-migration-review',
      'Restore package metadata before attempting a methodology migration',
      ['package.json'],
    ));
    return;
  }

  const schemaIndex = readJson(path.join(repoRoot, 'schemas', 'v1', 'index.json'));
  const releaseManifest = readJson(path.join(repoRoot, '.release-please-manifest.json'));
  const claudeManifest = readJson(path.join(repoRoot, '.claude-plugin', 'plugin.json'));
  const codexManifest = readJson(path.join(repoRoot, '.codex-plugin', 'plugin.json'));
  const lock = readJson(path.join(repoRoot, 'package-lock.json'));

  report.repository.toolkit_version = packageJson.version || null;
  report.repository.schema_version = schemaIndex?.version || null;
  report.repository.release_ledger_version = releaseManifest?.['.'] || null;
  report.repository.plugin_versions = {
    claude: claudeManifest?.version || null,
    codex: codexManifest?.version || null,
  };
  recordMigrationCatalog(repoRoot, report, null, schemaIndex?.version || null);

  if (!VALID_VERSION.test(packageJson.version || '')) {
    report.findings.push(finding(
      'toolkit-version-invalid',
      'error',
      'toolkit release version',
      packageJson.version || 'missing',
      'SemVer',
      'requires-migration-review',
      'Use the Release Please-owned version line',
      ['package.json'],
    ));
  }
  if (packageJson.version && !UAT_VERSION.test(packageJson.version) && /^1\./.test(packageJson.version)) {
    report.findings.push(finding(
      'retired-prototype-version',
      'advisory',
      'toolkit release version',
      packageJson.version,
      '0.x UAT line until explicit promotion',
      'requires-disposition',
      'Plan an explicit migration from the retired prototype line before accepting this repository',
      ['package.json'],
    ));
  }

  const surfaces = [
    ['package-lock-root', lock?.version, packageJson.version, 'package-lock.json'],
    ['package-lock-package', lock?.packages?.['']?.version, packageJson.version, 'package-lock.json'],
    ['release-ledger', releaseManifest?.['.'], packageJson.version, '.release-please-manifest.json'],
    ['claude-plugin-version', claudeManifest?.version, packageJson.version, '.claude-plugin/plugin.json'],
    ['codex-plugin-version', codexManifest?.version, packageJson.version, '.codex-plugin/plugin.json'],
  ];
  for (const [id, current, expected, file] of surfaces) {
    if (current === expected) continue;
    report.findings.push(finding(
      `version-${id}-drift`,
      'error',
      file,
      current || 'missing',
      expected || 'package version',
      'requires-migration-review',
      'Align this release surface through the Release Please workflow',
      [file],
    ));
  }

  const config = readJson(path.join(repoRoot, 'release-please-config.json'));
  const releaseConfig = config?.packages?.['.'];
  if (!releaseConfig || releaseConfig.versioning !== 'prerelease' || releaseConfig['prerelease-type'] !== 'uat') {
    report.findings.push(finding(
      'release-policy-drift',
      'advisory',
      'Release Please prerelease policy',
      releaseConfig ? `${releaseConfig.versioning || 'unset'}/${releaseConfig['prerelease-type'] || 'unset'}` : 'missing',
      'prerelease/uat',
      'requires-disposition',
      'Review Release Please configuration before the next UAT candidate',
      ['release-please-config.json'],
    ));
  }
  if (!schemaIndex || !VALID_VERSION.test(schemaIndex.version || '')) {
    report.findings.push(finding(
      'schema-registry-unreadable',
      'error',
      'schema registry version',
      schemaIndex?.version || 'missing',
      'SemVer schema registry',
      'requires-migration-review',
      'Restore or repair schemas/v1/index.json',
      ['schemas/v1/index.json'],
    ));
  }
}

function inspectConsumer(repoRoot, report) {
  const toolkitRoot = findToolkitRoot(__dirname) || path.resolve(__dirname, '..', '..');
  const runningToolkit = readJson(path.join(toolkitRoot, 'package.json')) || {};
  const runningSchema = readJson(path.join(toolkitRoot, 'schemas', 'v1', 'index.json')) || {};
  let runningSchemaDigest = null;
  try {
    runningSchemaDigest = digestJsonFile(path.join(toolkitRoot, 'schemas', 'v1', 'index.json'));
  } catch {
    // The toolkit repository's own doctor reports an unreadable schema.
  }
  report.repository.doctor_toolkit_version = runningToolkit.version || null;
  report.repository.doctor_schema_version = runningSchema.version || null;
  report.repository.doctor_schema_digest = runningSchemaDigest;

  const consumerContract = readConsumerContract(repoRoot);
  const pinnedSchemaVersion = consumerContract.record?.toolkit?.schema?.version || null;
  const { migrationCatalog, migrationPath } = recordMigrationCatalog(
    toolkitRoot,
    report,
    pinnedSchemaVersion,
    runningSchema.version || null,
  );
  report.repository.consumer_contract = {
    path: consumerContract.path,
    status: consumerContract.status,
    toolkit_version: consumerContract.record?.toolkit?.version || null,
    schema_version: consumerContract.record?.toolkit?.schema?.version || null,
    schema_digest: consumerContract.record?.toolkit?.schema?.digest || null,
    source: consumerContract.record?.toolkit?.source || null,
  };
  if (consumerContract.status === 'missing' || consumerContract.status === 'unrecorded') {
    report.findings.push(finding(
      'consumer-contract-unrecorded',
      'advisory',
      consumerContract.path,
      'accepted IDD Toolkit contract is not recorded',
      'idd_consumer front matter with toolkit/schema/source pins',
      'semantic-continuity-unassessed',
      'Record the accepted UAT toolkit and schema-registry contract before applying a consumer migration',
      [consumerContract.path],
    ));
    if (report.migration.catalog.synthetic) {
      report.findings.push(finding(
        'consumer-adoption-path-available',
        'info',
        'consumer schema migration catalog',
        'no recorded schema pin',
        runningSchema.version || 'unknown',
        'requires-disposition',
        'Run `idd doctor plan` to generate the synthetic adopt-consumer-contract migration, then `idd doctor apply --accept adopt-consumer-contract` to record the pins',
        [migrationCatalog.path],
      ));
    }
  } else if (consumerContract.status === 'invalid') {
    for (const message of consumerContract.errors) {
      report.findings.push(finding(
        'consumer-contract-invalid',
        'error',
        consumerContract.path,
        message,
        'valid idd_consumer contract record',
        'requires-migration-review',
        'Repair the consumer contract record before relying on doctor drift findings',
        [consumerContract.path],
      ));
    }
  } else if (consumerContract.record) {
    const pinnedToolkit = consumerContract.record.toolkit;
    if (runningToolkit.version && pinnedToolkit.version !== runningToolkit.version) {
      report.findings.push(finding(
        'consumer-toolkit-pin-drift',
        'advisory',
        `${consumerContract.path}: toolkit.version`,
        pinnedToolkit.version,
        runningToolkit.version,
        'requires-disposition',
        'Run the doctor against the accepted toolkit candidate or update the consumer pin through a migration review',
        [consumerContract.path],
      ));
    }
    if (runningSchema.version && pinnedToolkit.schema.version !== runningSchema.version) {
      report.findings.push(finding(
        'consumer-schema-version-drift',
        'advisory',
        `${consumerContract.path}: toolkit.schema.version`,
        pinnedToolkit.schema.version,
        runningSchema.version,
        'requires-disposition',
        'Review schema migrations before accepting the new toolkit candidate',
        [consumerContract.path],
      ));
    }
    if (runningSchemaDigest && pinnedToolkit.schema.digest !== runningSchemaDigest) {
      report.findings.push(finding(
        'consumer-schema-digest-drift',
        'advisory',
        `${consumerContract.path}: toolkit.schema.digest`,
        pinnedToolkit.schema.digest,
        runningSchemaDigest,
        'semantic-continuity-unassessed',
        'Inspect the schema migration and record which consumer meanings remain continuous',
        [consumerContract.path],
      ));
    }
    if (pinnedToolkit.schema.version !== runningSchema.version) {
      if (migrationPath.length > 0) {
        report.findings.push(finding(
          'consumer-migration-path-available',
          'info',
          'consumer schema migration catalog',
          pinnedToolkit.schema.version,
          runningSchema.version || 'unknown',
          'requires-disposition',
          `Review the cataloged path: ${migrationPath.map((migration) => migration.id).join(' → ')}`,
          [migrationCatalog.path],
        ));
      } else if (migrationCatalog.status === 'valid') {
        report.findings.push(finding(
          'consumer-migration-path-unavailable',
          'advisory',
          'consumer schema migration catalog',
          pinnedToolkit.schema.version,
          runningSchema.version || 'unknown',
          'semantic-continuity-unassessed',
          'No cataloged path covers this schema transition; define and review a migration before accepting the toolkit candidate',
          [migrationCatalog.path],
        ));
      }
    }
    const expectedSourceRef = pinnedToolkit.source.kind === 'github-tag'
      ? `v${pinnedToolkit.version}`
      : pinnedToolkit.source.kind === 'npm' ? pinnedToolkit.version : null;
    if (expectedSourceRef && pinnedToolkit.source.ref !== expectedSourceRef) {
      report.findings.push(finding(
        'consumer-source-ref-drift',
        'advisory',
        `${consumerContract.path}: toolkit.source.ref`,
        pinnedToolkit.source.ref,
        expectedSourceRef,
        'requires-disposition',
        'Align source provenance with the accepted toolkit version',
        [consumerContract.path],
      ));
    }
  }

  const packageJson = readJson(path.join(repoRoot, 'package.json')) || {};
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
    ...(packageJson.optionalDependencies || {}),
  };
  const toolkitDependency = dependencies['idd-toolkit'];
  report.repository.consumer_toolkit_spec = toolkitDependency || null;
  if (!toolkitDependency && !consumerContract.record) {
    report.findings.push(finding(
      'consumer-toolkit-version-unrecorded',
      'info',
      'consumer toolkit dependency',
      'not declared in package.json',
      'explicit accepted UAT version or host-native pin',
      'unassessed',
      'Record the accepted toolkit version before applying a migration',
      ['package.json'],
    ));
  } else if (!isExplicitToolkitSpec(toolkitDependency)) {
    report.findings.push(finding(
      'consumer-toolkit-version-floating',
      'advisory',
      'consumer toolkit dependency',
      toolkitDependency,
      'exact accepted version',
      'requires-disposition',
      'Pin the consumer to the UAT candidate being evaluated',
      ['package.json'],
    ));
  }

  const capabilityFiles = findFiles(path.join(repoRoot, 'specs', 'capabilities'), (_, name) => /\.capability\.ya?ml$/i.test(name));
  const moduleManifest = path.join(repoRoot, 'specs', 'modules.yaml');
  if (capabilityFiles.length > 0 && !fs.existsSync(moduleManifest)) {
    report.findings.push(finding(
      'consumer-module-manifest-missing',
      'advisory',
      'consumer module declaration',
      'capability files exist without specs/modules.yaml',
      'declared module ownership',
      'semantic-continuity-unassessed',
      'Run `idd module create` or add an explicit modules.yaml assignment before migration',
      capabilityFiles.map((file) => relative(repoRoot, file)),
    ));
  }
}

function isExplicitToolkitSpec(value) {
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) return true;
  return /^(?:github:|git\+https?:\/\/)[^#]+#v?0\.\d+\.\d+-uat\.\d+$/.test(value);
}

function inspectDeprecatedStructures(repoRoot, report) {
  const committedEvidence = findFiles(path.join(repoRoot, 'certification'), (_, name) => /^evidence\.ya?ml$/i.test(name));
  if (committedEvidence.length > 0) {
    report.findings.push(finding(
      'committed-generated-evidence',
      'advisory',
      'committed certification evidence',
      'evidence manifests under certification/',
      'generated .idd/evidence/ or CI artifact only',
      'requires-disposition',
      'Move generated evidence to the transient .idd/evidence/ workspace and preserve only the source intent artifacts',
      committedEvidence.map((file) => relative(repoRoot, file)),
    ));
  }
  const oldPrototype = [
    path.join(repoRoot, '.idd-skills-version'),
    path.join(repoRoot, '.claude', '.idd-skills-version'),
    path.join(repoRoot, '.codex', '.idd-skills-version'),
  ].filter((file) => fs.existsSync(file));
  if (oldPrototype.length > 0) {
    report.findings.push(finding(
      'legacy-copied-skill-marker',
      'info',
      'legacy copied-skill installation marker',
      'present in repository tree',
      'host-native plugin or explicit project binding',
      'unassessed',
      'Inspect the marker and migrate the host installation separately',
      oldPrototype.map((file) => relative(repoRoot, file)),
    ));
  }
}

function runValidator(repoRoot, check) {
  const command = toolCommand(`validate-${check}`);
  if (!command) {
    return {
      errors: [`${check}: validator script not found in this toolkit installation`],
      warnings: [],
      info: [],
    };
  }
  try {
    const output = execFileSync(process.execPath, [...command, '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } catch (error) {
    const output = error.stdout ? String(error.stdout) : '';
    try {
      return JSON.parse(output);
    } catch {
      return {
        errors: [`${check}: validator did not produce JSON diagnostics${error.message ? `: ${error.message}` : ''}`],
        warnings: [],
        info: [],
      };
    }
  }
}

const SPEC_PATH = /^((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:ya?ml|json|md|feature))(?::\d+)?:\s+/;

function slug(text, maxWords = 6) {
  return text
    .toLowerCase()
    .replace(/(\w)'(\w)/g, '$1$2')                       // doesn't → doesnt, before quote stripping
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, ' ')          // quoted names
    .replace(/\(schema: [^)]*\)/g, ' ')                  // schema url hint
    .replace(/(?:[a-z0-9_.-]+\/)+[a-z0-9_.-]+/g, ' ')     // paths
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, maxWords)
    .join('-');
}

/**
 * Classify a validator message into a stable, discriminating code so findings
 * can be grouped, deduplicated, and suppressed by id (AlloyIdentity #235
 * doctor observations). The file the message names is split out; the code is
 * derived from the message shape with names, paths, and numbers removed, so
 * two files failing the same check share one id.
 */
function classifyValidatorMessage(message) {
  let text = String(message);
  let file = null;
  const pathMatch = text.match(SPEC_PATH);
  if (pathMatch) {
    file = pathMatch[1];
    text = text.slice(pathMatch[0].length);
  }
  let code;
  const schema = text.match(/^(?:[a-z-]+ )?schema:\s*(?:\/\S*\s*:\s*)?(?:\(root\):\s*)?(.*)$/i);
  if (schema) {
    const detail = schema[1];
    const unknown = detail.match(/^unknown property "([^"]+)"/);
    const missing = detail.match(/^must have required property '([^']+)'/);
    if (unknown) code = `schema-unknown-property-${slug(unknown[1], 3)}`;
    else if (missing) code = `schema-missing-${slug(missing[1], 3)}`;
    else if (/must be equal to constant/.test(detail)) code = 'schema-const';
    else if (/must match a schema in anyOf|must match exactly one schema in oneOf/.test(detail)) code = 'schema-no-variant-matched';
    else code = `schema-${slug(detail, 4)}`;
  } else {
    code = slug(text) || 'unclassified';
  }
  return { file, code, detail: text };
}

function addValidatorFindings(report, check, result) {
  const push = (message, severity, expected, impact, recommendation) => {
    const { file, code, detail } = classifyValidatorMessage(message);
    const item = finding(`validator-${check}-${code}`, severity, `validator:${check}`, message, expected, impact, recommendation, file ? [file] : []);
    item.check = check;
    item.code = code;
    item.file = file;
    item.detail = detail;
    report.findings.push(item);
  };
  for (const message of result.errors || []) {
    push(message, 'error', 'zero validator errors', 'requires-migration-review', `Resolve the ${check} validator finding before applying a migration`);
  }
  for (const message of result.warnings || []) {
    push(message, 'advisory', 'no unresolved validator warnings', 'requires-disposition', `Review the ${check} validator warning and record a migration disposition`);
  }
}

const SEVERITIES = ['error', 'advisory', 'info'];

/**
 * Group findings by id: one row per distinct finding with a count and the
 * files it names. The grouped view is what a large consumer scans first.
 */
function groupFindings(findings) {
  const groups = new Map();
  for (const item of findings) {
    let group = groups.get(item.id);
    if (!group) {
      group = {
        id: item.id,
        severity: item.severity,
        subject: item.subject,
        count: 0,
        files: [],
        sample: item.detail || item.current,
        recommendation: item.recommendation,
        continuity_impact: item.continuity_impact,
      };
      groups.set(item.id, group);
    }
    group.count += 1;
    for (const file of item.paths || []) if (!group.files.includes(file)) group.files.push(file);
  }
  return [...groups.values()].sort((a, b) =>
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.count - a.count || a.id.localeCompare(b.id));
}

/**
 * Narrow a report to the requested severities. The summary keeps the totals
 * of the full inspection; `filter` records what the caller asked to see.
 */
function filterReport(report, severities) {
  if (!severities || severities.length === 0) return report;
  const wanted = [...new Set(severities)];
  return {
    ...report,
    filter: { severity: wanted },
    findings: report.findings.filter((item) => wanted.includes(item.severity)),
  };
}

function runDoctor(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const report = {
    report_version: 1,
    mode: 'report-only',
    repository: {
      root: repoRoot,
      toolkit_repository: false,
      toolkit_version: null,
      schema_version: null,
      release_ledger_version: null,
      plugin_versions: {},
      consumer_toolkit_spec: null,
      consumer_contract: null,
      doctor_toolkit_version: null,
      doctor_schema_version: null,
      doctor_schema_digest: null,
    },
    continuity: {
      status: 'not-assessed',
      claim: 'Doctor inspection identifies possible migration impact; it does not establish continuity.',
      dimensions: {
        identity: 'not-assessed',
        intent: 'not-assessed',
        semantics: 'not-assessed',
        data: 'not-assessed',
        operations: 'not-assessed',
      },
    },
    migration: {
      status: 'not-applied',
      plan: 'not-generated',
      writes: false,
      journal_mutation: false,
      catalog: {
        path: null,
        status: 'not-loaded',
        from_schema_version: null,
        to_schema_version: null,
        migration_ids: [],
        steps: [],
      },
    },
    findings: [],
    validators: {},
    summary: {},
  };

  const packageJson = readJson(path.join(repoRoot, 'package.json'));
  report.repository.toolkit_repository = packageJson?.name === 'idd-toolkit'
    || fs.existsSync(path.join(repoRoot, '.codex-plugin', 'plugin.json'));
  if (report.repository.toolkit_repository) inspectToolkitSurfaces(repoRoot, report);
  else inspectConsumer(repoRoot, report);
  inspectDeprecatedStructures(repoRoot, report);

  for (const check of DIAGNOSTIC_CHECKS) {
    const result = runValidator(repoRoot, check);
    report.validators[check] = {
      status: (result.errors || []).length > 0 ? 'error' : (result.warnings || []).length > 0 ? 'advisory' : 'pass',
      errors: result.errors || [],
      warnings: result.warnings || [],
      info: result.info || [],
    };
    addValidatorFindings(report, check, result);
  }
  report.validators.evidence = {
    status: 'not-run',
    errors: [],
    warnings: [],
    info: ['run-specific: generate a manifest with `idd generate-evidence`, then `idd validate evidence`; report-only inspection does not run it'],
  };

  const errors = report.findings.filter((item) => item.severity === 'error').length;
  const advisories = report.findings.filter((item) => item.severity === 'advisory').length;
  const infos = report.findings.filter((item) => item.severity === 'info').length;
  report.summary = {
    status: errors > 0 ? 'misaligned' : advisories > 0 ? 'advisories' : 'aligned',
    errors,
    advisories,
    infos,
    findings: report.findings.length,
    writes: false,
    journal_mutation: false,
  };
  return report;
}

function formatDoctorReport(report, options = {}) {
  const verbose = options.verbose === true;
  const summaryOnly = options.summary === true;
  const lines = [
    'IDD Doctor (report-only)',
    '',
    `Repository: ${report.repository.root}`,
    `Mode: ${report.mode}; continuity: ${report.continuity.status}`,
    report.repository.toolkit_repository
      ? `Toolkit: ${report.repository.toolkit_version || 'unknown'}; schema: ${report.repository.schema_version || 'unknown'}`
      : `Consumer toolkit spec: ${report.repository.consumer_toolkit_spec || 'not recorded'}`,
    `Status: ${report.summary.status} (${report.summary.errors} errors, ${report.summary.advisories} advisories, ${report.summary.infos} infos)`,
    '',
  ];
  const catalog = report.migration?.catalog;
  if (catalog?.status === 'valid') {
    const pathLabel = catalog.migration_ids.length > 0
      ? ` (${catalog.migration_ids.join(' → ')}${catalog.synthetic ? '; synthetic — generated by doctor plan' : ''})`
      : '';
    lines.push(`Migration catalog: ${catalog.path}${pathLabel}`, '');
  }
  if (report.filter) lines.push(`Showing severity: ${report.filter.severity.join(', ')}`, '');
  if (report.findings.length === 0) {
    lines.push(report.filter ? 'No findings at the requested severity.' : 'No misalignments detected by the current inspection surface.');
  } else {
    const groups = groupFindings(report.findings);
    lines.push(`Findings by id (${groups.length} distinct, ${report.findings.length} total):`);
    for (const group of groups) {
      const files = group.files.length > 0
        ? ` — ${group.files.slice(0, 3).join(', ')}${group.files.length > 3 ? `, +${group.files.length - 3} more` : ''}`
        : '';
      lines.push(`- [${group.severity}] ${group.id} ×${group.count}${files}`);
      lines.push(`  e.g. ${group.sample}`);
    }
    // Every finding is listed when the report is small or the caller asks;
    // a large consumer gets the grouped view and --verbose for the rest.
    const listAll = verbose || (!summaryOnly && report.findings.length <= 40);
    if (listAll) {
      lines.push('', 'Findings:');
      for (const item of report.findings) {
        lines.push(`- [${item.severity}] ${item.id}: ${item.subject} — ${item.current}`);
        lines.push(`  Recommendation: ${item.recommendation}`);
        lines.push(`  Continuity impact: ${item.continuity_impact}`);
      }
    } else if (!summaryOnly) {
      lines.push('', `${report.findings.length} findings; pass --verbose to list every one, or --severity error to narrow.`);
    }
  }
  lines.push('', 'Validator status:');
  for (const [name, result] of Object.entries(report.validators)) {
    const note = result.status === 'not-run' && result.info?.[0] ? ` — ${result.info[0]}` : '';
    lines.push(`- ${name}: ${result.status}${note}`);
  }
  lines.push('', 'No files were written. No journal history was mutated.');
  return lines.join('\n');
}

module.exports = { DIAGNOSTIC_CHECKS, SEVERITIES, classifyValidatorMessage, filterReport, formatDoctorReport, groupFindings, runDoctor, runValidator };
