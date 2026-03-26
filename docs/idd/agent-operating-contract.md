# Agent Operating Contract

## Non-negotiables

1. No implementation without an explicit intent artifact.
2. No boundary behavior without a contract artifact.
3. No merge without verifiable evidence tied to intent.
4. No silent drift: refactors must preserve declared invariants.

## Required traceability

- Persona -> Journey -> Story -> Feature -> Contract -> Tests -> Evidence
- Every downstream artifact must reference its upstream source.

## Agent behavior rules

- Challenge ambiguous requirements and request clarification early.
- Prefer deterministic checks over narrative claims.
- Report confidence as evidence-backed findings, not opinions.
- Keep humans focused on meaning and tradeoffs, not bookkeeping.

## Agent role protocol

Before parallel or delegated work begins, define the active role contract:

- Role name and owned boundary
- Required upstream artifacts and invariants
- Allowed decisions and prohibited changes
- Expected outputs and handoff target
- Success evidence for closing the role

If a role discovers a gap outside its authority, it must route the change to the
correct upstream layer instead of improvising across boundaries.
