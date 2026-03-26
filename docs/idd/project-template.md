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
10. `certification/` (automated evidence tied to intent)

## Delivery loop (intention → artifact → verification → evidence)

1. Capture intent in persona + journey + story artifacts.
2. Create a capability stub with personas, journeys, and stories.
3. Model domain concepts, rules, and lifecycles.
4. Convert story acceptance criteria into BDD features + boundary contracts, then finalize the capability scope with models, features, and contracts.
5. If work is delegated or parallelized, define role contracts before edits begin.
6. Implement code from contracts and feature expectations.
7. Produce executable verification: unit, contract, e2e, regression.
8. Publish evidence under `certification/` before merge (`/certification`).

## Done criteria

- Every story references journey and persona.
- Every contract operation references source story/feature.
- Every automated test maps to an explicit intent artifact.
- No feature is accepted on manual confidence alone.
- Certification evidence manifest is committed with traceability verified.
- Gaps are declared honestly, not hidden.
- Delegated roles preserve declared boundaries and invariants.
