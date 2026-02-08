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
