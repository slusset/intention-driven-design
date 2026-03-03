# Intention-Driven Project Template

## Minimal artifact spine

1. `specs/personas/`
2. `specs/journeys/`
3. `specs/stories/`
4. `specs/models/`
5. `specs/features/` (BDD)
6. `specs/contracts/openapi/`
7. `specs/fixtures/`
8. `specs/journey-maps/`
9. `certification/` (automated evidence tied to intent)

## Delivery loop (intention → artifact → verification → evidence)

1. Capture intent in persona + journey + story artifacts.
2. Model domain concepts, rules, and lifecycles.
3. Convert story acceptance criteria into BDD features + API contracts.
4. Implement code from contracts and feature expectations.
5. Produce executable verification: unit, contract, e2e, regression.
6. Publish evidence under `certification/` before merge (`/certification`).

## Done criteria

- Every story references journey and persona.
- Every contract operation references source story/feature.
- Every automated test maps to an explicit intent artifact.
- No feature is accepted on manual confidence alone.
- Certification evidence manifest is committed with traceability verified.
- Gaps are declared honestly, not hidden.
