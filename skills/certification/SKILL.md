---
name: certification
description: "Verify traceability and produce evidence that implementation fulfills declared intent. Use after implementation and tests are complete, before merge. Cross-cuts all layers to close the chain from persona to proof."
argument-hint: "[capability-name]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
---

# Certification

## Purpose

Close the traceability chain by verifying that every intent artifact has corresponding implementation and test evidence, then publish a structured evidence manifest. This is the operational enforcement of agent non-negotiable #3: **no merge without verifiable evidence tied to intent.**

Certification is cross-cutting — it doesn't produce narrative, model, contract, or test artifacts. It **verifies the connections between them** and produces the evidence record.

## When to Use

- After implementation and all tests pass.
- Before merge or PR approval.
- When the workflow-guide reaches step 6 (Certification).
- After a Fix Forward cycle to update evidence for the repaired gap.
- When auditing an existing capability's traceability health.

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
└── journey-maps/      ← from /e2e-journey-testing

Test results (from CI or local runs):
├── Unit test reports (JUnit XML, Jest JSON, etc.)
├── Contract test reports
├── E2E test reports (Playwright)
└── Coverage reports (optional)
```

## Output

```
certification/
└── {capability-name}/
    ├── evidence.yaml      ← structured evidence manifest
    ├── reports/            ← raw test output
    │   ├── unit.xml
    │   ├── contract.xml
    │   ├── e2e.xml
    │   └── coverage.json
    └── screenshots/        ← visual evidence (optional)
```

## Workflow

### Step 1: Identify the capability boundary

Determine which intent artifacts are in scope. A capability is typically one journey or a cluster of related stories.

```
Ask or determine:
- Which journey(s) does this capability cover?
- Which stories belong to this capability?
- Which personas are involved?
```

Search for the relevant artifacts:

```bash
# Find journeys
ls specs/journeys/

# Find stories referencing a journey
grep -rl "journey-name" specs/stories/

# Find features referencing those stories
grep -rl "story-name" specs/features/
```

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

Copy relevant reports to `certification/{capability}/reports/`.

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

Create `certification/{capability}/evidence.yaml`:

```yaml
# certification/{capability-name}/evidence.yaml

capability: {capability-name}
description: "{one-line description of what this capability delivers}"
certified_at: {ISO 8601 timestamp}
certified_by: {agent name, CI, or human}

# What intent does this evidence cover?
intent:
  personas:
    - specs/personas/{persona}.md
  journeys:
    - specs/journeys/{journey}.md
  stories:
    - specs/stories/{area}/{story}.md
  features:
    - specs/features/{area}/{feature}.feature
  contracts:
    - specs/contracts/openapi/api.yaml

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

### Step 7: Validate and commit

Before committing, verify:

- [ ] All `traceability` ratios are 100% (X/Y where X equals Y)
- [ ] All orphan counts are 0
- [ ] No test failures (failed: 0 across all evidence sections)
- [ ] Gaps are documented if any exist
- [ ] Intent section lists every in-scope artifact
- [ ] Reports are present in `reports/` directory

If any traceability ratio is below 100%, the capability is **not certifiable**. Either:
1. Add the missing spec/test artifacts to close the gap, or
2. Document the gap explicitly and get human approval to proceed.

Commit the evidence alongside the implementation:

```bash
git add certification/{capability}/
git commit -m "cert: {capability} evidence"
```

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

The previous evidence.yaml is not deleted — it's overwritten with the new certification. Git history preserves the record.

## Guardrails

- Never certify with test failures. Zero tolerance.
- Never certify with traceability gaps unless gaps are explicitly declared and human-approved.
- Never fabricate evidence. If tests weren't run, say so.
- Coverage percentage is informational, never a gate. Traceability matters more than coverage.
- Gaps are honest declarations. A gap is a future story, not a failure.
- The evidence manifest must be committed alongside code, not after the fact.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| solution-narrative | Certification verifies that its personas, journeys, and stories have downstream coverage |
| domain-modeling | Certification verifies that model rules are reflected in features and tests |
| behavior-contract | Certification verifies that features map to contracts and contracts have tests |
| e2e-journey-testing | Certification verifies that journeys have maps and e2e coverage |
| workflow-guide | Certification is step 6 in the workflow, invoked via `/certification` |

## Concepts Carried

| Concept | Role |
|---------|------|
| C5 — Fast Honest Feedback | **primary**: evidence must be automated and deterministic |
| C8 — Traceability Chain | **primary**: closes the chain from intent to proof |
| C12 — Done Means Verified | **primary**: operational definition of "done" |
| C4 — Assumptions Executable | referenced: certification proves assumptions are executable |
| C13 — Fix Forward | referenced: recertification follows fix-forward cycles |
| C14 — Agent Non-Negotiables | referenced: enforces rule 3 (no merge without evidence) |

## Standards Reference

For detailed evidence format specification, traceability verification tables, CI integration templates, and the philosophy behind honest gaps, see `docs/idd/certification-guide.md`.
