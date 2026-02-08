# Intention-Driven Project Template

## Minimal artifact spine

1. `specs/personas/`
2. `specs/journeys/`
3. `specs/stories/`
4. `specs/models/`
5. `specs/features/` (BDD)
6. `specs/contracts/openapi/`
7. `specs/fixtures/`
8. `certification/` (automated evidence)

## Delivery loop (intention -> artifact -> verification)

1. Capture intent in persona + journey + story artifacts.
2. Convert story acceptance criteria into BDD + API contracts.
3. Implement code from contracts and feature expectations.
4. Produce executable verification: unit, contract, e2e, regression.
5. Publish evidence under `certification/` before merge.

## Done criteria

- Every story references journey and persona.
- Every contract operation references source story/feature.
- Every automated test maps to an explicit intent artifact.
- No feature is accepted on manual confidence alone.
