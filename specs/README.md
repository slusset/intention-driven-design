# IDD Example Fixtures

This directory contains a complete, minimal set of **illustrative** IDD artifacts.

These files are not project-of-record specs for this repository. They exist so contributors can:

- run tooling validation (`check-front-matter`, `check-traceability`, `check-capability-scope`) against realistic data,
- inspect fully populated artifacts while onboarding, and
- reuse patterns when creating `specs/` in downstream project repositories.

## What this represents

The example chain models a trade-show workflow:

1. A prospect scans a QR code and signs up from a phone.
2. The new account starts a first audit during the same conversation.

## Layout

- `personas/` → who the system serves
- `journeys/` → end-to-end user experience
- `stories/` → scoped user capabilities
- `features/` + `contracts/` + `fixtures/` → executable behavior across HTTP, event, and RPC boundaries
- `models/` → domain concepts and rules
- `journey-maps/` → E2E validation spine
- `capabilities/` → certification scope boundary

## Validation

Run checks against this directory directly:

```bash
node tools/check-front-matter.js specs/
node tools/check-traceability.js specs/
node tools/check-capability-scope.js specs/
```

Real adopters should place equivalent artifacts under `specs/` in their own repositories.
