# Certification Guide

## Purpose

Certification is the evidence layer that makes "done means verified" (C12) real. It captures automated proof that implementation fulfills declared intent. Without certification, verification is a claim; with it, verification is a fact.

## Core rule

**No merge without verifiable evidence tied to intent.**

Evidence is not "tests pass." Evidence is a published record that traces specific test results back to specific intent artifacts — and that record is published with the change as part of the CI report.

## Evidence lifecycle: generated, validated, published — never committed

Evidence is **derived output**. It is recomputed from the capability scope and test results on every certification run, so it always describes exactly one commit. Committing it to the repo would freeze a claim that goes stale on the next push; keeping it in the CI report keeps the claim honest.

The three surfaces of the published record:

1. **Job summary + PR comment** — per-capability certification status, traceability ratios, test counts, and declared gaps. Rendered by the `idd-check` GitHub Action on every PR.
2. **Workflow artifact** (`idd-evidence`) — the full `evidence.yaml` manifests plus raw validator output for the run. This is the durable, auditable record; CI run history preserves past certifications.
3. **Local workspace** (`.idd/evidence/`, gitignored) — where local certification runs write manifests for inspection before CI takes over.

```
.idd/evidence/                  ← gitignored workspace (local or CI runner)
├── {capability-name}/
│   ├── evidence.yaml          ← structured evidence manifest
│   ├── reports/               ← raw test output
│   │   ├── unit.xml           ← JUnit/xUnit results
│   │   ├── contract.xml       ← contract test results
│   │   ├── e2e.xml            ← Playwright results
│   │   └── coverage.json      ← coverage data
│   └── screenshots/           ← visual evidence (optional)
│       └── journey-step-*.png
```

Only intent artifacts (`specs/`) are committed. The capability file declares *what* is certified; the CI report proves *that* it is.

## Evidence manifest

The `evidence.yaml` file is the structured link between intent and verification:

```yaml
# .idd/evidence/{capability-name}/evidence.yaml (generated — not committed)

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
- Evidence is generated and validated in CI, and the report is published on the PR.

## CI integration

The `idd-check` GitHub Action does this automatically: it discovers every `specs/capabilities/*.capability.yaml`, generates a manifest per capability, validates it against the certification thresholds, renders the result into the job summary and PR comment, and uploads the manifests as the `idd-evidence` workflow artifact.

```yaml
# In CI workflow
certify:
  needs: [unit-tests, contract-tests, e2e-tests]
  steps:
    - uses: actions/checkout@v4

    - name: Collect test reports
      run: |
        mkdir -p test-reports/${{ env.CAPABILITY }}
        cp backend/target/surefire-reports/*.xml test-reports/${{ env.CAPABILITY }}/unit.xml
        cp backend/target/contract-reports/*.xml test-reports/${{ env.CAPABILITY }}/contract.xml
        cp frontend/playwright-report/results.xml test-reports/${{ env.CAPABILITY }}/e2e.xml
        cp frontend/coverage/coverage-summary.json test-reports/${{ env.CAPABILITY }}/coverage.json

    - name: IDD checks + certification evidence report
      uses: slusset/intention-driven-design/.github/actions/idd-check@v1
      with:
        evidence-reports-dir: test-reports
        # Report-only by default; flip on once capabilities are certifiable:
        # evidence-gate: 'true'
```

Evidence reporting is **report-only by default** (`evidence-gate: 'false'`): every PR shows per-capability certification status without blocking while coverage is still being built out. Setting `evidence-gate: 'true'` makes an uncertifiable capability fail the check — that is the enforcement of "no merge without evidence" once a project is ready to hold the line.

The equivalent by hand, for pipelines that don't use the action:

```yaml
    - name: Generate + validate evidence manifest
      run: |
        idd generate-evidence \
          --capability specs/capabilities/${{ env.CAPABILITY }}.capability.yaml \
          --reports-dir test-reports/${{ env.CAPABILITY }} \
          --output .idd/evidence/${{ env.CAPABILITY }}/evidence.yaml \
          --write
        idd validate evidence \
          --evidence .idd/evidence/${{ env.CAPABILITY }}/evidence.yaml

    - name: Publish evidence with the run
      uses: actions/upload-artifact@v4
      with:
        name: idd-evidence
        path: .idd/evidence/
```

The current `generate-evidence.js` tool is a scaffold generator, not full certification automation. It can derive capability-scoped links and seed the manifest from available reports, but some fields still require human review or a later validator pass. Pair it with `validate-evidence.js` to enforce the current certification thresholds.

## Manual certification (for early adoption)

If CI automation isn't set up yet, produce and publish the evidence record by hand:

1. Run tests and collect results.
2. Generate a starting manifest with `node tools/generate-evidence.js --capability specs/capabilities/{capability}.capability.yaml --write` (defaults to `.idd/evidence/{capability}/evidence.yaml`, which is gitignored) or write it by hand using the template above.
3. Fill in test counts from actual results.
4. Validate it with `node tools/validate-evidence.js --evidence .idd/evidence/{capability}/evidence.yaml`.
5. Document gaps honestly. If human approval exists for explicit gaps, validate with `--allow-gaps`.
6. Publish the result where the merge decision happens — paste the manifest (or its summary) into the PR description or a PR comment. Do not commit it.

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
