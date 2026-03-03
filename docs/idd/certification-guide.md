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

capability: trade-show-signup
description: "Mobile signup and first audit at trade show"
certified_at: 2026-03-01T14:30:00Z
certified_by: CI    # or agent name, or human

# What intent does this evidence cover?
intent:
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
  contracts:
    - specs/contracts/openapi/api.yaml

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

## When to certify

Certification happens at the capability level, not the PR level. A capability is the smallest unit of intent that delivers user value — typically one journey or a cluster of related stories.

Certify when:
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
        # Script that reads test results + specs/ references
        # and produces evidence.yaml
        python tools/generate-evidence.py \
          --capability ${{ env.CAPABILITY }} \
          --specs-dir specs/ \
          --reports-dir certification/${{ env.CAPABILITY }}/reports/

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

## Manual certification (for early adoption)

If CI automation isn't set up yet, create the evidence manifest by hand:

1. Run tests and collect results.
2. Create `certification/{capability}/evidence.yaml` using the template above.
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
