'use strict';

const fs = require('fs');
const path = require('path');
const { DIAGNOSTIC_CHECKS, runDoctor, runValidator } = require('./doctor');
const { digestJsonFile, jcsSha256 } = require('./contract-digests');
const { adoptionMigration, findMigrationPath, readMigrationCatalog } = require('./migrations');
const { findToolkitRoot } = require('./toolkit-root');
const { TRANSFORMATIONS } = require('./transformations');

const REVIEW_DISPOSITIONS = new Set(['review-required', 'unassessed']);

function planDigest(plan) {
  const { digest, ...rest } = plan;
  return jcsSha256(rest);
}

function requiresAcceptance(migration) {
  if (migration.steps.some((step) => step.mode === 'review')) return true;
  return Object.values(migration.continuity).some((disposition) => REVIEW_DISPOSITIONS.has(disposition));
}

/**
 * Build a deterministic migration plan for a repository (#69). The plan is a
 * pure function of repository diagnostics, the running toolkit, the shipped
 * migration catalog, and any explicit source-schema assertion: no timestamps,
 * and its JCS digest doubles as both a
 * staleness check and replay protection for `idd doctor apply`.
 */
function buildMigrationPlan(options = {}) {
  const assertedSource = options.fromSchema !== undefined && options.fromSchema !== null;
  if (assertedSource && (typeof options.fromSchema !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(options.fromSchema))) {
    throw new Error('--from-schema requires an exact schema version, for example 1.11.0');
  }
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const toolkitRoot = findToolkitRoot(__dirname) || path.resolve(__dirname, '..', '..');
  const report = runDoctor({ repoRoot });

  const catalogPath = path.join(toolkitRoot, 'migrations', 'catalog.json');
  const catalog = report.migration.catalog;
  const isToolkit = report.repository.toolkit_repository;
  if (assertedSource && (isToolkit || !['missing', 'unrecorded'].includes(report.repository.consumer_contract?.status))) {
    throw new Error('--from-schema is only valid for an unrecorded consumer; it cannot override a recorded contract or target the toolkit');
  }
  const fromSchema = assertedSource ? options.fromSchema : isToolkit
    ? report.repository.schema_version
    : report.repository.consumer_contract?.schema_version || null;
  const toSchema = isToolkit
    ? report.repository.schema_version
    : report.repository.doctor_schema_version;

  const plan = {
    plan_version: 1,
    kind: 'idd-migration-plan',
    repository: { kind: isToolkit ? 'toolkit' : 'consumer' },
    toolkit: {
      version: report.repository.doctor_toolkit_version,
      schema_version: report.repository.doctor_schema_version,
      schema_digest: report.repository.doctor_schema_digest,
    },
    transition: { from_schema: fromSchema, to_schema: toSchema },
    ...(assertedSource ? { source_schema: { version: fromSchema, source: 'operator-asserted' } } : {}),
    catalog: {
      path: 'migrations/catalog.json',
      digest: fs.existsSync(catalogPath) ? digestJsonFile(catalogPath) : null,
    },
    migrations: [],
    acceptance_required: [],
    blockers: [],
    resolved_by_plan: [],
    writes: false,
    journal_mutation: false,
  };

  if (assertedSource && fromSchema !== toSchema) {
    const loaded = readMigrationCatalog(toolkitRoot);
    if (loaded.status !== 'valid') throw new Error(`Cannot select a catalog migration path: catalog is ${loaded.status}`);
    plan.migrations = findMigrationPath(loaded.catalog, fromSchema, toSchema);
    if (plan.migrations.length === 0) {
      throw new Error(`No catalog migration path from ${fromSchema} to ${toSchema}; no adoption fallback was selected`);
    }
  } else if (!isToolkit && (fromSchema === null || (assertedSource && fromSchema === toSchema)) && toSchema) {
    // With no source version, or an assertion already at the target schema,
    // only adoption remains: record the contract for the running toolkit.
    const { synthetic, ...adoption } = adoptionMigration(toSchema);
    plan.migrations.push(adoption);
  } else if (!isToolkit && catalog.migration_ids.length > 0) {
    // Reuse the shortest cataloged path the doctor already resolved; the
    // catalog digest above pins the exact metadata the plan was built from.
    const loaded = readMigrationCatalog(toolkitRoot);
    if (loaded.status === 'valid') {
      plan.migrations = findMigrationPath(loaded.catalog, fromSchema, toSchema);
    }
  }

  plan.acceptance_required = plan.migrations.filter(requiresAcceptance).map((migration) => migration.id);

  // Error findings block apply — except those the plan's own transformations
  // declare they resolve. A consumer whose fixtures fail the old schema is
  // exactly the consumer the fixture rewrite exists for; refusing on that
  // error would make the migration unreachable. The post-apply validation
  // still has to confirm the resolved findings are gone.
  const errorIds = [...new Set(report.findings.filter((item) => item.severity === 'error').map((item) => item.id))].sort();
  const resolvable = new Set(plan.migrations
    .flatMap((migration) => migration.steps)
    .filter((step) => step.mode === 'transform' && TRANSFORMATIONS[step.transformation])
    .flatMap((step) => TRANSFORMATIONS[step.transformation].resolves || []));
  plan.resolved_by_plan = errorIds.filter((id) => resolvable.has(id));
  plan.blockers = errorIds.filter((id) => !resolvable.has(id));
  plan.digest = planDigest(plan);
  return { plan, report };
}

function runValidatorSuite(repoRoot) {
  const suite = { errors: 0, warnings: 0, checks: {} };
  for (const check of DIAGNOSTIC_CHECKS) {
    const result = runValidator(repoRoot, check);
    const errors = (result.errors || []).length;
    const warnings = (result.warnings || []).length;
    suite.errors += errors;
    suite.warnings += warnings;
    suite.checks[check] = { errors, warnings };
  }
  return suite;
}

function unexpectedErrorIds(report, allowed = []) {
  return [...new Set(report.findings.filter((item) => item.severity === 'error').map((item) => item.id))]
    .filter((id) => !allowed.includes(id))
    .sort();
}

function refusal(result, reason, detail) {
  result.status = 'refused';
  result.refusals.push({ reason, detail });
  return result;
}

/**
 * Apply an accepted migration plan. The apply boundary is explicit:
 * a plan whose digest no longer matches the repository, toolkit, or catalog
 * state is refused before any write; review-required continuity demands
 * `--accept <migration-id>`; every write is a registered deterministic
 * transformation; invariants are re-validated afterwards; and the evolution
 * is journaled as an appended record under .idd/evolution/ — repository
 * history and any consumer journal are never mutated.
 */
function applyMigrationPlan(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const accept = options.accept || [];
  const allowBlockers = options.allowBlockers || [];
  const result = {
    mode: 'apply',
    status: 'applied',
    repository: { root: repoRoot },
    plan_digest: null,
    refusals: [],
    migrations: [],
    invariants: null,
    findings_before: null,
    findings_after: null,
    blockers_allowed: [],
    resolved_by_plan: [],
    evolution_record: null,
    writes: [],
    journal_mutation: false,
  };

  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(options.planPath, 'utf8'));
  } catch (error) {
    return refusal(result, 'plan-unreadable', `${options.planPath}: ${error.message}`);
  }
  if (stored.plan_version !== 1 || stored.kind !== 'idd-migration-plan') {
    return refusal(result, 'plan-unrecognized', 'expected an idd-migration-plan with plan_version 1');
  }
  if (stored.digest !== planDigest(stored)) {
    return refusal(result, 'plan-digest-mismatch', 'the plan content does not match its recorded digest');
  }
  result.plan_digest = stored.digest;

  let rebuilt;
  try {
    rebuilt = buildMigrationPlan({
      repoRoot,
      ...(stored.source_schema?.source === 'operator-asserted' ? { fromSchema: stored.source_schema.version } : {}),
    });
  } catch (error) {
    return refusal(result, 'plan-stale', `cannot rebuild the saved plan: ${error.message}`);
  }
  const { plan: current, report: before } = rebuilt;
  result.findings_before = { ...before.summary };
  if (current.digest !== stored.digest) {
    return refusal(result, 'plan-stale', 'repository, toolkit, or catalog state changed since the plan was generated — regenerate with `idd doctor plan`');
  }
  if (current.source_schema) result.source_schema = current.source_schema;
  const blockers = stored.blockers || [];
  const unallowed = blockers.filter((id) => !allowBlockers.includes(id));
  if (unallowed.length > 0) {
    return refusal(
      result,
      'error-findings-block-apply',
      `resolve error findings first, or accept them explicitly: ${unallowed.map((id) => `--allow-blocker ${id}`).join(' ')}`,
    );
  }
  result.blockers_allowed = blockers.filter((id) => allowBlockers.includes(id));
  result.resolved_by_plan = stored.resolved_by_plan || [];
  if (stored.migrations.length === 0) {
    return refusal(result, 'nothing-to-apply', 'the plan contains no applicable migrations');
  }
  const missingAcceptance = stored.acceptance_required.filter((id) => !accept.includes(id));
  if (missingAcceptance.length > 0) {
    return refusal(
      result,
      'acceptance-required',
      `review-required continuity needs explicit acceptance: ${missingAcceptance.map((id) => `--accept ${id}`).join(' ')}`,
    );
  }

  for (const migration of stored.migrations) {
    const applied = { id: migration.id, continuity: migration.continuity, steps: [] };
    result.migrations.push(applied);
    for (const step of migration.steps) {
      const stepResult = { id: step.id, mode: step.mode, status: 'applied' };
      applied.steps.push(stepResult);
      if (step.mode === 'review') {
        stepResult.status = 'acknowledged';
        stepResult.detail = `accepted via --accept ${migration.id}`;
      } else if (step.mode === 'transform') {
        const transformation = TRANSFORMATIONS[step.transformation];
        if (!transformation) {
          stepResult.status = 'failed';
          stepResult.detail = `unknown transformation: ${step.transformation}`;
          result.status = 'failed';
        } else {
          const outcome = transformation.apply(repoRoot, {
            toolkit: stored.toolkit,
            source: { kind: 'github-tag', ref: `v${stored.toolkit.version}` },
          });
          stepResult.transformation = step.transformation;
          stepResult.changed = outcome.changed;
          stepResult.paths = outcome.paths;
          for (const changedPath of outcome.changed ? outcome.paths : []) {
            if (!result.writes.includes(changedPath)) result.writes.push(changedPath);
          }
        }
      } else if (step.mode === 'validate') {
        const suite = runValidatorSuite(repoRoot);
        stepResult.errors = suite.errors;
        stepResult.warnings = suite.warnings;
        const unexpected = unexpectedErrorIds(runDoctor({ repoRoot }), result.blockers_allowed);
        if (unexpected.length > 0) {
          stepResult.status = 'failed';
          stepResult.detail = `unresolved error findings: ${unexpected.join(', ')}`;
          result.status = 'failed';
        }
      } else if (step.mode === 'inspect') {
        const inspection = runDoctor({ repoRoot });
        stepResult.summary = { ...inspection.summary };
      }
      if (result.status === 'failed') break;
    }
    if (result.status === 'failed') break;
  }

  // Post-apply invariant validation is unconditional evidence, whether or not
  // the plan's own steps included a validate pass.
  if (result.status !== 'failed') {
    result.invariants = runValidatorSuite(repoRoot);
  }
  const after = runDoctor({ repoRoot });
  result.findings_after = { ...after.summary };
  // Post-apply invariants: every error finding must be one the caller
  // explicitly allowed; the plan's own resolved findings must be gone.
  const unexpectedAfter = unexpectedErrorIds(after, result.blockers_allowed);
  if (unexpectedAfter.length > 0 && result.status !== 'failed') {
    result.status = 'failed';
    result.refusals.push({ reason: 'errors-after-apply', detail: `error findings remain after apply: ${unexpectedAfter.join(', ')}` });
  }
  const stillPresent = result.resolved_by_plan.filter((id) => after.findings.some((item) => item.id === id && item.severity === 'error'));
  if (stillPresent.length > 0 && result.status !== 'failed') {
    result.status = 'failed';
    result.refusals.push({ reason: 'resolved-findings-still-present', detail: `the plan claimed to resolve ${stillPresent.join(', ')} but they remain after apply` });
  }

  const record = {
    record_version: 1,
    kind: 'idd-evolution-record',
    status: result.status,
    applied_at: new Date().toISOString(),
    plan_digest: stored.digest,
    toolkit: stored.toolkit,
    transition: stored.transition,
    ...(stored.source_schema ? { source_schema: stored.source_schema } : {}),
    migrations: result.migrations,
    invariants: result.invariants,
    findings_before: result.findings_before,
    findings_after: result.findings_after,
    blockers_allowed: result.blockers_allowed,
    resolved_by_plan: result.resolved_by_plan,
    writes: result.writes,
    journal_mutation: false,
  };
  const evolutionDir = path.join(repoRoot, '.idd', 'evolution');
  fs.mkdirSync(evolutionDir, { recursive: true });
  const sequence = fs.readdirSync(evolutionDir).filter((name) => name.endsWith('.json')).length + 1;
  const recordName = `${String(sequence).padStart(4, '0')}-${stored.transition.from_schema || 'unrecorded'}-to-${stored.transition.to_schema}.json`;
  fs.writeFileSync(path.join(evolutionDir, recordName), `${JSON.stringify(record, null, 2)}\n`);
  result.evolution_record = path.join('.idd', 'evolution', recordName).replace(/\\/g, '/');

  return result;
}

function formatApplyResult(result) {
  const lines = ['IDD Doctor (apply)', '', `Repository: ${result.repository.root}`, `Status: ${result.status}`];
  if (result.source_schema) lines.push(`Source schema: ${result.source_schema.version} (${result.source_schema.source})`);
  if (result.refusals.length > 0) {
    lines.push('', 'Refused:');
    for (const item of result.refusals) lines.push(`- ${item.reason}: ${item.detail}`);
    lines.push('', 'No files were written. No journal history was mutated.');
    return lines.join('\n');
  }
  lines.push('', 'Migrations:');
  for (const migration of result.migrations) {
    lines.push(`- ${migration.id}`);
    for (const step of migration.steps) {
      const extras = [
        step.detail,
        step.changed !== undefined ? `changed: ${step.changed}` : null,
        step.errors !== undefined ? `${step.errors} errors, ${step.warnings} warnings` : null,
      ].filter(Boolean).join('; ');
      lines.push(`  - [${step.mode}] ${step.id}: ${step.status}${extras ? ` (${extras})` : ''}`);
    }
  }
  if (result.resolved_by_plan.length > 0) lines.push('', `Resolved by the plan's transformations: ${result.resolved_by_plan.join(', ')}`);
  if (result.blockers_allowed.length > 0) lines.push(`Blockers accepted explicitly (--allow-blocker): ${result.blockers_allowed.join(', ')}`);
  if (result.invariants) {
    lines.push('', `Invariants: ${result.invariants.errors} errors, ${result.invariants.warnings} warnings across ${Object.keys(result.invariants.checks).length} validators`);
  }
  lines.push(
    '',
    `Writes: ${result.writes.length > 0 ? result.writes.join(', ') : '(none)'}`,
    `Evolution record: ${result.evolution_record || '(none)'}`,
    'No journal history was mutated.',
  );
  return lines.join('\n');
}

module.exports = { applyMigrationPlan, buildMigrationPlan, formatApplyResult, planDigest };
