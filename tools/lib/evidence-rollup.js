'use strict';

/**
 * Evidence roll-up (schema v1.14).
 *
 * Evidence is a lattice, not a sum. The roll-up reads the verification maps
 * (what is claimed) and the formal-result records of a run (what was
 * observed) and derives, per rule and per capability, a coverage vector and a
 * verification claim — then puts the derived claim beside the one the map
 * declares. Declared above derived is a finding. So is an assertion with no
 * SAT witness (the shape of vacuous formal evidence), a record no claim
 * names, and a claimed probe the run never observed.
 *
 * Nothing here establishes semantic alignment. It establishes that claims
 * are grounded, observed, and not overstated, which is the mechanical part
 * of the gap between technical correctness and intent.
 */

const { getValidator } = require('./schema-loader');
const { claimsFor, declaredProbes, expectedFor, loadVerificationMaps, readFormalResults, verdictFor } = require('./formal-results');

const RANK = { 'not-verified': 0, 'locally-verified': 1, verified: 2 };
const DIMENSIONS = ['alloy', 'tla', 'vectors', 'tests', 'mutation'];
const DIMENSION_OF = {
  'alloy-command': 'alloy',
  'tla-invariant': 'tla',
  'tla-property': 'tla',
  'conformance-vector': 'vectors',
  'test-selector': 'tests',
  'mutation-probe': 'mutation',
};

function emptyDimension() {
  return { declared: 0, matched: 0, mismatched: 0, unpinned: 0, unobserved: [] };
}

function claimKey(claim) {
  return `${claim.ruleId}|${claim.kind}|${claim.name}`;
}

function finding(id, severity, subject, detail, extra = {}) {
  return { id, severity, subject, detail, ...extra };
}

function rollupEvidence(repoRoot, options = {}) {
  const resultsDir = options.resultsDir || '.idd/evidence/results';
  const { manifest, maps } = loadVerificationMaps(repoRoot, options.manifestPath);
  const findings = [];
  const rollup = {
    rollup_version: 1,
    kind: 'evidence-rollup',
    generated_at: options.now || new Date().toISOString(),
    repository: { root: repoRoot, results: resultsDir },
    run: { ids: [], revisions: [], environments: [] },
    capabilities: {},
    rules: {},
    orphan_results: [],
    findings,
    summary: {},
  };
  if (!manifest) {
    findings.push(finding('modules-manifest-missing', 'error', 'specs/modules.yaml', 'no module manifest; the roll-up has no maps to read claims from'));
    rollup.summary = summarize(rollup);
    return rollup;
  }

  // Records: validated against the formal-result schema before they count.
  const { records: raw, problems } = readFormalResults(repoRoot, resultsDir);
  for (const problem of problems) findings.push(finding('invalid-result-file', 'error', problem.split(':')[0], problem));
  const validate = getValidator('formal-result');
  const records = [];
  for (const { file, line, record } of raw) {
    const check = validate(record);
    const where = line ? `${file}:${line}` : file;
    if (!check.valid) {
      findings.push(finding('invalid-result-record', 'error', where, check.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')));
      continue;
    }
    records.push({ where, record });
  }
  const runIds = new Set(); const revisions = new Set(); const environments = new Set();
  for (const { record } of records) {
    runIds.add(record.run.id);
    if (record.run.revision) revisions.add(record.run.revision);
    environments.add(record.run.environment);
  }
  rollup.run = { ids: [...runIds].sort(), revisions: [...revisions].sort(), environments: [...environments].sort() };

  // Claims, and the records that satisfy each.
  const declared = declaredProbes(maps);
  const observedBy = new Map(); // claimKey → records
  for (const item of records) {
    const { record } = item;
    const claims = claimsFor(declared, record.probe);
    if (claims.length === 0) {
      rollup.orphan_results.push({ where: item.where, kind: record.probe.kind, name: record.probe.name, source: record.probe.source, observed: record.observed });
      findings.push(finding('orphan-result', 'advisory', item.where, `${record.probe.kind} ${record.probe.name}${record.probe.source ? ` (${record.probe.source})` : ''} observed ${record.observed}, but no verification map claims it`));
      continue;
    }
    for (const claim of claims) {
      const key = claimKey(claim);
      if (!observedBy.has(key)) observedBy.set(key, []);
      // The verdict is recomputed here against the map's pin, so a record
      // written with a stale `expected` cannot smuggle a match through.
      const expected = expectedFor(claim, record.probe.source);
      observedBy.get(key).push({ ...item, expected, verdict: expected === null ? 'unpinned' : verdictFor(record.observed, expected) });
    }
  }

  // Per rule: coverage vector, witnesses, derived claim.
  const rules = rollup.rules;
  for (const [mapPath, entry] of maps) {
    for (const rule of entry.document.rules || []) {
      rules[rule.id] = {
        map: mapPath,
        capability: entry.capability,
        module: entry.moduleName,
        coverage: Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, emptyDimension()])),
        witness: { assertions: 0, witnessed: 0, witnessless: [] },
        derived: 'not-verified',
        reasons: [],
      };
    }
  }
  const satWitnessBySource = new Map(); // mapPath|source → true when some predicate is SAT (expected or observed)
  const assertionsToCheck = [];
  for (const claim of declared) {
    const rule = rules[claim.ruleId];
    if (!rule) continue;
    const dimension = rule.coverage[DIMENSION_OF[claim.kind]];
    dimension.declared += 1;
    const observations = observedBy.get(claimKey(claim)) || [];
    if (observations.length === 0) {
      dimension.unobserved.push(claim.name);
    } else {
      for (const observation of observations) {
        if (observation.verdict === 'match') dimension.matched += 1;
        else if (observation.verdict === 'mismatch') {
          dimension.mismatched += 1;
          findings.push(finding('formal-result-mismatch', 'error', `${claim.ruleId} ${claim.kind} ${claim.name}`, `${observation.where}: observed ${observation.record.observed}, map expects ${observation.expected}`, { rule: claim.ruleId, map: claim.mapPath }));
        } else dimension.unpinned += 1;
      }
    }
    if (claim.kind === 'alloy-command') {
      const outcome = (observations.find((o) => o.verdict !== 'mismatch')?.record.observed) || expectedFor(claim, claim.sources[0]);
      if (claim.role === 'predicate' && outcome === 'SAT') {
        for (const source of claim.sources) satWitnessBySource.set(`${claim.mapPath}|${source}`, true);
        rule.witness.witnessed_by = [...(rule.witness.witnessed_by || []), claim.name];
      }
      if (claim.role === 'assertion' && !claim.inherited && (outcome === 'UNSAT' || outcome === null)) assertionsToCheck.push(claim);
    }
  }
  for (const claim of assertionsToCheck) {
    const rule = rules[claim.ruleId];
    rule.witness.assertions += 1;
    const ownWitness = (rule.witness.witnessed_by || []).length > 0;
    const mapWitness = claim.sources.some((source) => satWitnessBySource.get(`${claim.mapPath}|${source}`));
    if (ownWitness || mapWitness) rule.witness.witnessed += 1;
    else {
      rule.witness.witnessless.push(claim.name);
      findings.push(finding('witnessless-assertion', 'advisory', `${claim.ruleId} alloy ${claim.name}`, 'no SAT predicate exercises the scenario this assertion forbids (in the rule or its map); an UNSAT result may be vacuous', { rule: claim.ruleId, map: claim.mapPath }));
    }
  }
  for (const rule of Object.values(rules)) delete rule.witness.witnessed_by;

  for (const [ruleId, rule] of Object.entries(rules)) {
    const dims = Object.entries(rule.coverage);
    const declaredCount = dims.reduce((sum, [, d]) => sum + d.declared, 0);
    const mismatched = dims.reduce((sum, [, d]) => sum + d.mismatched, 0);
    const fullyObserved = dims.filter(([, d]) => d.declared > 0 && d.unobserved.length === 0 && d.mismatched === 0 && d.matched > 0);
    const partial = dims.filter(([, d]) => d.declared > 0 && d.unobserved.length > 0).map(([name]) => name);
    if (declaredCount === 0) {
      rule.derived = 'not-verified';
      rule.reasons.push('no executable probes declared');
    } else if (mismatched > 0) {
      rule.derived = 'not-verified';
      rule.reasons.push(`${mismatched} observation(s) contradict the map`);
    } else if (fullyObserved.length === 0) {
      rule.derived = 'not-verified';
      rule.reasons.push('no declared dimension was fully observed in this run');
    } else {
      const observations = fullyObserved.flatMap(([, d]) => d).length; // eslint-disable-line no-unused-vars
      const ci = rollup.run.environments.length === 1 && rollup.run.environments[0] === 'ci' && rollup.run.revisions.length === 1;
      rule.derived = ci ? 'verified' : 'locally-verified';
      rule.reasons.push(`${fullyObserved.map(([name]) => name).join(', ')} fully observed and matched`);
    }
    if (partial.length > 0) {
      rule.reasons.push(`unobserved: ${partial.join(', ')}`);
      for (const name of partial) {
        findings.push(finding('probe-unobserved', 'info', `${ruleId} ${name}`, `${rule.coverage[name].unobserved.length} declared probe(s) have no record in this run: ${rule.coverage[name].unobserved.slice(0, 5).join(', ')}${rule.coverage[name].unobserved.length > 5 ? ', …' : ''}`, { rule: ruleId }));
      }
    }
    const unpinned = dims.reduce((sum, [, d]) => sum + d.unpinned, 0);
    if (unpinned > 0) findings.push(finding('unpinned-probe', 'info', ruleId, `${unpinned} observation(s) matched a claim with no expected outcome; pin it in the map`, { rule: ruleId }));
  }

  // Per capability: derived is the minimum over rules; compare with declared.
  for (const [mapPath, entry] of maps) {
    const ruleIds = (entry.document.rules || []).map((rule) => rule.id);
    const derived = ruleIds.length === 0 ? 'not-verified' : ruleIds.map((id) => rules[id].derived).sort((a, b) => RANK[a] - RANK[b])[0];
    const declaredClaim = entry.document.evidence?.classification?.verification || entry.document.evidence_plan?.classification?.verification || null;
    const withProbes = ruleIds.filter((id) => Object.values(rules[id].coverage).some((d) => d.declared > 0)).length;
    const capability = {
      map: mapPath,
      module: entry.moduleName,
      rules: ruleIds.length,
      rules_with_executable_probes: withProbes,
      declared: entry.document.evidence?.classification || entry.document.evidence_plan?.classification || null,
      derived: { verification: derived },
      status: declaredClaim === null ? 'undeclared' : RANK[declaredClaim] > RANK[derived] ? 'overstated' : RANK[declaredClaim] < RANK[derived] ? 'understated' : 'consistent',
      ratification: 'not-assessed',
    };
    rollup.capabilities[entry.capability] = capability;
    if (capability.status === 'overstated') {
      findings.push(finding('declared-above-derived', 'error', entry.capability, `map declares verification: ${declaredClaim}, this run derives ${derived} (weakest rule: ${ruleIds.filter((id) => rules[id].derived === derived).slice(0, 3).join(', ')})`, { map: mapPath }));
    }
  }

  rollup.summary = summarize(rollup);
  return rollup;
}

function summarize(rollup) {
  const count = (severity) => rollup.findings.filter((item) => item.severity === severity).length;
  const capabilities = Object.values(rollup.capabilities);
  return {
    capabilities: capabilities.length,
    overstated: capabilities.filter((c) => c.status === 'overstated').length,
    rules: Object.keys(rollup.rules).length,
    rules_verified: Object.values(rollup.rules).filter((r) => r.derived !== 'not-verified').length,
    records: rollup.orphan_results.length + Object.values(rollup.rules).reduce((sum, r) => sum + Object.values(r.coverage).reduce((s, d) => s + d.matched + d.mismatched + d.unpinned, 0), 0),
    errors: count('error'),
    advisories: count('advisory'),
    infos: count('info'),
    status: count('error') > 0 ? 'fail' : count('advisory') > 0 ? 'advisories' : 'pass',
  };
}

function formatRollupMarkdown(rollup) {
  const lines = ['# Evidence roll-up', ''];
  lines.push(`- Status: **${rollup.summary.status}** (${rollup.summary.errors} errors, ${rollup.summary.advisories} advisories, ${rollup.summary.infos} infos)`);
  lines.push(`- Run: ${rollup.run.ids.join(', ') || 'none'}; revision: ${rollup.run.revisions.join(', ') || 'unrecorded'}; environment: ${rollup.run.environments.join(', ') || 'none'}`);
  lines.push('- Derived from the checked-in verification maps and this run\'s formal-result records; the roll-up derives claims and creates no evidence.');
  lines.push('', '## Capabilities', '', '| Capability | Rules (with probes) | Declared verification | Derived | Status |', '| --- | --- | --- | --- | --- |');
  for (const [capability, item] of Object.entries(rollup.capabilities)) {
    lines.push(`| ${capability} | ${item.rules} (${item.rules_with_executable_probes}) | ${item.declared?.verification || 'undeclared'} | ${item.derived.verification} | ${item.status} |`);
  }
  lines.push('', '## Rules', '', '| Rule | Alloy | TLA+ | Vectors | Tests | Mutation | Witness | Derived |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
  const cell = (d) => (d.declared === 0 ? '—' : `${d.matched}/${d.declared}${d.mismatched ? ` ✗${d.mismatched}` : ''}`);
  for (const [ruleId, rule] of Object.entries(rollup.rules)) {
    const c = rule.coverage;
    const witness = rule.witness.assertions === 0 ? '—' : `${rule.witness.witnessed}/${rule.witness.assertions}`;
    lines.push(`| ${ruleId} | ${cell(c.alloy)} | ${cell(c.tla)} | ${cell(c.vectors)} | ${cell(c.tests)} | ${cell(c.mutation)} | ${witness} | ${rule.derived} |`);
  }
  lines.push('', 'Cells read matched/declared for this run; ✗ counts observations that contradict the map. Witness reads assertions with at least one SAT predicate over all assertions.');
  lines.push('', '## Findings', '');
  if (rollup.findings.length === 0) lines.push('- none');
  for (const item of rollup.findings.filter((f) => f.severity !== 'info')) lines.push(`- [${item.severity}] ${item.id}: ${item.subject} — ${item.detail}`);
  const infos = rollup.findings.filter((f) => f.severity === 'info');
  if (infos.length > 0) lines.push(`- ${infos.length} info finding(s) omitted; see the JSON roll-up`);
  lines.push('', 'Semantic alignment is not assessed here: ratification of rule statements against their probes is `not-assessed` for every capability.');
  return lines.join('\n');
}

module.exports = { DIMENSIONS, RANK, formatRollupMarkdown, rollupEvidence };
