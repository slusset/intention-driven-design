# Intention-Driven Project Template

## Minimal artifact spine

1. `specs/personas/`
2. `specs/journeys/`
3. `specs/stories/`
4. `specs/models/`
5. `specs/features/` (BDD)
6. `specs/contracts/openapi/`, `specs/contracts/asyncapi/`, and/or `specs/contracts/json-rpc/`
7. `specs/fixtures/`
8. `specs/journey-maps/`
9. `specs/capabilities/` (created as a stub after narrative, finalized after models/contracts/features exist)
10. `specs/verification/{capability}/verification.yaml` (rules, planned/current evidence, map dependencies, and four independent maturity claims)
11. `specs/modules.yaml` (assigns every capability chain to exactly one module and declares the acyclic module dependency graph)

Evidence is not part of the committed spine: it is generated per capability
(into gitignored `.idd/evidence/`) and published through the CI evidence
report — job summary, PR comment, and workflow artifact.

## Delivery loop (intention → artifact → verification → evidence)

1. Capture intent in persona + journey + story artifacts.
2. Create a capability stub with personas, journeys, and stories.
3. Model domain concepts, rules, and lifecycles.
4. Convert story acceptance criteria into BDD features + boundary contracts, then finalize the capability scope with models, features, and contracts.
5. Assign the capability to one module and create its verification map; declare map and module dependencies explicitly rather than inferring them from file placement.
6. Plan rule-scoped evidence and declare the four independent maturity claims honestly.
7. If work is delegated or parallelized, define role contracts before edits begin.
8. Implement code from contracts and feature expectations.
9. Produce executable verification: unit, contract, e2e, regression.
10. Publish evidence via the CI evidence report before merge (`/certification`).

## Done criteria

- Every story references journey and persona.
- Every contract operation references source story/feature.
- Every automated test maps to an explicit intent artifact.
- Every capability belongs to exactly one module, and module dependencies form a DAG.
- Every capability has one root-aware verification map whose dependencies and rule citations follow that DAG.
- Verification and certification claims never exceed the weakest map they explicitly depend on.
- Every current-evidence selector resolves literally in its bound files, and every rule-bound contract reciprocates through `x-rules`.
- Every cross-module contract consumption records a `jcs-sha256@1` pin to the exact upstream JSON Schema document.
- No feature is accepted on manual confidence alone.
- Certification evidence is published in the CI report with traceability verified.
- Gaps are declared honestly, not hidden.
- Delegated roles preserve declared boundaries and invariants.
