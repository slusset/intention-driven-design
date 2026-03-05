# Certification Guide

## Purpose

Certification is the evidence layer that makes "done means verified" (C12) real. It captures automated proof that implementation fulfills declared intent. Without certification, verification is a claim; with it, verification is a fact.

## Core rule

**No merge without verifiable evidence tied to intent.**

Evidence is not "tests pass." Evidence is a published record that traces specific test results back to specific intent artifacts — and that record is committed alongside the code.

## Artifact location

```
certification/
├── {capability-name}/
│   ├── evidence.yaml          ← structured evidence manifest
│   ├── reports/               ← raw test output (CI-generated)
│   │   ├── unit.xml           ← JUnit/xUnit results
│   │   ├── contract.xml       ← contract test results
│   │   ├── e2e.xml            ← Playwright results
│   │   └── coverage.json      ← coverage data
│   └── screenshots/           ← visual evidence (optional)
│       └── journey-step-*.png
```

## Evidence manifest

The `evidence.yaml` file is the structured link between intent and verification:

```yaml
# certification/{capability-name}/evidence.yaml

capability: specs/capabilities/trade-show-signup.capability.yaml
certified_at: 2026-03-01T14:30:00Z
certified_by: CI    # or agent name, or human

# Intent scope is defined in the capability file above.
# The capability's scope block is the single source of truth for
# which personas, journeys, stories, features, contracts, and models
# belong to this certification unit.

# What evidence was collected?
evidence:
  unit_tests:
    report: reports/unit.xml
    passed: 24
    failed: 0
    skipped: 0

  contract_tests:
    report: reports/contract.xml
    passed: 8
    failed: 0
    description: "OpenAPI schema compliance for POST /accounts, POST /audits"

  e2e_tests:
    report: reports/e2e.xml
    passed: 5
    failed: 0
    journey_steps_covered: [1, 2, 3, 4, 5]
    journey_steps_total: 5

  coverage:
    report: reports/coverage.json
    line: 87.3
    branch: 81.2
    # Coverage is informational, not a gate

# Traceability verification
traceability:
  stories_with_features: 2/2       # all stories have feature files
  features_with_contracts: 2/2     # all features map to endpoints
  endpoints_with_tests: 4/4        # all endpoints have contract tests
  journeys_with_e2e: 1/1           # all journeys have e2e coverage
  orphan_tests: 0                  # tests without intent references

# What is NOT covered (honesty over completeness)
gaps:
  - "Offline/poor-connectivity scenario not yet tested"
  - "iPad viewport not included in visual regression"
```

## Capability artifacts

Certification happens at the capability level, not the PR level. A capability is the smallest unit of intent that delivers independently verifiable user value (C15).

Each capability has a definition file that declares its scope:

```yaml
# specs/capabilities/{capability-name}.capability.yaml

id: trade-show-signup
type: capability
description: "Mobile signup and first audit at trade show"

scope:
  personas:
    - specs/personas/trade-show-prospect.md
  journeys:
    - specs/journeys/trade-show-signup.md
  stories:
    - specs/stories/onboarding/mobile-signup.md
    - specs/stories/audits/quick-start-audit.md
  features:
    - specs/features/onboarding/mobile-signup.feature
    - specs/features/audits/create-audit.feature
  models:
    - specs/models/account/account.model.yaml
    - specs/models/audit/audit.model.yaml
  contracts:
    - specs/contracts/openapi/api.yaml
```

The capability file is the single source of truth for "what are we certifying?" The evidence manifest references it rather than re-enumerating intent artifacts inline. This eliminates duplication and makes scope changes traceable in version control.

Capability timing is two-phase:

1. **Stub early** — when `solution-narrative` produces its first stories, create `specs/capabilities/{capability-name}.capability.yaml` with:
   - `id`
   - `type`
   - `description`
   - `scope.personas`
   - `scope.journeys`
   - `scope.stories`
2. **Finalize later** — after `domain-modeling` and `behavior-contract`, update the same capability file with:
   - `scope.models`
   - `scope.features`
   - `scope.contracts`

Stub example:

```yaml
id: trade-show-signup
type: capability
description: "Mobile signup and first audit at trade show"

scope:
  personas:
    - specs/personas/trade-show-prospect.md
  journeys:
    - specs/journeys/trade-show-signup.md
  stories:
    - specs/stories/onboarding/mobile-signup.md
    - specs/stories/audits/quick-start-audit.md
```

Do not wait for every downstream artifact before creating the capability file. The early stub declares the certification boundary. Do not certify from the stub alone; certification requires the finalized scope.

## When to certify

Certify when:
- The capability file exists with a complete scope.
- All stories in the capability have corresponding features.
- All features have contract and unit test coverage.
- The journey has end-to-end coverage.
- Evidence is collected and the manifest is committed.

## CI integration

Generate evidence automatically in CI:

```yaml
# In CI workflow
certify:
  needs: [unit-tests, contract-tests, e2e-tests]
  steps:
    - name: Collect evidence
      run: |
        mkdir -p certification/${{ env.CAPABILITY }}/reports
        cp backend/target/surefire-reports/*.xml certification/${{ env.CAPABILITY }}/reports/unit.xml
        cp backend/target/contract-reports/*.xml certification/${{ env.CAPABILITY }}/reports/contract.xml
        cp frontend/playwright-report/results.xml certification/${{ env.CAPABILITY }}/reports/e2e.xml
        cp frontend/coverage/coverage-summary.json certification/${{ env.CAPABILITY }}/reports/coverage.json

    - name: Generate evidence manifest
      run: |
        # Tool that reads capability scope + available reports
        # and scaffolds evidence.yaml
        node tools/generate-evidence.js \
          --capability ${{ env.CAPABILITY }} \
          --reports-dir certification/${{ env.CAPABILITY }}/reports/ \
          --output certification/${{ env.CAPABILITY }}/evidence.yaml \
          --certified-by CI \
          --write

    - name: Verify traceability
      run: |
        # Verify every story has features, every feature has tests, etc.
        python tools/verify-traceability.py \
          --evidence certification/${{ env.CAPABILITY }}/evidence.yaml

    - name: Commit evidence
      run: |
        git add certification/${{ env.CAPABILITY }}/
        git commit -m "cert: ${{ env.CAPABILITY }} evidence"
```

The current `generate-evidence.js` tool is a scaffold generator, not full certification automation. It can derive capability-scoped links and seed the manifest from available reports, but some fields still require human review or a later validator pass.

## Manual certification (for early adoption)

If CI automation isn't set up yet, create the evidence manifest by hand:

1. Run tests and collect results.
2. Generate a starting manifest with `node tools/generate-evidence.js --capability specs/capabilities/{capability}.capability.yaml --write` or create `certification/{capability}/evidence.yaml` by hand using the template above.
3. Fill in test counts from actual results.
4. Verify traceability manually: check that every story has features, every feature has tests.
5. Document gaps honestly.
6. Commit alongside the implementation.

The manifest format is the same whether generated by CI or written by hand. Automation removes human effort; it doesn't change the standard.

## Traceability verification

The evidence manifest includes a `traceability` section that answers:

| Question | Field | Acceptable |
|----------|-------|------------|
| Does every story have a feature file? | `stories_with_features` | Must be 100% |
| Does every feature map to a contract endpoint? | `features_with_contracts` | Must be 100% |
| Does every endpoint have tests? | `endpoints_with_tests` | Must be 100% |
| Does every journey have e2e coverage? | `journeys_with_e2e` | Must be 100% |
| Are there tests with no intent reference? | `orphan_tests` | Should be 0 |

## Gaps are honest, not failures

The `gaps` section is not a failure — it's a declaration of what isn't verified yet. An honest gap is better than a false claim of completeness. Gaps become backlog items and can reference future stories.

## Relationship to other concepts

- **C4 (Assumptions Executable)**: Certification is where assumptions are proven executable.
- **C5 (Fast Honest Feedback)**: Evidence must be automated and deterministic.
- **C8 (Traceability Chain)**: The evidence manifest closes the chain from intent to proof.
- **C12 (Done Means Verified)**: Certification is the operational definition of "done."
- **C13 (Fix Forward)**: When a defect is found post-certification, the fix includes updating the evidence.
- **C14 (Agent Non-Negotiables)**: Rule 3 — no merge without verifiable evidence — is enforced here.
- **C15 (Capability as Certification Unit)**: The capability artifact defines the certification boundary. Evidence references the capability; the capability enumerates intent.
