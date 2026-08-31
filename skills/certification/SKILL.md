---
name: certification
description: "Verify traceability and produce evidence that implementation fulfills declared intent, published through the CI report rather than committed to the repo. Use after implementation and tests are complete, before merge. Cross-cuts all layers to close the chain from persona to proof."
license: MIT
argument-hint: "[capability-name]"
allowed-tools: Read Write Glob Grep
---

# Certification

## Purpose

Close the traceability chain by verifying that every intent artifact has corresponding implementation and test evidence, then publish a structured evidence manifest **through the CI report**. This is the operational enforcement of agent non-negotiable #3: **no merge without verifiable evidence tied to intent.**

Certification is cross-cutting — it doesn't produce narrative, model, contract, or test artifacts. It **verifies the connections between them** and produces the evidence record.

Evidence is **derived output, not a source artifact**. It is recomputed from specs and test results on every certification run and published via the CI report (job summary, PR comment, workflow artifact). It is never committed to the repository — committing derived evidence invites drift the moment the next commit lands.

## When to Use

- After implementation and all tests pass.
- Before merge or PR approval.
- When the idd-workflow reaches step 8 (Certification).
- After a Fix Forward cycle to update evidence for the repaired gap.
- When auditing an existing capability's traceability health.
- After a toolkit UAT update, use `/idd-doctor` first to inspect consumer alignment; do not certify a migration from a report-only doctor run alone.

## Inputs

The certification skill consumes artifacts from every upstream layer:

```
specs/
├── personas/          ← from /solution-narrative
├── journeys/          ← from /solution-narrative
├── stories/           ← from /solution-narrative
├── models/            ← from /domain-modeling
├── features/          ← from /behavior-contract
├── contracts/openapi/ ← from /behavior-contract
├── fixtures/          ← from /behavior-contract
├── journey-maps/      ← from /e2e-journey-testing
├── modules.yaml       ← capability ownership and dependency DAG
└── verification/      ← rule inventory, maturity claims, and evidence bindings

Test results (from CI or local runs):
├── Unit test reports (JUnit XML, Jest JSON, etc.)
├── Contract test reports
├── E2E test reports (Playwright)
└── Coverage reports (optional)
```

## Output

The evidence manifest is generated into a gitignored workspace and published through CI — none of it is committed:

```
.idd/evidence/                  ← gitignored workspace (local or CI runner)
└── {capability-name}/
    ├── evidence.yaml           ← structured evidence manifest
    ├── reports/                ← raw test output (when collected)
    │   ├── unit.xml
    │   ├── contract.xml
    │   ├── e2e.xml
    │   └── coverage.json
    └── screenshots/            ← visual evidence (optional)
```

Published as part of the CI report:

- **Job summary + PR comment** — per-capability certification status, traceability ratios, test counts, and declared gaps (rendered by the `idd-check` action).
- **Workflow artifact** (`idd-evidence`) — the full manifests and raw results, the durable record for each run.

## Workflow

### Step 1: Identify the capability boundary

Locate the capability definition file. A capability groups the artifacts that must be true together — typically one journey or a cluster of related stories.

```bash
# Find capability definitions
ls specs/capabilities/
```

If the capability file exists (`specs/capabilities/{name}.capability.yaml`), its `scope` block is the authoritative source for which artifacts are in scope. Read it:

```yaml
# specs/capabilities/{name}.capability.yaml
id: trade-show-signup
type: capability
scope:
  personas: [...]
  journeys: [...]
  stories: [...]
  features: [...]
  models: [...]
  contracts: [...]
```

If no capability file exists yet, create one by searching for the relevant artifacts:

```bash
# Find journeys
ls specs/journeys/

# Find stories referencing a journey
grep -rl "journey-name" specs/stories/

# Find features referencing those stories
grep -rl "story-name" specs/features/
```

Then write `specs/capabilities/{name}.capability.yaml` with the discovered scope.

Locate the capability's module in `specs/modules.yaml`, then read its expected
`<module-root>/verification/{name}/verification.yaml`. Treat the verification
map as the checked-in plan and claim boundary, not as generated proof. Run
`idd validate verification` before collecting evidence so missing maps,
dependency-direction errors, phantom selectors, and inconsistent contract
`x-rules` fail early.
For cross-module contracts, confirm each `contract_pins` digest still matches
the upstream JSON Schema under `jcs-sha256@1`.

### Step 2: Walk the traceability chain forward

Starting from each story in scope, verify every link in the chain exists:

**Story → Feature**

For each story in `specs/stories/{area}/`, verify a corresponding feature file exists in `specs/features/{area}/` that references it.

```
Check: Does the feature file header contain a reference to the story?
# Story: specs/stories/{area}/{story}.md
```

Record: `stories_with_features: X/Y`

**Feature → Contract**

For each feature scenario that implies an API interaction, verify the endpoint exists in `specs/contracts/openapi/` with matching `x-story` and `x-feature` extensions.

```
Check: Does the OpenAPI path include x-feature referencing this feature file?
x-feature: specs/features/{area}/{feature}.feature
```

Record: `features_with_contracts: X/Y`

**Contract → Tests**

For each endpoint in the contract, verify test coverage exists:
- Unit tests for the domain logic
- Contract/integration tests for the API boundary
- E2E tests for the journey flow

Record: `endpoints_with_tests: X/Y`

For each verification-map rule, confirm every `current_evidence.bindings[]`
entry names the exact files containing its literal selectors. Confirm every
rule-bound contract reciprocates through root-level `x-rules`, and every
`x-rules` ID is an actual map rule entry.

**Journey → E2E**

For each journey in scope, verify a journey map and corresponding e2e spec exist:
- `specs/journey-maps/{journey}.map.yaml`
- `frontend/e2e/journeys/{journey}.spec.ts` (or equivalent)

Record: `journeys_with_e2e: X/Y`

### Step 3: Detect orphans and broken links

Scan for artifacts that break traceability:

**Orphan tests** — test files with no intent reference in their header:

```bash
# Find e2e test files missing journey/story references
grep -rL "Journey:" frontend/e2e/journeys/ 2>/dev/null
grep -rL "Story:" frontend/e2e/journeys/ 2>/dev/null
```

**Orphan features** — feature files not referenced by any story:

```bash
# Find features with no Story: header
grep -rL "# Story:" specs/features/
```

**Orphan endpoints** — contract endpoints with no x-feature or x-story:

```bash
grep -rL "x-story\|x-feature" specs/contracts/openapi/paths/
```

Record: `orphan_tests: N`, `orphan_features: N`, `orphan_endpoints: N`

### Step 4: Collect test evidence

Gather test results from the most recent run. Location varies by stack:

| Stack | Unit reports | Contract reports | E2E reports |
|-------|-------------|-----------------|-------------|
| Maven/Spring | `target/surefire-reports/` | `target/contract-reports/` | — |
| Gradle | `build/test-results/` | `build/test-results/` | — |
| Jest/Node | `coverage/` or `jest-results.json` | — | — |
| Playwright | — | — | `playwright-report/` |
| pytest | `pytest-results.xml` | — | — |

Copy relevant reports to `.idd/evidence/{capability}/reports/` (or point the generator at them with `--reports-dir`).

If reports aren't available (tests were run but output wasn't captured), record the counts manually from the test run output. The manifest format is the same either way.

### Step 5: Identify gaps honestly

Review the traceability results and test coverage. Any of the following count as gaps:

- Stories without feature coverage
- Journey steps without e2e coverage
- Edge cases mentioned in stories but not tested
- Viewports or devices not covered in visual tests
- Performance scenarios not tested
- Error paths described in features but not implemented

**Gaps are declarations, not failures.** An honest gap becomes a backlog item. A hidden gap becomes drift.

### Step 6: Generate the evidence manifest

Generate `.idd/evidence/{capability}/evidence.yaml` — preferably with the toolkit so ratios are computed deterministically:

```bash
idd generate-evidence \
  --capability specs/capabilities/{capability}.capability.yaml \
  --reports-dir .idd/evidence/{capability}/reports \
  --write
```

The manifest shape:

```yaml
# .idd/evidence/{capability-name}/evidence.yaml

capability: specs/capabilities/{capability-name}.capability.yaml
certified_at: {ISO 8601 timestamp}
certified_by: {agent name, CI, or human}

# Intent scope is defined in the capability file above.
# The capability's scope block is the single source of truth for
# which personas, journeys, stories, features, contracts, and models
# belong to this certification unit.

# What evidence was collected?
evidence:
  unit_tests:
    report: reports/unit.xml
    passed: {count}
    failed: {count}
    skipped: {count}

  contract_tests:
    report: reports/contract.xml
    passed: {count}
    failed: {count}
    description: "{what contract compliance was verified}"

  e2e_tests:
    report: reports/e2e.xml
    passed: {count}
    failed: {count}
    journey_steps_covered: [{list}]
    journey_steps_total: {count}

  coverage:
    report: reports/coverage.json
    line: {percent}
    branch: {percent}
    # Coverage is informational, not a gate

# Traceability verification
traceability:
  stories_with_features: {X/Y}
  features_with_contracts: {X/Y}
  endpoints_with_tests: {X/Y}
  journeys_with_e2e: {X/Y}
  orphan_tests: {count}
  orphan_features: {count}
  orphan_endpoints: {count}

# What is NOT covered (honesty over completeness)
gaps:
  - "{description of what isn't verified yet}"
```

### Step 7: Validate and publish

Validate the manifest against the certification thresholds:

```bash
idd validate evidence --evidence .idd/evidence/{capability}/evidence.yaml
```

Before declaring the capability certified, verify:

- [ ] All `traceability` ratios are 100% (X/Y where X equals Y)
- [ ] All orphan counts are 0
- [ ] No test failures (failed: 0 across all evidence sections)
- [ ] Gaps are documented if any exist
- [ ] The capability scope covers every in-scope artifact
- [ ] `idd validate verification` passes: bindings resolve and contract `x-rules` are reciprocal
- [ ] Cross-module contract pins resolve to dependency-owned JSON Schemas and recompute successfully
- [ ] Reports are present in `reports/` (or counts recorded from the run)

If any traceability ratio is below 100%, the capability is **not certifiable**. Either:
1. Add the missing spec/test artifacts to close the gap, or
2. Document the gap explicitly and get human approval to proceed.

**Publishing is CI's job, not git's.** The `idd-check` action regenerates and
validates evidence for every declared module capability under every module
root on each PR, and publishes the result as the CI report: certification
status in the job summary and PR comment, full manifests in the `idd-evidence`
workflow artifact. Repositories without `modules.yaml` retain the legacy
`specs/capabilities/` discovery fallback. Do **not** commit `evidence.yaml`,
test reports, or screenshots — `.idd/` is gitignored precisely so local
certification runs stay out of version control. When run locally, report the
manifest's findings in your summary to the user instead of committing
anything.

## Traceability Thresholds

| Check | Required | Notes |
|-------|----------|-------|
| stories_with_features | 100% | Every story must have feature coverage |
| features_with_contracts | 100% | Every feature must map to contract endpoints |
| endpoints_with_tests | 100% | Every endpoint must have test coverage |
| journeys_with_e2e | 100% | Every journey must have e2e coverage |
| orphan_tests | 0 | No tests without intent references |
| orphan_features | 0 | No features without story references |
| orphan_endpoints | 0 | No endpoints without feature references |
| test failures | 0 | All tests must pass |
| coverage (line) | Informational | Not a gate — coverage without traceability is meaningless |

## Recertification

Recertify when:
- New stories are added to an existing capability
- A Fix Forward cycle updates specs for a bug fix
- Contract breaking changes occur (version bump)
- E2E journey steps change

Each certification run regenerates the manifest from scratch — evidence always describes the commit it was computed from. The CI run history and its `idd-evidence` workflow artifacts preserve the record of past certifications; there is nothing to delete or overwrite in the repo.

## Guardrails

- Never certify with test failures. Zero tolerance.
- Never certify with traceability gaps unless gaps are explicitly declared and human-approved.
- Never fabricate evidence. If tests weren't run, say so.
- Never treat a planned-evidence label or free-floating selector as current evidence; current selectors require explicit file bindings.
- Coverage percentage is informational, never a gate. Traceability matters more than coverage.
- Gaps are honest declarations. A gap is a future story, not a failure.
- Evidence must be generated from the same commit it certifies and published through the CI report — never after the fact, and never committed to the repository. Intent artifacts (`specs/`) are source; evidence is derived.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| solution-narrative | Certification verifies that its personas, journeys, and stories have downstream coverage |
| domain-modeling | Certification verifies that model rules are reflected in features and tests |
| behavior-contract | Certification verifies that features map to contracts and contracts have tests |
| e2e-journey-testing | Certification verifies that journeys have maps and e2e coverage |
| pr-review | PR review catches traceability gaps early in CI; certification provides the formal evidence record |
| idd-workflow | Certification is step 8 in the workflow, invoked via `/certification` |

## Concepts Carried

| Concept | Role |
|---------|------|
| C5 — Fast Honest Feedback | **primary**: evidence must be automated and deterministic |
| C8 — Traceability Chain | **primary**: closes the chain from intent to proof |
| C12 — Done Means Verified | **primary**: operational definition of "done" |
| C15 — Capability as Cert Unit | **primary**: capability artifact defines the certification boundary |
| C4 — Assumptions Executable | referenced: certification proves assumptions are executable |
| C13 — Fix Forward | referenced: recertification follows fix-forward cycles |
| C14 — Agent Non-Negotiables | referenced: enforces rule 3 (no merge without evidence) |

## Standards Reference

For detailed evidence format specification, traceability verification tables, CI integration templates, and the philosophy behind honest gaps, see `docs/idd/certification-guide.md`.
